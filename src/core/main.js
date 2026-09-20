// main.js - Main initialization, time, date, motto

function updateTime() {
  const now = new Date();
  const timeElement = document.getElementById('clock-time') || document.getElementById('clock');
  const dateElement = document.getElementById('date');
  const locale = getDisplayLocale();

  // Update time
  if (timeElement) {
    timeElement.textContent = formatClockTime(now, locale);
  }

  // Update date - use current language for locale
  if (dateElement) {
    dateElement.textContent = formatDateDisplay(now, locale);
  }
}

window.updateTime = updateTime;
window.getDisplayLocale = getDisplayLocale;
window.getClockFormat = getClockFormat;

function getDisplayLocale() {
  const currentLang = window.i18n ? window.i18n.currentLanguage() : 'en';
  const displayLocales = {
    en: 'en-US',
    zh: 'zh-CN',
    ja: 'ja-JP',
    ko: 'ko-KR',
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
    pt: 'pt-BR',
    ru: 'ru-RU'
  };

  // Unsupported languages use the documented default locale.
  return displayLocales[currentLang] || 'en-US';
}

function getClockFormat() {
  return localStorage.getItem('clockFormat') || 'auto';
}

function getDateFormat() {
  return localStorage.getItem('dateFormat') || 'auto';
}

