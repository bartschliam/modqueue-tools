Provides analytics and alerting for mod queues.

## About this app

modqueue-tools-plus is a community-maintained fork of [modqueue-tools](https://developers.reddit.com/apps/modqueue-tools) by u/fsvreddit. It builds on that project's analytics and alerting features and adds support for sending alerts to **multiple Discord webhooks**, each with its own optional thresholds. This fork was created after the corresponding pull request to the original project had gone unmerged for an extended period.

All credit for the original design and implementation goes to fsvreddit; this fork is offered under the same [BSD-3-Clause license](LICENSE) and is not affiliated with or endorsed by the original author.

## Analytics

This app updates a wiki page (modqueue-tools/queuestats) on your subreddit once a day with statistics on queue lengths and queue action times for the last 24 hours and for the last 3 months (or the app install date, whichever is later).

**Note**: If your sub has opted in to the new wiki experience, you will **not** see the wiki page update. However, you can navigate to the equivalent on Old Reddit to see statistics, even after you have opted in. Unfortunately, there is no API support for the new wiki experience and so it is not possible to update new wiki pages yet. Once support is available, it will be added.

It also includes a table with data for each day for the past 28 days.

All times are in UTC.

[Example analytics page](https://www.reddit.com/r/fsvapps/wiki/modqueue-tools/examplestats)
**Note:** this will not render properly on the Reddit mobile app.

The app will only report on queue activity after the app is installed. To get the best out of the analytics, you will need to wait a few days. The page updates once a day, shortly after midnight UTC.

## Alerting

You can specify a threshold (number of queue items) and (optionally) a queue item age (in hours). The app will alert moderators via a Discord webhook if either the queue size is reached or a single item in the queue has been there for too long.

The app checks the queue every 5 minutes and will send a message if needed. But if the queue stays too large (or has too old items), further messages won't be sent until the queue is dealt with and the length is reduced, or the older items are actioned.

You can also configure a percentage threshold for when an individual post will show in the alert.

![Example Screenshot](https://raw.githubusercontent.com/bartschliam/modqueue-tools/main/doc_images/ModqueueAlert.png)

[A guide on how to set up a webhook can be found here](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks).

### Multiple webhooks

Unlike the original modqueue-tools app, modqueue-tools-plus lets you send alerts to more than one Discord webhook. Enter one webhook URL per line in the "Discord webhook URLs" setting.

By default, every webhook uses the queue size and item age thresholds configured above. If you want a specific webhook to use different thresholds (for example, a channel that should only be notified for a much larger backlog), add a matching line in the "Per-webhook thresholds" setting, using the format `threshold:NUMBER|ageHours:NUMBER`. The line number in that field corresponds to the same line number in the webhook URL field; leave a line blank to keep the default thresholds for that webhook.

## Source Code and Licence

This app is open source, forked from [modqueue-tools](https://github.com/fsvreddit/modqueue-tools) by fsvreddit. [You can find this fork on GitHub here](https://github.com/bartschliam/modqueue-tools). Both projects are distributed under the [BSD-3-Clause licence](LICENSE).

## Version History

### v1.4.0 (modqueue-tools-plus)

* Added support for multiple Discord webhooks, each with optional per-webhook thresholds

### v1.3.2

* Mitigate against duplicate actions if the Developer Platform is having issues

### v1.3

* Discord messages now stay updated with new queue lengths while the queue is over the threshold
* New option to allow the alert message to be deleted or updated when the queue is under the threshold (disabled by default to match previous behaviour)

### v1.2.6

* Update Dev Platform version and README. No user facing changes in this release.

### v1.2.5

* If any stats are greater than 1000, indicate that this may be over 1000 due to limits in Reddit data retrieval
* Improve reliability of install
* Update Devvit and dependencies

### v1.2.3

* Fix problem that prevents newer Discord webhooks from being used
* Fix "1 item are over X hours old" wording

### v1.2

* Update Devvit library version only, and reformat code. No functional changes.

### v1.1

* Update Devvit library version only. No functional changes.

### v1.0.5

* Fix 3 bugs that affected subs with large queues that were present before install. It caused alerts to show inaccurate queue item age and dominant item, and show inaccurate mod action time in wiki page.
* Clarify help text on settings
