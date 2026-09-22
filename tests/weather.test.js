import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// Helper to mock geolocation
let originalGeolocation;
let originalFetch;

function mockGeolocation({ latitude, longitude }) {
  originalGeolocation = navigator.geolocation;
  navigator.geolocation = {
    getCurrentPosition: (success) => {
      success({
        coords: {
          latitude,
          longitude
        }
      });
    }
  };
}

function mockGeolocationError(error = new Error('Geolocation failed')) {
  originalGeolocation = navigator.geolocation;
  navigator.geolocation = {
    getCurrentPosition: (_success, failure) => {
      failure(error);
    }
  };
}

beforeAll(() => {
  // Create weather widget element if not already present (setup.js may have created it)
  if (!document.getElementById('weather-widget')) {
    const widget = document.createElement('div');
    widget.id = 'weather-widget';
    widget.className = 'weather-widget';
    widget.style.display = 'none';
    document.body.appendChild(widget);
  }

  // Inject utils.js first to provide escapeHtml
  injectScript('src/core/utils.js');
  // weather.js depends on the shared WeatherUtils module
  injectScript('src/features/weather-utils.js');
  injectScript('src/features/weather.js');
});

beforeEach(() => {
  originalFetch = global.fetch;
  localStorage.clear();
  const widget = document.getElementById('weather-widget');
  if (widget) {
    widget.innerHTML = '';
    widget.style.display = 'none';
    widget.className = 'weather-widget';
  }
});

afterEach(() => {
  global.fetch = originalFetch;
  originalFetch = undefined;
  if (originalGeolocation !== undefined) {
    navigator.geolocation = originalGeolocation;
  } else {
    delete navigator.geolocation;
  }
  originalGeolocation = undefined;
});

