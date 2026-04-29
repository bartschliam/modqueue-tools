import { Comment, Post, TriggerContext } from "@devvit/public-api";
import { AppSetting, UnderThresholdAction } from "./settings.js";
import { addDays, addMinutes, subHours } from "date-fns";
import { formatDurationToNow } from "./utility.js";
import pluralize from "pluralize";
import { QueuedItemProperties } from "./handleActions.js";
import markdownEscape from "markdown-escape";
import { countBy } from "lodash";
import { isLinkId } from "@devvit/public-api/types/tid.js";

interface QueuedPostCount {
    postId: string;
    count: number;
}

function getTopPosts (modQueue: (Post | Comment)[], threshold: number): QueuedPostCount[] {
    const postIdList = modQueue.map(item => item instanceof Comment ? item.postId : item.id);
    const countedPosts = countBy(postIdList);
    const postsInQueue = Object.keys(countedPosts).map(postId => ({ postId, count: countedPosts[postId] } as QueuedPostCount));

    return postsInQueue.filter(item => Math.round(100 * item.count / modQueue.length) >= threshold).sort((a, b) => b.count - a.count);
}

export async function checkAlerting (modQueue: (Post | Comment)[], queueItemProps: QueuedItemProperties[], context: TriggerContext) {
    const settings = await context.settings.getAll();
    if (!settings[AppSetting.EnableAlerts]) {
        console.log("Alerting: Alerting is disabled.");
        return;
    }

    const discordWebhookUrls = getDiscordWebhookUrls(settings[AppSetting.DiscordWebhook] as string);
    if (discordWebhookUrls.length === 0) {
        console.log("Alerting: Webhook is not set up!");
        return;
    }

    let shouldAlert = false;
    const alertThreshold = settings[AppSetting.AlertThreshold] as number;
    const alertAgeHours = settings[AppSetting.AlertAgeHours] as number;

    if (alertThreshold && modQueue.length >= alertThreshold) {
        console.log(`Alerting: Queue length of ${modQueue.length} is over threshold of ${alertThreshold}`);
        shouldAlert = true;
    } else {
        console.log(`Alerting: Queue length ${modQueue.length} is under threshold.`);
    }

    let agedItems: QueuedItemProperties[] = [];
    let oldestItem: QueuedItemProperties | undefined;
    if (alertAgeHours && queueItemProps.length > 0) {
        agedItems = queueItemProps.filter(item => new Date(item.queueDate) < subHours(new Date(), alertAgeHours));
        oldestItem = queueItemProps.sort((a, b) => a.queueDate - b.queueDate)[0];
    }

    if (agedItems.length > 0 && alertAgeHours) {
        console.log(`Alerting: Found ${agedItems.length} items over ${alertAgeHours} old`);
        shouldAlert = true;
    }

    if (oldestItem) {
        console.log(`Alerting: Oldest item: ${formatDurationToNow(new Date(oldestItem.queueDate))}`);
    }

    const subredditName = context.subredditName ?? await context.reddit.getCurrentSubredditName();

    const alertMessageIdKey = "AlertMessageIds";
    const alertMessageIdsStr = await context.redis.get(alertMessageIdKey);
    const alertMessageIds = alertMessageIdsStr ? JSON.parse(alertMessageIdsStr) as Record<string, string> : {};

    const maxQueueLengthKey = "MaxQueueLengthObserved";
    const previousMaxQueueLengthStr = await context.redis.get(maxQueueLengthKey);
    const previousMaxQueueLength = previousMaxQueueLengthStr ? parseInt(previousMaxQueueLengthStr, 10) : 0;

    const alertingPausedKey = "AlertingPaused";

    if (!shouldAlert) {
        console.log("Alerting: Conditions not met for alerting.");
        const [underAlertAction] = settings[AppSetting.UnderThresholdAction] as UnderThresholdAction[] | undefined ?? [UnderThresholdAction.None];
        if (underAlertAction === UnderThresholdAction.DeleteMessage) {
            console.log("Alerting: Deleting alert messages as queue is under threshold.");
            for (const webhookUrl of discordWebhookUrls) {
                const messageId = alertMessageIds[webhookUrl];
                if (messageId) {
                    await deleteWebhookMessage(webhookUrl, messageId);
                }
            }
        } else if (underAlertAction === UnderThresholdAction.UpdateMessage) {
            console.log("Alerting: Updating alert messages as queue is under threshold.");
            const message = `✅ The [modqueue](<https://www.reddit.com/r/${subredditName}/about/modqueue>) on /r/${subredditName} is now under the alerting thresholds. There ${pluralize("are", modQueue.length)} currently ${modQueue.length} ${pluralize("item", modQueue.length)} in the queue, and the maximum queue length seen was ${previousMaxQueueLength}.`;
            for (const webhookUrl of discordWebhookUrls) {
                const messageId = alertMessageIds[webhookUrl];
                if (messageId) {
                    await updateWebhookMessage(webhookUrl, messageId, message);
                }
            }
        }

        await context.redis.del(alertMessageIdKey, maxQueueLengthKey);

        // Pause alerting for 15 minutes to avoid repeated alerts
        await context.redis.set(alertingPausedKey, "", { expiration: addMinutes(new Date(), 15) });

        return;
    }

    if (await context.redis.exists(alertingPausedKey)) {
        console.log("Alerting: Alerting is currently paused, skipping alert.");
        return;
    }

    if (modQueue.length > previousMaxQueueLength) {
        await context.redis.set(maxQueueLengthKey, modQueue.length.toString());
    }

    const roleId = settings[AppSetting.RoleToPing] as string | undefined;

    let message = `⚠️ The [modqueue](<https://www.reddit.com/r/${subredditName}/about/modqueue>) on /r/${subredditName} needs attention.`;
    if (roleId) {
        message += ` <@&${roleId}>`;
    }

    message += ` As at <t:${Math.round(Date.now() / 1000)}:t>:`;

    message += `\n* There ${pluralize("is", modQueue.length)} currently ${modQueue.length} ${pluralize("item", modQueue.length)} in the queue\n`;

    if (agedItems.length > 0) {
        message += `* ${agedItems.length} ${pluralize("item", agedItems.length)} ${pluralize("is", agedItems.length)} over ${alertAgeHours} ${pluralize("hour", alertAgeHours)} old.`;
        if (oldestItem?.itemId) {
            let target: Post | Comment;
            if (isLinkId(oldestItem.itemId)) {
                target = await context.reddit.getPostById(oldestItem.itemId);
            } else {
                target = await context.reddit.getCommentById(oldestItem.itemId);
            }
            message += ` [Oldest item](<https://www.reddit.com${target.permalink}>).`;
        }
        message += "\n";
    } else if (oldestItem) {
        message += `* Oldest queue item: ${formatDurationToNow(new Date(oldestItem.queueDate))}\n`;
    }

    const alertThresholdForIndividualPosts = settings[AppSetting.AlertThresholdForIndividualPosts] as number | undefined;

    // Check to see if any posts represent a large proportion of the mod queue
    if (alertThreshold && alertThresholdForIndividualPosts && modQueue.length >= alertThreshold) {
        const topQueuePosts = getTopPosts(modQueue, alertThresholdForIndividualPosts);
        for (const item of topQueuePosts) {
            const post = await context.reddit.getPostById(item.postId);
            message += `* Queue items from one post make up ${Math.round(100 * item.count / modQueue.length)}% of queue entries: [${markdownEscape(post.title)}](<https://www.reddit.com${post.permalink}>)\n`;
        }
    }

    const hasExistingMessage = Object.keys(alertMessageIds).length > 0;
    if (hasExistingMessage) {
        for (const webhookUrl of discordWebhookUrls) {
            const messageId = alertMessageIds[webhookUrl];
            if (messageId) {
                await updateWebhookMessage(webhookUrl, messageId, message);
            } else {
                const newMessageId = await sendMessageToWebhook(webhookUrl, message);
                if (newMessageId) {
                    alertMessageIds[webhookUrl] = newMessageId;
                }
            }
        }
        console.log("Alerting: Updated existing alert messages.");
    } else {
        for (const webhookUrl of discordWebhookUrls) {
            const newMessageId = await sendMessageToWebhook(webhookUrl, message);
            if (newMessageId) {
                alertMessageIds[webhookUrl] = newMessageId;
            }
        }
        console.log("Alerting: Sent new alert messages.");
    }

    // Record that we're in an alerting period with an expiry of a day
    if (Object.keys(alertMessageIds).length > 0) {
        await context.redis.set(alertMessageIdKey, JSON.stringify(alertMessageIds), { expiration: addDays(new Date(), 1) });
    }
}

