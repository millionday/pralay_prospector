/**
 * MapHarvest Pro v2.0 — Popup Controller
 * Multi-source lead extraction: Google Maps, JustDial, Bing Maps
 * Made with ❤ by Keshav Mishra & Scoryn Co.
 */

'use strict';

const BRAND = {
  name: 'MapHarvest Pro',
  version: '2.0.0',
  author: 'Keshav Mishra',
  company: 'Scoryn Co.',
  tagline: 'Made with ❤ by Keshav Mishra & Scoryn Co.',
  exportPrefix: 'MapHarvest_Pro_by_ScorynCo'
};

// ── Field definitions ──────────────────────────────────────────────
const FIELD_GROUPS = [
  {
    title: 'Basic Info',
    fields: [
      { key: 'name', label: 'Name', basic: true },
      { key: 'fullAddress', label: 'Full Address', basic: true },
      { key: 'street', label: 'Street', basic: true },
      { key: 'categories', label: 'Categories', basic: true },
      { key: 'description', label: 'Description', basic: false },
      { key: 'yearsInBusiness', label: 'Years in Business', basic: false },
    ]
  },
  {
    title: 'Contact',
    fields: [
      { key: 'phone', label: 'Phone', basic: true },
      { key: 'phones', label: 'All Phones', basic: false },
      { key: 'whatsapp', label: 'WhatsApp', basic: false },
      { key: 'website', label: 'Website', basic: true },
      { key: 'domain', label: 'Domain', basic: false },
      { key: 'email', label: 'Email', basic: true },
      { key: 'listingUrl', label: 'Listing URL', basic: false },
    ]
  },
  {
    title: 'Ratings & Reviews',
    fields: [
      { key: 'averageRating', label: 'Avg Rating', basic: true },
      { key: 'reviewCount', label: 'Review Count', basic: true },
      { key: 'reviewUrl', label: 'Review URL', basic: false },
    ]
  },
  {
    title: 'Location & Maps',
    fields: [
      { key: 'googleMapsUrl', label: 'Maps URL', basic: true },
      { key: 'latitude', label: 'Latitude', basic: false },
      { key: 'longitude', label: 'Longitude', basic: false },
      { key: 'openingHours', label: 'Opening Hours', basic: false },
    ]
  },
  {
    title: 'Media',
    fields: [
      { key: 'featuredImage', label: 'Featured Image', basic: false },
      { key: 'url', label: 'URL', basic: false },
    ]
  },
  {
    title: 'Social Media',
    fields: [
      { key: 'socialMedias', label: 'Social Medias', basic: false },
      { key: 'facebook', label: 'Facebook', basic: false },
      { key: 'instagram', label: 'Instagram', basic: false },
      { key: 'twitter', label: 'Twitter', basic: false },
    ]
  },
  {
    title: 'Source',
    fields: [
      { key: 'source', label: 'Source Platform', basic: true },
    ]
  }
];

const ALL_FIELDS = FIELD_GROUPS.flatMap(g => g.fields.map(f => f.key));

// ── State ──────────────────────────────────────────────────────────
let allData = [];
let filteredData = [];
let selectedFields = new Set(ALL_FIELDS);
let isRunning = false;
let elapsedTimer = null;
let elapsedSeconds = 0;
let currentSource = 'google'; // 'google' | 'justdial' | 'bing'

// ── DOM refs ───────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSourceSelector();
  initPresetBtns();
  initSlider();
  initControls();
  initFieldSelector();
  initDataSearch();
  initExportButtons();
  loadSettings();
  loadSavedData();
  detectCurrentSource();

  setInterval(pollStatus, 1000);
});

// ── SOURCE SELECTOR ───────────────────────────────────────────────
function initSourceSelector() {
  document.querySelectorAll('.source-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSource = btn.dataset.source;
      updateSourceHints();
    });
  });
}

function updateSourceHints() {
  const hints = {
    google: 'Navigate to <strong>Google Maps</strong> and run a search',
    justdial: 'Navigate to <strong>JustDial</strong> search results',
    bing: 'Navigate to <strong>Bing Maps</strong> and search locally'
  };
  const hint = $('sourceHint');
  if (hint) hint.innerHTML = hints[currentSource] || hints.google;
}

async function detectCurrentSource() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url || '';
    if (url.includes('justdial.com')) {
      setActiveSource('justdial');
    } else if (url.includes('bing.com')) {
      setActiveSource('bing');
    } else {
      setActiveSource('google');
    }
  } catch (_) {}
}

function setActiveSource(src) {
  currentSource = src;
  document.querySelectorAll('.source-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.source === src);
  });
  updateSourceHints();
}

