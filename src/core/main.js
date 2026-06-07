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

function runDefaultSearch(query) {
  if (typeof chrome !== 'undefined' && chrome.search && typeof chrome.search.query === 'function') {
    chrome.search.query({
      text: query,
      disposition: 'CURRENT_TAB',
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

  recordSearchHistory(query);
  runDefaultSearch(query);
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
    if (nextTarget && searchBarElement.contains(nextTarget)) {
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

// Set the motto and button functionality after the page has finished loading
document.addEventListener('DOMContentLoaded', () => {
  displayDailyMotto();
  setupRefreshMotto();
  setupCopyMotto();
  checkFooterOverlap();
  window.addEventListener('resize', checkFooterOverlap);
});
