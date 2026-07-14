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
  // Use VisibilityInterval if available, fallback to regular setInterval
  if (window.VisibilityInterval) {
    _clockInterval = new VisibilityInterval(updateTime, 1000);
  } else {
    _clockInterval = setInterval(updateTime, 1000);
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
        const randomIndex = Math.floor(Math.random() * currentMottos.length);
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
const SEARCH_HISTORY_LIMIT = 8;

const SEARCH_PROVIDER_STORAGE_KEY = 'searchProvider';
const CUSTOM_PROVIDERS_STORAGE_KEY = 'customSearchProviders';

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

let isSearchInputFocused = false;
let searchBarElement = null;
let searchInputElement = null;
let searchHistoryPanel = null;
let searchHistoryListEl = null;
let searchHistoryClearBtn = null;

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

function loadCustomProviders() {
  try {
    const raw = localStorage.getItem(CUSTOM_PROVIDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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
  if (!name || !url || !url.includes('{query}')) return false;
  const id = 'custom_' + Date.now();
  const providers = loadCustomProviders();
  providers.push({ id: id, name: name, url: url });
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

function getActiveProviderUrl(query) {
  const all = getAllProviders();
  const provider = all[activeProviderId];
  if (!provider) return null;
  return provider.url.replace('{query}', encodeURIComponent(query));
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
    btn.title = p.name;
    btn.setAttribute('aria-label', 'Search with ' + p.name);
    btn.textContent = p.name.charAt(0).toUpperCase();
    bar.appendChild(btn);
  });
}

function updateProviderSelection() {
  const bar = document.getElementById('search-provider-bar');
  if (!bar) return;

  bar.querySelectorAll('.search-provider-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.provider === activeProviderId);
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

  renderCustomProviderButtons();
  updateProviderSelection();

  bar.addEventListener('click', function (event) {
    const btn = event.target.closest('.search-provider-btn');
    if (!btn) return;
    saveActiveProvider(btn.dataset.provider);
    updateProviderSelection();
  });

  bar.addEventListener('focusin', function (event) {
    if (event.target.closest('.search-provider-btn')) {
      isSearchInputFocused = false;
      hideSearchHistorySuggestions();
    }
  });
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
      <div class="search-history-list"></div>
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

    searchBarElement.appendChild(searchHistoryPanel);
  }

  return searchHistoryPanel;
}

function hideSearchHistorySuggestions() {
  if (searchHistoryPanel) {
    searchHistoryPanel.hidden = true;
  }

  if (searchInputElement) {
    searchInputElement.setAttribute('aria-expanded', 'false');
  }
}

function executeSearch(query) {
  clearSearchValidationFeedback();
  const validation = validateUrl(query);

  if (validation.status === 'valid') {
    window.location.href = validation.url.href;
    return;
  }

  if (validation.status === 'malformed') {
    showSearchValidationFeedback(translateValidationMessage(validation.message));
    return;
  }

  runDefaultSearch(query);
}

function selectSearchHistorySuggestion(query) {
  if (!searchInputElement) {
    return;
  }

  searchInputElement.value = query;
  hideSearchHistorySuggestions();
  searchInputElement.focus();
  executeSearch(query);
}

function renderSearchHistorySuggestions() {
  if (!searchInputElement) {
    return;
  }

  const panel = ensureSearchHistoryPanel();
  if (!panel || !searchHistoryListEl || !searchHistoryClearBtn) {
    return;
  }

  const t = window.i18n ? window.i18n.t : (key) => key;
  const searchHistory = readSearchHistory();
  const query = searchInputElement.value.trim().toLowerCase();
  const suggestions = query
    ? searchHistory.filter((item) => item.toLowerCase().includes(query))
    : searchHistory;

  if (!isSearchInputFocused || suggestions.length === 0) {
    hideSearchHistorySuggestions();
    return;
  }

  const title = panel.querySelector('.search-history-title');
  if (title) {
    title.textContent = t('recentSearches');
  }

  searchHistoryClearBtn.textContent = t('clearSearchHistory');
  searchHistoryListEl.innerHTML = '';

  suggestions.forEach((item) => {
    const suggestionBtn = document.createElement('button');
    suggestionBtn.type = 'button';
    suggestionBtn.className = 'search-history-item';
    suggestionBtn.textContent = item;
    suggestionBtn.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    suggestionBtn.addEventListener('click', () => {
      selectSearchHistorySuggestion(item);
    });
    searchHistoryListEl.appendChild(suggestionBtn);
  });

  panel.hidden = false;
  searchInputElement.setAttribute('aria-expanded', 'true');
}

function runDefaultSearch(query, onSuccess) {
  const isActiveDefault = !activeProviderId || activeProviderId === 'google';
  const providerUrl = isActiveDefault ? null : getActiveProviderUrl(query);

  if (providerUrl) {
    recordSearchHistory(query);
    window.open(providerUrl, '_blank');
    if (onSuccess) onSuccess();
    return;
  }

  if (typeof chrome !== 'undefined' && chrome.search && typeof chrome.search.query === 'function') {
    chrome.search.query({
      text: query,
      disposition: 'NEW_TAB',
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
  const validation = validateUrl(query);

  if (validation.status === 'valid') {
    recordSearchHistory(query);
    window.location.href = validation.url.href;
    return;
  }

  if (validation.status === 'malformed') {
    showSearchValidationFeedback(translateValidationMessage(validation.message));
    return;
  }

  runDefaultSearch(query, () => recordSearchHistory(query));
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

  searchInputElement.setAttribute('aria-autocomplete', 'list');
  searchInputElement.setAttribute('aria-expanded', 'false');
  searchInputElement.setAttribute('aria-controls', 'search-history-panel');

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
    hideSearchHistorySuggestions();
  });

  searchInputElement.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      isSearchInputFocused = false;
      hideSearchHistorySuggestions();
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
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
window.addCustomProvider = addCustomProvider;
window.removeCustomProvider = removeCustomProvider;
window.getAllProviders = getAllProviders;
window.getActiveProviderUrl = getActiveProviderUrl;
window.updateProviderSelection = updateProviderSelection;
window.BUILT_IN_PROVIDERS = BUILT_IN_PROVIDERS;

// Set the motto and button functionality after the page has finished loading
document.addEventListener('DOMContentLoaded', () => {
  displayDailyMotto();
  setupRefreshMotto();
  setupCopyMotto();
  checkFooterOverlap();
  window.addEventListener('resize', checkFooterOverlap);
});
