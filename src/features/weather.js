// src/features/weather.js - Weather widget functionality
// Uses Open-Meteo API (no API key required)

(function() {
  'use strict';

  const escapeHtml = window.escapeHtml;

  // Configuration
  const CACHE_KEY = 'weatherCache';
  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  const GEO_TIMEOUT_MS = 10000; // 10 seconds

  // WMO weather codes to icon/type mapping
  // Each code has labels for all supported languages: en, zh, ja, ko, es, fr, de, pt, ru
  const WEATHER_CODES = {
    0: { type: 'clear', labelEn: 'Clear sky', labelZh: '晴朗', labelJa: '晴れ', labelKo: '맑음', labelEs: 'Despejado', labelFr: 'Ciel dégagé', labelDe: 'Klarer Himmel', labelPt: 'Céu limpo', labelRu: 'Ясно' },
    1: { type: 'partly-cloudy', labelEn: 'Mainly clear', labelZh: '大部晴朗', labelJa: 'ほぼ晴れ', labelKo: '주로 맑음', labelEs: 'Principalmente despejado', labelFr: 'Peu nuageux', labelDe: 'Überwiegend klar', labelPt: 'Predominantemente limpo', labelRu: 'Преимущественно ясно' },
    2: { type: 'partly-cloudy', labelEn: 'Partly cloudy', labelZh: '多云', labelJa: '曇り時々晴れ', labelKo: '일부 흐림', labelEs: 'Parcialmente nublado', labelFr: 'Partiellement nuageux', labelDe: 'Teilweise bewölkt', labelPt: 'Parcialmente nublado', labelRu: 'Переменная облачность' },
    3: { type: 'cloudy', labelEn: 'Overcast', labelZh: '阴天', labelJa: '曇り', labelKo: '흐림', labelEs: 'Nublado', labelFr: 'Couvert', labelDe: 'Bedeckt', labelPt: 'Encoberto', labelRu: 'Пасмурно' },
    45: { type: 'fog', labelEn: 'Fog', labelZh: '雾', labelJa: '霧', labelKo: '안개', labelEs: 'Niebla', labelFr: 'Brouillard', labelDe: 'Nebel', labelPt: 'Nevoeiro', labelRu: 'Туман' },
    48: { type: 'fog', labelEn: 'Depositing rime fog', labelZh: '雾凇', labelJa: '着氷性の霧', labelKo: '상안개', labelEs: 'Niebla helada', labelFr: 'Brouillard givrant', labelDe: 'Eisnebel', labelPt: 'Nevoeiro gelado', labelRu: 'Изморозь' },
    51: { type: 'drizzle', labelEn: 'Light drizzle', labelZh: '小雨', labelJa: '霧雨（弱い）', labelKo: '가랑비 (약함)', labelEs: 'Llovizna ligera', labelFr: 'Bruine légère', labelDe: 'Leichter Sprühregen', labelPt: 'Garoa fraca', labelRu: 'Слабая морось' },
    53: { type: 'drizzle', labelEn: 'Moderate drizzle', labelZh: '中雨', labelJa: '霧雨（中程度）', labelKo: '가랑비 (보통)', labelEs: 'Llovizna moderada', labelFr: 'Bruine modérée', labelDe: 'Mäßiger Sprühregen', labelPt: 'Garoa moderada', labelRu: 'Умеренная морось' },
    55: { type: 'drizzle', labelEn: 'Dense drizzle', labelZh: '大雨', labelJa: '霧雨（強い）', labelKo: '가랑비 (강함)', labelEs: 'Llovizna densa', labelFr: 'Bruine dense', labelDe: 'Dichter Sprühregen', labelPt: 'Garoa densa', labelRu: 'Сильная морось' },
    56: { type: 'drizzle', labelEn: 'Light freezing drizzle', labelZh: '冻雨', labelJa: '着氷性の霧雨（弱い）', labelKo: '동결 가랑비 (약함)', labelEs: 'Llovizna helada ligera', labelFr: 'Bruine verglaçante légère', labelDe: 'Leichter Sprühfrostregen', labelPt: 'Garoa gelada fraca', labelRu: 'Слабая замерзающая морось' },
    57: { type: 'drizzle', labelEn: 'Dense freezing drizzle', labelZh: '强冻雨', labelJa: '着氷性の霧雨（強い）', labelKo: '동결 가랑비 (강함)', labelEs: 'Llovizna helada densa', labelFr: 'Bruine verglaçante dense', labelDe: 'Dichter Sprühfrostregen', labelPt: 'Garoa gelada densa', labelRu: 'Сильная замерзающая морось' },
    61: { type: 'rain', labelEn: 'Slight rain', labelZh: '小雨', labelJa: '弱い雨', labelKo: '약한 비', labelEs: 'Lluvia ligera', labelFr: 'Pluie légère', labelDe: 'Leichter Regen', labelPt: 'Chuva fraca', labelRu: 'Небольшой дождь' },
    63: { type: 'rain', labelEn: 'Moderate rain', labelZh: '中雨', labelJa: '雨', labelKo: '보통 비', labelEs: 'Lluvia moderada', labelFr: 'Pluie modérée', labelDe: 'Mäßiger Regen', labelPt: 'Chuva moderada', labelRu: 'Умеренный дождь' },
    65: { type: 'rain', labelEn: 'Heavy rain', labelZh: '大雨', labelJa: '強い雨', labelKo: '강한 비', labelEs: 'Lluvia intensa', labelFr: 'Pluie forte', labelDe: 'Starker Regen', labelPt: 'Chuva forte', labelRu: 'Сильный дождь' },
    66: { type: 'rain', labelEn: 'Light freezing rain', labelZh: '冻雨', labelJa: '着氷性の雨（弱い）', labelKo: '동결 비 (약함)', labelEs: 'Lluvia helada ligera', labelFr: 'Pluie verglaçante légère', labelDe: 'Leichter Eisregen', labelPt: 'Chuva gelada fraca', labelRu: 'Небольшой замерзающий дождь' },
    67: { type: 'rain', labelEn: 'Heavy freezing rain', labelZh: '强冻雨', labelJa: '着氷性の雨（強い）', labelKo: '동결 비 (강함)', labelEs: 'Lluvia helada intensa', labelFr: 'Pluie verglaçante forte', labelDe: 'Starker Eisregen', labelPt: 'Chuva gelada forte', labelRu: 'Сильный замерзающий дождь' },
    71: { type: 'snow', labelEn: 'Slight snow', labelZh: '小雪', labelJa: '弱い雪', labelKo: '약한 눈', labelEs: 'Nieve ligera', labelFr: 'Neige légère', labelDe: 'Leichter Schneefall', labelPt: 'Neve fraca', labelRu: 'Небольшой снег' },
    73: { type: 'snow', labelEn: 'Moderate snow', labelZh: '中雪', labelJa: '雪', labelKo: '보통 눈', labelEs: 'Nieve moderada', labelFr: 'Neige modérée', labelDe: 'Mäßiger Schneefall', labelPt: 'Neve moderada', labelRu: 'Умеренный снег' },
    75: { type: 'snow', labelEn: 'Heavy snow', labelZh: '大雪', labelJa: '強い雪', labelKo: '강한 눈', labelEs: 'Nieve intensa', labelFr: 'Neige forte', labelDe: 'Starker Schneefall', labelPt: 'Neve forte', labelRu: 'Сильный снег' },
    77: { type: 'snow', labelEn: 'Snow grains', labelZh: '雪粒', labelJa: '小雪片', labelKo: '싸락눈', labelEs: 'Granos de nieve', labelFr: 'Grains de neige', labelDe: 'Schneegriesel', labelPt: 'Grãos de neve', labelRu: 'Снежная крупа' },
    80: { type: 'rain', labelEn: 'Slight rain showers', labelZh: '阵雨', labelJa: '弱いにわか雨', labelKo: '약한 소나기', labelEs: 'Lluvias ligeras', labelFr: 'Averses légères', labelDe: 'Leichte Regenschauer', labelPt: 'Pancadas de chuva fracas', labelRu: 'Небольшой ливневый дождь' },
    81: { type: 'rain', labelEn: 'Moderate rain showers', labelZh: '中阵雨', labelJa: 'にわか雨', labelKo: '보통 소나기', labelEs: 'Lluvias moderadas', labelFr: 'Averses modérées', labelDe: 'Mäßige Regenschauer', labelPt: 'Pancadas de chuva moderadas', labelRu: 'Умеренный ливневый дождь' },
    82: { type: 'rain', labelEn: 'Violent rain showers', labelZh: '强阵雨', labelJa: '強いにわか雨', labelKo: '강한 소나기', labelEs: 'Lluvias intensas', labelFr: 'Averses fortes', labelDe: 'Starke Regenschauer', labelPt: 'Pancadas de chuva fortes', labelRu: 'Сильный ливневый дождь' },
    85: { type: 'snow', labelEn: 'Slight snow showers', labelZh: '阵雪', labelJa: '弱い雪のにわか雨', labelKo: '약한 눈 소나기', labelEs: 'Chubascos de nieve ligeros', labelFr: 'Averses de neige légères', labelDe: 'Leichte Schneeschauer', labelPt: 'Pancadas de neve fracas', labelRu: 'Небольшой ливневый снег' },
    86: { type: 'snow', labelEn: 'Heavy snow showers', labelZh: '强阵雪', labelJa: '強い雪のにわか雨', labelKo: '강한 눈 소나기', labelEs: 'Chubascos de nieve intensos', labelFr: 'Averses de neige fortes', labelDe: 'Starke Schneeschauer', labelPt: 'Pancadas de neve fortes', labelRu: 'Сильный ливневый снег' },
    95: { type: 'thunderstorm', labelEn: 'Thunderstorm', labelZh: '雷雨', labelJa: '雷雨', labelKo: '뇌우', labelEs: 'Tormenta', labelFr: 'Orage', labelDe: 'Gewitter', labelPt: 'Trovoada', labelRu: 'Гроза' },
    96: { type: 'thunderstorm', labelEn: 'Thunderstorm with hail', labelZh: '雷暴伴冰雹', labelJa: '雷雨（ひょう）', labelKo: '뇌우 (우박)', labelEs: 'Tormenta con granizo', labelFr: 'Orage avec grêle', labelDe: 'Gewitter mit Hagel', labelPt: 'Trovoada com granizo', labelRu: 'Гроза с градом' },
    99: { type: 'thunderstorm', labelEn: 'Thunderstorm with heavy hail', labelZh: '强雷暴伴冰雹', labelJa: '雷雨（強いひょう）', labelKo: '뇌우 (강한 우박)', labelEs: 'Tormenta con granizo intenso', labelFr: 'Orage avec forte grêle', labelDe: 'Gewitter mit starkem Hagel', labelPt: 'Trovoada com granizo forte', labelRu: 'Гроза с сильным градом' }
  };

  // SVG icons for weather conditions
  const WEATHER_ICONS = {
    'clear': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" opacity="0.3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
    'partly-cloudy': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="currentColor" opacity="0.2"/><circle cx="16" cy="7" r="2.5" fill="currentColor" opacity="0.5" stroke="none"/></svg>',
    'cloudy': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="currentColor" opacity="0.2"/></svg>',
    'fog': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15h16M4 18h16M4 12h16M4 9h16"/></svg>',
    'drizzle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="currentColor" opacity="0.2"/><path d="M8 21v-2m4 2v-2m4 2v-2"/></svg>',
    'rain': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="currentColor" opacity="0.2"/><path d="M8 21v-3m4 3v-3m4 3v-3"/></svg>',
    'snow': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="currentColor" opacity="0.2"/><path d="m8 21 2-2m-2-2 2 2m6 0 2 2m-2-2 2-2"/></svg>',
    'thunderstorm': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="currentColor" opacity="0.2"/><path d="M13 16l-4 4h3l-1 4 5-5h-3l2-3"/></svg>'
  };

  // State
  let isRefreshing = false;
  let pendingRefresh = false;
  let currentCache = null;

  // ===================== Utility Functions =====================

  // Map app language codes to Open-Meteo API language codes.
  // Falls back to 'en' for unsupported languages.
  const OPEN_METEO_LANGS = new Set(['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru']);

  function getOpenMeteoLang() {
    const lang = getLang();
    return OPEN_METEO_LANGS.has(lang) ? lang : 'en';
  }

  function getLang() {
    return window.i18n ? window.i18n.currentLanguage() : 'en';
  }

  function t(key) {
    return window.i18n ? window.i18n.t(key) : key;
  }

  function celsiusToFahrenheit(c) {
    return Math.round((c * 9 / 5) + 32);
  }

  function getTemp(celsius, unit) {
    if (unit === 'fahrenheit') {
      return celsiusToFahrenheit(celsius);
    }
    return Math.round(celsius);
  }

  function getTempUnit(unit) {
    return unit === 'fahrenheit' ? '°F' : '°C';
  }

  function getWeatherInfo(code) {
    const info = WEATHER_CODES[code];
    if (!info) {
      return { type: 'clear', labelEn: 'Unknown', labelZh: '未知', labelJa: '不明', labelKo: '알 수 없음', labelEs: 'Desconocido', labelFr: 'Inconnu', labelDe: 'Unbekannt', labelPt: 'Desconhecido', labelRu: 'Неизвестно' };
    }
    return info;
  }

  function getWeatherLabel(info) {
    const lang = getLang();
    const labelKey = `label${lang.charAt(0).toUpperCase() + lang.slice(1)}`;
    return info[labelKey] || info.labelEn;
  }

  function getWeatherIcon(type) {
    return WEATHER_ICONS[type] || WEATHER_ICONS['clear'];
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
      if (currentCache) return currentCache;
      const raw = _safeGet(CACHE_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.data || !parsed.timestamp) {
          console.warn('Invalid weather cache data shape, discarding');
          return null;
        }
        currentCache = parsed;
        return currentCache;
      } catch (e) {
        console.warn('Failed to parse weather cache:', e);
        return null;
      }
    },

    saveCache(cacheData) {
      currentCache = cacheData;
      _safeSet(CACHE_KEY, JSON.stringify(cacheData));
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
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
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
    // Trigger the CSS entrance animation by toggling the class.
    // Force a reflow so the animation starts from the beginning.
    el.classList.remove('animate-entrance');
    void el.offsetWidth;
    el.classList.add('animate-entrance');
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
      <span class="weather-error-text">${message}</span>
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

    const current = data.current_weather;
    if (!current || typeof current.temperature !== 'number' || typeof current.weathercode !== 'number') {
      renderError(t('weatherError'));
      return;
    }
    const info = getWeatherInfo(current.weathercode);
    const temp = getTemp(current.temperature, unit);
    const tempUnit = getTempUnit(unit);
    const label = getWeatherLabel(info);
    const icon = getWeatherIcon(info.type);
    const displayLocation = locationName || t('weatherUnknownLocation');

    el.className = 'weather-widget weather-data';
    el.innerHTML = `
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
          <span>${escapeHtml(displayLocation)}</span>
        </div>
      </div>
    `;
    // Only animate entrance if the widget was hidden (e.g., cache hit on first load).
    // When already visible (refresh/update), just update content without re-animating.
    if (el.style.display === 'none' || !el.style.display) {
      showWidgetWithAnimation(el);
    } else {
      el.style.display = 'flex';
    }
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
    const unitCelsius = document.getElementById('weather-unit-celsius');
    const unitFahrenheit = document.getElementById('weather-unit-fahrenheit');
    const modeAuto = document.getElementById('weather-mode-auto');
    const modeManual = document.getElementById('weather-mode-manual');
    const manualInput = document.getElementById('weather-manual-city');

    if (enabledCheckbox) enabledCheckbox.checked = enabled;
    if (unitCelsius) unitCelsius.checked = unit === 'celsius';
    if (unitFahrenheit) unitFahrenheit.checked = unit === 'fahrenheit';
    if (modeAuto) modeAuto.checked = locationMode === 'auto';
    if (modeManual) modeManual.checked = locationMode === 'manual';
    if (manualInput) manualInput.value = manualCity;

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
    const unitCelsius = document.getElementById('weather-unit-celsius');
    const unitFahrenheit = document.getElementById('weather-unit-fahrenheit');
    const modeAuto = document.getElementById('weather-mode-auto');
    const modeManual = document.getElementById('weather-mode-manual');
    const manualInput = document.getElementById('weather-manual-city');
    const refreshBtn = document.getElementById('weather-refresh-btn');

    if (enabledCheckbox) {
      enabledCheckbox.addEventListener('change', function() {
        WeatherStorage.saveEnabled(this.checked);
        applyWeatherSettings();
      });
    }

    if (unitCelsius) {
      unitCelsius.addEventListener('change', function() {
        if (this.checked) {
          WeatherStorage.saveUnit('celsius');
          const cache = WeatherStorage.loadCache();
          if (cache && cache.data && isCacheMatchingSettings(cache)) {
            renderWeather(cache.data, cache.locationName, 'celsius');
          } else {
            refreshWeather(true);
          }
        }
      });
    }

    if (unitFahrenheit) {
      unitFahrenheit.addEventListener('change', function() {
        if (this.checked) {
          WeatherStorage.saveUnit('fahrenheit');
          const cache = WeatherStorage.loadCache();
          if (cache && cache.data && isCacheMatchingSettings(cache)) {
            renderWeather(cache.data, cache.locationName, 'fahrenheit');
          } else {
            refreshWeather(true);
          }
        }
      });
    }

    if (modeAuto) {
      modeAuto.addEventListener('change', function() {
        if (this.checked) {
          WeatherStorage.saveLocationMode('auto');
          const manualGroup = document.getElementById('weather-manual-group');
          if (manualGroup) manualGroup.style.display = 'none';
          refreshWeather(true);
        }
      });
    }

    if (modeManual) {
      modeManual.addEventListener('change', function() {
        if (this.checked) {
          WeatherStorage.saveLocationMode('manual');
          const manualGroup = document.getElementById('weather-manual-group');
          if (manualGroup) manualGroup.style.display = 'block';
          refreshWeather(true);
        }
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
