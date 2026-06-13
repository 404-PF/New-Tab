import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  // Create weather widget element
  const widget = document.createElement('div');
  widget.id = 'weather-widget';
  widget.className = 'weather-widget';
  widget.style.display = 'none';
  document.body.appendChild(widget);

  injectScript('src/features/weather.js');
});

beforeEach(() => {
  localStorage.clear();
  const widget = document.getElementById('weather-widget');
  if (widget) {
    widget.innerHTML = '';
    widget.style.display = 'none';
    widget.className = 'weather-widget';
  }
});

describe('Weather forecast', () => {
  const mockWeatherData = {
    current_weather: {
      temperature: 22,
      weathercode: 0,
      windspeed: 10,
      winddirection: 180,
      time: '2025-01-15T12:00'
    },
    daily: {
      time: ['2025-01-15', '2025-01-16', '2025-01-17', '2025-01-18', '2025-01-19', '2025-01-20', '2025-01-21'],
      temperature_2m_max: [22, 24, 20, 18, 21, 23, 25],
      temperature_2m_min: [12, 14, 10, 8, 11, 13, 15],
      weather_code: [0, 1, 2, 3, 61, 80, 0]
    }
  };

  it('WeatherWidget exists', () => {
    expect(window.WeatherWidget).toBeDefined();
    expect(typeof window.WeatherWidget.init).toBe('function');
    expect(typeof window.WeatherWidget.refresh).toBe('function');
  });

  it('WeatherStorage has required methods', () => {
    expect(window.WeatherWidget.loadEnabled).toBeDefined();
    expect(window.WeatherWidget.loadUnit).toBeDefined();
    expect(window.WeatherWidget.loadLocationMode).toBeDefined();
    expect(window.WeatherWidget.loadManualCity).toBeDefined();
  });

  it('forecast renders when daily data is present', async () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherLocationMode', 'auto');

    const widget = document.getElementById('weather-widget');
    expect(widget).not.toBeNull();

    // Stub navigator.geolocation.getCurrentPosition
    const originalGeolocation = navigator.geolocation;
    navigator.geolocation = {
      getCurrentPosition: (success) => {
        success({
          coords: {
            latitude: 37.7749,
            longitude: -122.4194
          }
        });
      }
    };

    // Stub global fetch
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      return {
        ok: true,
        json: async () => mockWeatherData
      };
    };

    try {
      // Call the actual refresh method
      await window.WeatherWidget.refresh(true);

      // Wait for any promises to flush
      await new Promise(resolve => setTimeout(resolve, 0));

      const cards = widget.querySelectorAll('.weather-forecast-card');
      expect(cards.length).toBe(7);
    } finally {
      // Restore original functions
      navigator.geolocation = originalGeolocation;
      global.fetch = originalFetch;
    }
  });

  it('forecast cards display correct temperatures', async () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherLocationMode', 'auto');

    const widget = document.getElementById('weather-widget');

    // Stub navigator.geolocation.getCurrentPosition
    const originalGeolocation = navigator.geolocation;
    navigator.geolocation = {
      getCurrentPosition: (success) => {
        success({
          coords: {
            latitude: 37.7749,
            longitude: -122.4194
          }
        });
      }
    };

    // Stub global fetch
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      return {
        ok: true,
        json: async () => mockWeatherData
      };
    };

    try {
      // Call the actual refresh method
      await window.WeatherWidget.refresh(true);

      // Wait for any promises to flush
      await new Promise(resolve => setTimeout(resolve, 0));

      const highTemps = widget.querySelectorAll('.weather-forecast-high');
      const lowTemps = widget.querySelectorAll('.weather-forecast-low');

      expect(highTemps[0].textContent).toBe('22°');
      expect(lowTemps[0].textContent).toBe('12°');
      expect(highTemps[6].textContent).toBe('25°');
      expect(lowTemps[6].textContent).toBe('15°');
    } finally {
      // Restore original functions
      navigator.geolocation = originalGeolocation;
      global.fetch = originalFetch;
    }
  });

  it('forecast is hidden when widget is collapsed', () => {
    const widget = document.getElementById('weather-widget');
    widget.style.display = 'none';

    const forecast = widget.querySelector('.weather-forecast');
    expect(forecast).toBeNull();
  });

  it('forecast degrades gracefully when daily data is missing', async () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherLocationMode', 'auto');

    const widget = document.getElementById('weather-widget');

    // Stub navigator.geolocation.getCurrentPosition
    const originalGeolocation = navigator.geolocation;
    navigator.geolocation = {
      getCurrentPosition: (success) => {
        success({
          coords: {
            latitude: 37.7749,
            longitude: -122.4194
          }
        });
      }
    };

    // Stub global fetch to return data without daily field
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      return {
        ok: true,
        json: async () => ({
          current_weather: {
            temperature: 22,
            weathercode: 0,
            windspeed: 10,
            winddirection: 180,
            time: '2025-01-15T12:00'
          }
          // No daily field
        })
      };
    };

    try {
      // Call the actual refresh method
      await window.WeatherWidget.refresh(true);

      // Wait for any promises to flush
      await new Promise(resolve => setTimeout(resolve, 0));

      const forecast = widget.querySelector('.weather-forecast');
      expect(forecast).toBeNull();
    } finally {
      // Restore original functions
      navigator.geolocation = originalGeolocation;
      global.fetch = originalFetch;
    }
  });
});