function formatClockTime(now, locale) {
  const clockFormat = getClockFormat();

  if (clockFormat === '12h') {
    return now.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  if (clockFormat === '24h') {
    return now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  return now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function formatLocaleDefaultDate(now, locale) {
  const currentLang = window.i18n ? window.i18n.currentLanguage() : 'en';

  // Keep the existing Chinese spacing, otherwise let the locale choose the default order.
  if (currentLang === 'zh') {
    const weekday = now.toLocaleDateString('zh-CN', { weekday: 'long' });
    const month = now.toLocaleDateString('zh-CN', { month: 'long' });
    const day = now.toLocaleDateString('zh-CN', { day: 'numeric' });
    return `${month}${day} ${weekday}`;
  }

  return now.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatLongDate(now, locale) {
  const currentLang = window.i18n ? window.i18n.currentLanguage() : 'en';

  if (currentLang === 'zh') {
    const weekday = now.toLocaleDateString('zh-CN', { weekday: 'long' });
    const month = now.toLocaleDateString('zh-CN', { month: 'long' });
    const day = now.toLocaleDateString('zh-CN', { day: 'numeric' });
    return `${weekday} ${month}${day}`;
  }

  return now.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatCompactDate(now, locale) {
  const currentLang = window.i18n ? window.i18n.currentLanguage() : 'en';

  if (currentLang === 'zh') {
    const month = now.toLocaleDateString('zh-CN', { month: 'numeric' });
    const day = now.toLocaleDateString('zh-CN', { day: 'numeric' });
    return `${month}月${day}日`;
  }

  return now.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function formatDateDisplay(now, locale) {
  const dateFormat = getDateFormat();

  if (dateFormat === 'long') {
    return formatLongDate(now, locale);
  }

  if (dateFormat === 'compact') {
    return formatCompactDate(now, locale);
  }

  if (dateFormat === 'numeric') {
    return now.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  return formatLocaleDefaultDate(now, locale);
}

// Update time immediately and then every minute using visibility-aware interval
updateTime();

let _clockInterval = null;

function initClock() {
  // Clear any existing interval to prevent duplicates
  if (_clockInterval) {
    if (_clockInterval.destroy) _clockInterval.destroy();
    else clearInterval(_clockInterval);
  }
  // Use VisibilityInterval if available, fallback to regular setInterval.
  // Reference window.updateTime so that later wrappers (e.g. timezone-clocks.js)
  // that replace window.updateTime are picked up by the interval.
  if (window.VisibilityInterval) {
    _clockInterval = new VisibilityInterval(function () { window.updateTime(); }, 1000);
  } else {
    _clockInterval = setInterval(function () { window.updateTime(); }, 1000);
  }
}

// Initialize clock when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initClock);
} else {
  initClock();
}

// Listen for language changes to update time and date display
window.addEventListener('languageChanged', updateTime);

// Display a motto that stays the same for each day
function displayDailyMotto() {
  try {
    const now = new Date();
    // Use year, month, and day to get a unique number for the day
    const daySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    // Get current language
    const currentLang = window.i18n ? window.i18n.currentLanguage() : 'en';
    // Get mottos for current language, fallback to English
    const currentMottos = mottos[currentLang] || mottos.en;
    // Deterministically pick a motto for the day
    const index = daySeed % currentMottos.length;
    const mottoText = document.getElementById('motto-text');
    if (mottoText) {
      mottoText.textContent = currentMottos[index];
      // Add fade-in effect
      if (window.prefersReducedMotion && window.prefersReducedMotion()) {
        mottoText.style.transition = 'none';
        mottoText.style.opacity = '1';
      } else {
        mottoText.style.opacity = '0';
        setTimeout(() => {
          mottoText.style.transition = 'opacity 0.5s';
          mottoText.style.opacity = '1';
        }, 50);
      }
    }
  } catch (e) {
    console.error('Error displaying motto:', e);
  }
}

// Handle refresh motto functionality
function setupRefreshMotto() {
  const refreshBtn = document.getElementById('refresh-motto-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const mottoText = document.getElementById('motto-text');
      if (mottoText) {
        // Get current language
        const currentLang = window.i18n ? window.i18n.currentLanguage() : 'en';
        // Get mottos for current language, fallback to English
        const currentMottos = mottos[currentLang] || mottos.en;
        // Pick a random motto
        const randomValue = new Uint32Array(1);
        const maxUnbiasedValue = Math.floor(0x100000000 / currentMottos.length) * currentMottos.length;
        do {
          crypto.getRandomValues(randomValue);
        } while (randomValue[0] >= maxUnbiasedValue);
        const randomIndex = randomValue[0] % currentMottos.length;
        mottoText.textContent = currentMottos[randomIndex];
        // Add refresh animation
        if (window.prefersReducedMotion && window.prefersReducedMotion()) {
          mottoText.style.transition = 'none';
          mottoText.style.opacity = '1';
          checkFooterOverlap();
        } else {
          mottoText.style.opacity = '0';
          setTimeout(() => {
            mottoText.style.transition = 'opacity 0.3s ease';
            mottoText.style.opacity = '1';
            checkFooterOverlap();
          }, 50);
        }
      }
    });
  }
}

// Handle copy motto functionality
function showCopyNotification(success) {
  const successText = window.i18n ? window.i18n.t('copyMottoCopied') : 'Copied';
  const failureText = window.i18n ? window.i18n.t('copyMottoFailed') : 'Failed to copy';

  let notification = document.querySelector('.copy-notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.className = 'copy-notification';
    document.body.appendChild(notification);
  }

  notification.textContent = success ? successText : failureText;
  notification.classList.add('show');
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

function setupCopyMotto() {
  const copyBtn = document.getElementById('copy-motto-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const mottoText = document.getElementById('motto-text');
      if (mottoText && mottoText.textContent) {
        try {
          await navigator.clipboard.writeText(mottoText.textContent);
          showCopyNotification(true);
        } catch (err) {
          console.error('Failed to copy motto:', err);
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = mottoText.textContent;
          document.body.appendChild(textArea);
          textArea.select();
          try {
            document.execCommand('copy');
            showCopyNotification(true);
          } catch (fallbackErr) {
            console.error('Fallback copy failed:', fallbackErr);
            showCopyNotification(false);
          }
          document.body.removeChild(textArea);
        }
      }
    });
  }
}

let isSearchHandlerBound = false;

const SEARCH_UNAVAILABLE_MESSAGE = 'Search is unavailable in this browser.';
const SEARCH_HISTORY_STORAGE_KEY = 'searchHistory';
const SEARCH_HISTORY_ENABLED_STORAGE_KEY = 'searchHistoryEnabled';
const SEARCH_HISTORY_LIMIT = 8;
const SEARCH_SUGGESTION_DEBOUNCE_MS = 150;
const SEARCH_REMOTE_SUGGESTION_LIMIT = 5;
const SEARCH_SUGGESTION_LIMIT = 8;

const SEARCH_PROVIDER_STORAGE_KEY = 'searchProvider';
const CUSTOM_PROVIDERS_STORAGE_KEY = 'customSearchProviders';

const SEARCH_BANGS = Object.freeze({
  g: 'google',
  b: 'bing',
  d: 'duckduckgo',
  w: 'wikipedia',
  yt: 'youtube'
});

const BUILT_IN_PROVIDERS = {
  google: {
    name: 'Google',
    url: 'https://www.google.com/search?q={query}',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>'
  },
  bing: {
    name: 'Bing',
    url: 'https://www.bing.com/search?q={query}',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M4.07 3.5v14.3l4.57 1.97V6.37l7.47 3.22v4.7L4.07 3.5z" fill="#00809D"/><path d="M16.11 9.59l3.95-1.7v7.32l-3.95 1.7V9.59z" fill="#00809D"/><path d="M4.07 3.5l11.37 4.9-3.8 1.64L4.07 3.5z" fill="#50B9B4"/></svg>'
  },
  duckduckgo: {
    name: 'DuckDuckGo',
    url: 'https://duckduckgo.com/?q={query}',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0z" fill="#DE5833"/><path d="M10.07 9.56c-.07.42.15.82.58 1.04.42.22.92.12 1.23-.26l.04-.05c.32-.38.37-.93.12-1.37-.25-.44-.75-.66-1.21-.54-.46.12-.73.58-.66 1.03l.02.04c-.18-.05-.37-.06-.56-.03-.42.07-.72.45-.67.88.05.42.42.7.84.65.32-.04.58-.23.68-.52l.01-.03c.14-.36.09-.78-.15-1.07-.24-.29-.63-.38-.97-.28-.34.1-.55.42-.52.78v.04c-.16-.05-.33-.06-.5-.02-.41.09-.69.43-.63.84.05.42.42.7.83.64z" fill="#FFF"/></svg>'
  },
  wikipedia: {
    name: 'Wikipedia',
    url: 'https://en.wikipedia.org/w/index.php?search={query}',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12.09 2C6.46 2 3.34 3.45 3.34 3.45l.01 1.52s3.12-1.19 5.88-1.19l-.01 2.59H3.72v2.44h5.5v2.98h-4.3v2.44h4.3v3.88c-.03.22-.15.84-.15.84l2.22-.02s-.12-.39-.16-.64v-6.06h4.3v-2.44h-4.3V6.22h5.88v-2.59s-1.8.08-3.42.39c-.41-1.49-1.21-2.02-1.21-2.02h-4.6z" fill="#333"/></svg>'
  },
  youtube: {
    name: 'YouTube',
    url: 'https://www.youtube.com/results?search_query={query}',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z" fill="#FF0000"/></svg>'
  }
};

const RESERVED_PROVIDER_IDS = Object.keys(BUILT_IN_PROVIDERS);

let isSearchInputFocused = false;
let searchBarElement = null;
let searchInputElement = null;
let searchHistoryPanel = null;
let searchHistoryListEl = null;
let searchHistoryClearBtn = null;
let searchSuggestionDebounceTimer = null;
let searchSuggestionRequestController = null;
let searchSuggestionRequestSequence = 0;
let searchSuggestionItems = [];
let searchSuggestionIndex = -1;
let searchProviderLiveRegion = null;

function isSearchHistoryEnabled() {
  try {
    return localStorage.getItem(SEARCH_HISTORY_ENABLED_STORAGE_KEY) !== 'false';
  } catch (e) {
    console.warn('Failed to read search history enabled setting:', e);
    return true;
  }
}

function readSearchHistory() {
  try {
    const rawHistory = localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!rawHistory) {
      return [];
    }

    const parsedHistory = JSON.parse(rawHistory);
    if (!Array.isArray(parsedHistory)) {
      return [];
    }

    const seen = new Set();
    const normalizedHistory = [];

    parsedHistory.forEach((item) => {
      if (typeof item !== 'string') {
        return;
      }

      const query = item.trim();
      if (!query) {
        return;
      }

      const dedupeKey = query.toLowerCase();
      if (seen.has(dedupeKey)) {
        return;
      }

      seen.add(dedupeKey);
      normalizedHistory.push(query);
    });

    return normalizedHistory.slice(0, SEARCH_HISTORY_LIMIT);
  } catch (error) {
    console.warn('Failed to read search history:', error);
    return [];
  }
}

function writeSearchHistory(history) {
  try {
    if (!history.length) {
      localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY);
      return;
    }

    localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, SEARCH_HISTORY_LIMIT)));
  } catch (error) {
    console.warn('Failed to persist search history:', error);
  }
}