// ── TABS ───────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $('tab-' + tab).classList.add('active');
      if (tab === 'data') renderDataTable(filteredData);
      if (tab === 'export') updateExportCount();
    });
  });
}

// ── PRESET BUTTONS ─────────────────────────────────────────────────
function initPresetBtns() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $('maxLeads').value = btn.dataset.val;
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active-preset'));
      btn.classList.add('active-preset');
    });
  });
}

// ── SLIDER ─────────────────────────────────────────────────────────
function initSlider() {
  const slider = $('scrollDelay');
  const label = $('delayVal');
  slider.addEventListener('input', () => {
    label.textContent = (slider.value / 1000).toFixed(1) + 's';
  });
}

// ── MAIN CONTROLS ──────────────────────────────────────────────────
function initControls() {
  $('startBtn').addEventListener('click', startScraping);
  $('stopBtn').addEventListener('click', stopScraping);
  $('clearBtn').addEventListener('click', clearData);
  $('clearLogBtn').addEventListener('click', () => { $('logContainer').innerHTML = ''; });
  $('copyAllBtn').addEventListener('click', copyAllData);
}

async function startScraping() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  const url = tab?.url || '';

  // Detect source from current tab URL
  let matchedSource = null;
  if (url.includes('google.com/maps') || url.includes('maps.google.com')) matchedSource = 'google';
  else if (url.includes('justdial.com')) matchedSource = 'justdial';
  else if (url.includes('bing.com/maps') || url.includes('bing.com/search')) matchedSource = 'bing';

  if (!matchedSource) {
    showMapWarning(true);
    addLog('Please navigate to Google Maps, JustDial, or Bing Maps first', 'warn');
    return;
  }

  setActiveSource(matchedSource);
  showMapWarning(false);
  isRunning = true;
  elapsedSeconds = 0;
  startElapsedTimer();
  updateUI_running(matchedSource);
  addLog(`Starting ${getSourceLabel(matchedSource)} scraper...`, 'highlight');

  const config = getConfig();
  const scriptFile = matchedSource === 'justdial' ? 'js/content_justdial.js'
                   : matchedSource === 'bing' ? 'js/content_bing.js'
                   : 'js/content.js';

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [scriptFile] });
  } catch (_) { /* already injected */ }

  chrome.tabs.sendMessage(tab.id, { action: 'START_SCRAPING', config });
  saveSettings();
}

async function stopScraping() {
  isRunning = false;
  stopElapsedTimer();

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'STOP_SCRAPING' });

  updateUI_idle();
  addLog('Scraper stopped', 'warn');

  const autoExport = $('setAutoExport').checked;
  if (autoExport && allData.length > 0) setTimeout(() => exportCSV(), 500);
}

async function clearData() {
  if (allData.length > 0 && !confirm(`Clear all ${allData.length} extracted leads?`)) return;
  allData = [];
  filteredData = [];
  renderDataTable([]);
  updateCount(0);
  updateExportCount();
  addLog('All data cleared', 'warn');
  await chrome.storage.local.set({ scraped_places: [] });
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'CLEAR_DATA' });
}

// ── STATUS POLLING ─────────────────────────────────────────────────
async function pollStatus() {
  if (!isRunning) return;
  const res = await chrome.storage.local.get(['scraped_places']);
  const places = res.scraped_places || [];
  if (places.length !== allData.length) {
    allData = places;
    filteredData = filterData(allData, $('dataSearch').value);
    updateCount(allData.length);
    $('statExtracted').textContent = allData.length;
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.dataset.tab === 'data') renderDataTable(filteredData);
  }
}

// ── MESSAGES FROM CONTENT SCRIPTS ─────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.action) {
    case 'PROGRESS_UPDATE':
      $('statExtracted').textContent = msg.count;
      $('statScrolls').textContent = msg.scrolls;
      $('statErrors').textContent = msg.errors;
      updateProgress(msg.count, parseInt($('maxLeads').value));
      break;
    case 'SCRAPING_COMPLETE':
      isRunning = false;
      stopElapsedTimer();
      updateUI_done(msg.count);
      addLog(`✓ Complete! Extracted ${msg.count} leads from ${msg.source || 'source'}`, 'success');
      loadSavedData();
      break;
    case 'LOG':
      addLog(msg.message, 'info');
      break;
    case 'NEW_PLACE':
      break;
  }
});

// ── UI STATE HELPERS ───────────────────────────────────────────────
function getSourceLabel(src) {
  return src === 'justdial' ? 'JustDial' : src === 'bing' ? 'Bing Maps' : 'Google Maps';
}

