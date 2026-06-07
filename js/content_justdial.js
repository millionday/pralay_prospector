/**
 * MapHarvest Pro v2.0 — JustDial Content Script
 * Extracts business leads from JustDial listing pages
 * Made with ❤ by Keshav Mishra & Scoryn Co.
 */

(function () {
  'use strict';

  const SOURCE = 'justdial';
  let isRunning = false;
  let extractedPlaces = new Map();
  let scrollCount = 0;
  let errorCount = 0;
  let startTime = null;
  let config = {};
  let scrollTimer = null;
  let observer = null;

  // ── Message listener ──────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.action) {
      case 'PING':
        sendResponse({ ok: true, onJustDial: isOnJustDial(), source: SOURCE });
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
        scrollCount = 0; errorCount = 0;
        sendResponse({ cleared: true });
        break;
      case 'GET_STATUS':
        sendResponse({
          running: isRunning,
          count: extractedPlaces.size,
          scrolls: scrollCount,
          errors: errorCount,
          elapsed: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
          source: SOURCE
        });
        break;
    }
    return true;
  });

  function isOnJustDial() {
    return location.href.includes('justdial.com');
  }

  function startScraping() {
    if (isRunning) return;
    isRunning = true;
    startTime = Date.now();
    log('JustDial scraping started');
    // Use MutationObserver to catch dynamically loaded listings
    setupObserver();
    runScrapeLoop();
  }

  function stopScraping() {
    isRunning = false;
    clearTimeout(scrollTimer);
    if (observer) { observer.disconnect(); observer = null; }
    log('JustDial scraping stopped');
    sendProgress();
  }

  // Watch for new listing cards injected via AJAX/infinite scroll
  function setupObserver() {
    const feed = document.querySelector('.resultbox_cnt, .store-details, ul.store-list, .jd-listing-results');
    if (!feed) return;
    observer = new MutationObserver(() => {
      if (isRunning) extractVisibleResults();
    });
    observer.observe(feed, { childList: true, subtree: true });
  }

  async function runScrapeLoop() {
    if (!isRunning) return;
    const maxLeads = config.maxLeads || 500;
    const delay = config.scrollDelay || 2000;

    await extractVisibleResults();
    sendProgress();

    if (extractedPlaces.size >= maxLeads) {
      isRunning = false;
      log(`Reached max leads limit: ${maxLeads}`);
      chrome.runtime.sendMessage({ action: 'SCRAPING_COMPLETE', count: extractedPlaces.size, source: SOURCE });
      return;
    }

    const scrolled = scrollPage();
    if (scrolled) {
      scrollCount++;
      scrollTimer = setTimeout(runScrapeLoop, delay);
    } else {
      // Try clicking "Load More" or next page
      const loadMore = clickLoadMore();
      if (loadMore) {
        scrollTimer = setTimeout(runScrapeLoop, delay * 1.5);
      } else {
        isRunning = false;
        log(`JustDial scraping complete. Total: ${extractedPlaces.size}`);
        chrome.runtime.sendMessage({ action: 'SCRAPING_COMPLETE', count: extractedPlaces.size, source: SOURCE });
      }
    }
  }

  async function extractVisibleResults() {
    // JustDial listing card selectors (covers multiple page layouts)
    const cardSelectors = [
      '.resultbox_info',
      '.store-details',
      '.jd-card',
      'li[data-resultid]',
      '.cntanr',
      '.resultbox',
      'div[data-id]',
      '.jsx-business-card'
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
    data.source = 'JustDial';

    // Business name
    data.name = getTextFromSelectors(card, [
      '.resultbox_title_anchor',
      'h2.jd-heading-xxs',
      '.store-name a',
      '.bname',
      '.fn',
      '[itemprop="name"]',
      'h3',
      '.companyname'
    ]);
    if (!data.name) return null;

    // Generate unique ID from name + href
    const link = card.querySelector('a[href]');
    const href = link ? link.href : '';
    data.placeId = 'jd_' + btoa(data.name + href).replace(/[^a-z0-9]/gi, '').substr(0, 16);
    data.googleMapsUrl = href || '';
    data.listingUrl = href || '';

    // Phone number (JustDial often hides it behind a click/data attr)
    const phoneEl = card.querySelector('[data-phone],[data-telno],a[href^="tel:"],.tel,.mobilesv span');
    if (phoneEl) {
      data.phone = (phoneEl.dataset.phone || phoneEl.dataset.telno ||
                    phoneEl.getAttribute('href') || phoneEl.textContent)
                   .replace('tel:', '').trim();
    }
    // Also scan visible text for phone patterns
    if (!data.phone) {
      const phoneMatch = card.textContent.match(/(\+?91[\s\-]?)?[6-9]\d{9}/g);
      if (phoneMatch) data.phone = phoneMatch[0].trim();
    }

    // Address
    data.fullAddress = getTextFromSelectors(card, [
      '.resultbox_address',
      '.address-info',
      '[itemprop="streetAddress"]',
      '.adr',
      '.locatn',
      '.store-address'
    ]);

    // Rating
    const ratingEl = card.querySelector('[class*="star"],[class*="rating"],[itemprop="ratingValue"],.green-box,.ratingbox');
    if (ratingEl) {
      const rtext = ratingEl.textContent.trim().replace(/[^\d.]/g, '');
      data.averageRating = parseFloat(rtext) || '';
    }

    // Review count
    const reviewEl = card.querySelector('[class*="review"],[itemprop="reviewCount"],.count,.reviewscount');
    if (reviewEl) {
      data.reviewCount = reviewEl.textContent.replace(/[^0-9]/g, '') || '';
    }

    // Category
    data.categories = getTextFromSelectors(card, [
      '.resultbox_type',
      '.store-catg',
      '[itemprop="category"]',
      '.catgname'
    ]);

    // Website link
    const webEl = card.querySelector('a[href*="http"]:not([href*="justdial"])');
    if (webEl) {
      data.website = webEl.href;
      data.domain = extractDomain(data.website);
    }

    // Email from data attributes
    const emailEl = card.querySelector('[data-email],[href^="mailto:"]');
    if (emailEl) {
      data.email = (emailEl.dataset.email || emailEl.getAttribute('href') || '').replace('mailto:', '').trim();
    }

    // WhatsApp number if available
    const waEl = card.querySelector('a[href*="whatsapp"],[data-whatsapp]');
    if (waEl) {
      data.whatsapp = (waEl.dataset.whatsapp || waEl.getAttribute('href') || '').replace(/[^0-9]/g, '');
    }

    // Tagline / description
    data.description = getTextFromSelectors(card, [
      '.jd-desc',
      '.tagline-desc',
      '.store-desc',
      '[itemprop="description"]'
    ]);

    // Years in business
    const yrEl = card.querySelector('.years_in_business,.yr_count');
    if (yrEl) data.yearsInBusiness = yrEl.textContent.replace(/[^0-9]/g, '');

    return data;
  }

  function scrollPage() {
    const before = window.scrollY;
    window.scrollBy({ top: 600, behavior: 'smooth' });
    return window.scrollY !== before || document.documentElement.scrollHeight > window.innerHeight + window.scrollY + 10;
  }

  function clickLoadMore() {
    const loadMoreBtns = [
      document.querySelector('.loadmore'),
      document.querySelector('[data-load-more]'),
      document.querySelector('.show-more-btn'),
      document.querySelector('button[class*="load"]'),
      document.querySelector('.paginationlinkbox a.next'),
      document.querySelector('a[rel="next"]')
    ].filter(Boolean);

    if (loadMoreBtns.length > 0) {
      loadMoreBtns[0].click();
      return true;
    }
    return false;
  }

  function sendProgress() {
    chrome.runtime.sendMessage({
      action: 'PROGRESS_UPDATE',
      count: extractedPlaces.size,
      scrolls: scrollCount,
      errors: errorCount,
      elapsed: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
      running: isRunning,
      source: SOURCE
    });
  }

  // ── Helpers ───────────────────────────────────────────
  function getTextFromSelectors(el, selectors) {
    for (const sel of selectors) {
      try {
        const found = el.querySelector(sel);
        if (found && found.textContent.trim()) return found.textContent.trim();
      } catch (_) {}
    }
    return '';
  }

  function extractDomain(url) {
    try { return new URL(url).hostname.replace('www.', ''); } catch (_) { return ''; }
  }

  function log(msg) {
    chrome.runtime.sendMessage({ action: 'LOG', message: `[JustDial] ${msg}` });
  }

  function createEmptyRecord() {
    return {
      placeId: '', name: '', fullAddress: '', street: '',
      categories: '', phone: '', phones: '', reviewCount: '',
      averageRating: '', reviewUrl: '', googleMapsUrl: '',
      listingUrl: '', latitude: '', longitude: '', website: '', domain: '',
      openingHours: '', featuredImage: '', url: '',
      email: '', socialMedias: '', facebook: '', instagram: '', twitter: '',
      whatsapp: '', description: '', yearsInBusiness: '', source: 'JustDial'
    };
  }

})();