function recordSearchHistory(query) {
  if (!isSearchHistoryEnabled()) {
    return;
  }

  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return;
  }

  const lowerQuery = normalizedQuery.toLowerCase();
  const nextHistory = readSearchHistory().filter((item) => item.toLowerCase() !== lowerQuery);
  nextHistory.unshift(normalizedQuery);
  writeSearchHistory(nextHistory);

  if (isSearchInputFocused) {
    renderSearchHistorySuggestions();
  }
}

function clearSearchHistory() {
  writeSearchHistory([]);

  if (isSearchInputFocused) {
    renderSearchHistorySuggestions();
  } else {
    hideSearchHistorySuggestions();
  }
}

let activeProviderId = null;

function loadActiveProvider() {
  try {
    const stored = localStorage.getItem(SEARCH_PROVIDER_STORAGE_KEY);
    if (stored && (BUILT_IN_PROVIDERS[stored] || loadCustomProviders().some(function (p) { return p.id === stored; }))) {
      return stored;
    }
  } catch (e) {
    console.warn('Failed to read search provider:', e);
  }
  return 'google';
}

function saveActiveProvider(providerId) {
  try {
    localStorage.setItem(SEARCH_PROVIDER_STORAGE_KEY, providerId);
  } catch (e) {
    console.warn('Failed to save search provider:', e);
  }
  activeProviderId = providerId;
}

function isValidProviderUrl(url) {
  if (typeof url !== 'string' || !url.includes('{query}')) return false;

  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function isValidCustomProvider(provider, seenIds, seenBangCodes) {
  if (!provider || typeof provider !== 'object' ||
    typeof provider.id !== 'string' || !provider.id.trim() ||
    typeof provider.name !== 'string' || !provider.name.trim() ||
    !isValidProviderUrl(provider.url)) {
    return false;
  }
  if (RESERVED_PROVIDER_IDS.indexOf(provider.id) !== -1) return false;

  const code = getCustomProviderCode(provider);
  if (!code || Object.prototype.hasOwnProperty.call(SEARCH_BANGS, code)) return false;

  if (seenIds) {
    if (seenIds[provider.id]) return false;
    seenIds[provider.id] = true;
  }
  if (seenBangCodes) {
    if (seenBangCodes[code]) return false;
    seenBangCodes[code] = true;
  }
  return true;
}

function loadCustomProviders() {
  try {
    const raw = localStorage.getItem(CUSTOM_PROVIDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seenIds = {};
    const seenBangCodes = {};
    return parsed.filter(function (p) { return isValidCustomProvider(p, seenIds, seenBangCodes); });
  } catch (e) {
    console.warn('Failed to read custom providers:', e);
    return [];
  }
}

function saveCustomProviders(providers) {
  try {
    localStorage.setItem(CUSTOM_PROVIDERS_STORAGE_KEY, JSON.stringify(providers));
  } catch (e) {
    console.warn('Failed to save custom providers:', e);
  }
}

function addCustomProvider(name, url) {
  if (typeof name !== 'string' || !name.trim() || !isValidProviderUrl(url)) return false;
  const id = 'custom_' + Date.now();
  const providers = loadCustomProviders();
  const normalizedName = name.trim();
  const usedCodes = new Set(Object.keys(SEARCH_BANGS));
  providers.forEach(function (provider) {
    const code = getCustomProviderCode(provider);
    if (code) usedCodes.add(code);
  });

  const codeCandidates = [];
  const addCodeCandidate = function (candidate) {
    if (/^[a-z0-9]$/i.test(candidate) && !codeCandidates.includes(candidate)) {
      codeCandidates.push(candidate.toLowerCase());
    }
  };
  for (const char of normalizedName.toLowerCase()) {
    addCodeCandidate(char);
  }
  for (const char of 'abcdefghijklmnopqrstuvwxyz0123456789') {
    addCodeCandidate(char);
  }

  const code = codeCandidates.find(function (candidate) { return !usedCodes.has(candidate); });
  if (!code) return false;

  providers.push({ id: id, name: normalizedName, url: url, code: code });
  saveCustomProviders(providers);
  renderCustomProviderButtons();
  return id;
}

function removeCustomProvider(id) {
  const providers = loadCustomProviders().filter(function (p) { return p.id !== id; });
  saveCustomProviders(providers);
  if (activeProviderId === id) {
    saveActiveProvider('google');
    updateProviderSelection();
  }
  renderCustomProviderButtons();
}

function getAllProviders() {
  const all = {};
  Object.keys(BUILT_IN_PROVIDERS).forEach(function (key) {
    all[key] = BUILT_IN_PROVIDERS[key];
  });
  loadCustomProviders().forEach(function (p) {
    all[p.id] = { name: p.name, url: p.url, icon: '' };
  });
  return all;
}

function getProviderUrl(providerId, query) {
  const all = getAllProviders();
  const provider = all[providerId];
  if (!provider || !isValidProviderUrl(provider.url)) return null;
  return provider.url.replace('{query}', encodeURIComponent(query));
}

function getActiveProviderUrl(query) {
  return getProviderUrl(activeProviderId, query);
}

function getProviderSuggestionEndpoint(providerId, query) {
  const encodedQuery = encodeURIComponent(query);

  switch (providerId) {
    case 'google':
      return 'https://suggestqueries.google.com/complete/search?client=firefox&q=' + encodedQuery;
    case 'youtube':
      return 'https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=' + encodedQuery;
    case 'bing':
      return 'https://api.bing.com/qsonhs.aspx?q=' + encodedQuery;
    case 'duckduckgo':
      return 'https://duckduckgo.com/ac/?q=' + encodedQuery + '&type=list';
    case 'wikipedia':
      return 'https://en.wikipedia.org/w/api.php?action=opensearch&search=' + encodedQuery + '&limit=' + SEARCH_REMOTE_SUGGESTION_LIMIT + '&namespace=0&format=json&origin=*';
    default:
      return null;
  }
}

function normalizeRemoteSuggestion(value, query) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === query.trim().toLowerCase()) return null;
  return normalized;
}

