// src/features/weather.js - Weather widget functionality
// Uses Open-Meteo API (no API key required)

(function() {
  'use strict';

  // Shared weather lookup/conversion helpers. Defined once in
  // src/features/weather-utils.js and consumed by both the widget and the
  // app modal so the two surfaces cannot drift apart. weather-utils.js is
  // loaded first via bootstrap.js; bail out defensively if it is missing or
  // late so the widget degrades instead of throwing an uncaught TypeError.
  if (!window.WeatherUtils) {
    console.warn('[weather] window.WeatherUtils unavailable; weather widget disabled');
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

  // Configuration
  const CACHE_KEY = 'weatherCache';
  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  const GEO_TIMEOUT_MS = 10000; // 10 seconds

  // State
  let isRefreshing = false;
  let widgetHasBeenShown = false;
  let pendingRefresh = false;

  // ===================== Utility Functions =====================

  // Map app language codes to Open-Meteo API language codes.
  // Falls back to 'en' for unsupported languages.
  const OPEN_METEO_LANGS = new Set(['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru']);

  function getOpenMeteoLang() {
    const lang = normalizeLang(getLang());
    return OPEN_METEO_LANGS.has(lang) ? lang : 'en';
  }

  function t(key) {
    return window.i18n ? window.i18n.t(key) : key;
  }

  // ===================== Storage =====================

  // Safe localStorage accessors — degrade gracefully when storage is unavailable
  const _safeGet = function(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('Failed to read from localStorage:', e);
      return null;
    }
  };

  const _safeSet = function(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn('Failed to write to localStorage:', e);
      return false;
    }
  };

  const WeatherStorage = {
    loadEnabled() {
      return _safeGet('weatherEnabled') === 'true';
    },

    saveEnabled(value) {
      _safeSet('weatherEnabled', value ? 'true' : 'false');
    },

    loadUnit() {
      const unit = _safeGet('weatherUnit');
      return unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    },

    saveUnit(value) {
      _safeSet('weatherUnit', value);
    },

    loadLocationMode() {
      return _safeGet('weatherLocationMode') || 'auto';
    },

    saveLocationMode(value) {
      _safeSet('weatherLocationMode', value);
    },

    loadManualCity() {
      return _safeGet('weatherManualCity') || '';
    },

    saveManualCity(value) {
      _safeSet('weatherManualCity', value);
    },

    loadCache() {
      const raw = _safeGet(CACHE_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.data || !parsed.timestamp) {
          console.warn('Invalid weather cache data shape, discarding');
          return null;
        }
        return parsed;
      } catch (e) {
        console.warn('Failed to parse weather cache:', e);
        return null;
      }
    },

    saveCache(cacheData) {
      _safeSet(CACHE_KEY, JSON.stringify(cacheData));
      // Dispatch custom event for same-tab listeners (storage events only fire in other tabs)
      window.dispatchEvent(new CustomEvent('weatherCacheUpdated'));
    }
  };

  function isCacheValid(cache) {
    if (!cache || !cache.timestamp || !cache.data) return false;
    const age = Date.now() - cache.timestamp;
    return age < CACHE_TTL_MS;
  }

  function isCacheMatchingSettings(cache) {
    if (!cache) return false;
    const locationMode = WeatherStorage.loadLocationMode();
    const manualCity = WeatherStorage.loadManualCity();
    if (cache.locationMode !== locationMode) return false;
    if (locationMode === 'auto' && (cache.lat === undefined || cache.lon === undefined)) return false;
    if (locationMode === 'manual' && cache.manualCity !== manualCity.trim()) return false;
    return true;
  }

  // ===================== API Functions =====================

  function createWeatherError(message, code) {
    const err = new Error(message);
    err.code = code;
    return err;
  }

  async function geocodeCity(city) {
    let response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=${getOpenMeteoLang()}&format=json`;
      response = await fetch(url, { signal: controller.signal });
    } catch (e) {
      if (e.name === 'AbortError') {
        throw createWeatherError('Geocoding timed out', 'GEOCODING_TIMEOUT');
      }
      throw createWeatherError('Geocoding network error', 'NETWORK_ERROR');
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) throw createWeatherError('Geocoding failed', 'GEOCODING_FAILED');
    let data;
    try {
      data = await response.json();
    } catch {
      throw createWeatherError('Geocoding response invalid', 'GEOCODING_INVALID');
    }
    if (!data.results || data.results.length === 0) throw createWeatherError('City not found', 'CITY_NOT_FOUND');
    const result = data.results[0];
    if (typeof result.latitude !== 'number' || typeof result.longitude !== 'number') {
      throw createWeatherError('Geocoding response invalid', 'GEOCODING_INVALID');
    }
    return {
      lat: result.latitude,
      lon: result.longitude,
      name: result.name,
      country: result.country
    };
  }

  async function fetchWeather(lat, lon) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);
    let response;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=7&hourly=temperature_2m,weather_code,precipitation_probability&forecast_hours=24&timezone=auto`;
      response = await fetch(url, { signal: controller.signal });
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error('Weather API timed out');
      }
      throw new Error('Weather API failed');
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) throw new Error('Weather API failed');
    return await response.json();
  }

  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            name: null,
            country: null
          });
        },
        (error) => {
          reject(error);
        },
        { timeout: GEO_TIMEOUT_MS, enableHighAccuracy: false }
      );
    });
  }

  // ===================== DOM Rendering =====================

  function getWidgetElement() {
    return document.getElementById('weather-widget');
  }

  function showWidgetWithAnimation(el) {
    el.style.display = 'flex';
    // Only animate entrance on first show; subsequent updates skip re-animation.
    if (widgetHasBeenShown) return;
    // Trigger the CSS entrance animation by toggling the class.
    // Force a reflow so the animation starts from the beginning.
    el.classList.remove('animate-entrance');
    void el.offsetWidth;
    el.classList.add('animate-entrance');
    widgetHasBeenShown = true;
  }

  function renderLoading() {
    if (!WeatherStorage.loadEnabled()) {
      hideWidget();
      return;
    }
    const el = getWidgetElement();
    if (!el) return;
    el.className = 'weather-widget weather-loading';
    el.innerHTML = `
      <div class="weather-spinner"></div>
      <span class="weather-loading-text">${t('weatherLoading')}</span>
    `;
    showWidgetWithAnimation(el);
  }

  function renderError(message) {
    if (!WeatherStorage.loadEnabled()) {
      hideWidget();
      return;
    }
    const el = getWidgetElement();
    if (!el) return;
    el.className = 'weather-widget weather-error';
    el.innerHTML = `
      <div class="weather-error-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <span class="weather-error-text">${window.escapeHtml(message)}</span>
    `;
    showWidgetWithAnimation(el);
  }

  function renderWeather(data, locationName, unit) {
    if (!WeatherStorage.loadEnabled()) {
      hideWidget();
      return;
    }
    const el = getWidgetElement();
    if (!el) return;

    const current = data.current;
    if (!current || typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number') {
      renderError(t('weatherError'));
      return;
    }
    const info = getWeatherInfo(current.weather_code);
    const temp = getTemp(current.temperature_2m, unit);
    const tempUnit = getTempUnit(unit);
    const label = getWeatherLabel(info);
    const icon = getWeatherIcon(info.type);
    const displayLocation = locationName || t('weatherUnknownLocation');

    el.className = 'weather-widget weather-data';

    el.innerHTML = `
      <div class="weather-current">
        <div class="weather-main">
          <div class="weather-icon">${icon}</div>
          <div class="weather-temp">${temp}${tempUnit}</div>
        </div>
        <div class="weather-details">
          <div class="weather-condition">${label}</div>
          <div class="weather-location">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span></span>
          </div>
        </div>
      </div>
    `;

    const locationElement = el.querySelector('.weather-location span');
    if (locationElement) {
      locationElement.textContent = displayLocation;
    }

    // Show the widget with entrance animation on first reveal, or just update content on refresh.
    showWidgetWithAnimation(el);
  }

  function hideWidget() {
    const el = getWidgetElement();
    if (el) el.style.display = 'none';
  }

  // ===================== Core Logic =====================

  function formatCoords(lat, lon) {
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
  }

  async function refreshWeather(force = false) {
    if (!WeatherStorage.loadEnabled()) {
      hideWidget();
      return;
    }

    // Persist any in-flight manual city input before reading stored value,
    // so the refresh always uses what the user actually typed (not just
    // what was previously saved on blur/Enter).
    const manualInput = document.getElementById('weather-manual-city');
    if (manualInput) {
      WeatherStorage.saveManualCity(manualInput.value.trim());
    }

    const unit = WeatherStorage.loadUnit();
    const locationMode = WeatherStorage.loadLocationMode();
    const manualCity = WeatherStorage.loadManualCity();

    // Check cache first (unless forced)
    const cache = WeatherStorage.loadCache();
    if (!force && cache && isCacheValid(cache) && isCacheMatchingSettings(cache)) {
      renderWeather(cache.data, cache.locationName, unit);
      return;
    }

    if (isRefreshing) {
      if (force) pendingRefresh = true;
      return;
    }
    isRefreshing = true;
    pendingRefresh = false;
    renderLoading();

    try {
      let location;

      if (locationMode === 'manual') {
        if (!manualCity.trim()) {
          renderError(t('weatherEnterCity'));
          return;
        }
        try {
          location = await geocodeCity(manualCity.trim());
        } catch (e) {
          // Try to use stale cache as fallback only if it matches current settings
          if (cache && cache.data && isCacheMatchingSettings(cache)) {
            renderWeather(cache.data, cache.locationName, unit);
            return;
          }
          if (e.code === 'NETWORK_ERROR' || e.code === 'GEOCODING_TIMEOUT' || e.code === 'GEOCODING_FAILED' || e.code === 'GEOCODING_INVALID') {
            renderError(t('weatherError'));
          } else {
            renderError(t('weatherLocationNotFound'));
          }
          return;
        }
      } else {
        try {
          location = await getLocation();
        } catch {
          // Try to use stale cache as fallback only if it matches current mode
          if (cache && cache.data && isCacheMatchingSettings(cache)) {
            renderWeather(cache.data, cache.locationName, unit);
            return;
          }
          renderError(t('weatherLocationUnavailable'));
          return;
        }
      }

      const weatherData = await fetchWeather(location.lat, location.lon);

      const locationDisplay = location.name
        ? (location.country ? `${location.name}, ${location.country}` : location.name)
        : formatCoords(location.lat, location.lon);

      const newCache = {
        lat: location.lat,
        lon: location.lon,
        data: weatherData,
        timestamp: Date.now(),
        locationMode: locationMode,
        manualCity: manualCity.trim(),
        locationName: locationDisplay
      };

      WeatherStorage.saveCache(newCache);
      renderWeather(weatherData, newCache.locationName, unit);
    } catch (e) {
      console.error('Weather refresh failed:', e);
      // Try to use stale cache as fallback only if it matches current settings
      if (cache && cache.data && isCacheMatchingSettings(cache)) {
        renderWeather(cache.data, cache.locationName, unit);
      } else {
        renderError(t('weatherError'));
      }
    } finally {
      isRefreshing = false;
      if (pendingRefresh) {
        pendingRefresh = false;
        refreshWeather(true);
      }
    }
  }

  function initWeather() {
    const enabled = WeatherStorage.loadEnabled();
    if (!enabled) {
      hideWidget();
      return;
    }

    // Check if widget element exists
    const el = getWidgetElement();
    if (!el) {
      console.warn('Weather widget element not found');
      return;
    }

    // Refresh weather
    refreshWeather();
  }

  // ===================== Settings Integration =====================

  function applyWeatherSettings() {
    const enabled = WeatherStorage.loadEnabled();
    const unit = WeatherStorage.loadUnit();
    const locationMode = WeatherStorage.loadLocationMode();
    const manualCity = WeatherStorage.loadManualCity();

    // Update UI controls if they exist
    const enabledCheckbox = document.getElementById('weather-enabled-setting');
    const manualInput = document.getElementById('weather-manual-city');

    if (enabledCheckbox) enabledCheckbox.checked = enabled;
    if (manualInput) manualInput.value = manualCity;

    // Sync unit toggle buttons
    const unitButtons = document.querySelectorAll('[data-weather-choice="unit"] .weather-choice-button');
    unitButtons.forEach(function(btn) {
      const isActive = btn.dataset.value === unit;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Sync location mode toggle buttons
    const modeButtons = document.querySelectorAll('[data-weather-choice="mode"] .weather-choice-button');
    modeButtons.forEach(function(btn) {
      const isActive = btn.dataset.value === locationMode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Show/hide manual input based on mode
    const manualGroup = document.getElementById('weather-manual-group');
    if (manualGroup) {
      manualGroup.style.display = locationMode === 'manual' ? 'block' : 'none';
    }

    // Apply visibility
    if (enabled) {
      initWeather();
    } else {
      hideWidget();
    }
  }

  function setupSettingsListeners() {
    const enabledCheckbox = document.getElementById('weather-enabled-setting');
    const manualInput = document.getElementById('weather-manual-city');
    const refreshBtn = document.getElementById('weather-refresh-btn');

    if (enabledCheckbox) {
      enabledCheckbox.addEventListener('change', function() {
        WeatherStorage.saveEnabled(this.checked);
        applyWeatherSettings();
      });
    }

    // Unit toggle buttons
    const unitGroup = document.querySelector('[data-weather-choice="unit"]');
    if (unitGroup) {
      unitGroup.addEventListener('click', function(e) {
        const btn = e.target.closest('.weather-choice-button');
        if (!btn || btn.classList.contains('active')) return;
        const value = btn.dataset.value;
        WeatherStorage.saveUnit(value);
        // Sync active state within group
        unitGroup.querySelectorAll('.weather-choice-button').forEach(function(b) {
          const isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        const cache = WeatherStorage.loadCache();
        if (cache && cache.data && isCacheMatchingSettings(cache)) {
          if (WeatherStorage.loadEnabled()) {
            renderWeather(cache.data, cache.locationName, value);
          }
        } else {
          refreshWeather(true);
        }
      });
    }

    // Location mode toggle buttons
    const modeGroup = document.querySelector('[data-weather-choice="mode"]');
    if (modeGroup) {
      modeGroup.addEventListener('click', function(e) {
        const btn = e.target.closest('.weather-choice-button');
        if (!btn || btn.classList.contains('active')) return;
        const value = btn.dataset.value;
        WeatherStorage.saveLocationMode(value);
        // Sync active state within group
        modeGroup.querySelectorAll('.weather-choice-button').forEach(function(b) {
          const isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        const manualGroup = document.getElementById('weather-manual-group');
        if (manualGroup) manualGroup.style.display = value === 'manual' ? 'block' : 'none';
        refreshWeather(true);
      });
    }

    if (manualInput) {
      manualInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          const trimmed = this.value.trim();
          if (trimmed === WeatherStorage.loadManualCity()) return;
          WeatherStorage.saveManualCity(trimmed);
          refreshWeather(true);
        }
      });
      manualInput.addEventListener('blur', function() {
        const trimmed = this.value.trim();
        if (trimmed === WeatherStorage.loadManualCity()) return;
        WeatherStorage.saveManualCity(trimmed);
        refreshWeather(true);
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        refreshWeather(true);
      });
    }
  }

  // ===================== Event Listeners =====================

  // Listen for language changes — always re-fetch because geocoding
  // results (location names) are language-specific and cached labels
  // from the previous language would be stale.
  window.addEventListener('languageChanged', function() {
    if (!WeatherStorage.loadEnabled()) return;
    if (isRefreshing) { pendingRefresh = true; return; }
    refreshWeather(true);
  });

  // ===================== Initialization =====================

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setupSettingsListeners();
        applyWeatherSettings();
      });
    } else {
      setupSettingsListeners();
      applyWeatherSettings();
    }
  }

  init();

  // Export for global access
  window.WeatherWidget = {
    init: initWeather,
    refresh: refreshWeather,
    loadEnabled: WeatherStorage.loadEnabled,
    loadUnit: WeatherStorage.loadUnit,
    loadLocationMode: WeatherStorage.loadLocationMode,
    loadManualCity: WeatherStorage.loadManualCity,
    applySettings: applyWeatherSettings
  };

})();
