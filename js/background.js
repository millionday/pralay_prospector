/**
 * MapHarvest Pro v2.0 — Background Service Worker
 * Made with ❤ by Keshav Mishra & Scoryn Co.
 */

const BRAND = 'MapHarvest Pro by Scoryn Co.';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'NEW_PLACE' || msg.action === 'PROGRESS_UPDATE' ||
      msg.action === 'SCRAPING_COMPLETE' || msg.action === 'LOG') {

    if (msg.action === 'NEW_PLACE') {
      chrome.storage.local.get(['scraped_places'], (res) => {
        const places = res.scraped_places || [];
        // Deduplicate by placeId
        const exists = places.find(p => p.placeId === msg.place.placeId);
        if (!exists) {
          places.push(msg.place);
          chrome.storage.local.set({ scraped_places: places });
        }
      });
    }
  }
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log(`${BRAND} v2.0 installed/updated`);
});