function parseRemoteSearchSuggestions(providerId, payload, query) {
  const values = [];

  function add(value) {
    const normalized = normalizeRemoteSuggestion(value, query);
    if (normalized) values.push(normalized);
  }

  if ((providerId === 'google' || providerId === 'youtube') && Array.isArray(payload)) {
    const googleSuggestions = Array.isArray(payload[1]) ? payload[1] : [];
    googleSuggestions.forEach((item) => {
      if (Array.isArray(item)) add(item[0]);
      else add(item);
    });
  } else if (providerId === 'bing') {
    const results = payload && payload.AS && Array.isArray(payload.AS.Results) ? payload.AS.Results : [];
    results.forEach((result) => {
      const suggests = result && Array.isArray(result.Suggests) ? result.Suggests : [];
      suggests.forEach((item) => add(item && item.Txt));
    });
  } else if (providerId === 'duckduckgo' && Array.isArray(payload)) {
    payload.forEach((item) => add(item && item.phrase));
  } else if (providerId === 'wikipedia' && Array.isArray(payload)) {
    const wikipediaSuggestions = Array.isArray(payload[1]) ? payload[1] : [];
    wikipediaSuggestions.forEach(add);
  }

  return values.slice(0, SEARCH_REMOTE_SUGGESTION_LIMIT);
}

async function fetchRemoteSearchSuggestions(providerId, query, signal) {
  const endpoint = getProviderSuggestionEndpoint(providerId, query);
  if (!endpoint || !query.trim() || navigator.onLine === false) {
    return [];
  }

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'omit',
      signal
    });
    if (!response.ok) return [];

    const payload = await response.json();
    return parseRemoteSearchSuggestions(providerId, payload, query);
  } catch (error) {
    if (error && error.name !== 'AbortError') {
      console.warn('Failed to fetch search suggestions:', error);
    }
    return [];
  }
}

function getCustomProviderCode(provider) {
  if (!provider || typeof provider !== 'object') return '';
  if (typeof provider.code === 'string' && /^[a-z0-9]$/i.test(provider.code.trim())) {
    return provider.code.trim().toLowerCase();
  }

  const match = typeof provider.name === 'string' ? provider.name.match(/[a-z0-9]/i) : null;
  return match ? match[0].toLowerCase() : '';
}

function resolveSearchQuery(query) {
  const originalQuery = typeof query === 'string' ? query.trim() : '';
  if (!originalQuery) {
    return { query: '', providerId: activeProviderId, hasBang: false };
  }

  const match = /^!([a-z0-9]{1,10})(?:\s+(.*))?$/i.exec(originalQuery);
  if (!match) {
    return { query: originalQuery, providerId: activeProviderId, hasBang: false };
  }

  const code = match[1].toLowerCase();
  let providerId = SEARCH_BANGS[code] || null;

  if (!providerId) {
    const customProvider = loadCustomProviders().find((provider) => getCustomProviderCode(provider) === code);
    providerId = customProvider ? customProvider.id : null;
  }

  if (!providerId) {
    return { query: originalQuery, providerId: activeProviderId, hasBang: false };
  }

  return {
    query: (match[2] || '').trim(),
    providerId,
    hasBang: true
  };
}

