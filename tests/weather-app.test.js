import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  // weather-app.js depends on the shared WeatherUtils module
  injectScript('src/features/weather-utils.js');
  injectScript('src/features/weather-app.js');
});

beforeEach(() => {
  localStorage.clear();
  const modal = document.getElementById('weather-app-modal');
  if (modal) {
    modal.classList.remove('modal-open');
  }
  const body = document.getElementById('weather-app-body');
  if (body) {
    body.innerHTML = '';
  }
});

describe('Weather app', () => {
  it('WeatherApp exists with required methods', () => {
    expect(window.WeatherApp).toBeDefined();
    expect(typeof window.WeatherApp.init).toBe('function');
    expect(typeof window.WeatherApp.open).toBe('function');
    expect(typeof window.WeatherApp.close).toBe('function');
  });

  it('open adds modal-open class to modal element', () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherCache', JSON.stringify({
      data: {
        current: { temperature_2m: 20, weather_code: 0, apparent_temperature: 18, wind_speed_10m: 5, relative_humidity_2m: 65 }
      },
      locationName: 'Test City'
    }));

    window.WeatherApp.open();

    const modal = document.getElementById('weather-app-modal');
    expect(modal.classList.contains('modal-open')).toBe(true);
  });

  it('close removes modal-open class', () => {
    const modal = document.getElementById('weather-app-modal');
    modal.classList.add('modal-open');

    window.WeatherApp.close();

    expect(modal.classList.contains('modal-open')).toBe(false);
  });

  it('renders expanded weather from cache', () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherCache', JSON.stringify({
      data: {
        current: { temperature_2m: 22, weather_code: 0, apparent_temperature: 20, wind_speed_10m: 12, relative_humidity_2m: 55 },
        daily: {
          time: ['2025-01-15', '2025-01-16'],
          temperature_2m_max: [22, 24],
          temperature_2m_min: [12, 14],
          weather_code: [0, 1]
        }
      },
      locationName: 'London, UK'
    }));

    window.WeatherApp.open();

    const body = document.getElementById('weather-app-body');
    expect(body.querySelector('.weather-app-current')).not.toBeNull();
    expect(body.querySelector('.weather-app-current-temp').textContent).toContain('22');
    expect(body.querySelector('.weather-app-details')).not.toBeNull();

    const detailCards = body.querySelectorAll('.weather-app-detail-card');
    expect(detailCards.length).toBe(3);
  });

  it('renders cached weather when the widget toggle is off', () => {
    localStorage.setItem('weatherEnabled', 'false');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherCache', JSON.stringify({
      data: {
        current: { temperature_2m: 18, weather_code: 0, apparent_temperature: 16, wind_speed_10m: 9, relative_humidity_2m: 40 }
      },
      locationName: 'Berlin, DE'
    }));

    window.WeatherApp.open();

    const modal = document.getElementById('weather-app-modal');
    const body = document.getElementById('weather-app-body');
    expect(modal.classList.contains('modal-open')).toBe(true);
    expect(body.querySelector('.weather-app-disabled')).toBeNull();
    expect(body.querySelector('.weather-app-current')).not.toBeNull();
    expect(body.querySelector('.weather-app-current-temp').textContent).toContain('18');
    expect(body.querySelector('.weather-app-current-location').textContent).toContain('Berlin, DE');
  });

  it('renders cached weather when weatherEnabled was never set', () => {
    localStorage.setItem('weatherCache', JSON.stringify({
      data: {
        current: { temperature_2m: 21, weather_code: 1 }
      },
      locationName: 'Rome, IT'
    }));

    window.WeatherApp.open();

    const body = document.getElementById('weather-app-body');
    expect(body.querySelector('.weather-app-disabled')).toBeNull();
    expect(body.querySelector('.weather-app-current-temp').textContent).toContain('21');
  });

  it('triggers a refresh that ignores the widget toggle', () => {
    const refresh = vi.fn().mockResolvedValue();
    const originalWeatherWidget = window.WeatherWidget;
    window.WeatherWidget = { refresh };

    try {
      window.WeatherApp.open();

      expect(refresh).toHaveBeenCalledWith(false, true);
    } finally {
      if (originalWeatherWidget === undefined) {
        delete window.WeatherWidget;
      } else {
        window.WeatherWidget = originalWeatherWidget;
      }
    }
  });

  it('renders forecast days in expanded view', () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherCache', JSON.stringify({
      data: {
        current: { temperature_2m: 20, weather_code: 0, apparent_temperature: 18, wind_speed_10m: 5, relative_humidity_2m: 65 },
        daily: {
          time: ['2025-01-15', '2025-01-16', '2025-01-17'],
          temperature_2m_max: [20, 22, 18],
          temperature_2m_min: [10, 12, 8],
          weather_code: [0, 1, 2]
        }
      },
      locationName: 'Paris, FR'
    }));

    window.WeatherApp.open();

    const body = document.getElementById('weather-app-body');
    const forecastDays = body.querySelectorAll('.weather-app-forecast-day');
    expect(forecastDays.length).toBe(3);
  });

  it('renders Fahrenheit temperatures correctly', () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'fahrenheit');
    localStorage.setItem('weatherCache', JSON.stringify({
      data: {
        current: { temperature_2m: 20, weather_code: 0, apparent_temperature: 18, wind_speed_10m: 8, relative_humidity_2m: 50 }
      },
      locationName: 'New York, US'
    }));

    window.WeatherApp.open();

    const body = document.getElementById('weather-app-body');
    const tempEl = body.querySelector('.weather-app-current-temp');
    expect(tempEl.textContent).toContain('\u00B0F');
    // Verify conversion: 20°C should be converted to 68°F
    expect(tempEl.textContent).toContain('68');
  });

  it('re-renders when weatherCacheUpdated event is dispatched', () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherCache', JSON.stringify({
      data: {
        current: { temperature_2m: 15, weather_code: 0, apparent_temperature: 13, wind_speed_10m: 5, relative_humidity_2m: 60 }
      },
      locationName: 'Initial City'
    }));

    window.WeatherApp.open();

    const body = document.getElementById('weather-app-body');
    expect(body.querySelector('.weather-app-current-temp').textContent).toContain('15');

    localStorage.setItem('weatherCache', JSON.stringify({
      data: {
        current: { temperature_2m: 30, weather_code: 1, apparent_temperature: 28, wind_speed_10m: 10, relative_humidity_2m: 40 }
      },
      locationName: 'Updated City'
    }));

    window.dispatchEvent(new CustomEvent('weatherCacheUpdated'));

    expect(body.querySelector('.weather-app-current-temp').textContent).toContain('30');
  });

  it('escapes HTML in error messages', () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherCache', JSON.stringify({ data: {} }));

    const originalT = window.i18n.t;
    window.i18n.t = (key) => (key === 'weatherError' ? '<img src=x onerror=alert(1)>' : originalT(key));

    try {
      window.WeatherApp.open();

      const body = document.getElementById('weather-app-body');
      const errorText = body.querySelector('.weather-app-error-text');
      expect(errorText).not.toBeNull();
      expect(errorText.textContent).toBe('<img src=x onerror=alert(1)>');
      expect(body.querySelector('.weather-app-error-text img')).toBeNull();
    } finally {
      window.i18n.t = originalT;
    }
  });
});
