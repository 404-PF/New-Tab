// src/features/weather-app.js - Weather app modal (expanded view)
// Shares data and settings with the existing WeatherWidget

(function () {
  'use strict';

  const escapeHtml = window.escapeHtml;

  // Shared weather lookup/conversion helpers. Defined once in
  // src/features/weather-utils.js and consumed by both the widget and the
  // app modal so the two surfaces cannot drift apart. weather-utils.js is
  // loaded first via bootstrap.js; bail out defensively if it is missing or
  // late so the app modal degrades instead of throwing an uncaught TypeError.
  if (!window.WeatherUtils) {
    console.warn('[weather] window.WeatherUtils unavailable; weather app modal disabled');
    return;
  }
  const {
    getWeatherInfo,
    getWeatherLabel,
    getWeatherIcon,
    getTemp,
    getTempUnit,
    getLang,
    normalizeLang
  } = window.WeatherUtils;

  // ===================== Constants =====================

  const CACHE_KEY = 'weatherCache';

  const DETAIL_ICONS = {
    feelsLike: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>',
    wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>',
    humidity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>'
  };

  const LOCATION_PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  // ===================== Utility Functions =====================

  function t(key) {
    return window.i18n ? window.i18n.t(key) : key;
  }

  function getAbbreviatedDayName(dateString, lang) {
    if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return '';
    }
    const date = new Date(dateString + 'T00:00:00');
    const dayIndex = date.getDay();
    if (!Number.isFinite(dayIndex) || dayIndex < 0 || dayIndex > 6 || isNaN(date.getTime())) {
      return '';
    }
    const dayNames = {
      en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      zh: ['\u5468\u65E5', '\u5468\u4E00', '\u5468\u4E8C', '\u5468\u4E09', '\u5468\u56DB', '\u5468\u4E94', '\u5468\u516D'],
      ja: ['\u65E5', '\u6708', '\u706B', '\u6C34', '\u6728', '\u91D1', '\u571F'],
      ko: ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0'],
      es: ['Dom', 'Lun', 'Mar', 'Mi\u00E9', 'Jue', 'Vie', 'S\u00E1b'],
      fr: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
      de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
      pt: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'S\u00E1b'],
      ru: ['\u0412\u0441', '\u041F\u043D', '\u0412\u0442', '\u0421\u0440', '\u0427\u0442', '\u041F\u0442', '\u0421\u0431']
    };
    const names = dayNames[normalizeLang(lang)] || dayNames.en;
    return names[dayIndex];
  }

  // ===================== Storage =====================

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse weather cache:', e);
      return {};
    }
  }

  function loadUnit() {
    try {
      return localStorage.getItem('weatherUnit') || 'celsius';
    } catch {
      return 'celsius';
    }
  }

  function loadEnabled() {
    try {
      return localStorage.getItem('weatherEnabled') === 'true';
    } catch {
      return false;
    }
  }

  // ===================== Rendering =====================

  function getModalElement() {
    return document.getElementById('weather-app-modal');
  }

  function getBodyElement() {
    return document.getElementById('weather-app-body');
  }

  function renderAppLoading() {
    const body = getBodyElement();
    if (!body) return;
    body.innerHTML = '<div class="weather-app-loading">' +
      '<div class="weather-spinner"></div>' +
      '<span class="weather-app-loading-text">' + t('weatherLoading') + '</span>' +
      '</div>';
  }

  function renderAppError(message) {
    const body = getBodyElement();
    if (!body) return;
    body.innerHTML = '<div class="weather-app-error">' +
      '<div class="weather-app-error-icon">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="10"/>' +
      '<line x1="12" y1="8" x2="12" y2="12"/>' +
      '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
      '</svg>' +
      '</div>' +
      '<span class="weather-app-error-text">' + escapeHtml(message) + '</span>' +
      '</div>';
  }

  function renderAppDisabled() {
    const body = getBodyElement();
    if (!body) return;
    body.innerHTML = '<div class="weather-app-disabled">' +
      '<span class="weather-app-disabled-text">' + t('weatherEnablePrompt') + '</span>' +
      '</div>';
  }

  function renderExpandedWeather(data, locationName, unit) {
    const body = getBodyElement();
    if (!body) return;

    const current = data.current;
    if (!current || typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number') {
      renderAppError(t('weatherError'));
      return;
    }

    const info = getWeatherInfo(current.weather_code);
    const temp = getTemp(current.temperature_2m, unit);
    const tempUnit = getTempUnit(unit);
    const label = getWeatherLabel(info);
    const icon = getWeatherIcon(info.type);
    const displayLocation = locationName || t('weatherUnknownLocation');

    // Extended current data
    const currentDetail = data.current || {};
    const feelsLike = typeof currentDetail.apparent_temperature === 'number'
      ? getTemp(currentDetail.apparent_temperature, unit) + tempUnit
      : null;
    const windSpeed = typeof currentDetail.wind_speed_10m === 'number'
      ? Math.round(currentDetail.wind_speed_10m) + ' km/h'
      : null;
    const humidity = typeof currentDetail.relative_humidity_2m === 'number'
      ? Math.round(currentDetail.relative_humidity_2m) + '%'
      : null;

    let html = '';

    // Current conditions
    html += '<div class="weather-app-current">';
    html += '<div class="weather-app-current-icon">' + icon + '</div>';
    html += '<div class="weather-app-current-info">';
    html += '<div class="weather-app-current-temp">' + temp + tempUnit + '</div>';
    html += '<div class="weather-app-current-condition">' + label + '</div>';
    html += '<div class="weather-app-current-location">' + LOCATION_PIN_SVG + ' <span>' + escapeHtml(displayLocation) + '</span></div>';
    html += '</div>';
    html += '</div>';

    // Detail cards
    const hasDetails = feelsLike !== null || windSpeed !== null || humidity !== null;
    if (hasDetails) {
      html += '<div class="weather-app-details">';
      if (feelsLike !== null) {
        html += '<div class="weather-app-detail-card">';
        html += '<div class="weather-app-detail-icon">' + DETAIL_ICONS.feelsLike + '</div>';
        html += '<div class="weather-app-detail-value">' + feelsLike + '</div>';
        html += '<div class="weather-app-detail-label">' + t('weatherFeelsLike') + '</div>';
        html += '</div>';
      }
      if (windSpeed !== null) {
        html += '<div class="weather-app-detail-card">';
        html += '<div class="weather-app-detail-icon">' + DETAIL_ICONS.wind + '</div>';
        html += '<div class="weather-app-detail-value">' + windSpeed + '</div>';
        html += '<div class="weather-app-detail-label">' + t('weatherWind') + '</div>';
        html += '</div>';
      }
      if (humidity !== null) {
        html += '<div class="weather-app-detail-card">';
        html += '<div class="weather-app-detail-icon">' + DETAIL_ICONS.humidity + '</div>';
        html += '<div class="weather-app-detail-value">' + humidity + '</div>';
        html += '<div class="weather-app-detail-label">' + t('weatherHumidity') + '</div>';
        html += '</div>';
      }
      html += '</div>';
    }

    // Forecast
    if (data.daily) {
      const forecastHtml = renderExpandedForecast(data, unit);
      if (forecastHtml) {
        html += forecastHtml;
      }
    }

    body.innerHTML = html;
  }

  function renderExpandedForecast(data, unit) {
    const daily = data.daily;
    if (!daily || !daily.time || !daily.temperature_2m_max || !daily.temperature_2m_min || !daily.weather_code) {
      return '';
    }

    const lang = getLang();
    const boundedLength = Math.min(
      daily.time.length,
      (daily.temperature_2m_max || []).length,
      (daily.temperature_2m_min || []).length,
      (daily.weather_code || []).length,
      7
    );

    const dayHtml = [];
    for (let i = 0; i < boundedLength; i++) {
      const dateStr = daily.time[i];
      const dayName = getAbbreviatedDayName(dateStr, lang);
      const highVal = Number(daily.temperature_2m_max[i]);
      const lowVal = Number(daily.temperature_2m_min[i]);
      const weatherCode = Number(daily.weather_code[i]);

      if (!Number.isFinite(highVal) || !Number.isFinite(lowVal) || !Number.isFinite(weatherCode) || !dayName) {
        continue;
      }

      const high = getTemp(highVal, unit);
      const low = getTemp(lowVal, unit);
      const dayInfo = getWeatherInfo(weatherCode);
      const dayIcon = getWeatherIcon(dayInfo.type);
      const dayCondition = getWeatherLabel(dayInfo);

      dayHtml.push(
        '<div class="weather-app-forecast-day">' +
        '<div class="weather-app-forecast-day-name">' + dayName + '</div>' +
        '<div class="weather-app-forecast-day-icon">' + dayIcon + '</div>' +
        '<div class="weather-app-forecast-day-condition">' + dayCondition + '</div>' +
        '<div class="weather-app-forecast-day-temps">' +
        '<span class="weather-app-forecast-day-high">' + high + '\u00B0</span>' +
        '<span class="weather-app-forecast-day-low">' + low + '\u00B0</span>' +
        '</div>' +
        '</div>'
      );
    }

    if (dayHtml.length === 0) return '';

    return '<div class="weather-app-forecast">' +
      '<div class="weather-app-forecast-title">' + t('weatherForecast') + '</div>' +
      '<div class="weather-app-forecast-list">' + dayHtml.join('') + '</div>' +
      '</div>';
  }

  // ===================== Modal Control =====================

  function open() {
    const modal = getModalElement();
    if (!modal) return;

    if (!loadEnabled()) {
      renderAppDisabled();
      modal.classList.add('modal-open');
      return;
    }

    // Render from cached data immediately
    const cache = loadCache();
    if (cache && cache.data) {
      const unit = loadUnit();
      renderExpandedWeather(cache.data, cache.locationName, unit);
    } else {
      renderAppLoading();
    }

    modal.classList.add('modal-open');

    // Trigger a refresh via the widget so data stays fresh
    if (window.WeatherWidget && window.WeatherWidget.refresh) {
      window.WeatherWidget.refresh(false);
    }
  }

  function close() {
    const modal = getModalElement();
    if (modal) {
      modal.classList.remove('modal-open');
    }
  }

  // ===================== Event Listeners =====================

  function setupListeners() {
    // Overlay click
    const modal = getModalElement();
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) {
          close();
        }
      });
    }

    // Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('modal-open')) {
        close();
      }
    });

    // Re-render when the widget finishes a refresh (listen for cache updates)
    // Storage events only fire in other tabs, so also listen for custom events
    window.addEventListener('storage', function (e) {
      if (e.key === CACHE_KEY && modal && modal.classList.contains('modal-open')) {
        const cache = loadCache();
        if (cache && cache.data) {
          const unit = loadUnit();
          renderExpandedWeather(cache.data, cache.locationName, unit);
        }
      }
    });

    // Listen for custom event for same-tab updates
    window.addEventListener('weatherCacheUpdated', function () {
      if (modal && modal.classList.contains('modal-open')) {
        const cache = loadCache();
        if (cache && cache.data) {
          const unit = loadUnit();
          renderExpandedWeather(cache.data, cache.locationName, unit);
        }
      }
    });
  }

  // ===================== Initialization =====================

  let initialized = false;
  function init() {
    if (initialized) return;
    initialized = true;
    setupListeners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export
  window.WeatherApp = {
    init: init,
    open: open,
    close: close
  };

})();