function ensureSearchProviderLiveRegion() {
  if (searchProviderLiveRegion) return searchProviderLiveRegion;

  searchProviderLiveRegion = document.createElement('div');
  searchProviderLiveRegion.className = 'search-status-live';
  searchProviderLiveRegion.setAttribute('role', 'status');
  searchProviderLiveRegion.setAttribute('aria-live', 'polite');
  searchProviderLiveRegion.setAttribute('aria-atomic', 'true');

  const container = searchBarElement ? (searchBarElement.parentElement || searchBarElement) : document.body;
  container.appendChild(searchProviderLiveRegion);
  return searchProviderLiveRegion;
}

function announceSearchProvider(providerId) {
  const provider = getAllProviders()[providerId];
  if (!provider) return;

  const liveRegion = ensureSearchProviderLiveRegion();
  const t = window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t : (key) => key;
  liveRegion.textContent = t('searchWith') + ' ' + provider.name;
}

function cycleSearchProvider(step) {
  const providers = Object.keys(getAllProviders());
  if (!providers.length) return null;

  let currentIndex = providers.indexOf(activeProviderId);
  if (currentIndex === -1) currentIndex = 0;

  const direction = step < 0 ? -1 : 1;
  const nextIndex = (currentIndex + direction + providers.length) % providers.length;
  const nextProviderId = providers[nextIndex];

  saveActiveProvider(nextProviderId);
  updateProviderSelection();
  announceSearchProvider(nextProviderId);

  if (isSearchInputFocused) {
    scheduleSearchSuggestionsFetch();
  }

  return nextProviderId;
}

function resetSearchSuggestionSelection() {
  searchSuggestionIndex = -1;
  if (searchInputElement) {
    searchInputElement.removeAttribute('aria-activedescendant');
  }
}

function updateSearchSuggestionSelection(index) {
  if (!searchHistoryListEl || !searchInputElement) return;

  const items = Array.from(searchHistoryListEl.querySelectorAll('.search-history-item'));
  items.forEach((item, itemIndex) => {
    const selected = itemIndex === index;
    item.classList.toggle('is-selected', selected);
    item.setAttribute('aria-selected', selected ? 'true' : 'false');
  });

  searchSuggestionIndex = index;

  if (index >= 0 && items[index]) {
    const item = items[index];
    searchInputElement.setAttribute('aria-activedescendant', item.id);
    if (typeof item.scrollIntoView === 'function') {
      item.scrollIntoView({ block: 'nearest' });
    }
  } else {
    searchInputElement.removeAttribute('aria-activedescendant');
  }
}

function moveSearchSuggestionSelection(direction) {
  const itemCount = searchSuggestionItems.length;
  if (!itemCount) return;

  let nextIndex = searchSuggestionIndex + direction;
  if (nextIndex < 0) nextIndex = itemCount - 1;
  if (nextIndex >= itemCount) nextIndex = 0;

  updateSearchSuggestionSelection(nextIndex);
}

function mergeSearchSuggestions(localSuggestions, remoteSuggestions) {
  const merged = [];
  const seen = new Set();

  [...localSuggestions, ...remoteSuggestions].forEach((item) => {
    const normalized = normalizeRemoteSuggestion(item, '');
    if (!normalized) return;

    const key = normalized.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    merged.push(normalized);
  });

  return merged.slice(0, SEARCH_SUGGESTION_LIMIT);
}

function cancelSearchSuggestionsFetch() {
  if (searchSuggestionDebounceTimer) {
    clearTimeout(searchSuggestionDebounceTimer);
    searchSuggestionDebounceTimer = null;
  }

  if (searchSuggestionRequestController) {
    searchSuggestionRequestController.abort();
    searchSuggestionRequestController = null;
  }

  searchSuggestionRequestSequence += 1;
}

function scheduleSearchSuggestionsFetch() {
  if (!searchInputElement || !isSearchInputFocused || !isSearchHistoryEnabled()) {
    cancelSearchSuggestionsFetch();
    return;
  }

  cancelSearchSuggestionsFetch();
  const rawQuery = searchInputElement.value.trim();
  const resolved = resolveSearchQuery(rawQuery);
  const effectiveQuery = resolved.query;
  const searchHistory = readSearchHistory();
  const localSuggestions = effectiveQuery
    ? searchHistory.filter((item) => item.toLowerCase().includes(effectiveQuery.toLowerCase()))
    : searchHistory;

  renderSearchSuggestions(localSuggestions, resolved.providerId);

  if (!effectiveQuery || navigator.onLine === false || !resolved.providerId) {
    return;
  }

  const requestSequence = searchSuggestionRequestSequence;
  searchSuggestionDebounceTimer = setTimeout(async () => {
    searchSuggestionDebounceTimer = null;
    searchSuggestionRequestController = new AbortController();

    const remoteSuggestions = await fetchRemoteSearchSuggestions(
      resolved.providerId,
      resolved.query,
      searchSuggestionRequestController.signal
    );

    if (requestSequence !== searchSuggestionRequestSequence || !isSearchInputFocused) {
      return;
    }

    const latestHistory = readSearchHistory();
    const latestQuery = searchInputElement.value.trim();
    const latestResolved = resolveSearchQuery(latestQuery);
    const latestEffectiveQuery = latestResolved.query;
    const latestLocalSuggestions = latestEffectiveQuery
      ? latestHistory.filter((item) => item.toLowerCase().includes(latestEffectiveQuery.toLowerCase()))
      : latestHistory;

    if (
      latestResolved.providerId !== resolved.providerId ||
      latestResolved.query.toLowerCase() !== resolved.query.toLowerCase()
    ) {
      scheduleSearchSuggestionsFetch();
      return;
    }

    renderSearchSuggestions(mergeSearchSuggestions(latestLocalSuggestions, remoteSuggestions), latestResolved.providerId);
    searchSuggestionRequestController = null;
  }, SEARCH_SUGGESTION_DEBOUNCE_MS);
}