async function sendMessageToWebhook (webhookUrl: string, message: string): Promise<string | undefined> {
    const params = {
        content: message,
    };

    const pathParams = new URLSearchParams();
    pathParams.append("wait", "true");

    try {
        const result = await fetch(
            `${webhookUrl}?${pathParams}`,
            {
                method: "post",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(params),
            },
        );
        console.log("Webhook message sent, status:", result.status);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const json = await result.json();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return json.id;
    } catch (error) {
        console.error("Error sending message to webhook:", error);
    }
}

async function updateWebhookMessage (webhookUrl: string, messageId: string, newMessage: string): Promise<void> {
    const params = {
        content: newMessage,
    };

    try {
        const result = await fetch(
            `${webhookUrl}/messages/${messageId}`,
            {
                method: "patch",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(params),
            },
        );
        console.log("Webhook message updated, status:", result.status);
    } catch (error) {
        console.error("Error updating message to webhook:", error);
    }
}

async function deleteWebhookMessage (webhookUrl: string, messageId: string): Promise<void> {
    try {
        const result = await fetch(
            `${webhookUrl}/messages/${messageId}`,
            {
                method: "delete",
            },
        );
        console.log("Webhook message deleted, status:", result.status);
    } catch (error) {
        console.error("Error deleting message to webhook:", error);
    }
}

function getDiscordWebhookUrls (webhookSetting: string | undefined): string[] {
    if (!webhookSetting) {
        return [];
    }
    return webhookSetting
        .trim()
        .split(/\n+/)
        .map(url => url.trim())
        .filter(url => url.length > 0);
}