function getSourceIcon(src) {
  if (src === 'justdial') return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>`;
  if (src === 'bing') return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l4 14 4-5 4 3V3"/></svg>`;
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
}

function updateUI_running(src) {
  $('startBtn').disabled = true;
  $('stopBtn').disabled = false;
  $('statusDot').className = 'status-dot active';
  $('statusIcon').className = 'status-icon running';
  $('statusIcon').innerHTML = getSourceIcon(src);
  $('statusLabel').textContent = `Scraping ${getSourceLabel(src)}`;
  $('statusSub').textContent = 'Auto-scrolling and extracting data...';
  $('progressSection').style.display = 'block';
}

function updateUI_idle() {
  $('startBtn').disabled = false;
  $('stopBtn').disabled = true;
  $('statusDot').className = 'status-dot';
  $('statusIcon').className = 'status-icon idle';
  $('statusIcon').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>`;
  $('statusLabel').textContent = 'Ready to Scrape';
  $('statusSub').textContent = 'Select a source and navigate to it';
}

function updateUI_done(count) {
  $('startBtn').disabled = false;
  $('stopBtn').disabled = true;
  $('statusDot').className = 'status-dot';
  $('statusIcon').className = 'status-icon done';
  $('statusIcon').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>`;
  $('statusLabel').textContent = `Done — ${count} Leads Extracted`;
  $('statusSub').textContent = 'Export your data from the Export tab';
}

function updateProgress(current, max) {
  const pct = Math.min(100, Math.round((current / max) * 100));
  $('progressFill').style.width = pct + '%';
  $('progressPct').textContent = pct + '%';
}

function updateCount(n) {
  $('countBadge').textContent = n;
  updateExportCount();
}

function showMapWarning(show) {
  $('mapWarning').style.display = show ? 'flex' : 'none';
}

// ── ELAPSED TIMER ──────────────────────────────────────────────────
function startElapsedTimer() {
  elapsedTimer = setInterval(() => {
    elapsedSeconds++;
    $('statElapsed').textContent = formatSeconds(elapsedSeconds);
  }, 1000);
}

function stopElapsedTimer() { clearInterval(elapsedTimer); }

function formatSeconds(s) {
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  return m + 'm' + (s % 60) + 's';
}

// ── LOG ────────────────────────────────────────────────────────────
function addLog(msg, type = 'info') {
  const container = $('logContainer');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  const ts = new Date().toTimeString().split(' ')[0];
  entry.textContent = `[${ts}] ${msg}`;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
  while (container.children.length > 100) container.removeChild(container.firstChild);
}

// ── FIELD SELECTOR ─────────────────────────────────────────────────
function initFieldSelector() {
  const container = $('fieldGroups');
  container.innerHTML = '';
  FIELD_GROUPS.forEach(group => {
    const groupEl = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'field-group-title';
    title.textContent = group.title;
    groupEl.appendChild(title);
    const chips = document.createElement('div');
    chips.className = 'field-checkboxes';
    group.fields.forEach(field => {
      const chip = document.createElement('label');
      chip.className = 'field-chip' + (selectedFields.has(field.key) ? ' checked' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedFields.has(field.key);
      cb.addEventListener('change', () => {
        if (cb.checked) { selectedFields.add(field.key); chip.classList.add('checked'); }
        else { selectedFields.delete(field.key); chip.classList.remove('checked'); }
      });
      chip.appendChild(cb);
      chip.appendChild(document.createTextNode(field.label));
      chips.appendChild(chip);
    });
    groupEl.appendChild(chips);
    container.appendChild(groupEl);
  });
  $('selectAllFields').addEventListener('click', () => { selectedFields = new Set(ALL_FIELDS); refreshChips(true); });
  $('selectNoneFields').addEventListener('click', () => { selectedFields.clear(); refreshChips(false); });
  $('selectBasicFields').addEventListener('click', () => {
    selectedFields.clear();
    FIELD_GROUPS.forEach(g => g.fields.forEach(f => { if (f.basic) selectedFields.add(f.key); }));
    refreshChips(null);
  });
}

function refreshChips(allState) {
  document.querySelectorAll('.field-chip').forEach((chip, i) => {
    const key = ALL_FIELDS[i];
    const checked = allState === null ? selectedFields.has(key) : allState;
    const cb = chip.querySelector('input');
    if (cb) cb.checked = checked;
    if (checked) chip.classList.add('checked'); else chip.classList.remove('checked');
    if (allState === null && checked) selectedFields.add(key);
    else if (allState === true) selectedFields.add(key);
    else if (allState === false) selectedFields.delete(key);
  });
}

// ── DATA SEARCH ────────────────────────────────────────────────────
function initDataSearch() {
  $('dataSearch').addEventListener('input', (e) => {
    filteredData = filterData(allData, e.target.value);
    renderDataTable(filteredData);
  });

  // Source filter pills
  document.querySelectorAll('.source-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.source-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const src = btn.dataset.filter;
      filteredData = src === 'all' ? allData : allData.filter(d => (d.source || '').toLowerCase().includes(src));
      renderDataTable(filteredData);
    });
  });
}

