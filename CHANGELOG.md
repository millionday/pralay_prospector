# Changelog

All notable changes to **Pralay Prospector** are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.0.0] — 2026-06-07

### Added
- **JustDial support** (`content_justdial.js`) — extracts leads from JustDial listing pages with MutationObserver for infinite scroll
- **Bing Maps support** (`content_bing.js`) — extracts from Bing Maps sidebar and local search results
- **Auto source detection** — popup detects active tab URL and auto-selects the correct source (Google Maps / JustDial / Bing Maps)
- **Source selector UI** — three-button toggle to manually select the target platform
- **Source filter pills** in the Data tab — filter leads by platform
- **Color-coded source badges** in the data table
- **WhatsApp number** field (JustDial)
- **Description / tagline** field (JustDial)
- **Years in Business** field (JustDial)
- **Source Platform** field on all records
- **Branded export filenames** — `Pralay_Prospector_by_ScorynCo_YYYY-MM-DD.ext`
- **JSON meta block** — exported JSON now includes `meta` with author, company, version, timestamp, total leads
- **Excel branded header row** — first row spans all columns with tool/author info
- **CSV metadata comment** — first line of CSV is a `#` comment with branding and export time
- **Brand strip** below header in popup
- **Footer brand bar** at bottom of popup
- **Redesigned About section** with logo, source badges, and author credit
- `setWhatsApp` and `setDescription` toggle settings

### Changed
- `createEmptyRecord()` in Google Maps content script now includes `source`, `whatsapp`, `description` fields
- Export button sub-label shows branded filename prefix
- Log panel startup message includes Scoryn Co. tagline
- `manifest.json` version bumped to `2.0.0`, host permissions expanded to include JustDial and Bing domains
- `background.js` updated with branding comment

### Fixed
- Scroll termination on Bing Maps now uses optimistic loop with stagnation detection rather than brittle pixel checks

---

## [1.0.0] — 2026-06-02

### Added
- Initial release — Google Maps only
- Auto-scroll through search result feed
- Extract: name, address, phone, rating, review count, website, domain, hours, images, coordinates, email, Facebook, Instagram, Twitter
- Click-to-enrich mode (auto-open detail panel)
- Live log panel
- Progress bar with stats (extracted, scrolls, errors, elapsed)
- Data table with search/filter
- Export to Excel (.xls), CSV, JSON
- Copy to clipboard (tab-separated)
- Custom field selector (All / None / Basic)
- Deduplication by Place ID
- Persistent storage (leads survive popup close)
- Configurable max leads (50 → 10,000)
- Configurable scroll delay (0.5s → 5s)
- Auto-export on stop setting
- Settings saved to `chrome.storage.local`
