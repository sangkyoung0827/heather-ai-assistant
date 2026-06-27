# Heather Account-Aware Automation

Heather uses account profiles to route desktop and website actions without storing passwords, cookies, API keys, or Google tokens in the repository.

## Profiles

- `work`: `waterfallingsound0827@gmail.com`
  - Services: Google Calendar, Gmail, Google Drive, Docs, meetings
  - Used for productivity, scheduling, project work, and calendar tasks
- `media`: `samkyoung1004@gmail.com`
  - Services: YouTube, YouTube Music, Netflix
  - Used for entertainment and media playback/search

## Current Browser Strategy

The MVP uses URL-based navigation first. Browser profile routing is represented in action metadata and UI, but if native browser profile selection is unavailable Heather asks the user to confirm the active browser account.

Allowed sites:

- Google Search
- Google Calendar
- Gmail
- YouTube
- YouTube Music
- Netflix

Blocked website automation:

- payments
- purchases
- account settings
- password entry
- security settings
- financial websites
- stock trading
- banking

## Calendar Strategy

Google Calendar belongs only to the `work` profile. The preferred integration is Google Calendar API with OAuth. Until OAuth client configuration and secure token storage are wired, Heather can:

- route calendar requests to the work profile
- parse read/create/update/delete intent
- show confirmation proposals
- open Google Calendar
- log the action
- avoid changing calendar data without OAuth

No Google password or token is stored by this MVP.

## YouTube Music Strategy

For a request like `헤더, 유튜브 뮤직에서 Living on a Prayer 재생해줘`, Heather routes to:

- intent: `play_music`
- service: `youtube_music`
- profile: `media`
- URL: `https://music.youtube.com/search?q=Living%20on%20a%20Prayer`

Automatic click-to-play is intentionally left as a future site driver because it needs reliable DOM selectors and user-approved browser session state.
