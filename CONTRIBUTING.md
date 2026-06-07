# Contributing to Pralay Prospector

Thank you for your interest in contributing! Whether it's a new data source, a bug fix, or a UI improvement — all contributions are welcome.

---

## Getting Started

1. **Fork** this repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/millionday/pralay-prospector.git
   cd pralay-prospector
   ```
3. Load the extension unpacked in Chrome (`chrome://extensions` → Developer Mode → Load Unpacked → select the folder)
4. Make your changes — the extension reloads when you click the refresh icon on `chrome://extensions`

---

## How to Add a New Data Source

Adding support for a new listing platform is the most impactful contribution. Here's the pattern:

### 1. Create a content script

Create `js/content_yourplatform.js`. Follow the structure of `content_justdial.js`:

```js
(function () {
  'use strict';

  const SOURCE = 'yourplatform';  // short identifier
  let isRunning = false;
  let extractedPlaces = new Map();
  // ... standard state vars

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // Handle: PING, START_SCRAPING, STOP_SCRAPING, GET_DATA, CLEAR_DATA, GET_STATUS
  });

  async function extractVisibleResults() {
    // Query card elements, call extractFromCard() for each
  }

  function extractFromCard(card) {
    const data = createEmptyRecord();
    data.source = 'Your Platform Name';
    // ... populate fields
    return data;
  }

  function createEmptyRecord() {
    return {
      placeId: '', name: '', fullAddress: '', phone: '',
      email: '', website: '', domain: '', averageRating: '',
      reviewCount: '', categories: '', source: 'Your Platform'
      // add any platform-specific fields
    };
  }
})();
```

### 2. Register in `manifest.json`

Add to `host_permissions` and `content_scripts`:

```json
"host_permissions": [
  "https://www.yourplatform.com/*"
],
"content_scripts": [
  {
    "matches": ["https://www.yourplatform.com/*"],
    "js": ["js/content_yourplatform.js"],
    "run_at": "document_idle"
  }
]
```

### 3. Wire up in `popup.js`

In the `startScraping()` function, add detection:

```js
else if (url.includes('yourplatform.com')) matchedSource = 'yourplatform';
```

Add the script mapping:

```js
const scriptFile = matchedSource === 'yourplatform' ? 'js/content_yourplatform.js' : ...
```

### 4. Add a source button in `popup.html`

```html
<button class="source-btn" data-source="yourplatform">
  <!-- SVG icon -->
  Your Platform
</button>
```

### 5. Update the fields table in README.md

Add a column for your platform to the **Extracted Fields** table.

---

## Bug Reports

Please open an [issue](https://github.com/millionday/pralay-prospector/issues) and include:

- Chrome version
- Extension version (shown in About tab)
- Which source platform (Google Maps / JustDial / Bing Maps)
- URL of the page you were scraping (or a description of the search)
- What you expected vs what happened
- Any errors from the browser console (`F12` → Console)

---

## Code Style

- Plain ES6+ JavaScript — no build step, no bundler, no frameworks
- Use `const`/`let`, arrow functions, template literals
- Keep selectors in arrays so fallbacks are easy to add as sites update their DOM
- Comment any non-obvious selector logic explaining *why* that selector works
- New fields should be added to `createEmptyRecord()` in every content script that supports them, and to `FIELD_GROUPS` in `popup.js`

---

## Pull Request Checklist

- [ ] Tested on the target platform with at least 20 leads extracted
- [ ] No console errors during normal operation
- [ ] Export (CSV/JSON/Excel) includes the new fields
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] README field table updated if new fields were added
- [ ] Branding preserved (`source` field populated, `createEmptyRecord()` consistent)

---

*Made with ❤ by Keshav Mishra & Scoryn Co.*
