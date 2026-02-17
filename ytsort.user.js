// ==UserScript==
// @name         YTSort - YouTube Subscription Organizer
// @namespace    https://github.com/rustytrees/ytsort
// @version      1.0.0
// @description  Categorize, filter, sort, and organize your YouTube subscription feed
// @author       YTSort
// @match        https://www.youtube.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @compatible   firefox Greasemonkey/Tampermonkey/Violentmonkey
// @compatible   chrome Tampermonkey/Violentmonkey
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/rustytrees/ytsort/main/ytsort.user.js
// @updateURL    https://raw.githubusercontent.com/rustytrees/ytsort/main/ytsort.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // Constants
  // ============================================================

  const SCRIPT_ID = 'ytsort';

  const STORAGE_KEYS = {
    categories: `${SCRIPT_ID}_categories`,
    channelMap: `${SCRIPT_ID}_channel_map`,
    apiKey: `${SCRIPT_ID}_api_key`,
    activeFilters: `${SCRIPT_ID}_active_filters`,
    sortByDate: `${SCRIPT_ID}_sort_by_date`,
    hiddenCategories: `${SCRIPT_ID}_hidden_categories`,
  };

  const DEFAULT_CATEGORIES = [
    'Music',
    'Gaming',
    'Tech',
    'Education',
    'Entertainment',
    'News & Politics',
    'Science',
    'Sports',
    'Comedy',
    'Howto & DIY',
    'Film & Animation',
    'Lifestyle',
    'Other',
  ];

  // Map Wikipedia topic slugs (from YouTube API topicDetails) to our categories
  const TOPIC_TO_CATEGORY = {
    Music: 'Music',
    Pop_music: 'Music',
    Rock_music: 'Music',
    Hip_hop_music: 'Music',
    Electronic_music: 'Music',
    Country_music: 'Music',
    Jazz: 'Music',
    Classical_music: 'Music',
    Rhythm_and_blues: 'Music',
    Soul_music: 'Music',
    Independent_music: 'Music',
    Video_game: 'Gaming',
    Action_game: 'Gaming',
    'Role-playing_video_game': 'Gaming',
    'Action-adventure_game': 'Gaming',
    Simulation_video_game: 'Gaming',
    Strategy_video_game: 'Gaming',
    Massively_multiplayer_online_game: 'Gaming',
    Technology: 'Tech',
    Computer: 'Tech',
    Software: 'Tech',
    Education: 'Education',
    Entertainment: 'Entertainment',
    Television: 'Entertainment',
    Humour: 'Comedy',
    Comedy: 'Comedy',
    Film: 'Film & Animation',
    Animation: 'Film & Animation',
    Animated_cartoon: 'Film & Animation',
    News: 'News & Politics',
    Politics: 'News & Politics',
    Sport: 'Sports',
    Association_football: 'Sports',
    Basketball: 'Sports',
    American_football: 'Sports',
    Baseball: 'Sports',
    Tennis: 'Sports',
    Golf: 'Sports',
    Cricket: 'Sports',
    Ice_hockey: 'Sports',
    Boxing: 'Sports',
    Motorsport: 'Sports',
    Science: 'Science',
    Physics: 'Science',
    Mathematics: 'Science',
    Chemistry: 'Science',
    Biology: 'Science',
    Fashion: 'Lifestyle',
    Fitness: 'Lifestyle',
    Food: 'Howto & DIY',
    Cooking: 'Howto & DIY',
    Pet: 'Lifestyle',
    Health: 'Lifestyle',
    Tourism: 'Lifestyle',
    Hobby: 'Howto & DIY',
    Vehicle: 'Lifestyle',
    Society: 'News & Politics',
    Business: 'News & Politics',
    Military: 'News & Politics',
    'Lifestyle_(sociology)': 'Lifestyle',
    Knowledge: 'Education',
    Performing_arts: 'Entertainment',
  };

  // ============================================================
  // GM_addStyle polyfill (for Greasemonkey 4+ which removed it)
  // ============================================================

  const addStyle = (typeof GM_addStyle === 'function')
    ? GM_addStyle
    : function (css) {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        return style;
      };

  // ============================================================
  // Storage Layer
  // ============================================================

  const Storage = {
    get(key, defaultValue) {
      try {
        const val = GM_getValue(key, null);
        if (val === null || val === undefined) return defaultValue;
        return typeof val === 'string' ? JSON.parse(val) : val;
      } catch {
        return defaultValue;
      }
    },
    set(key, value) {
      GM_setValue(key, JSON.stringify(value));
    },
  };

  // ============================================================
  // Application State
  // ============================================================

  const state = {
    categories: Storage.get(STORAGE_KEYS.categories, [...DEFAULT_CATEGORIES]),
    channelMap: Storage.get(STORAGE_KEYS.channelMap, {}),
    apiKey: Storage.get(STORAGE_KEYS.apiKey, ''),
    activeFilters: Storage.get(STORAGE_KEYS.activeFilters, []),
    sortByDate: Storage.get(STORAGE_KEYS.sortByDate, false),
    hiddenCategories: Storage.get(STORAGE_KEYS.hiddenCategories, []),
    uiInjected: false,
    observer: null,
    originalOrder: null,
  };

  function saveState() {
    Storage.set(STORAGE_KEYS.categories, state.categories);
    Storage.set(STORAGE_KEYS.channelMap, state.channelMap);
    Storage.set(STORAGE_KEYS.apiKey, state.apiKey);
    Storage.set(STORAGE_KEYS.activeFilters, state.activeFilters);
    Storage.set(STORAGE_KEYS.sortByDate, state.sortByDate);
    Storage.set(STORAGE_KEYS.hiddenCategories, state.hiddenCategories);
  }

  // ============================================================
  // DOM Utilities
  // ============================================================

  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for ${selector}`));
      }, timeout);
    });
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') node.className = value;
      else if (key === 'textContent') node.textContent = value;
      else if (key === 'innerHTML') node.innerHTML = value;
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        node.setAttribute(key, value);
      }
    }
    for (const child of children) {
      if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else if (child) node.appendChild(child);
    }
    return node;
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // ============================================================
  // YouTube DOM Interaction
  // ============================================================

  function isSubscriptionsPage() {
    return location.pathname.startsWith('/feed/subscriptions');
  }

  function getVideoCards() {
    return document.querySelectorAll(
      'ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer'
    );
  }

  function getChannelName(card) {
    const selectors = [
      // New yt-lockup layout (2024+)
      'yt-attribution-view-model a span',
      // Metadata row first span
      '.yt-content-metadata-view-model-wiz__metadata-text span:first-child',
      '.yt-content-metadata-view-model__metadata-row span:first-child',
      // Classic layout
      'yt-formatted-string.ytd-channel-name a',
      'yt-formatted-string.ytd-channel-name',
      '#channel-name yt-formatted-string a',
      '#channel-name yt-formatted-string',
      '#channel-name a',
      '#byline a',
      '#byline',
    ];

    for (const selector of selectors) {
      const found = card.querySelector(selector);
      if (found) {
        const text = found.textContent.trim();
        if (text) return text;
      }
    }
    return null;
  }

  function getVideoTimeText(card) {
    const selectors = [
      // New layout — metadata spans
      '.yt-content-metadata-view-model-wiz__metadata-text span:last-child',
      '.yt-content-metadata-view-model__metadata-row span:last-child',
      // Classic layout
      '#metadata-line span:nth-child(2)',
      'ytd-video-meta-block #metadata-line span:last-child',
      '.inline-metadata-item:last-child',
    ];

    for (const selector of selectors) {
      const found = card.querySelector(selector);
      if (found) {
        const text = found.textContent.trim();
        if (/ago|hour|minute|second|day|week|month|year/i.test(text)) {
          return text;
        }
      }
    }
    return null;
  }

  /** Convert "X time ago" string to seconds-ago number for sorting. */
  function parseTimeAgo(timeStr) {
    if (!timeStr) return Infinity;
    const cleaned = timeStr.replace(/^(Streamed|Premiered)\s+/i, '').trim();
    const match = cleaned.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
    if (!match) return Infinity;

    const num = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multipliers = {
      second: 1,
      minute: 60,
      hour: 3600,
      day: 86400,
      week: 604800,
      month: 2592000,
      year: 31536000,
    };
    return num * (multipliers[unit] || Infinity);
  }

  function getChannelLink(card) {
    const selectors = [
      'a[href*="/@"]',
      '#channel-name a[href]',
      'yt-attribution-view-model a[href]',
    ];
    for (const selector of selectors) {
      const found = card.querySelector(selector);
      if (found && found.href) return found.href;
    }
    return null;
  }

  function getGridContainer() {
    return document.querySelector(
      'ytd-browse[page-subtype="subscriptions"] ytd-rich-grid-renderer #contents'
    );
  }

  // ============================================================
  // Category Management
  // ============================================================

  function getChannelCategory(channelName) {
    if (!channelName) return 'Uncategorized';
    return state.channelMap[channelName] || 'Uncategorized';
  }

  function setChannelCategory(channelName, category) {
    state.channelMap[channelName] = category;
    saveState();
  }

  function getDiscoveredChannels() {
    const channels = new Set();
    getVideoCards().forEach((card) => {
      const name = getChannelName(card);
      if (name) channels.add(name);
    });
    return [...channels].sort((a, b) => a.localeCompare(b));
  }

  // ============================================================
  // YouTube Data API v3 Integration (optional)
  // ============================================================

  function apiGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        onload(resp) {
          try {
            resolve(JSON.parse(resp.responseText));
          } catch {
            reject(new Error('Failed to parse API response'));
          }
        },
        onerror: reject,
      });
    });
  }

  /** Resolve /@handle URLs to channel IDs via the API. */
  async function resolveHandlesToIds(handleUrls) {
    if (!state.apiKey) return [];
    const ids = [];
    for (const url of handleUrls) {
      const match = url.match(/@([^/?]+)/);
      if (!match) continue;
      try {
        const data = await apiGet(
          `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=${encodeURIComponent(match[1])}&key=${state.apiKey}`
        );
        if (data.items?.[0]) {
          ids.push({ id: data.items[0].id, title: data.items[0].snippet?.title });
        }
      } catch (e) {
        console.warn('[YTSort] Failed to resolve handle:', match[1], e);
      }
    }
    return ids;
  }

  /** Fetch topicDetails for batches of channel IDs and update channelMap. */
  async function autoDetectCategories(channels) {
    if (!state.apiKey) return;

    // channels = [{id, title}, ...]
    const batches = [];
    for (let i = 0; i < channels.length; i += 50) {
      batches.push(channels.slice(i, i + 50));
    }

    for (const batch of batches) {
      const ids = batch.map((c) => c.id).join(',');
      try {
        const data = await apiGet(
          `https://www.googleapis.com/youtube/v3/channels?part=topicDetails,snippet&id=${ids}&key=${state.apiKey}`
        );
        if (!data.items) continue;

        for (const item of data.items) {
          const title = item.snippet?.title;
          if (!title) continue;
          // Skip manually-categorized channels
          if (state.channelMap[title] && state.channelMap[title] !== 'Uncategorized') continue;

          const topics = item.topicDetails?.topicCategories || [];
          let category = 'Other';
          for (const topicUrl of topics) {
            const slug = topicUrl.split('/wiki/')[1];
            if (slug && TOPIC_TO_CATEGORY[slug]) {
              category = TOPIC_TO_CATEGORY[slug];
              break;
            }
          }
          state.channelMap[title] = category;
        }
      } catch (e) {
        console.error('[YTSort] API batch error:', e);
      }
    }
    saveState();
  }

  // ============================================================
  // Styles
  // ============================================================

  const STYLES = `
/* ---- YTSort Filter Bar ---- */
.ytsort-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--yt-spec-10-percent-layer, #333);
  position: sticky;
  top: 56px; /* below YouTube's top bar */
  z-index: 2000;
  background: var(--yt-spec-base-background, #0f0f0f);
}
.ytsort-bar-section {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.ytsort-bar-divider {
  width: 1px;
  height: 24px;
  background: var(--yt-spec-10-percent-layer, #333);
  margin: 0 4px;
}
.ytsort-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 8px;
  border: none;
  font-size: 13px;
  font-family: "Roboto", Arial, sans-serif;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  background: var(--yt-spec-badge-chip-background, #272727);
  color: var(--yt-spec-text-primary, #f1f1f1);
  white-space: nowrap;
  user-select: none;
}
.ytsort-btn:hover {
  background: var(--yt-spec-10-percent-layer, #3f3f3f);
}
.ytsort-btn.active {
  background: var(--yt-spec-text-primary, #f1f1f1);
  color: var(--yt-spec-general-background-a, #0f0f0f);
}
.ytsort-btn.sort-active {
  background: #065fd4;
  color: #fff;
}
.ytsort-count {
  font-size: 11px;
  opacity: 0.7;
  margin-left: 2px;
}

/* ---- Settings Modal ---- */
.ytsort-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ytsort-modal {
  background: var(--yt-spec-base-background, #0f0f0f);
  border: 1px solid var(--yt-spec-10-percent-layer, #333);
  border-radius: 12px;
  width: 720px;
  max-width: 92vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.ytsort-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--yt-spec-10-percent-layer, #333);
}
.ytsort-modal-title {
  font-size: 18px;
  font-weight: 500;
  color: var(--yt-spec-text-primary, #f1f1f1);
}
.ytsort-modal-close {
  background: none;
  border: none;
  color: var(--yt-spec-text-secondary, #aaa);
  font-size: 24px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 50%;
  line-height: 1;
}
.ytsort-modal-close:hover {
  background: var(--yt-spec-10-percent-layer, #3f3f3f);
}
.ytsort-modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

/* Tabs */
.ytsort-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--yt-spec-10-percent-layer, #333);
  margin-bottom: 16px;
}
.ytsort-tab {
  padding: 10px 20px;
  border: none;
  background: none;
  color: var(--yt-spec-text-secondary, #aaa);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.ytsort-tab:hover {
  color: var(--yt-spec-text-primary, #f1f1f1);
}
.ytsort-tab.active {
  color: var(--yt-spec-text-primary, #f1f1f1);
  border-bottom-color: var(--yt-spec-text-primary, #f1f1f1);
}
.ytsort-tab-panel { display: none; }
.ytsort-tab-panel.active { display: block; }

/* Sections */
.ytsort-section {
  margin-bottom: 24px;
}
.ytsort-section-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--yt-spec-text-primary, #f1f1f1);
  margin-bottom: 8px;
}
.ytsort-section-desc {
  font-size: 12px;
  color: var(--yt-spec-text-secondary, #aaa);
  margin-bottom: 10px;
  line-height: 1.5;
}
.ytsort-section-desc a {
  color: #3ea6ff;
}

/* Inputs */
.ytsort-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--yt-spec-10-percent-layer, #333);
  background: var(--yt-spec-additive-background, #121212);
  color: var(--yt-spec-text-primary, #f1f1f1);
  font-size: 13px;
  font-family: "Roboto", Arial, sans-serif;
  box-sizing: border-box;
}
.ytsort-input:focus {
  outline: none;
  border-color: #3ea6ff;
}
.ytsort-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.ytsort-input-row .ytsort-input { flex: 1; }

/* Buttons */
.ytsort-action-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: #065fd4;
  color: #fff;
  white-space: nowrap;
}
.ytsort-action-btn:hover { background: #0b6fe4; }
.ytsort-action-btn.secondary {
  background: var(--yt-spec-badge-chip-background, #272727);
  color: var(--yt-spec-text-primary, #f1f1f1);
}
.ytsort-action-btn.secondary:hover {
  background: var(--yt-spec-10-percent-layer, #3f3f3f);
}
.ytsort-action-btn.danger { background: #c00; color: #fff; }
.ytsort-action-btn.danger:hover { background: #e00; }

/* Category tags */
.ytsort-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.ytsort-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 16px;
  font-size: 12px;
  background: var(--yt-spec-badge-chip-background, #272727);
  color: var(--yt-spec-text-primary, #f1f1f1);
}
.ytsort-tag.hidden-cat { opacity: 0.45; }
.ytsort-tag-action {
  cursor: pointer;
  opacity: 0.6;
  font-size: 13px;
}
.ytsort-tag-action:hover { opacity: 1; }

/* Channel table */
.ytsort-ch-table {
  width: 100%;
  border-collapse: collapse;
}
.ytsort-ch-table th,
.ytsort-ch-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--yt-spec-10-percent-layer, #333);
  font-size: 13px;
  color: var(--yt-spec-text-primary, #f1f1f1);
}
.ytsort-ch-table th {
  font-weight: 500;
  color: var(--yt-spec-text-secondary, #aaa);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.ytsort-ch-table select {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--yt-spec-10-percent-layer, #333);
  background: var(--yt-spec-additive-background, #121212);
  color: var(--yt-spec-text-primary, #f1f1f1);
  font-size: 13px;
  cursor: pointer;
}

/* Status */
.ytsort-status {
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--yt-spec-additive-background, #121212);
  color: var(--yt-spec-text-secondary, #aaa);
  font-size: 12px;
  margin-top: 10px;
}
.ytsort-status.ok   { color: #4caf50; }
.ytsort-status.err  { color: #f44336; }

/* Textarea */
.ytsort-textarea {
  width: 100%;
  min-height: 100px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--yt-spec-10-percent-layer, #333);
  background: var(--yt-spec-additive-background, #121212);
  color: var(--yt-spec-text-primary, #f1f1f1);
  font-size: 12px;
  font-family: monospace;
  resize: vertical;
  box-sizing: border-box;
}

/* Toast */
.ytsort-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 8px;
  background: #323232;
  color: #fff;
  font-size: 14px;
  z-index: 20000;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}
.ytsort-toast.show { opacity: 1; }

/* Card hiding */
ytd-rich-item-renderer.ytsort-hidden { display: none !important; }
`;

  // ============================================================
  // Toast notifications
  // ============================================================

  function showToast(message, duration = 2500) {
    let toast = document.querySelector('.ytsort-toast');
    if (!toast) {
      toast = el('div', { className: 'ytsort-toast' });
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  // ============================================================
  // Filter Bar UI
  // ============================================================

  function buildFilterBar() {
    const bar = el('div', { className: 'ytsort-bar', id: 'ytsort-filter-bar' });

    // --- Category filter buttons ---
    const catSection = el('div', { className: 'ytsort-bar-section' });

    // Count videos per category
    const counts = {};
    getVideoCards().forEach((card) => {
      const cat = getChannelCategory(getChannelName(card));
      counts[cat] = (counts[cat] || 0) + 1;
    });

    // "All" button
    catSection.appendChild(
      el('button', {
        className: `ytsort-btn ${state.activeFilters.length === 0 ? 'active' : ''}`,
        textContent: 'All',
        onClick: () => {
          state.activeFilters = [];
          saveState();
          refreshUI();
        },
      })
    );

    // One button per category that has visible videos (or is actively filtered)
    const relevantCats = [...new Set([...state.categories, 'Uncategorized'])];
    for (const cat of relevantCats) {
      const count = counts[cat] || 0;
      const isActive = state.activeFilters.includes(cat);
      if (count === 0 && !isActive) continue;

      const btn = el(
        'button',
        {
          className: `ytsort-btn ${isActive ? 'active' : ''}`,
          onClick: () => toggleCategoryFilter(cat),
        },
        [
          document.createTextNode(cat + ' '),
          el('span', { className: 'ytsort-count', textContent: String(count) }),
        ]
      );
      catSection.appendChild(btn);
    }
    bar.appendChild(catSection);
    bar.appendChild(el('div', { className: 'ytsort-bar-divider' }));

    // --- Sort toggle ---
    const sortSection = el('div', { className: 'ytsort-bar-section' });
    sortSection.appendChild(
      el(
        'button',
        {
          className: `ytsort-btn ${state.sortByDate ? 'sort-active' : ''}`,
          onClick: toggleSort,
        },
        [document.createTextNode(state.sortByDate ? 'Sorted by Date' : 'Sort by Date')]
      )
    );
    bar.appendChild(sortSection);
    bar.appendChild(el('div', { className: 'ytsort-bar-divider' }));

    // --- Settings gear ---
    bar.appendChild(
      el('button', { className: 'ytsort-btn', onClick: openSettings, title: 'YTSort Settings' }, [
        document.createTextNode('\u2699 Settings'),
      ])
    );

    return bar;
  }

  function refreshUI() {
    // Rebuild filter bar and reapply filters
    const existing = document.getElementById('ytsort-filter-bar');
    if (existing) {
      const newBar = buildFilterBar();
      existing.replaceWith(newBar);
    }
    applyFilters();
  }

  function toggleCategoryFilter(cat) {
    const idx = state.activeFilters.indexOf(cat);
    if (idx >= 0) {
      state.activeFilters.splice(idx, 1);
    } else {
      state.activeFilters.push(cat);
    }
    saveState();
    refreshUI();
  }

  function toggleSort() {
    state.sortByDate = !state.sortByDate;
    saveState();
    if (state.sortByDate) {
      saveOriginalOrder();
      sortVideosByDate();
    } else {
      restoreOriginalOrder();
    }
    refreshUI();
  }

  // ============================================================
  // Filter Logic
  // ============================================================

  function applyFilters() {
    getVideoCards().forEach((card) => {
      const cat = getChannelCategory(getChannelName(card));

      if (state.activeFilters.length === 0) {
        // "All" mode: show everything except hidden categories
        card.classList.toggle('ytsort-hidden', state.hiddenCategories.includes(cat));
      } else {
        // Show only selected categories
        card.classList.toggle('ytsort-hidden', !state.activeFilters.includes(cat));
      }
    });
  }

  // ============================================================
  // Sort Logic
  // ============================================================

  function saveOriginalOrder() {
    if (state.originalOrder) return;
    const container = getGridContainer();
    if (!container) return;
    state.originalOrder = [...container.children];
  }

  function restoreOriginalOrder() {
    const container = getGridContainer();
    if (!container || !state.originalOrder) return;
    const frag = document.createDocumentFragment();
    for (const child of state.originalOrder) {
      frag.appendChild(child);
    }
    container.appendChild(frag);
    state.originalOrder = null;
  }

  function sortVideosByDate() {
    const container = getGridContainer();
    if (!container) return;

    // Gather all video items regardless of whether they're in grid-row wrappers
    const items = [...container.querySelectorAll(':scope > ytd-rich-item-renderer')];

    // Also handle items nested inside ytd-rich-grid-row
    const rows = container.querySelectorAll(':scope > ytd-rich-grid-row');
    rows.forEach((row) => {
      const rowItems = row.querySelectorAll('ytd-rich-item-renderer');
      rowItems.forEach((item) => items.push(item));
    });

    if (items.length === 0) return;

    items.sort((a, b) => parseTimeAgo(getVideoTimeText(a)) - parseTimeAgo(getVideoTimeText(b)));

    // Remove grid rows (we'll put items directly into the container)
    rows.forEach((row) => row.remove());

    // Collect non-video children (continuation elements, section renderers, etc.)
    const others = [...container.children].filter(
      (c) => c.tagName !== 'YTD-RICH-ITEM-RENDERER'
    );

    const frag = document.createDocumentFragment();
    for (const item of items) frag.appendChild(item);
    for (const other of others) frag.appendChild(other);
    container.appendChild(frag);
  }

  // ============================================================
  // Settings Modal
  // ============================================================

  function openSettings() {
    if (document.querySelector('.ytsort-overlay')) return;

    const overlay = el('div', { className: 'ytsort-overlay' });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSettings();
    });

    const modal = el('div', { className: 'ytsort-modal' });

    // Header
    modal.appendChild(
      el('div', { className: 'ytsort-modal-header' }, [
        el('span', { className: 'ytsort-modal-title', textContent: 'YTSort Settings' }),
        el('button', { className: 'ytsort-modal-close', textContent: '\u00d7', onClick: closeSettings }),
      ])
    );

    // Body
    const body = el('div', { className: 'ytsort-modal-body' });

    // Tabs
    const tabNames = ['Channels', 'Categories', 'API', 'Import / Export'];
    const panels = [];
    const tabBar = el('div', { className: 'ytsort-tabs' });

    tabNames.forEach((name, i) => {
      const tab = el('button', {
        className: `ytsort-tab ${i === 0 ? 'active' : ''}`,
        textContent: name,
        onClick: () => {
          tabBar.querySelectorAll('.ytsort-tab').forEach((t) => t.classList.remove('active'));
          tab.classList.add('active');
          panels.forEach((p, j) => p.classList.toggle('active', j === i));
        },
      });
      tabBar.appendChild(tab);
    });
    body.appendChild(tabBar);

    // Tab panels
    panels.push(buildChannelsPanel());
    panels.push(buildCategoriesPanel());
    panels.push(buildAPIPanel());
    panels.push(buildExportPanel());
    panels.forEach((p) => body.appendChild(p));

    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function closeSettings() {
    document.querySelector('.ytsort-overlay')?.remove();
    refreshUI();
  }

  // --- Channels Panel ---

  function buildChannelsPanel() {
    const panel = el('div', { className: 'ytsort-tab-panel active' });

    const section = el('div', { className: 'ytsort-section' });
    section.appendChild(el('div', { className: 'ytsort-section-title', textContent: 'Channel Categories' }));
    section.appendChild(
      el('div', {
        className: 'ytsort-section-desc',
        textContent:
          'Assign a category to each channel. Channels are discovered automatically from your subscription feed as you browse.',
      })
    );

    // Search + category filter row
    const filterRow = el('div', { className: 'ytsort-input-row', style: 'margin-bottom: 10px;' });

    const filterInput = el('input', {
      className: 'ytsort-input',
      placeholder: 'Search channels\u2026',
      type: 'text',
    });
    filterRow.appendChild(filterInput);

    const catFilter = el('select', { className: 'ytsort-input', style: 'width: auto; min-width: 160px;' });
    const catFilterOpts = ['All Categories', 'Uncategorized', ...state.categories];
    for (const label of catFilterOpts) {
      const opt = el('option', { textContent: label });
      opt.value = label;
      catFilter.appendChild(opt);
    }
    // Default to "Uncategorized" isn't forced, but it's easy to select
    filterRow.appendChild(catFilter);
    section.appendChild(filterRow);

    // Table
    const table = el('table', { className: 'ytsort-ch-table' });
    table.appendChild(
      el('thead', {}, [
        el('tr', {}, [
          el('th', { textContent: 'Channel' }),
          el('th', { textContent: 'Category' }),
        ]),
      ])
    );

    const tbody = el('tbody');
    const allChannels = [
      ...new Set([...getDiscoveredChannels(), ...Object.keys(state.channelMap)]),
    ].sort((a, b) => a.localeCompare(b));

    for (const ch of allChannels) {
      tbody.appendChild(buildChannelRow(ch));
    }
    table.appendChild(tbody);
    section.appendChild(table);

    // Combined filter handler (text search + category dropdown)
    function applyChannelFilters() {
      const q = filterInput.value.toLowerCase();
      const selectedCat = catFilter.value;
      tbody.querySelectorAll('tr').forEach((row) => {
        const name = (row.dataset.ch || '').toLowerCase();
        const rowCat = getChannelCategory(row.dataset.ch);
        const matchesText = !q || name.includes(q);
        const matchesCat = selectedCat === 'All Categories' || rowCat === selectedCat;
        row.style.display = (matchesText && matchesCat) ? '' : 'none';
      });
    }
    filterInput.addEventListener('input', applyChannelFilters);
    catFilter.addEventListener('change', applyChannelFilters);

    // Store the filter function so row change handlers can re-apply it
    tbody._applyFilters = applyChannelFilters;

    panel.appendChild(section);
    return panel;
  }

  function buildChannelRow(channelName) {
    const currentCat = getChannelCategory(channelName);
    const row = el('tr', { 'data-ch': channelName });
    row.appendChild(el('td', { textContent: channelName }));

    const select = el('select');
    const cats = [...state.categories, 'Uncategorized'];
    for (const cat of cats) {
      const opt = el('option', { textContent: cat });
      opt.value = cat;
      if (cat === currentCat) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      setChannelCategory(channelName, select.value);
      showToast(`${channelName} \u2192 ${select.value}`);
      // Re-apply the table filter so the row hides if it no longer matches
      const tbody = row.closest('tbody');
      if (tbody?._applyFilters) tbody._applyFilters();
    });

    const td = el('td');
    td.appendChild(select);
    row.appendChild(td);
    return row;
  }

  // --- Categories Panel ---

  function buildCategoriesPanel() {
    const panel = el('div', { className: 'ytsort-tab-panel' });

    // Add category
    const addSection = el('div', { className: 'ytsort-section' });
    addSection.appendChild(el('div', { className: 'ytsort-section-title', textContent: 'Manage Categories' }));
    addSection.appendChild(
      el('div', {
        className: 'ytsort-section-desc',
        textContent:
          'Add or remove categories. Toggle visibility to hide a category from the "All" view. Removing a category resets its channels to Uncategorized.',
      })
    );

    const addInput = el('input', { className: 'ytsort-input', placeholder: 'New category name\u2026', type: 'text' });
    const addBtn = el('button', {
      className: 'ytsort-action-btn',
      textContent: 'Add',
      onClick: () => {
        const name = addInput.value.trim();
        if (!name) return;
        if (state.categories.includes(name)) {
          showToast('Category already exists');
          return;
        }
        state.categories.push(name);
        saveState();
        addInput.value = '';
        renderCategoryTags(tagsEl);
        showToast(`Added: ${name}`);
      },
    });
    addSection.appendChild(el('div', { className: 'ytsort-input-row' }, [addInput, addBtn]));

    const tagsEl = el('div', { className: 'ytsort-tags' });
    renderCategoryTags(tagsEl);
    addSection.appendChild(tagsEl);

    panel.appendChild(addSection);
    return panel;
  }

  function renderCategoryTags(container) {
    container.innerHTML = '';
    for (const cat of state.categories) {
      const isHidden = state.hiddenCategories.includes(cat);
      const tag = el(
        'div',
        { className: `ytsort-tag ${isHidden ? 'hidden-cat' : ''}` },
        [
          document.createTextNode(cat),
          // Toggle visibility
          el('span', {
            className: 'ytsort-tag-action',
            textContent: isHidden ? '[show]' : '[hide]',
            title: isHidden ? 'Show in "All" view' : 'Hide from "All" view',
            onClick: () => {
              if (isHidden) {
                state.hiddenCategories = state.hiddenCategories.filter((c) => c !== cat);
              } else {
                state.hiddenCategories.push(cat);
              }
              saveState();
              renderCategoryTags(container);
            },
          }),
          // Remove
          el('span', {
            className: 'ytsort-tag-action',
            textContent: '\u00d7',
            title: 'Remove category',
            onClick: () => {
              if (!confirm(`Remove "${cat}"? Channels assigned to it will become Uncategorized.`)) return;
              state.categories = state.categories.filter((c) => c !== cat);
              state.hiddenCategories = state.hiddenCategories.filter((c) => c !== cat);
              for (const [ch, c] of Object.entries(state.channelMap)) {
                if (c === cat) state.channelMap[ch] = 'Uncategorized';
              }
              saveState();
              renderCategoryTags(container);
              showToast(`Removed: ${cat}`);
            },
          }),
        ]
      );
      container.appendChild(tag);
    }
  }

  // --- API Panel ---

  function buildAPIPanel() {
    const panel = el('div', { className: 'ytsort-tab-panel' });

    // API key
    const keySection = el('div', { className: 'ytsort-section' });
    keySection.appendChild(
      el('div', { className: 'ytsort-section-title', textContent: 'YouTube Data API Key (Optional)' })
    );
    keySection.appendChild(
      el('div', {
        className: 'ytsort-section-desc',
        innerHTML:
          'Providing a YouTube Data API v3 key enables automatic category detection via channel topic metadata. ' +
          'Create one at the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console</a>. ' +
          'Without a key, you can still assign categories manually.',
      })
    );

    const apiInput = el('input', { className: 'ytsort-input', placeholder: 'Paste API key\u2026', type: 'password' });
    apiInput.value = state.apiKey;

    const saveBtn = el('button', {
      className: 'ytsort-action-btn',
      textContent: 'Save Key',
      onClick: () => {
        state.apiKey = apiInput.value.trim();
        saveState();
        showToast('API key saved');
      },
    });
    keySection.appendChild(el('div', { className: 'ytsort-input-row' }, [apiInput, saveBtn]));
    panel.appendChild(keySection);

    // Auto-detect
    const detectSection = el('div', { className: 'ytsort-section' });
    detectSection.appendChild(
      el('div', { className: 'ytsort-section-title', textContent: 'Auto-Detect Categories' })
    );
    detectSection.appendChild(
      el('div', {
        className: 'ytsort-section-desc',
        textContent:
          'Fetch topic categories from YouTube for all channels discovered in your feed. ' +
          'Requires an API key. Channels you have already manually categorized will not be overwritten.',
      })
    );

    const statusDiv = el('div', { className: 'ytsort-status', textContent: 'Ready' });

    const detectBtn = el('button', {
      className: 'ytsort-action-btn',
      textContent: 'Auto-Detect Now',
      onClick: async () => {
        if (!state.apiKey) {
          statusDiv.textContent = 'No API key configured.';
          statusDiv.className = 'ytsort-status err';
          return;
        }
        statusDiv.textContent = 'Collecting channel handles from feed\u2026';
        statusDiv.className = 'ytsort-status';

        try {
          // Gather unique channel links from current page
          const handleSet = new Set();
          getVideoCards().forEach((card) => {
            const link = getChannelLink(card);
            if (link) handleSet.add(link);
          });

          statusDiv.textContent = `Resolving ${handleSet.size} channel handle(s)\u2026`;
          const channels = await resolveHandlesToIds([...handleSet]);

          statusDiv.textContent = `Fetching categories for ${channels.length} channel(s)\u2026`;
          await autoDetectCategories(channels);

          const categorised = Object.values(state.channelMap).filter(
            (c) => c !== 'Uncategorized'
          ).length;
          statusDiv.textContent = `Done \u2014 ${categorised} channel(s) categorised.`;
          statusDiv.className = 'ytsort-status ok';
          showToast('Auto-detection complete');
        } catch (e) {
          statusDiv.textContent = `Error: ${e.message}`;
          statusDiv.className = 'ytsort-status err';
        }
      },
    });

    detectSection.appendChild(detectBtn);
    detectSection.appendChild(statusDiv);
    panel.appendChild(detectSection);
    return panel;
  }

  // --- Import / Export Panel ---

  function buildExportPanel() {
    const panel = el('div', { className: 'ytsort-tab-panel' });

    // Export
    const expSection = el('div', { className: 'ytsort-section' });
    expSection.appendChild(el('div', { className: 'ytsort-section-title', textContent: 'Export' }));

    const exportArea = el('textarea', { className: 'ytsort-textarea', readOnly: 'true' });
    const genBtn = el('button', {
      className: 'ytsort-action-btn secondary',
      textContent: 'Generate',
      onClick: () => {
        exportArea.value = JSON.stringify(
          {
            categories: state.categories,
            channelMap: state.channelMap,
            hiddenCategories: state.hiddenCategories,
          },
          null,
          2
        );
      },
    });
    const copyBtn = el('button', {
      className: 'ytsort-action-btn secondary',
      textContent: 'Copy',
      onClick: () => {
        navigator.clipboard.writeText(exportArea.value).then(() => showToast('Copied'));
      },
    });
    expSection.appendChild(el('div', { className: 'ytsort-input-row', style: 'margin-bottom:8px' }, [genBtn, copyBtn]));
    expSection.appendChild(exportArea);
    panel.appendChild(expSection);

    // Import
    const impSection = el('div', { className: 'ytsort-section' });
    impSection.appendChild(el('div', { className: 'ytsort-section-title', textContent: 'Import' }));

    const importArea = el('textarea', { className: 'ytsort-textarea', placeholder: 'Paste exported JSON here\u2026' });
    const impBtn = el('button', {
      className: 'ytsort-action-btn',
      textContent: 'Import',
      onClick: () => {
        try {
          const data = JSON.parse(importArea.value);
          if (data.categories) state.categories = data.categories;
          if (data.channelMap) Object.assign(state.channelMap, data.channelMap);
          if (data.hiddenCategories) state.hiddenCategories = data.hiddenCategories;
          saveState();
          showToast('Imported successfully');
          closeSettings();
        } catch {
          showToast('Invalid JSON');
        }
      },
    });
    const resetBtn = el('button', {
      className: 'ytsort-action-btn danger',
      textContent: 'Reset All Settings',
      onClick: () => {
        if (!confirm('Reset all YTSort settings to defaults? This cannot be undone.')) return;
        state.categories = [...DEFAULT_CATEGORIES];
        state.channelMap = {};
        state.activeFilters = [];
        state.hiddenCategories = [];
        state.sortByDate = false;
        state.apiKey = '';
        saveState();
        showToast('All settings reset');
        closeSettings();
      },
    });
    impSection.appendChild(el('div', { className: 'ytsort-input-row', style: 'margin-bottom:8px' }, [impBtn, resetBtn]));
    impSection.appendChild(importArea);
    panel.appendChild(impSection);

    return panel;
  }

  // ============================================================
  // Core Lifecycle
  // ============================================================

  function processNewCards() {
    let changed = false;
    getVideoCards().forEach((card) => {
      const name = getChannelName(card);
      if (name && !(name in state.channelMap)) {
        state.channelMap[name] = 'Uncategorized';
        changed = true;
      }
    });
    if (changed) saveState();
    applyFilters();
  }

  const debouncedProcessAndRefresh = debounce(() => {
    processNewCards();
    refreshUI();
    if (state.sortByDate) sortVideosByDate();
  }, 600);

  function injectUI() {
    if (state.uiInjected || !isSubscriptionsPage()) return;

    waitForElement('ytd-browse[page-subtype="subscriptions"] ytd-rich-grid-renderer')
      .then((grid) => {
        if (document.getElementById('ytsort-filter-bar')) {
          state.uiInjected = true;
          return;
        }

        const bar = buildFilterBar();
        grid.insertBefore(bar, grid.firstChild);
        state.uiInjected = true;

        processNewCards();

        if (state.sortByDate) {
          saveOriginalOrder();
          sortVideosByDate();
        }

        // Watch for infinite-scroll additions
        const contents = grid.querySelector('#contents') || grid;
        if (state.observer) state.observer.disconnect();
        state.observer = new MutationObserver(debouncedProcessAndRefresh);
        state.observer.observe(contents, { childList: true });
      })
      .catch(() => {
        // Grid not rendered yet; will retry on next navigation event
        state.uiInjected = false;
      });
  }

  function teardownUI() {
    document.getElementById('ytsort-filter-bar')?.remove();
    state.uiInjected = false;
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    state.originalOrder = null;
  }

  // ============================================================
  // SPA Navigation
  // ============================================================

  function onNavigate() {
    if (isSubscriptionsPage()) {
      setTimeout(() => {
        if (!state.uiInjected) injectUI();
      }, 400);
    } else {
      teardownUI();
    }
  }

  // ============================================================
  // Init
  // ============================================================

  function init() {
    addStyle(STYLES);

    // SPA navigation listeners
    window.addEventListener('yt-navigate-finish', onNavigate);
    window.addEventListener('yt-page-data-updated', onNavigate);

    // Initial page load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onNavigate);
    } else {
      onNavigate();
    }

    // Keyboard: Escape closes settings
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSettings();
    });

    // Tampermonkey menu entry
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('YTSort Settings', () => {
        if (isSubscriptionsPage()) openSettings();
        else showToast('Navigate to Subscriptions first');
      });
    }

    console.log('[YTSort] YouTube Subscription Organizer v1.0.0 loaded');
  }

  init();
})();