function filterData(data, query) {
  if (!query) return data;
  const q = query.toLowerCase();
  return data.filter(d => Object.values(d).some(v => String(v).toLowerCase().includes(q)));
}

// ── DATA TABLE ─────────────────────────────────────────────────────
function renderDataTable(data) {
  const table = $('dataTable');
  const empty = $('emptyState');
  if (!data || data.length === 0) {
    table.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  table.style.display = 'table';
  empty.style.display = 'none';

  const showCols = ['name', 'phone', 'averageRating', 'categories', 'fullAddress', 'website', 'source'];
  const head = $('tableHead');
  head.innerHTML = showCols.map(k => `<th>${fieldLabel(k)}</th>`).join('') + '<th>#</th>';

  const body = $('tableBody');
  body.innerHTML = '';
  const slice = data.slice(0, 200);
  slice.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = showCols.map(k => {
      let val = row[k] || '';
      if (k === 'averageRating' && val) return `<td class="rating-cell">★ ${val}</td>`;
      if (k === 'website' && val) return `<td><a href="${val}" target="_blank" style="color:var(--accent-blue);text-decoration:none">${row.domain || val.slice(0,25)}</a></td>`;
      if (k === 'source') {
        const color = val.includes('JustDial') ? '#ff6600' : val.includes('Bing') ? '#0078d4' : '#4285f4';
        return `<td><span style="background:${color}20;color:${color};padding:1px 6px;border-radius:10px;font-size:10px;font-weight:600">${val||'—'}</span></td>`;
      }
      return `<td title="${escHtml(String(val))}">${escHtml(String(val).slice(0,30))}${val.length>30?'…':''}</td>`;
    }).join('');
    tr.innerHTML += `<td style="color:var(--text-muted)">${i + 1}</td>`;
    body.appendChild(tr);
  });

  if (data.length > 200) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${showCols.length+1}" style="text-align:center;color:var(--text-muted);padding:10px">… and ${data.length-200} more rows (export to see all)</td>`;
    body.appendChild(tr);
  }
}

