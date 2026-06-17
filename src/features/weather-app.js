// src/features/weather-app.js - Weather app modal (expanded view)
// Shares data and settings with the existing WeatherWidget

(function () {
  'use strict';

  const escapeHtml = window.escapeHtml;

  // ===================== Constants =====================

  const CACHE_KEY = 'weatherCache';

  // WMO weather codes to icon/type mapping (duplicated from weather.js for self-containment)
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

  const DETAIL_ICONS = {
    feelsLike: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>',
    wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>',
    humidity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>'
  };

  const LOCATION_PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  // ===================== Utility Functions =====================

  function normalizeLang(lang) {
    return String(lang || 'en').split(/[-_]/)[0].toLowerCase();
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
    return unit === 'fahrenheit' ? '\u00B0F' : '\u00B0C';
  }

  function getWeatherInfo(code) {
    const info = WEATHER_CODES[code];
    if (!info) {
      return { type: 'clear', labelEn: 'Unknown', labelZh: '\u672A\u77E5', labelJa: '\u4E0D\u660E', labelKo: '\uC54C \uC218 \uC5C6\uC74C', labelEs: 'Desconocido', labelFr: 'Inconnu', labelDe: 'Unbekannt', labelPt: 'Desconhecido', labelRu: '\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E' };
    }
    return info;
  }

  function getWeatherLabel(info) {
    const lang = normalizeLang(getLang());
    const labelKey = 'label' + lang.charAt(0).toUpperCase() + lang.slice(1);
    return info[labelKey] || info.labelEn;
  }

  function getWeatherIcon(type) {
    return WEATHER_ICONS[type] || WEATHER_ICONS['clear'];
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
      '<span class="weather-app-error-text">' + message + '</span>' +
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
    // Close button
    const closeBtn = document.getElementById('weather-app-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }

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

  let _initialized = false;
  function init() {
    if (_initialized) return;
    _initialized = true;
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
