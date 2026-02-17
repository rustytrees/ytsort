# YTSort - YouTube Subscription Organizer

A userscript that lets you categorize, filter, sort, and hide videos on your YouTube subscription feed.

## Features

- **Category filtering** — Assign channels to categories (Music, Gaming, Tech, etc.) and filter your feed by category using a chip-style button bar
- **Hide categories** — Mark categories as hidden so their videos don't appear in the default "All" view
- **Sort by date** — Reorder your subscription feed by upload recency (parses "X time ago" labels)
- **Auto-detect categories** — Optionally provide a YouTube Data API v3 key to auto-classify channels based on their topic metadata
- **Manual overrides** — Full settings UI to assign or reassign any channel to any category
- **Persistent storage** — All settings, channel assignments, and filter state are saved across sessions
- **Import / Export** — Back up and restore your configuration as JSON
- **SPA-aware** — Handles YouTube's single-page-app navigation and infinite scroll
- **Dark/light theme** — Uses YouTube's CSS custom properties so it matches your current theme

## Installation

### 1. Install a userscript manager

| Browser | Extension |
|---------|-----------|
| Firefox | [Tampermonkey](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) or [Violentmonkey](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/) |
| Chrome  | [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) or [Violentmonkey](https://chrome.google.com/webstore/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag) |

### 2. Install the userscript

Click the link below (or paste the raw URL into your userscript manager's "Install from URL" dialog):

**[Install ytsort.user.js](https://raw.githubusercontent.com/rustytrees/ytsort/main/ytsort.user.js)**

Alternatively, copy the contents of `ytsort.user.js` and create a new script in your userscript manager.

### 3. Open YouTube Subscriptions

Navigate to <https://www.youtube.com/feed/subscriptions>. You should see a new filter bar above your video grid.

## Usage

### Filter bar

The filter bar appears at the top of the subscription feed:

- **All** — Show all videos (minus any hidden categories)
- **Category chips** — Click one or more categories to show only those. Click again to deselect.
- **Sort by Date** — Toggle chronological re-ordering of the visible video cards
- **Settings** — Open the configuration modal

### Settings modal

Open via the gear button on the filter bar, or from the userscript manager menu.

#### Channels tab

Lists every channel discovered from your feed. Use the dropdown next to each channel to assign it to a category. A search box filters the list.

#### Categories tab

Add new categories, remove existing ones, or toggle category visibility:

- **[hide]** — Videos from this category won't appear in the "All" view
- **[show]** — Restore the category to the "All" view
- **×** — Delete the category (affected channels revert to "Uncategorized")

#### API tab (optional)

Provide a YouTube Data API v3 key to enable automatic category detection:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a project (or use an existing one)
3. Enable the **YouTube Data API v3**
4. Create an **API key** credential
5. Paste the key into the settings and click **Save Key**
6. Click **Auto-Detect Now** to classify discovered channels

The auto-detector reads each channel's `topicDetails.topicCategories` from the YouTube API and maps them to built-in categories. It will not overwrite channels you've already manually categorized.

**Quota note:** The YouTube Data API has a daily quota of 10,000 units. Each channel resolution costs 1 unit, and each batch of 50 channels for topic detection costs 1 unit. A feed with 200 subscriptions would use roughly 200 + 4 = 204 units.

#### Import / Export tab

- **Export** — Generate a JSON snapshot of your categories and channel assignments
- **Import** — Paste a previously exported JSON to restore settings
- **Reset All** — Clear all YTSort data and revert to defaults

## How it works

1. The script runs on all `youtube.com` pages and listens for YouTube's SPA navigation events (`yt-navigate-finish`, `yt-page-data-updated`).
2. When you visit `/feed/subscriptions`, it waits for the grid to render, then injects the filter bar.
3. It scans each video card for the channel name using multiple DOM selector fallbacks.
4. Each channel is looked up in the stored channel-to-category map. New channels default to "Uncategorized".
5. A `MutationObserver` watches the grid for new cards loaded via infinite scroll and processes them automatically.
6. Filtering works by toggling `display: none` on video card elements.
7. Date sorting parses the relative time strings ("2 hours ago", "3 days ago") into seconds and reorders the DOM.

## Compatibility

- **Firefox** — Tampermonkey, Violentmonkey, Greasemonkey 4+
- **Chrome / Edge** — Tampermonkey, Violentmonkey
- YouTube's DOM structure changes periodically. The script uses multiple fallback selectors for resilience, but may need updates if YouTube makes major layout changes.

## License

MIT