function fieldLabel(key) {
  for (const g of FIELD_GROUPS) {
    const f = g.fields.find(f => f.key === key);
    if (f) return f.label;
  }
  return key;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── COPY ALL ───────────────────────────────────────────────────────
function copyAllData() {
  if (!allData.length) { showToast('No data to copy', 'error'); return; }
  const fields = [...selectedFields];
  const lines = [fields.join('\t')];
  allData.forEach(row => lines.push(fields.map(k => row[k] || '').join('\t')));
  navigator.clipboard.writeText(lines.join('\n')).then(() => showToast('Copied to clipboard!', 'success'));
}

// ── EXPORT ─────────────────────────────────────────────────────────
function initExportButtons() {
  $('exportExcel').addEventListener('click', exportExcel);
  $('exportCSV').addEventListener('click', exportCSV);
  $('exportJSON').addEventListener('click', exportJSON);
}

function updateExportCount() {
  const el = $('exportCount');
  if (el) el.textContent = allData.length;
}

function getExportData() {
  const fields = [...selectedFields];
  return allData.map(row => {
    const out = {};
    fields.forEach(k => { out[fieldLabel(k)] = row[k] || ''; });
    return out;
  });
}

function exportCSV() {
  if (!allData.length) { showToast('No data to export', 'error'); return; }
  const rows = getExportData();
  const fields = Object.keys(rows[0]);
  const lines = [
    `# ${BRAND.name} v${BRAND.version} | ${BRAND.tagline} | Exported: ${new Date().toLocaleString()}`,
    fields.join(',')
  ];
  rows.forEach(r => lines.push(fields.map(k => `"${String(r[k]).replace(/"/g,'""')}"`).join(',')));
  downloadFile(lines.join('\n'), 'text/csv', `${BRAND.exportPrefix}_${dateStr()}.csv`);
  showToast(`Exported ${allData.length} leads as CSV`, 'success');
}

function exportJSON() {
  if (!allData.length) { showToast('No data to export', 'error'); return; }
  const rows = getExportData();
  const output = {
    meta: {
      tool: BRAND.name,
      version: BRAND.version,
      author: BRAND.author,
      company: BRAND.company,
      exportedAt: new Date().toISOString(),
      totalLeads: rows.length
    },
    data: rows
  };
  downloadFile(JSON.stringify(output, null, 2), 'application/json', `${BRAND.exportPrefix}_${dateStr()}.json`);
  showToast(`Exported ${allData.length} leads as JSON`, 'success');
}

function exportExcel() {
  if (!allData.length) { showToast('No data to export', 'error'); return; }
  const rows = getExportData();
  const fields = Object.keys(rows[0]);

  let xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
    xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <Worksheet ss:Name="${BRAND.name} Leads">
    <Table>`;

  // Branding row
  xml += `<Row><Cell ss:MergeAcross="${fields.length-1}"><Data ss:Type="String">${BRAND.name} v${BRAND.version} | ${BRAND.tagline} | Exported: ${new Date().toLocaleString()}</Data></Cell></Row>`;

  // Header
  xml += `<Row>${fields.map(f => `<Cell><Data ss:Type="String">${escXml(f)}</Data></Cell>`).join('')}</Row>`;

  rows.forEach(r => {
    const cells = fields.map(k => `<Cell><Data ss:Type="String">${escXml(String(r[k]))}</Data></Cell>`).join('');
    xml += `<Row>${cells}</Row>`;
  });

  xml += '</Table></Worksheet></Workbook>';
  downloadFile(xml, 'application/vnd.ms-excel', `${BRAND.exportPrefix}_${dateStr()}.xls`);
  showToast(`Exported ${allData.length} leads as Excel`, 'success');
}

function escXml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function downloadFile(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: false });
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function dateStr() {
  return new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
}

// ── SETTINGS ───────────────────────────────────────────────────────
function getConfig() {
  return {
    maxLeads: parseInt($('maxLeads').value) || 500,
    scrollDelay: parseInt($('scrollDelay').value) || 1500,
    extractPhone: $('setPhone').checked,
    extractEmailSocial: $('setEmailSocial').checked,
    extractHours: $('setHours').checked,
    extractCoords: $('setCoords').checked,
    extractImages: $('setImages').checked,
    autoOpen: $('setAutoOpen').checked,
    deduplicate: $('setDedup').checked,
    autoExport: $('setAutoExport').checked,
    extractWhatsApp: $('setWhatsApp') ? $('setWhatsApp').checked : true,
    extractDescription: $('setDescription') ? $('setDescription').checked : true,
  };
}

function saveSettings() {
  chrome.storage.local.set({ mh_settings: getConfig() });
}

function loadSettings() {
  chrome.storage.local.get(['mh_settings'], (res) => {
    if (!res.mh_settings) return;
    const s = res.mh_settings;
    if (s.maxLeads) $('maxLeads').value = s.maxLeads;
    if (s.scrollDelay) { $('scrollDelay').value = s.scrollDelay; $('delayVal').textContent = (s.scrollDelay/1000).toFixed(1)+'s'; }
    const bools = ['extractPhone','extractEmailSocial','extractHours','extractCoords','extractImages','autoOpen','deduplicate','autoExport'];
    bools.forEach(k => {
      const id = 'set' + k.charAt(0).toUpperCase() + k.slice(1).replace('extract','').replace(/([A-Z])/g, (m) => m);
      // find toggle by mapping
    });
    if (s.extractPhone !== undefined) $('setPhone').checked = s.extractPhone;
    if (s.extractEmailSocial !== undefined) $('setEmailSocial').checked = s.extractEmailSocial;
    if (s.extractHours !== undefined) $('setHours').checked = s.extractHours;
    if (s.extractCoords !== undefined) $('setCoords').checked = s.extractCoords;
    if (s.extractImages !== undefined) $('setImages').checked = s.extractImages;
    if (s.autoOpen !== undefined) $('setAutoOpen').checked = s.autoOpen;
    if (s.deduplicate !== undefined) $('setDedup').checked = s.deduplicate;
    if (s.autoExport !== undefined) $('setAutoExport').checked = s.autoExport;
  });
}

function loadSavedData() {
  chrome.storage.local.get(['scraped_places'], (res) => {
    allData = res.scraped_places || [];
    filteredData = allData;
    updateCount(allData.length);
    updateExportCount();
    $('statExtracted').textContent = allData.length;
    if (allData.length > 0) addLog(`Loaded ${allData.length} previously scraped leads`, 'success');
  });
}

// ── TOAST ──────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  let toast = document.querySelector('.toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 2500);
}
