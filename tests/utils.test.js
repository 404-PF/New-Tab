/* global validateIconUrl */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/app-grid-storage.js');
  injectScript('src/core/app-grid-state.js');
  injectScript('src/core/utils.js');
});

beforeEach(() => {
  localStorage.clear();
  if (typeof iconCache !== 'undefined' && typeof iconCache.__originalGetIconWithCache === 'function') {
    iconCache.getIconWithCache = iconCache.__originalGetIconWithCache;
  }
});

describe('URL validation', () => {
  it('validates simple https URL', () => {
    const result = validateUrl('https://example.com');
    expect(result.status).toBe('valid');
    expect(result.url.href).toBe('https://example.com/');
  });

  it('validates URL with path', () => {
    const result = validateUrl('https://example.com/path?query=1');
    expect(result.status).toBe('valid');
  });

  it('adds https protocol when missing', () => {
    const result = validateUrl('example.com');
    expect(result.status).toBe('valid');
    expect(result.url.href).toBe('https://example.com/');
  });

  it('validates localhost', () => {
    const result = validateUrl('localhost:3000');
    expect(result.status).toBe('valid');
  });

  it('validates IPv4 address', () => {
    const result = validateUrl('192.168.1.1');
    expect(result.status).toBe('valid');
  });

  it('validates IPv4 with port', () => {
    const result = validateUrl('127.0.0.1:8080');
    expect(result.status).toBe('valid');
  });

  it('validates IPv4 with protocol', () => {
    const result = validateUrl('http://192.168.1.1');
    expect(result.status).toBe('valid');
  });

  it('validates IPv4 with protocol and port', () => {
    const result = validateUrl('https://127.0.0.1:8080');
    expect(result.status).toBe('valid');
  });

  it('rejects malformed URL', () => {
    const result = validateUrl('example.c');
    expect(result.status).toBe('malformed');
  });

  it('rejects missing hostname', () => {
    const result = validateUrl('https://');
    expect(result.status).toBe('malformed');
  });

  it('rejects incomplete domain', () => {
    const result = validateUrl('example');
    expect(result.status).toBe('undetectable');
  });

  it('rejects search query', () => {
    const result = validateUrl('hello world');
    expect(result.status).toBe('undetectable');
  });

  it('rejects empty input', () => {
    const result = validateUrl('');
    expect(result.status).toBe('undetectable');
  });

  it('rejects IP out of range', () => {
    const result = validateUrl('256.0.0.1');
    expect(result.status).toBe('malformed');
  });

  it('rejects out-of-range IPv4 with path', () => {
    const result = validateUrl('256.0.0.1/foo');
    expect(result.status).toBe('malformed');
  });

  it('rejects out-of-range IPv4 with query', () => {
    const result = validateUrl('999.999.999.999?x=1');
    expect(result.status).toBe('malformed');
  });

  it('rejects out-of-range IPv4 with protocol', () => {
    const result = validateUrl('http://256.0.0.1');
    expect(result.status).toBe('malformed');
  });

  it('validates IPv4 with path', () => {
    const result = validateUrl('192.168.1.1/path');
    expect(result.status).toBe('valid');
  });

  it('rejects invalid hostname characters', () => {
    const result = validateUrl('exa_mple.com');
    expect(result.status).toBe('malformed');
  });
});

describe('URL boolean helpers', () => {
  it('isValidUrl returns true for valid URL', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
  });

  it('isValidUrl returns false for search query', () => {
    expect(isValidUrl('hello world')).toBe(false);
  });

  it('isMalformedUrl returns true for malformed URL', () => {
    expect(isMalformedUrl('example.c')).toBe(true);
  });

  it('isMalformedUrl returns false for valid URL', () => {
    expect(isMalformedUrl('https://example.com')).toBe(false);
  });

  it('isSearchQuery returns true for plain text', () => {
    expect(isSearchQuery('hello world')).toBe(true);
  });

  it('isSearchQuery returns false for valid URL', () => {
    expect(isSearchQuery('https://example.com')).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('returns normalized URL for valid input', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
  });

  it('returns null for invalid input', () => {
    expect(normalizeUrl('hello world')).toBeNull();
  });
});

describe('translateValidationMessage', () => {
  it('translates known messages', () => {
    expect(translateValidationMessage('Valid URL')).toBe('Valid URL');
    expect(translateValidationMessage('Please enter a URL or search query')).toBe('Please enter a URL or search query');
  });

  it('returns key for unknown messages', () => {
    expect(translateValidationMessage('Something else')).toBe('Something else');
  });

  it('handles malformed prefix', () => {
    expect(translateValidationMessage('Malformed URL: error')).toBe('Malformed URL');
  });
});

