// src/features/weather-utils.js - Shared weather lookup and conversion helpers
// Single source of truth for weather-code mappings, localized labels, icons and
// unit conversion. Consumed by both the weather widget (weather.js) and the
// weather app modal (weather-app.js) so the two surfaces cannot drift apart.
// Loaded before both consumers via src/core/bootstrap.js.

(function () {
  'use strict';

  // Extract the base language from locale variants (e.g. "zh_CN" → "zh")
  function normalizeLang(lang) {
    return String(lang || 'en').split(/[-_]/)[0].toLowerCase();
  }

  function getLang() {
    return window.i18n ? window.i18n.currentLanguage() : 'en';
  }

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

  function celsiusToFahrenheit(c) {
    return Math.round((c * 9 / 5) + 32);
  }

  // Round a Celsius temperature for display, converting to Fahrenheit when requested
  function getTemp(celsius, unit) {
    if (unit === 'fahrenheit') {
      return celsiusToFahrenheit(celsius);
    }
    return Math.round(celsius);
  }

  function getTempUnit(unit) {
    return unit === 'fahrenheit' ? '°F' : '°C';
  }

  // Map a WMO weather code to its condition info (icon type + localized labels)
  function getWeatherInfo(code) {
    const info = WEATHER_CODES[code];
    if (!info) {
      return { type: 'clear', labelEn: 'Unknown', labelZh: '未知', labelJa: '不明', labelKo: '알 수 없음', labelEs: 'Desconocido', labelFr: 'Inconnu', labelDe: 'Unbekannt', labelPt: 'Desconhecido', labelRu: 'Неизвестно' };
    }
    return info;
  }

  // Resolve the localized label for a condition, falling back to English
  function getWeatherLabel(info) {
    const lang = normalizeLang(getLang());
    const labelKey = 'label' + lang.charAt(0).toUpperCase() + lang.slice(1);
    return info[labelKey] || info.labelEn;
  }

  // Return the SVG markup for a condition icon type
  function getWeatherIcon(type) {
    return WEATHER_ICONS[type] || WEATHER_ICONS['clear'];
  }

  // Make helpers available globally to both consumers
  window.WeatherUtils = {
    getWeatherInfo: getWeatherInfo,
    getWeatherLabel: getWeatherLabel,
    getWeatherIcon: getWeatherIcon,
    getTemp: getTemp,
    getTempUnit: getTempUnit,
    getLang: getLang,
    normalizeLang: normalizeLang
  };

})();