function renderBuiltInProviderIcons() {
  const bar = document.getElementById('search-provider-bar');
  if (!bar) return;

  Object.keys(BUILT_IN_PROVIDERS).forEach(function (providerId) {
    const button = bar.querySelector('.search-provider-btn[data-provider="' + providerId + '"]');
    if (!button) return;

    button.innerHTML = BUILT_IN_PROVIDERS[providerId].icon;
    button.dataset.providerIcon = providerId;
    const code = providerId === 'youtube' ? 'yt' : Object.keys(SEARCH_BANGS).find((bang) => SEARCH_BANGS[bang] === providerId);
    button.dataset.providerCode = code || '';
    button.setAttribute('aria-keyshortcuts', 'Control+K');
    button.setAttribute('aria-pressed', activeProviderId === providerId ? 'true' : 'false');
  });
}

function renderCustomProviderButtons() {
  const bar = document.getElementById('search-provider-bar');
  if (!bar) return;

  bar.querySelectorAll('.search-provider-custom').forEach(function (el) { el.remove(); });

  loadCustomProviders().forEach(function (p) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-provider-btn search-provider-custom';
    if (activeProviderId === p.id) btn.classList.add('active');
    btn.dataset.provider = p.id;
    const providerCode = getCustomProviderCode(p);
    btn.dataset.providerCode = providerCode;
    btn.title = p.name + (providerCode ? ' (!' + providerCode + ')' : '');
    const searchWith = window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t('searchWith') : 'Search with';
    btn.setAttribute('aria-label', searchWith + ' ' + p.name + (providerCode ? ' !' + providerCode : ''));
    btn.setAttribute('aria-keyshortcuts', 'Control+K');
    btn.setAttribute('aria-pressed', activeProviderId === p.id ? 'true' : 'false');
    btn.textContent = p.name.charAt(0).toUpperCase();
    bar.appendChild(btn);
  });
}

function updateProviderSelection() {
  const bar = document.getElementById('search-provider-bar');
  if (!bar) return;

  bar.querySelectorAll('.search-provider-btn').forEach(function (btn) {
    const isActive = btn.dataset.provider === activeProviderId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.setAttribute('aria-keyshortcuts', 'Control+K');
  });

  if (activeProviderId && activeProviderId !== 'google') {
    bar.classList.add('has-selection');
  } else {
    bar.classList.remove('has-selection');
  }
}

function initProviderBar() {
  activeProviderId = loadActiveProvider();

  const bar = document.getElementById('search-provider-bar');
  if (!bar) return;

  renderBuiltInProviderIcons();
  renderCustomProviderButtons();
  updateProviderSelection();

  bar.addEventListener('click', function (event) {
    const btn = event.target.closest('.search-provider-btn');
    if (!btn) return;
    saveActiveProvider(btn.dataset.provider);
    updateProviderSelection();
    announceSearchProvider(btn.dataset.provider);
  });

  bar.addEventListener('focusin', function (event) {
    if (event.target.closest('.search-provider-btn')) {
      isSearchInputFocused = false;
      hideSearchHistorySuggestions();
    }
  });
}

function refreshProviderBar() {
  activeProviderId = loadActiveProvider();
  renderBuiltInProviderIcons();
  renderCustomProviderButtons();
  updateProviderSelection();
}

function ensureSearchHistoryPanel() {
  if (!searchBarElement) {
    return null;
  }

  if (!searchHistoryPanel) {
    searchHistoryPanel = document.createElement('div');
    searchHistoryPanel.className = 'search-history-panel';
    searchHistoryPanel.id = 'search-history-panel';
    searchHistoryPanel.hidden = true;
    searchHistoryPanel.innerHTML = `
      <div class="search-history-header">
        <span class="search-history-title"></span>
        <button type="button" class="search-history-clear-btn"></button>
      </div>
      <div class="search-history-list" id="search-suggestions-list" role="listbox" data-i18n-aria-label="searchSuggestionsAriaLabel"></div>
    `;

    searchHistoryListEl = searchHistoryPanel.querySelector('.search-history-list');
    searchHistoryClearBtn = searchHistoryPanel.querySelector('.search-history-clear-btn');

    searchHistoryClearBtn.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    searchHistoryClearBtn.addEventListener('click', () => {
      clearSearchHistory();
      if (searchInputElement) {
        searchInputElement.focus();
      }
    });

    const searchHistoryContainer = searchBarElement.closest('.search-bar-wrapper') || searchBarElement;
    searchHistoryContainer.appendChild(searchHistoryPanel);
  }

  return searchHistoryPanel;
}

function hideSearchHistorySuggestions() {
  if (searchHistoryPanel) {
    searchHistoryPanel.hidden = true;
  }

  searchSuggestionItems = [];
  resetSearchSuggestionSelection();

  if (searchInputElement) {
    searchInputElement.setAttribute('aria-expanded', 'false');
  }
}

function executeSearch(query, providerIdOverride = null) {
  clearSearchValidationFeedback();
  const resolved = resolveSearchQuery(query);
  const providerId = providerIdOverride || resolved.providerId;

  if (!resolved.query) {
    return;
  }

  if (!resolved.hasBang) {
    const validation = validateUrl(resolved.query);

    if (validation.status === 'valid') {
      window.location.href = validation.url.href;
      return;
    }

    if (validation.status === 'malformed') {
      showSearchValidationFeedback(translateValidationMessage(validation.message));
      return;
    }
  }

  runDefaultSearch(resolved.query, null, providerId);
}

