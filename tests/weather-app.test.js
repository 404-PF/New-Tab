import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
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
        current_weather: { temperature: 20, weathercode: 0 },
        current: { apparent_temperature: 18, wind_speed_10m: 5, relative_humidity_2m: 65 }
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
        current_weather: { temperature: 22, weathercode: 0 },
        current: { apparent_temperature: 20, wind_speed_10m: 12, relative_humidity_2m: 55 },
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

  it('renders disabled state when weather is not enabled', () => {
    localStorage.removeItem('weatherEnabled');

    window.WeatherApp.open();

    const body = document.getElementById('weather-app-body');
    expect(body.querySelector('.weather-app-disabled')).not.toBeNull();
  });

  it('renders forecast days in expanded view', () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherCache', JSON.stringify({
      data: {
        current_weather: { temperature: 20, weathercode: 0 },
        current: { apparent_temperature: 18, wind_speed_10m: 5, relative_humidity_2m: 65 },
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
        current_weather: { temperature: 20, weathercode: 0 },
        current: { apparent_temperature: 18, wind_speed_10m: 8, relative_humidity_2m: 50 }
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
});
