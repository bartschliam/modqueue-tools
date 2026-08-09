import { SettingsFormField } from "@devvit/public-api";

export enum AppSetting {
    EnableAlerts = "enableAlerts",
    AlertThreshold = "alertThreshold",
    AlertAgeHours = "alertAgeHours",
    AlertThresholdForIndividualPosts = "alertThresholdForIndividualPosts",
    DiscordWebhook = "discordWebhook",
    DiscordWebhookConfig = "discordWebhookConfig",
    UnderThresholdAction = "underThresholdAction",
    RoleToPing = "roleToPing",
}

export enum UnderThresholdAction {
    None = "none",
    DeleteMessage = "deleteMessage",
    UpdateMessage = "updateMessage",
}

export const appSettings: SettingsFormField[] = [
    {
        type: "group",
        label: "Alerting Options",
        fields: [
            {
                name: AppSetting.EnableAlerts,
                type: "boolean",
                label: "Enable Alerting",
                defaultValue: true,
            },
            {
                name: AppSetting.AlertThreshold,
                type: "number",
                label: "Queue size threshold",
                helpText: "Alert if the number of posts or comments in the queue is this number or higher.",
                defaultValue: 30,
                onValidate: ({ value }) => {
                    if (!value || value < 1) {
                        return "Queue size threshold must be at least 1.";
                    }
                },
            },
            {
                name: AppSetting.AlertAgeHours,
                type: "number",
                label: "Item age threshold (hours)",
                helpText: "Alert if any post or comment has been in the queue longer than this number of hours. Set to 0 to disable.",
                defaultValue: 24,
                onValidate: ({ value }) => {
                    if (value && value < 0) {
                        return "Item age threshold must be at least 0.";
                    }
                },
            },
            {
                name: AppSetting.AlertThresholdForIndividualPosts,
                type: "number",
                label: "Individual post alert threshold %",
                helpText: "If an individual post is dominating the modqueue by taking up more than this percentage of queued items, include it in the alert. Set to 0 to disable.",
                defaultValue: 40,
                onValidate: ({ value }) => {
                    if (value && value < 0) {
                        return "Individual post alert threshold age threshold must be at least 0.";
                    }
                },
            },
            {
                name: AppSetting.DiscordWebhook,
                type: "paragraph",
                label: "Discord webhook URLs",
                helpText: "One or more Discord webhook URLs to send alerts to, one per line. Get these from your Discord server's or channel settings. The line number of each URL here corresponds to the same line number in the per-webhook thresholds field below.",
                placeholder: "https://discord.com/api/webhooks/123456789012345678/abcdefg",
                onValidate: ({ value }) => {
                    const webhookRegex = /^https:\/\/discord(?:app)?.com\/api\/webhooks\/\d+\//;
                    if (value) {
                        const urls = value.trim().split(/\n+/).filter(url => url.trim());
                        for (const url of urls) {
                            if (!webhookRegex.test(url.trim())) {
                                return "Please enter valid Discord webhook URLs";
                            }
                        }
                    }
                },
            },
            {
                name: AppSetting.DiscordWebhookConfig,
                type: "paragraph",
                label: "Per-webhook thresholds (optional)",
                helpText: "Override the default thresholds for specific webhooks. Each line here matches the webhook on the same line number in the field above (line 1 configures the first webhook, line 2 the second, and so on). Leave a line blank to use the default thresholds for that webhook. Format: 'threshold:NUMBER|ageHours:NUMBER'.",
                placeholder: "threshold:20|ageHours:12",
                onValidate: ({ value }) => {
                    if (value) {
                        const lines = value.split(/\r?\n/).map(line => line.trim());
                        for (const line of lines) {
                            if (!line) {
                                continue;
                            }
                            for (const param of line.split("|")) {
                                if (!param.includes(":")) {
                                    return "Invalid configuration format. Use: threshold:NUMBER|ageHours:NUMBER";
                                }
                                const [key, val] = param.split(":");
                                if (["threshold", "ageHours"].includes(key.trim())) {
                                    if (isNaN(Number(val))) {
                                        return `Invalid value for ${key}: must be a number`;
                                    }
                                } else {
                                    return `Unknown parameter: ${key}`;
                                }
                            }
                        }
                    }
                },
            },
            {
                name: AppSetting.UnderThresholdAction,
                type: "select",
                label: "Action when queue is under threshold",
                helpText: "Choose what to do with the alert message when the queue size falls below the alert threshold.",
                defaultValue: [UnderThresholdAction.None],
                options: [
                    { label: "No action (leave previous alert in place)", value: UnderThresholdAction.None },
                    { label: "Delete Alert Message", value: UnderThresholdAction.DeleteMessage },
                    { label: "Update Alert Message", value: UnderThresholdAction.UpdateMessage },
                ],
                multiSelect: false,
                onValidate: ({ value }) => {
                    if (value?.length !== 1) {
                        return "Please select one action for when the queue is under threshold.";
                    }
                },
            },
            {
                name: AppSetting.RoleToPing,
                type: "string",
                label: "Discord Role ID to ping (optional)",
                helpText: "To identify the role's ID, type \\@rolename in a channel on your server. Copy the number.",
                onValidate: ({ value }) => {
                    const roleRegex = /^\d+$/;
                    if (value && !roleRegex.test(value)) {
                        return "Please enter a valid Discord role ID";
                    }
                },
            },
        ],
    },
];