function selectSearchHistorySuggestion(suggestion) {
  if (!searchInputElement) {
    return;
  }

  const suggestionText = typeof suggestion === 'string' ? suggestion : (suggestion && suggestion.text);
  const providerId = typeof suggestion === 'object' && suggestion ? suggestion.providerId : null;
  if (!suggestionText) {
    return;
  }

  searchInputElement.value = suggestionText;
  hideSearchHistorySuggestions();
  searchInputElement.focus();
  executeSearch(suggestionText, providerId);
}

function renderSearchSuggestions(suggestions, providerId = activeProviderId) {
  if (!searchInputElement) {
    return;
  }

  if (!isSearchHistoryEnabled()) {
    hideSearchHistorySuggestions();
    return;
  }

  const panel = ensureSearchHistoryPanel();
  if (!panel || !searchHistoryListEl || !searchHistoryClearBtn) {
    return;
  }

  if (!isSearchInputFocused || suggestions.length === 0) {
    hideSearchHistorySuggestions();
    return;
  }

  const t = window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t : (key) => key;
  const title = panel.querySelector('.search-history-title');
  if (title) {
    title.textContent = t('recentSearches');
  }

  searchHistoryClearBtn.textContent = t('clearSearchHistory');
  searchHistoryListEl.setAttribute('aria-label', t('searchSuggestionsAriaLabel') || 'Search suggestions');
  searchHistoryListEl.innerHTML = '';
  searchSuggestionItems = suggestions.slice(0, SEARCH_SUGGESTION_LIMIT).map((item) => ({
    text: typeof item === 'string' ? item : (item && item.text) || '',
    providerId: typeof item === 'object' && item && item.providerId ? item.providerId : providerId
  }));

  searchSuggestionItems.forEach((item, index) => {
    const suggestionBtn = document.createElement('button');
    suggestionBtn.type = 'button';
    suggestionBtn.className = 'search-history-item';
    suggestionBtn.id = 'search-suggestion-item-' + index;
    suggestionBtn.setAttribute('role', 'option');
    suggestionBtn.setAttribute('aria-selected', 'false');
    suggestionBtn.textContent = item.text;
    suggestionBtn.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    suggestionBtn.addEventListener('click', () => {
      selectSearchHistorySuggestion(item);
    });
    searchHistoryListEl.appendChild(suggestionBtn);
  });

  resetSearchSuggestionSelection();
  panel.hidden = false;
  searchInputElement.setAttribute('aria-expanded', 'true');
}

function renderSearchHistorySuggestions() {
  if (!searchInputElement) {
    return;
  }

  const rawQuery = searchInputElement.value.trim();
  const resolved = resolveSearchQuery(rawQuery);
  const searchHistory = readSearchHistory();
  const suggestions = resolved.query
    ? searchHistory.filter((item) => item.toLowerCase().includes(resolved.query.toLowerCase()))
    : searchHistory;

  renderSearchSuggestions(suggestions, resolved.providerId);
  scheduleSearchSuggestionsFetch();
}

function loadOpenNewTabSetting() {
  return localStorage.getItem('openAppsInNewTab') !== 'false';
}

function runDefaultSearch(query, onSuccess, providerId = activeProviderId) {
  const providerUrl = providerId ? getProviderUrl(providerId, query) : null;
  const openInNewTab = loadOpenNewTabSetting();

  if (providerUrl) {
    if (onSuccess) {
      onSuccess();
    } else {
      recordSearchHistory(query);
    }

    if (openInNewTab) {
      window.open(providerUrl, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = providerUrl;
    }
    return;
  }

  if (typeof chrome !== 'undefined' && chrome.search && typeof chrome.search.query === 'function') {
    chrome.search.query({
      text: query,
      disposition: openInNewTab ? 'NEW_TAB' : 'CURRENT_TAB',
    }).then(() => {
      if (onSuccess) {
        onSuccess();
      }
    }).catch((error) => {
      console.warn('Failed to run default search:', error);
      showSearchValidationFeedback(SEARCH_UNAVAILABLE_MESSAGE);
    });
    return;
  }

  console.warn('chrome.search.query is unavailable in this browser.');
  showSearchValidationFeedback(SEARCH_UNAVAILABLE_MESSAGE);
}

function runSearch(query) {
  clearSearchValidationFeedback();
  cancelSearchSuggestionsFetch();

  const resolved = resolveSearchQuery(query);
  if (!resolved.query) {
    return;
  }

  if (!resolved.hasBang) {
    const validation = validateUrl(resolved.query);

    if (validation.status === 'valid') {
      recordSearchHistory(resolved.query);
      window.location.href = validation.url.href;
      return;
    }

    if (validation.status === 'malformed') {
      showSearchValidationFeedback(translateValidationMessage(validation.message));
      return;
    }
  }

  runDefaultSearch(resolved.query, () => recordSearchHistory(resolved.query), resolved.providerId);
}

function initSearchEngine() {
  if (isSearchHandlerBound) {
    return;
  }

  searchBarElement = document.querySelector('.search-bar');
  searchInputElement = searchBarElement ? searchBarElement.querySelector('input') : null;
  if (!searchBarElement || !searchInputElement) {
    return;
  }

  searchInputElement.setAttribute('role', 'combobox');
  searchInputElement.setAttribute('aria-autocomplete', 'list');
  searchInputElement.setAttribute('aria-expanded', 'false');
  searchInputElement.setAttribute('aria-controls', 'search-suggestions-list');

  const searchHistoryEnabledSetting = document.getElementById('search-history-enabled-setting');
  if (searchHistoryEnabledSetting) {
    searchHistoryEnabledSetting.checked = isSearchHistoryEnabled();
    searchHistoryEnabledSetting.addEventListener('change', function () {
      try {
        localStorage.setItem(SEARCH_HISTORY_ENABLED_STORAGE_KEY, this.checked);
      } catch (e) {
        console.warn('Failed to save search history enabled setting:', e);
      }
      if (this.checked) {
        renderSearchHistorySuggestions();
      } else {
        hideSearchHistorySuggestions();
      }
    });
  }

  searchInputElement.addEventListener('focus', function () {
    isSearchInputFocused = true;
    renderSearchHistorySuggestions();
  });

  searchBarElement.addEventListener('focusout', function (event) {
    const nextTarget = event.relatedTarget;
    if (nextTarget && (searchBarElement.contains(nextTarget) || (searchBarElement.parentElement && searchBarElement.parentElement.contains(nextTarget)))) {
      return;
    }

    isSearchInputFocused = false;
    cancelSearchSuggestionsFetch();
    hideSearchHistorySuggestions();
  });

  searchInputElement.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      cancelSearchSuggestionsFetch();
      hideSearchHistorySuggestions();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      cycleSearchProvider(event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === 'ArrowDown' && searchSuggestionItems.length) {
      event.preventDefault();
      moveSearchSuggestionSelection(1);
      return;
    }

    if (event.key === 'ArrowUp' && searchSuggestionItems.length) {
      event.preventDefault();
      moveSearchSuggestionSelection(-1);
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    if (searchSuggestionIndex >= 0 && searchSuggestionItems[searchSuggestionIndex]) {
      selectSearchHistorySuggestion(searchSuggestionItems[searchSuggestionIndex]);
      return;
    }

    const query = this.value.trim();
    if (!query) return;

    runSearch(query);
  });

  searchInputElement.addEventListener('input', function () {
    clearSearchValidationFeedback();
    if (isSearchInputFocused) {
      renderSearchHistorySuggestions();
    }
  });
  isSearchHandlerBound = true;
  initProviderBar();
}

