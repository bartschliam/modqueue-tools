import { TriggerContext } from "@devvit/public-api";
import { ModAction, PostReport, CommentReport } from "@devvit/protos";
import { addMinutes, differenceInSeconds, subSeconds } from "date-fns";
import { FILTERED_ITEM_KEY, recordActionDelay } from "./redisHelper.js";
import { formatDurationToNow } from "./utility.js";
import { T1ID, T3ID } from "@devvit/public-api/types/tid.js";
import { hasTriggerBeenHandled } from "@fsvreddit/fsv-devvit-helpers";

export interface QueuedItemProperties {
    postId: T3ID;
    itemId: T1ID | T3ID;
    reasonForQueue: "AutoModerator" | "reddit" | "report";
    queueDate: number;
}

function getItemIdFromModAction (event: ModAction): T1ID | T3ID {
    if (event.targetComment?.id) {
        return event.targetComment.id as T1ID;
    } else if (event.targetPost?.id) {
        return event.targetPost.id as T3ID;
    } else {
        throw new Error("Unexpected mod action type");
    }
}

function getPostIdFromModAction (event: ModAction): T3ID {
    if (event.targetComment?.id) {
        return event.targetComment.postId as T3ID;
    } else if (event.targetPost?.id) {
        return event.targetPost.id as T3ID;
    } else {
        throw new Error("Unexpected mod action type");
    }
}

async function hasModActionBeenHandled (event: ModAction, context: TriggerContext): Promise<boolean> {
    return await hasTriggerBeenHandled(context.redis, `modAction:${event.action}:${event.moderator?.name}:${event.actionedAt?.getTime()}`, { expiration: addMinutes(new Date(), 10) });
}

export async function handleModAction (event: ModAction, context: TriggerContext) {
    if (!event.action || !event.moderator || !event.actionedAt) {
        return;
    }

    if (event.action === "approvelink" || event.action === "approvecomment") {
        if (await hasModActionBeenHandled(event, context)) {
            console.log(`Mod action ${event.id} has already been handled, skipping.`);
            return;
        }

        const itemId = getItemIdFromModAction(event);
        const existingValue = await context.redis.hGet(FILTERED_ITEM_KEY, itemId);
        if (existingValue) {
            const queueItemProps = JSON.parse(existingValue) as QueuedItemProperties;
            const secondsBeforeAction = differenceInSeconds(event.actionedAt, queueItemProps.queueDate);
            console.log(`${itemId}: Approved by ${event.moderator.name}. Item actioned after ${formatDurationToNow(subSeconds(new Date(), secondsBeforeAction))}`);
            await recordActionDelay(event.actionedAt, itemId, secondsBeforeAction, context);
            await context.redis.hDel(FILTERED_ITEM_KEY, [itemId]);
        } else {
            console.log(`${itemId}: Approved by ${event.moderator.name}, but item doesn't appear to have been in the queue.`);
        }
    }

    if (event.action === "removelink" || event.action === "removecomment" || event.action === "spamlink" || event.action === "spamcomment") {
        if (await hasModActionBeenHandled(event, context)) {
            console.log(`Mod action ${event.id} has already been handled, skipping.`);
            return;
        }

        const itemId = getItemIdFromModAction(event);
        const postId = getPostIdFromModAction(event);

        if (event.moderator.name === "AutoModerator" || event.moderator.name === "reddit") {
            // Action that might result in a modqueue item, so store in hash.
            // Check to see if item has already been potentially queued.
            const existingValue = await context.redis.hGet(FILTERED_ITEM_KEY, itemId);
            if (!existingValue) {
                const props: QueuedItemProperties = {
                    postId,
                    itemId,
                    reasonForQueue: event.moderator.name,
                    queueDate: event.actionedAt.getTime(),
                };
                await context.redis.hSet(FILTERED_ITEM_KEY, { [itemId]: JSON.stringify(props) });
                console.log(`${itemId}: Removed by ${event.moderator.name} so may be queued. Added to Redis.`);
            }
        } else {
            // Human mod, AEO or other definitive removal action, item cannot be in queue after
            const existingValue = await context.redis.hGet(FILTERED_ITEM_KEY, itemId);
            if (existingValue) {
                const queueItemProps = JSON.parse(existingValue) as QueuedItemProperties;
                const secondsBeforeAction = differenceInSeconds(event.actionedAt, queueItemProps.queueDate);
                console.log(`${itemId}: Removed by ${event.moderator.name}. Item actioned after ${formatDurationToNow(subSeconds(new Date(), secondsBeforeAction))}`);
                await recordActionDelay(event.actionedAt, itemId, secondsBeforeAction, context);
                await context.redis.hDel(FILTERED_ITEM_KEY, [itemId]);
            } else {
                console.log(`${itemId}: Removed by ${event.moderator.name}, but item doesn't appear to have been in the queue.`);
            }
        }
    }
}

async function handleReport (itemId: T1ID | T3ID, postId: T3ID, context: TriggerContext) {
    const existingValue = await context.redis.hGet(FILTERED_ITEM_KEY, itemId);
    if (!existingValue) {
        const props: QueuedItemProperties = {
            postId,
            itemId,
            reasonForQueue: "report",
            queueDate: new Date().getTime(),
        };
        await context.redis.hSet(FILTERED_ITEM_KEY, { [itemId]: JSON.stringify(props) });
        console.log(`${itemId}: Reported. Added to Redis store.`);
    } else {
        console.log(`${itemId}: Reported, but was already in Redis store.`);
    }
}

export async function handlePostReport (event: PostReport, context: TriggerContext) {
    if (!event.post) {
        return;
    }

    if (await hasTriggerBeenHandled(context.redis, `postReport:${event.post.id}:${event.reason}`, { expiration: addMinutes(new Date(), 1) })) {
        console.log(`Post report ${event.post.id} has already been handled, skipping.`);
        return;
    }

    await handleReport(event.post.id as T3ID, event.post.id as T3ID, context);
}

export async function handleCommentReport (event: CommentReport, context: TriggerContext) {
    if (!event.comment) {
        return;
    }

    if (await hasTriggerBeenHandled(context.redis, `commentReport:${event.comment.id}:${event.reason}`, { expiration: addMinutes(new Date(), 1) })) {
        console.log(`Comment report ${event.comment.id} has already been handled, skipping.`);
        return;
    }

    await handleReport(event.comment.id as T1ID, event.comment.postId as T3ID, context);
}
