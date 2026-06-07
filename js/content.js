/**
 * MapHarvest Pro — Content Script
 * Runs on Google Maps pages, handles auto-scroll and data extraction
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────
  let isRunning = false;
  let extractedPlaces = new Map(); // placeId → data
  let scrollCount = 0;
  let errorCount = 0;
  let startTime = null;
  let config = {};
  let scrollTimer = null;

  // ── Listen for messages from popup ──────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.action) {
      case 'PING':
        sendResponse({ ok: true, onMaps: isOnMaps() });
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
        extractedPlaces.clear();
        scrollCount = 0;
        errorCount = 0;
        sendResponse({ cleared: true });
        break;

      case 'GET_STATUS':
        sendResponse({
          running: isRunning,
          count: extractedPlaces.size,
          scrolls: scrollCount,
          errors: errorCount,
          elapsed: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0
        });
        break;
    }
    return true;
  });

  // ── Utility: are we on Google Maps? ──────────────────
  function isOnMaps() {
    return location.href.includes('google.com/maps') ||
           location.href.includes('maps.google.com');
  }

  // ── Start / Stop ──────────────────────────────────────
  function startScraping() {
    if (isRunning) return;
    isRunning = true;
    startTime = Date.now();
    log('Scraping started');
    runScrapeLoop();
  }

  function stopScraping() {
    isRunning = false;
    clearTimeout(scrollTimer);
    log('Scraping stopped by user');
    sendProgress();
  }

  // ── Main scrape loop ──────────────────────────────────
  async function runScrapeLoop() {
    if (!isRunning) return;

    const maxLeads = config.maxLeads || 500;
    const delay = config.scrollDelay || 1500;

    // Extract currently visible results
    await extractVisibleResults();

    sendProgress();

    if (extractedPlaces.size >= maxLeads) {
      isRunning = false;
      log(`Reached max leads limit: ${maxLeads}`);
      chrome.runtime.sendMessage({ action: 'SCRAPING_COMPLETE', count: extractedPlaces.size });
      return;
    }

    // Try scrolling the results panel
    const scrolled = scrollResultsList();

    if (scrolled) {
      scrollCount++;
      scrollTimer = setTimeout(runScrapeLoop, delay);
    } else {
      // No more results to scroll
      isRunning = false;
      log(`Scraping complete. Total: ${extractedPlaces.size} places`);
      chrome.runtime.sendMessage({ action: 'SCRAPING_COMPLETE', count: extractedPlaces.size });
    }
  }

  // ── Extract visible results ──────────────────────────
  async function extractVisibleResults() {
    const results = findResultItems();

    for (const el of results) {
      if (!isRunning) break;

      try {
        const data = await extractFromListItem(el);
        if (data && data.placeId && !extractedPlaces.has(data.placeId)) {
          extractedPlaces.set(data.placeId, data);

          if (config.autoOpen) {
            // Click to load full detail panel and enrich
            await clickAndEnrich(el, data);
          }

          chrome.runtime.sendMessage({ action: 'NEW_PLACE', place: data });
        }
      } catch (e) {
        errorCount++;
      }
    }
  }

  // ── Find result list items ────────────────────────────
  function findResultItems() {
    // Google Maps search results use various selectors
    const selectors = [
      'div[role="feed"] > div[jsaction]',
      'div.Nv2PK',
      'a[href*="/maps/place/"]',
      '.section-result',
      'div[data-result-index]'
    ];

    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) return [...els];
    }
    return [];
  }

  // ── Extract data from a list item ────────────────────
  async function extractFromListItem(el) {
    const data = createEmptyRecord();

    try {
      // Name
      data.name = getText(el, [
        '.qBF1Pd','.NrDZNb','.fontHeadlineSmall','h3','[role="heading"]',
        '.section-result-title','.PQ5bV'
      ]);

      // Rating
      const ratingEl = el.querySelector('.MW4etd,.AJB7ye,.section-result-rating,.ZkP5Je');
      if (ratingEl) data.averageRating = parseFloat(ratingEl.textContent) || '';

      // Review count
      const reviewEl = el.querySelector('.UY7F9,.section-result-num-ratings,.RDApEe');
      if (reviewEl) {
        data.reviewCount = reviewEl.textContent.replace(/[^0-9,]/g, '').replace(',', '') || '';
      }

      // Categories
      data.categories = getText(el, ['.W4Efsd:not(.W4Efsd .W4Efsd)','.DkEaL','.section-result-details','.YhemCb']);

      // Address from list
      const addrEls = el.querySelectorAll('.W4Efsd,.UsdlK,.section-result-location');
      addrEls.forEach(ae => {
        const t = ae.textContent.trim();
        if (t && t.match(/\d/) && t.length > 5 && !data.fullAddress) {
          data.fullAddress = t;
        }
      });

      // Phone
      const phoneMatch = el.textContent.match(/(\+?[\d\s\-().]{7,20})/g);
      if (phoneMatch) {
        for (const p of phoneMatch) {
          if (isPhone(p)) { data.phone = p.trim(); break; }
        }
      }

      // Maps URL + lat/lng from href
      const link = el.querySelector('a[href*="/maps/place/"]') ||
                   (el.matches('a[href*="/maps/place/"]') ? el : null);
      if (link) {
        data.googleMapsUrl = link.href;
        const coords = extractCoordsFromUrl(link.href);
        if (coords) { data.latitude = coords.lat; data.longitude = coords.lng; }
        data.placeId = extractPlaceId(link.href) || generateId(data.name);
      }

      // Featured image
      const img = el.querySelector('img[src*="maps"]:not([src*="google.com/maps/api"]), img[src*="lh3"]');
      if (img && img.src) data.featuredImage = img.src;

      if (!data.placeId) data.placeId = generateId(data.name || Math.random());
      data.reviewUrl = data.googleMapsUrl ? data.googleMapsUrl + '/reviews' : '';

    } catch (e) {
      errorCount++;
    }

    return data;
  }

  // ── Click a result and extract from detail panel ─────
  async function clickAndEnrich(el, data) {
    return new Promise(resolve => {
      const clickTarget = el.querySelector('a, [role="button"]') || el;
      clickTarget.click();

      // Wait for detail panel to load
      setTimeout(async () => {
        try {
          await enrichFromDetailPanel(data);
        } catch (_) {}
        resolve();
      }, 1200);
    });
  }

  // ── Enrich from detail panel (right sidebar / full page) ──
  async function enrichFromDetailPanel(data) {
    const panel = document.querySelector('[role="main"], .m6QErb[role="region"], .section-layout-root');
    if (!panel) return;

    // Full address
    const addrBtn = panel.querySelector('[data-item-id="address"] .Io6YTe, button[data-item-id="address"],.section-info-line:has([aria-label*="Address"])');
    if (addrBtn) {
      data.fullAddress = addrBtn.textContent.trim();
      const parts = parseAddress(data.fullAddress);
      data.street = parts.street;
    }

    // Phone
    if (config.extractPhone) {
      const phoneEl = panel.querySelector('[data-item-id*="phone"] .Io6YTe, [aria-label*="Phone"], a[href^="tel:"]');
      if (phoneEl) data.phone = (phoneEl.getAttribute('href') || phoneEl.textContent).replace('tel:', '').trim();
    }

    // Website
    const webEl = panel.querySelector('[data-item-id="authority"] a,[data-item-id="website"] a, a[data-item-id*="authority"]');
    if (webEl) {
      data.website = webEl.href || webEl.textContent.trim();
      data.domain = extractDomain(data.website);
    }

    // Opening hours
    if (config.extractHours) {
      const hoursTable = panel.querySelectorAll('.t39EBf .G8aQO,.mxowUb tr,.section-open-hours-container .section-open-hours-day');
      const hours = [];
      hoursTable.forEach(row => {
        const cells = row.querySelectorAll('td, .section-open-hours-day-text');
        if (cells.length >= 2) {
          hours.push(`${cells[0].textContent.trim()}: ${cells[1].textContent.trim()}`);
        } else if (cells.length === 1) {
          const t = cells[0].textContent.trim();
          if (t) hours.push(t);
        }
      });
      if (hours.length) data.openingHours = hours.join(' | ');
    }

    // Featured image (higher quality from panel)
    if (config.extractImages) {
      const heroImg = panel.querySelector('.ZKCDEc img, .gallery-image-high-res,.section-hero-header-image img');
      if (heroImg && heroImg.src) data.featuredImage = heroImg.src;
    }

    // Latitude / longitude from URL
    if (!data.latitude) {
      const coords = extractCoordsFromUrl(location.href);
      if (coords) { data.latitude = coords.lat; data.longitude = coords.lng; }
    }

    // Extract review URL
    data.reviewUrl = data.googleMapsUrl ? data.googleMapsUrl : '';

    // Email & social media (from website if loaded)
    if (config.extractEmailSocial && data.website) {
      const socials = extractSocialsFromPage();
      Object.assign(data, socials);
    }
  }

  // ── Extract email/social from current page DOM ────────
  function extractSocialsFromPage() {
    const out = { email: '', facebook: '', instagram: '', twitter: '', socialMedias: '' };
    const html = document.documentElement.innerHTML;

    // Email
    const emailMatch = html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
    if (emailMatch) {
      const filtered = emailMatch.filter(e =>
        !e.includes('@example') && !e.includes('@google') && !e.includes('@schema') &&
        !e.includes('@w3') && !e.includes('sentry') && !e.includes('@2x')
      );
      if (filtered.length) out.email = filtered[0];
    }

    // Facebook
    const fbMatch = html.match(/facebook\.com\/([^"'\s?/\\>]+)/i);
    if (fbMatch) out.facebook = 'https://facebook.com/' + fbMatch[1].split('/')[0];

    // Instagram
    const igMatch = html.match(/instagram\.com\/([^"'\s?/\\>]+)/i);
    if (igMatch) out.instagram = 'https://instagram.com/' + igMatch[1].split('/')[0];

    // Twitter / X
    const twMatch = html.match(/(?:twitter|x)\.com\/([^"'\s?/\\>@]+)/i);
    if (twMatch) out.twitter = 'https://twitter.com/' + twMatch[1].split('/')[0];

    // Aggregate
    const socials = [out.facebook, out.instagram, out.twitter].filter(Boolean);
    out.socialMedias = socials.join(', ');

    return out;
  }

  // ── Scroll the results list ───────────────────────────
  function scrollResultsList() {
    const containers = [
      document.querySelector('div[role="feed"]'),
      document.querySelector('.m6QErb[role="region"]'),
      document.querySelector('.ecceSd'),
      document.querySelector('.DxyBCb'),
      document.querySelector('.section-scrollbox'),
    ].filter(Boolean);

    if (!containers.length) return false;

    const container = containers[0];
    const before = container.scrollTop;
    container.scrollBy({ top: 400, behavior: 'smooth' });

    // Check if we've hit the bottom
    setTimeout(() => {
      if (container.scrollTop === before) {
        // End of results — check for "end of list" marker
        const endMarker = document.querySelector('.HlvSq,.section-no-result,.zLN5O');
        if (endMarker || container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
          isRunning = false;
          chrome.runtime.sendMessage({ action: 'SCRAPING_COMPLETE', count: extractedPlaces.size });
        }
      }
    }, 300);

    return true;
  }

  // ── Progress update ───────────────────────────────────
  function sendProgress() {
    chrome.runtime.sendMessage({
      action: 'PROGRESS_UPDATE',
      count: extractedPlaces.size,
      scrolls: scrollCount,
      errors: errorCount,
      elapsed: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
      running: isRunning
    });
  }

  // ── Helper: getText from multiple selectors ───────────
  function getText(el, selectors) {
    for (const sel of selectors) {
      try {
        const found = el.querySelector(sel);
        if (found && found.textContent.trim()) return found.textContent.trim();
      } catch (_) {}
    }
    return '';
  }

  function isPhone(s) {
    return /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/.test(s.replace(/\s/g, ''));
  }

  function extractCoordsFromUrl(url) {
    const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: m[1], lng: m[2] };
    const m2 = url.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m2) return { lat: m2[1], lng: m2[2] };
    return null;
  }

  function extractPlaceId(url) {
    const m = url.match(/place\/([^/]+)\//) || url.match(/placeid=([^&]+)/);
    return m ? m[1] : null;
  }

  function extractDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch (_) { return ''; }
  }

  function parseAddress(addr) {
    const parts = addr.split(',');
    return { street: parts[0] ? parts[0].trim() : '' };
  }

  function generateId(seed) {
    return 'place_' + btoa(String(seed)).replace(/[^a-z0-9]/gi, '').substr(0, 12) + '_' + Date.now();
  }

  function log(msg) {
    chrome.runtime.sendMessage({ action: 'LOG', message: msg });
  }

  function createEmptyRecord() {
    return {
      placeId: '', name: '', fullAddress: '', street: '',
      categories: '', phone: '', phones: '', reviewCount: '',
      averageRating: '', reviewUrl: '', googleMapsUrl: '',
      latitude: '', longitude: '', website: '', domain: '',
      openingHours: '', featuredImage: '', url: '',
      email: '', socialMedias: '', facebook: '', instagram: '', twitter: '', whatsapp: '', description: '', source: 'Google Maps'
    };
  }

})();