describe('Weather widget', () => {
  const mockWeatherData = {
    current: {
      temperature_2m: 22,
      weather_code: 0,
      wind_speed_10m: 10,
      relative_humidity_2m: 50,
      apparent_temperature: 24
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

  it('fetches daily data for the weather app cache', async () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherLocationMode', 'auto');

    mockGeolocation({ latitude: 37.7749, longitude: -122.4194 });

    const originalFetch = global.fetch;
    let capturedUrl;
    global.fetch = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => mockWeatherData };
    };

    try {
      await window.WeatherWidget.refresh(true);
      await new Promise(resolve => setTimeout(resolve, 0));

      const urlObj = new URL(capturedUrl);
      const params = new URLSearchParams(urlObj.search);
      expect(params.get('current')).toBe('temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code');
      expect(params.get('daily')).toBe('temperature_2m_max,temperature_2m_min,weather_code');
      expect(params.get('forecast_days')).toBe('7');
      expect(params.get('timezone')).toBe('auto');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('requests forecast in location timezone to avoid GMT day shift (regression #629)', async () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherLocationMode', 'auto');

    mockGeolocation({ latitude: -36.8485, longitude: 174.7633 }); // Auckland (UTC+13)

    const originalFetch = global.fetch;
    let capturedUrl;
    global.fetch = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => mockWeatherData };
    };

    try {
      await window.WeatherWidget.refresh(true);
      await new Promise(resolve => setTimeout(resolve, 0));

      const urlObj = new URL(capturedUrl);
      expect(urlObj.search).toContain('timezone=auto');
      expect(new URL(capturedUrl).searchParams.get('timezone')).toBe('auto');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('widget renders current conditions without forecast', async () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherLocationMode', 'auto');

    const widget = document.getElementById('weather-widget');
    expect(widget).not.toBeNull();

    mockGeolocation({ latitude: 37.7749, longitude: -122.4194 });

    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      const urlObj = new URL(url);
      if (urlObj.hostname !== 'api.open-meteo.com' || urlObj.pathname !== '/v1/forecast') {
        return { ok: false, status: 400, json: async () => ({ error: 'Invalid URL' }) };
      }
      return { ok: true, json: async () => mockWeatherData };
    };

    try {
      await window.WeatherWidget.refresh(true);
      await new Promise(resolve => setTimeout(resolve, 0));

      const cards = widget.querySelectorAll('.weather-forecast-card');
      expect(cards.length).toBe(0);
      const forecast = widget.querySelector('.weather-forecast');
      expect(forecast).toBeNull();
      const temp = widget.querySelector('.weather-temp');
      expect(temp).not.toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });

  const DEFAULT_AUTO_COORDINATES = {
    latitude: 37.7749,
    longitude: -122.4194
  };

  function configureAutoWeather({
    cacheData = mockWeatherData,
    cacheCoordinates = DEFAULT_AUTO_COORDINATES,
    currentCoordinates = DEFAULT_AUTO_COORDINATES,
    locationName = 'Location A'
  } = {}) {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherLocationMode', 'auto');
    localStorage.setItem('weatherCache', JSON.stringify({
      lat: cacheCoordinates.latitude,
      lon: cacheCoordinates.longitude,
      data: cacheData,
      timestamp: Date.now(),
      locationMode: 'auto',
      manualCity: '',
      locationName
    }));
    mockGeolocation(currentCoordinates);
  }

  function installWeatherFetch({ data = mockWeatherData, onCall = () => {} } = {}) {
    global.fetch = async (url) => {
      onCall(url);
      return { ok: true, json: async () => data };
    };
  }

  it('does not use a fresh auto-location cache after the user moves', async () => {
    configureAutoWeather({
      currentCoordinates: { latitude: 34.0522, longitude: -118.2437 }
    });

    let capturedUrl;
    installWeatherFetch({
      onCall: (url) => {
        capturedUrl = url;
      }
    });

    await window.WeatherWidget.refresh();

    const urlObj = new URL(capturedUrl);
    expect(urlObj.searchParams.get('latitude')).toBe('34.0522');
    expect(urlObj.searchParams.get('longitude')).toBe('-118.2437');
  });

  it('uses a fresh auto-location cache within the coordinate tolerance', async () => {
    const cachedData = {
      ...mockWeatherData,
      current: {
        ...mockWeatherData.current,
        temperature_2m: 19
      }
    };
    configureAutoWeather({
      cacheData: cachedData,
      currentCoordinates: { latitude: 37.8044, longitude: -122.4194 }
    });

    let fetchCalled = false;
    installWeatherFetch({
      onCall: () => {
        fetchCalled = true;
      }
    });

    await window.WeatherWidget.refresh();

    expect(fetchCalled).toBe(false);
    expect(document.querySelector('.weather-temp').textContent).toContain('19');
  });

  it('rejects a fresh auto-location cache just beyond the coordinate tolerance', async () => {
    // ~10.50 km north of the cached latitude, just beyond the 10 km limit.
    configureAutoWeather({
      currentCoordinates: { latitude: 37.8693, longitude: -122.4194 }
    });

    let capturedUrl;
    installWeatherFetch({
      onCall: (url) => {
        capturedUrl = url;
      }
    });

    await window.WeatherWidget.refresh();

    expect(capturedUrl).toBeDefined();
    expect(new URL(capturedUrl).searchParams.get('latitude')).toBe('37.8693');
    expect(new URL(capturedUrl).searchParams.get('longitude')).toBe('-122.4194');
  });

  it('does not use a fresh auto-location cache when geolocation fails', async () => {
    const cachedData = {
      ...mockWeatherData,
      current: {
        ...mockWeatherData.current,
        temperature_2m: 19
      }
    };
    configureAutoWeather({ cacheData: cachedData });
    mockGeolocationError();

    let fetchCalled = false;
    installWeatherFetch({
      onCall: () => {
        fetchCalled = true;
      }
    });

    await window.WeatherWidget.refresh();

    expect(fetchCalled).toBe(false);
    expect(document.querySelector('.weather-temp')).toBeNull();
    expect(document.querySelector('.weather-error')).not.toBeNull();
  });

  it('does not trust an auto-location cache with invalid coordinates', async () => {
    configureAutoWeather({
      cacheCoordinates: { latitude: null, longitude: -122.4194 }
    });

    let fetchCalled = false;
    installWeatherFetch({
      onCall: () => {
        fetchCalled = true;
      }
    });

    await window.WeatherWidget.refresh();

    expect(fetchCalled).toBe(true);
  });

  it('falls back to matching auto-location cache when the weather fetch fails', async () => {
    const cachedData = {
      ...mockWeatherData,
      current: {
        ...mockWeatherData.current,
        temperature_2m: 19
      }
    };
    configureAutoWeather({ cacheData: cachedData });

    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error('Network unavailable');
    };

    try {
      await window.WeatherWidget.refresh(true);

      expect(document.querySelector('.weather-temp').textContent).toContain('19');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('re-reads weather cache after storage changes', async () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherLocationMode', 'auto');

    mockGeolocation({ latitude: 37.7749, longitude: -122.4194 });

    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => mockWeatherData });

    try {
      await window.WeatherWidget.refresh(true);

      const updatedData = {
        ...mockWeatherData,
        current: {
          ...mockWeatherData.current,
          temperature_2m: 30
        }
      };
      localStorage.setItem('weatherCache', JSON.stringify({
        lat: 37.7749,
        lon: -122.4194,
        data: updatedData,
        timestamp: Date.now(),
        locationMode: 'auto',
        manualCity: '',
        locationName: '<img src=x onerror=alert(1)>'
      }));

      await window.WeatherWidget.refresh();

      const widget = document.getElementById('weather-widget');
      expect(widget.querySelector('.weather-temp').textContent).toContain('30');
      expect(widget.querySelector('.weather-location span').textContent).toBe(
        '<img src=x onerror=alert(1)>'
      );
      expect(widget.querySelector('.weather-location img')).toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('escapes HTML in error messages', async () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherLocationMode', 'manual');
    localStorage.setItem('weatherManualCity', '');

    const originalT = window.i18n.t;
    window.i18n.t = (key) => (key === 'weatherEnterCity' ? '<img src=x onerror=alert(1)>' : originalT(key));

    try {
      await window.WeatherWidget.refresh(true);

      const widget = document.getElementById('weather-widget');
      const errorText = widget.querySelector('.weather-error-text');
      expect(errorText).not.toBeNull();
      expect(errorText.textContent).toBe('<img src=x onerror=alert(1)>');
      expect(widget.querySelector('.weather-error-text img')).toBeNull();
    } finally {
      window.i18n.t = originalT;
    }
  });
});
