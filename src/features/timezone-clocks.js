// src/features/timezone-clocks.js - Multiple time zone clocks

(function () {
  'use strict';

  const STORAGE_KEY = 'extraTimeZones';
  const MAX_TIMEZONES = 5;

  const POPULAR_ZONES = [
    { id: 'America/New_York', city: 'New York', offset: -5 },
    { id: 'America/Chicago', city: 'Chicago', offset: -6 },
    { id: 'America/Denver', city: 'Denver', offset: -7 },
    { id: 'America/Los_Angeles', city: 'Los Angeles', offset: -8 },
    { id: 'America/Anchorage', city: 'Anchorage', offset: -9 },
    { id: 'Pacific/Honolulu', city: 'Honolulu', offset: -10 },
    { id: 'America/Toronto', city: 'Toronto', offset: -5 },
    { id: 'America/Vancouver', city: 'Vancouver', offset: -8 },
    { id: 'America/Sao_Paulo', city: 'São Paulo', offset: -3 },
    { id: 'America/Argentina/Buenos_Aires', city: 'Buenos Aires', offset: -3 },
    { id: 'America/Mexico_City', city: 'Mexico City', offset: -6 },
    { id: 'Europe/London', city: 'London', offset: 0 },
    { id: 'Europe/Paris', city: 'Paris', offset: 1 },
    { id: 'Europe/Berlin', city: 'Berlin', offset: 1 },
    { id: 'Europe/Rome', city: 'Rome', offset: 1 },
    { id: 'Europe/Madrid', city: 'Madrid', offset: 1 },
    { id: 'Europe/Amsterdam', city: 'Amsterdam', offset: 1 },
    { id: 'Europe/Moscow', city: 'Moscow', offset: 3 },
    { id: 'Europe/Istanbul', city: 'Istanbul', offset: 3 },
    { id: 'Africa/Cairo', city: 'Cairo', offset: 2 },
    { id: 'Africa/Lagos', city: 'Lagos', offset: 1 },
    { id: 'Africa/Johannesburg', city: 'Johannesburg', offset: 2 },
    { id: 'Asia/Dubai', city: 'Dubai', offset: 4 },
    { id: 'Asia/Karachi', city: 'Karachi', offset: 5 },
    { id: 'Asia/Kolkata', city: 'Mumbai', offset: 5.5 },
    { id: 'Asia/Dhaka', city: 'Dhaka', offset: 6 },
    { id: 'Asia/Bangkok', city: 'Bangkok', offset: 7 },
    { id: 'Asia/Singapore', city: 'Singapore', offset: 8 },
    { id: 'Asia/Shanghai', city: 'Shanghai', offset: 8 },
    { id: 'Asia/Hong_Kong', city: 'Hong Kong', offset: 8 },
    { id: 'Asia/Taipei', city: 'Taipei', offset: 8 },
    { id: 'Asia/Seoul', city: 'Seoul', offset: 9 },
    { id: 'Asia/Tokyo', city: 'Tokyo', offset: 9 },
    { id: 'Australia/Sydney', city: 'Sydney', offset: 11 },
    { id: 'Australia/Melbourne', city: 'Melbourne', offset: 11 },
    { id: 'Pacific/Auckland', city: 'Auckland', offset: 13 }
  ];

  function loadTimeZones() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (tz) {
        return typeof tz === 'string' && tz.length > 0;
      }).slice(0, MAX_TIMEZONES);
    } catch (_e) {
      console.warn('Failed to load extra time zones');
      return [];
    }
  }

  function saveTimeZones(zones) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(zones));
      return true;
    } catch (_e) {
      console.warn('Failed to save extra time zones');
      return false;
    }
  }

  function getZoneInfo(zoneId) {
    for (let i = 0; i < POPULAR_ZONES.length; i++) {
      if (POPULAR_ZONES[i].id === zoneId) {
        return POPULAR_ZONES[i];
      }
    }
    return null;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatZoneTime(date, zoneId, locale, clockFormat) {
    try {
      const options = {
        timeZone: zoneId,
        hour: 'numeric',
        minute: '2-digit',
        hour12: clockFormat === '12h' || (clockFormat === 'auto' && locale && locale.indexOf('US') !== -1)
      };
      if (clockFormat === '24h') {
        options.hour12 = false;
        options.hour = '2-digit';
      }
      return date.toLocaleTimeString(locale || 'en-US', options);
    } catch (_e) {
      return '--:--';
    }
  }

  function renderExtraClocks() {
    const container = document.getElementById('extra-timezones');
    if (!container) return;

    const zones = loadTimeZones();
    container.innerHTML = '';

    if (zones.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';

    const now = new Date();
    const locale = window.getDisplayLocale ? window.getDisplayLocale() : 'en-US';
    const clockFormat = window.getClockFormat ? window.getClockFormat() : 'auto';

    zones.forEach(function (zoneId) {
      const info = getZoneInfo(zoneId);
      const city = info ? info.city : zoneId.split('/').pop().replace(/_/g, ' ');
      const time = formatZoneTime(now, zoneId, locale, clockFormat);

      const chip = document.createElement('div');
      chip.className = 'timezone-chip';
      chip.dataset.zone = zoneId;

      chip.innerHTML =
        '<span class="timezone-city">' + escapeHtml(city) + '</span>' +
        '<span class="timezone-time">' + time + '</span>' +
        '<button class="timezone-remove" title="Remove" aria-label="Remove ' + escapeHtml(city) + '">' +
          '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
        '</button>';

      container.appendChild(chip);
    });
  }

  function updateExtraClocks() {
    const container = document.getElementById('extra-timezones');
    if (!container || container.style.display === 'none') return;

    const chips = container.querySelectorAll('.timezone-chip');
    if (chips.length === 0) return;

    const now = new Date();
    const locale = window.getDisplayLocale ? window.getDisplayLocale() : 'en-US';
    const clockFormat = window.getClockFormat ? window.getClockFormat() : 'auto';

    chips.forEach(function (chip) {
      const zoneId = chip.dataset.zone;
      const timeEl = chip.querySelector('.timezone-time');
      if (timeEl) {
        timeEl.textContent = formatZoneTime(now, zoneId, locale, clockFormat);
      }
    });
  }

  function addTimeZone(zoneId) {
    const zones = loadTimeZones();
    if (zones.length >= MAX_TIMEZONES) return false;
    if (zones.indexOf(zoneId) !== -1) return false;
    zones.push(zoneId);
    if (saveTimeZones(zones)) {
      renderExtraClocks();
      return true;
    }
    return false;
  }

  function removeTimeZone(zoneId) {
    const zones = loadTimeZones();
    const index = zones.indexOf(zoneId);
    if (index === -1) return false;
    zones.splice(index, 1);
    if (saveTimeZones(zones)) {
      renderExtraClocks();
      return true;
    }
    return false;
  }

  function initTimezoneClocks() {
    let container = document.getElementById('extra-timezones');
    if (!container) {
      container = document.createElement('div');
      container.id = 'extra-timezones';
      container.className = 'extra-timezones';
      const clock = document.getElementById('clock');
      if (clock) {
        clock.appendChild(container);
      }
    }

    container.addEventListener('click', function (e) {
      const removeBtn = e.target.closest('.timezone-remove');
      if (removeBtn) {
        const chip = removeBtn.closest('.timezone-chip');
        if (chip) {
          removeTimeZone(chip.dataset.zone);
        }
      }
    });

    renderExtraClocks();
  }

  const originalUpdateTime = window.updateTime;
  if (typeof originalUpdateTime === 'function') {
    window.updateTime = function () {
      originalUpdateTime();
      updateExtraClocks();
    };
  }

  window.initTimezoneClocks = initTimezoneClocks;
  window.renderExtraClocks = renderExtraClocks;
  window.addTimeZone = addTimeZone;
  window.removeTimeZone = removeTimeZone;
  window.loadTimeZones = loadTimeZones;
  window.saveTimeZones = saveTimeZones;
  window.POPULAR_ZONES = POPULAR_ZONES;
  window.MAX_TIMEZONES = MAX_TIMEZONES;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTimezoneClocks);
  } else {
    initTimezoneClocks();
  }
})();