function showSearchValidationFeedback(message) {
  let feedbackEl = document.querySelector('.search-validation-feedback');
  if (!feedbackEl) {
    feedbackEl = document.createElement('div');
    feedbackEl.className = 'search-validation-feedback';
    const searchBar = document.querySelector('.search-bar');
    if (searchBar) {
      searchBar.appendChild(feedbackEl);
    }
  }

  feedbackEl.textContent = message;
  feedbackEl.classList.add('show');
}

function clearSearchValidationFeedback() {
  const feedbackEl = document.querySelector('.search-validation-feedback');
  if (feedbackEl) {
    feedbackEl.classList.remove('show');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSearchEngine);
} else {
  initSearchEngine();
}

// Listen for language changes to update daily motto
window.addEventListener('languageChanged', displayDailyMotto);

// Hide footer-left / footer-right when they overlap with the motto container
function checkFooterOverlap() {
  const motto = document.getElementById('motto-container');
  const footerLeft = document.querySelector('.footer-left');
  const footerRight = document.querySelector('.footer-right');

  if (!motto || (!footerLeft && !footerRight)) return;

  const mottoRect = motto.getBoundingClientRect();

  if (footerLeft) {
    const leftRect = footerLeft.getBoundingClientRect();
    // Check if the right edge of footer-left is past the left edge of motto (with 5px buffer)
    const overlaps = leftRect.right + 5 >= mottoRect.left;
    footerLeft.style.opacity = overlaps ? '0' : '';
  }

  if (footerRight) {
    const rightRect = footerRight.getBoundingClientRect();
    // Check if the left edge of footer-right is before the right edge of motto (with 5px buffer)
    const overlaps = rightRect.left - 5 <= mottoRect.right;
    footerRight.style.opacity = overlaps ? '0' : '';
  }
}

// Make checkFooterOverlap globally accessible
window.checkFooterOverlap = checkFooterOverlap;

// Search provider functions (exposed for testing)
window.loadActiveProvider = loadActiveProvider;
window.saveActiveProvider = saveActiveProvider;
window.loadCustomProviders = loadCustomProviders;
window.saveCustomProviders = saveCustomProviders;
window.SEARCH_BANGS = SEARCH_BANGS;
window.getCustomProviderCode = getCustomProviderCode;
window.addCustomProvider = addCustomProvider;
window.removeCustomProvider = removeCustomProvider;
window.getAllProviders = getAllProviders;
window.getActiveProviderUrl = getActiveProviderUrl;
window.resolveSearchQuery = resolveSearchQuery;
window.cycleSearchProvider = cycleSearchProvider;
window.parseRemoteSearchSuggestions = parseRemoteSearchSuggestions;
window.fetchRemoteSearchSuggestions = fetchRemoteSearchSuggestions;
window.scheduleSearchSuggestionsFetch = scheduleSearchSuggestionsFetch;
window.updateProviderSelection = updateProviderSelection;
window.refreshProviderBar = refreshProviderBar;
window.BUILT_IN_PROVIDERS = BUILT_IN_PROVIDERS;

// Set the motto and button functionality after the page has finished loading
function initMottoAndFooter() {
  displayDailyMotto();
  setupRefreshMotto();
  setupCopyMotto();
  checkFooterOverlap();
  window.addEventListener('resize', checkFooterOverlap);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMottoAndFooter);
} else {
  initMottoAndFooter();
}