describe('iconCache', () => {
  it('is globally available', () => {
    expect(typeof iconCache).toBe('object');
  });

  it('isOffline reflects navigator.onLine', () => {
    expect(typeof iconCache.isOffline()).toBe('boolean');
  });

  it('preserves app changes while caching icons', async () => {
    AppGridStorage.saveCustomApps([
      {
        id: 'app1',
        url: 'https://one.example',
        name: 'One',
        icon: 'https://cdn.example/one.svg'
      },
      {
        id: 'app2',
        url: 'https://two.example',
        name: 'Two',
        icon: 'https://cdn.example/two.svg'
      }
    ]);

    const createDeferred = () => {
      let resolve;
      const promise = new Promise((innerResolve) => {
        resolve = innerResolve;
      });
      return { promise, resolve };
    };

    const first = createDeferred();
    const second = createDeferred();
    const originalGetIconWithCache = iconCache.getIconWithCache.bind(iconCache);
    iconCache.__originalGetIconWithCache = originalGetIconWithCache;
    iconCache.getIconWithCache = (iconUrl) => {
      if (iconUrl.includes('one.svg')) return first.promise;
      return second.promise;
    };

    const cachingPromise = iconCache.cacheExistingAppIcons();
    AppGridState.deleteApp('app1');
    AppGridState.updateThumbnail('app2', 'https://cdn.example/two-new.svg');

    first.resolve('data:image/png;base64,one');
    second.resolve('data:image/png;base64,two');
    await cachingPromise;

    expect(AppGridState.getCustomApps()).toEqual([
      {
        id: 'app2',
        url: 'https://two.example',
        name: 'Two',
        icon: 'https://cdn.example/two-new.svg'
      }
    ]);
  });

  it('does not overwrite an app that already has a cached icon', async () => {
    AppGridStorage.saveCustomApps([
      {
        id: 'app3',
        url: 'https://three.example',
        name: 'Three',
        icon: 'https://cdn.example/three.svg',
        cachedIcon: 'data:image/png;base64,existing'
      }
    ]);

    const deferred = (() => {
      let resolve;
      const promise = new Promise((innerResolve) => {
        resolve = innerResolve;
      });
      return { promise, resolve };
    })();

    const originalGetIconWithCache = iconCache.getIconWithCache.bind(iconCache);
    iconCache.__originalGetIconWithCache = originalGetIconWithCache;
    iconCache.getIconWithCache = () => deferred.promise;

    const cachingPromise = iconCache.cacheExistingAppIcons();
    deferred.resolve('data:image/png;base64,new');
    await cachingPromise;

    expect(AppGridState.getCustomApps()).toEqual([
      {
        id: 'app3',
        url: 'https://three.example',
        name: 'Three',
        icon: 'https://cdn.example/three.svg',
        cachedIcon: 'data:image/png;base64,existing'
      }
    ]);
  });
});

describe('VisibilityInterval', () => {
  it('is globally available', () => {
    expect(typeof VisibilityInterval).toBe('function');
  });

  const visibilityResumeCases = [
    {
      name: 'visibilitychange',
      target: document,
    },
    {
      name: 'focus',
      target: window,
    },
    {
      name: 'pageshow',
      target: window,
    },
  ];

  visibilityResumeCases.forEach(({ name, target }) => {
    it(`pauses while hidden and resumes on ${name}`, () => {
      vi.useFakeTimers();

      const originalHidden = document.hidden;
      const callback = vi.fn();
      let interval;

      try {
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        interval = new VisibilityInterval(callback, 1000);

        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000);
        expect(callback).toHaveBeenCalledTimes(1);

        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        vi.advanceTimersByTime(2000);
        expect(callback).toHaveBeenCalledTimes(1);

        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        target.dispatchEvent(new Event(name));

        expect(callback).toHaveBeenCalledTimes(2);

        vi.advanceTimersByTime(1000);
        expect(callback).toHaveBeenCalledTimes(3);
      } finally {
        if (interval && typeof interval.destroy === 'function') {
          interval.destroy();
        }

        Object.defineProperty(document, 'hidden', { value: originalHidden, configurable: true });
        vi.useRealTimers();
      }
    });
  });
});

describe('visibilityManager', () => {
  it('is globally available', () => {
    expect(typeof visibilityManager).toBe('object');
  });
});

describe('icon URL validation', () => {
  it('accepts relative and root-relative image paths and rejects unsafe schemes', () => {
    expect(validateIconUrl('images/icons/ai.svg')).toBe('images/icons/ai.svg');
    expect(validateIconUrl('/images/icons/ai.svg')).toBe('/images/icons/ai.svg');
    expect(validateIconUrl('./icons/app.png')).toBe('./icons/app.png');
    expect(validateIconUrl('https://example.com/icon.png')).toBe('https://example.com/icon.png');
    expect(validateIconUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
    expect(validateIconUrl('javascript:alert(1)')).toBeNull();
    expect(validateIconUrl('data:text/html,alert(1)')).toBeNull();
  });
});
