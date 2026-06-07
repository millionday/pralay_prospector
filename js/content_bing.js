/**
 * MapHarvest Pro v2.0 — Bing Maps Content Script
 * Extracts business leads from Bing Maps local search results
 * Made with ❤ by Keshav Mishra & Scoryn Co.
 */

(function () {
  'use strict';

  const SOURCE = 'bing';
  let isRunning = false;
  let extractedPlaces = new Map();
  let scrollCount = 0;
  let errorCount = 0;
  let startTime = null;
  let config = {};
  let scrollTimer = null;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.action) {
      case 'PING':
        sendResponse({ ok: true, onBing: isOnBing(), source: SOURCE });
        break;
      case 'START_SCRAPING':
        config = msg.config || {};
        startScraping();
        sendResponse({ started: true });
        break;
      case 'STOP_SCRAPING':
        stopScraping();
        sendResponse({ stopped: true });
        break;
      case 'GET_DATA':
        sendResponse({ data: [...extractedPlaces.values()] });
        break;
      case 'CLEAR_DATA':
        extractedPlaces.clear(); scrollCount = 0; errorCount = 0;
        sendResponse({ cleared: true });
        break;
      case 'GET_STATUS':
        sendResponse({
          running: isRunning, count: extractedPlaces.size,
          scrolls: scrollCount, errors: errorCount,
          elapsed: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
          source: SOURCE
        });
        break;
    }
    return true;
  });

  function isOnBing() {
    return location.href.includes('bing.com/maps') || location.href.includes('bing.com/search');
  }

  function startScraping() {
    if (isRunning) return;
    isRunning = true;
    startTime = Date.now();
    log('Bing Maps scraping started');
    runScrapeLoop();
  }

  function stopScraping() {
    isRunning = false;
    clearTimeout(scrollTimer);
    log('Bing Maps scraping stopped');
    sendProgress();
  }

  async function runScrapeLoop() {
    if (!isRunning) return;
    const maxLeads = config.maxLeads || 500;
    const delay = config.scrollDelay || 2000;

    await extractVisibleResults();
    sendProgress();

    if (extractedPlaces.size >= maxLeads) {
      isRunning = false;
      chrome.runtime.sendMessage({ action: 'SCRAPING_COMPLETE', count: extractedPlaces.size, source: SOURCE });
      return;
    }

    const scrolled = scrollResultsList();
    if (scrolled) {
      scrollCount++;
      scrollTimer = setTimeout(runScrapeLoop, delay);
    } else {
      isRunning = false;
      log(`Bing scraping complete. Total: ${extractedPlaces.size}`);
      chrome.runtime.sendMessage({ action: 'SCRAPING_COMPLETE', count: extractedPlaces.size, source: SOURCE });
    }
  }

  async function extractVisibleResults() {
    // Bing Maps local result selectors
    const cardSelectors = [
      '.b_algo',           // Bing search results
      '.listing',
      '.lc_loc',
      '.MbANr',           // Bing Maps sidebar cards
      '[data-bm]',
      '.b_lBottom',
      '.local-result',
      '.b_maps .b_algo'
    ];

    let cards = [];
    for (const sel of cardSelectors) {
      cards = [...document.querySelectorAll(sel)];
      if (cards.length > 0) break;
    }

    for (const card of cards) {
      if (!isRunning) break;
      try {
        const data = extractFromCard(card);
        if (data && data.placeId && !extractedPlaces.has(data.placeId)) {
          extractedPlaces.set(data.placeId, data);
          chrome.runtime.sendMessage({ action: 'NEW_PLACE', place: data });
        }
      } catch (e) {
        errorCount++;
      }
    }
  }

  function extractFromCard(card) {
    const data = createEmptyRecord();
    data.source = 'Bing Maps';

    // Name
    data.name = getTextFromSelectors(card, [
      'h2 a', '.b_algo h2', '.lc_dn', '.b_title a',
      '.MbANr .title', 'h3', '[class*="name"]'
    ]);
    if (!data.name) return null;

    // Link / URL
    const link = card.querySelector('a[href*="bing.com/maps"], a[href*="http"]');
    data.googleMapsUrl = link ? link.href : '';
    data.placeId = 'bing_' + btoa(data.name + data.googleMapsUrl).replace(/[^a-z0-9]/gi, '').substr(0, 16);

    // Address
    data.fullAddress = getTextFromSelectors(card, [
      '.b_algo .b_factrow .lc_loc',
      '.b_subtext',
      '.lc_loc',
      '[class*="address"]',
      '.b_address'
    ]);

    // Phone
    const phoneEl = card.querySelector('[href^="tel:"], [data-phone]');
    if (phoneEl) {
      data.phone = (phoneEl.getAttribute('href') || phoneEl.dataset.phone || '').replace('tel:', '').trim();
    }
    if (!data.phone) {
      const phoneMatch = card.textContent.match(/(\+?[\d][\d\s\-().]{8,18}[\d])/g);
      if (phoneMatch) {
        for (const p of phoneMatch) {
          if (/\d{7,}/.test(p.replace(/\D/g, ''))) { data.phone = p.trim(); break; }
        }
      }
    }

    // Rating
    const ratingEl = card.querySelector('[aria-label*="star"],[class*="rating"],[class*="star"]');
    if (ratingEl) {
      const rtext = (ratingEl.getAttribute('aria-label') || ratingEl.textContent).match(/[\d.]+/);
      if (rtext) data.averageRating = parseFloat(rtext[0]) || '';
    }

    // Review count
    const reviewEl = card.querySelector('[class*="review"],[class*="count"],[aria-label*="review"]');
    if (reviewEl) {
      const rcount = reviewEl.textContent.match(/\d[\d,]*/);
      if (rcount) data.reviewCount = rcount[0].replace(',', '');
    }

    // Category / type
    data.categories = getTextFromSelectors(card, [
      '.b_factrow span',
      '.lc_cat',
      '[class*="category"]',
      '[class*="type"]'
    ]);

    // Website
    const webEl = card.querySelector('a[href]:not([href*="bing.com"]):not([href^="#"])');
    if (webEl && webEl.href.startsWith('http')) {
      data.website = webEl.href;
      data.domain = extractDomain(data.website);
    }

    // Extract lat/lng from data attributes or URL
    const coords = extractCoordsFromText(card.innerHTML);
    if (coords) { data.latitude = coords.lat; data.longitude = coords.lng; }

    // Extract email from text
    const emailMatch = card.textContent.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) data.email = emailMatch[0];

    return data;
  }

  function scrollResultsList() {
    // Bing Maps sidebar panel
    const containers = [
      document.querySelector('#maps_results'),
      document.querySelector('.lc_list'),
      document.querySelector('.b_results'),
      document.querySelector('[class*="results"]')
    ].filter(Boolean);

    if (!containers.length) {
      // Fallback: page scroll
      const before = window.scrollY;
      window.scrollBy({ top: 500, behavior: 'smooth' });
      return window.scrollY !== before;
    }

    const container = containers[0];
    const before = container.scrollTop;
    container.scrollBy({ top: 400, behavior: 'smooth' });
    return true; // Optimistic; loop will terminate when no new data
  }

  function sendProgress() {
    chrome.runtime.sendMessage({
      action: 'PROGRESS_UPDATE',
      count: extractedPlaces.size, scrolls: scrollCount,
      errors: errorCount,
      elapsed: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
      running: isRunning, source: SOURCE
    });
  }

  function getTextFromSelectors(el, selectors) {
    for (const sel of selectors) {
      try {
        const found = el.querySelector(sel);
        if (found && found.textContent.trim()) return found.textContent.trim();
      } catch (_) {}
    }
    return '';
  }

  function extractCoordsFromText(text) {
    const m = text.match(/"lat(?:itude)?"\s*:\s*(-?\d+\.\d+).*?"lon(?:gitude)?"\s*:\s*(-?\d+\.\d+)/s);
    if (m) return { lat: m[1], lng: m[2] };
    const m2 = text.match(/cp=(-?\d+\.\d+)~(-?\d+\.\d+)/);
    if (m2) return { lat: m2[1], lng: m2[2] };
    return null;
  }

  function extractDomain(url) {
    try { return new URL(url).hostname.replace('www.', ''); } catch (_) { return ''; }
  }

  function log(msg) {
    chrome.runtime.sendMessage({ action: 'LOG', message: `[Bing] ${msg}` });
  }

  function createEmptyRecord() {
    return {
      placeId: '', name: '', fullAddress: '', street: '',
      categories: '', phone: '', phones: '', reviewCount: '',
      averageRating: '', reviewUrl: '', googleMapsUrl: '',
      listingUrl: '', latitude: '', longitude: '', website: '', domain: '',
      openingHours: '', featuredImage: '', url: '',
      email: '', socialMedias: '', facebook: '', instagram: '', twitter: '',
      whatsapp: '', description: '', source: 'Bing Maps'
    };
  }

})();
