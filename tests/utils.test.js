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

  it.each([
    ['https://localhost:5173/preview', 'localhost'],
    ['http://localhost/preview', 'localhost'],
    ['http://127.0.0.1:8080/app/', '127.0.0.1']
  ])('validates localhost/loopback %s with path', (url, expectedHostname) => {
    const result = validateUrl(url);
    expect(result.status).toBe('valid');
    expect(result.url.hostname).toBe(expectedHostname);
  });

  it('rejects single-label hostname with path as incomplete domain', () => {
    const result = validateUrl('https://example/foo');
    expect(result.status).toBe('malformed');
    expect(result.message).toBe('Invalid URL: incomplete domain name');
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
    AppGridStorage.saveOrder(['app1', 'app2']);

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

describe('iconCache pruning', () => {
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const cachePrefix = 'iconCache_';
  const cacheKeyFor = (url) => `${cachePrefix}${btoa(encodeURIComponent(url))}`;

  const seedEntry = (url, timestamp) => {
    localStorage.setItem(
      cacheKeyFor(url),
      JSON.stringify({ url, dataUrl: 'data:image/png;base64,icon', timestamp })
    );
  };

  const countIconCacheKeys = () => {
    let count = 0;
    for (let index = 0; index < localStorage.length; index += 1) {
      if (localStorage.key(index).startsWith(cachePrefix)) count += 1;
    }
    return count;
  };

  it('removes stale and corrupt entries but keeps fresh and non-cache keys', () => {
    seedEntry('https://fresh.example', Date.now());
    seedEntry('https://stale.example', Date.now() - oneWeek - 1);
    localStorage.setItem(cacheKeyFor('https://corrupt.example'), '{not valid json');
    localStorage.setItem('theme', 'dark');

    iconCache.pruneIconCache();

    expect(localStorage.getItem(cacheKeyFor('https://fresh.example'))).not.toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://stale.example'))).toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://corrupt.example'))).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('drops structurally invalid entries even when the JSON parses', () => {
    localStorage.setItem(
      cacheKeyFor('https://missing-url.example'),
      JSON.stringify({ dataUrl: 'data:image/png;base64,icon', timestamp: Date.now() })
    );
    localStorage.setItem(
      cacheKeyFor('https://missing-dataurl.example'),
      JSON.stringify({ url: 'https://missing-dataurl.example', timestamp: Date.now() })
    );
    localStorage.setItem(
      cacheKeyFor('https://nonstring-url.example'),
      JSON.stringify({ url: 42, dataUrl: 'data:image/png;base64,icon', timestamp: Date.now() })
    );
    localStorage.setItem(
      cacheKeyFor('https://infinite-timestamp.example'),
      '{"url":"https://infinite-timestamp.example","dataUrl":"data:image/png;base64,icon","timestamp":1e999}'
    );

    iconCache.pruneIconCache();

    expect(localStorage.getItem(cacheKeyFor('https://missing-url.example'))).toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://missing-dataurl.example'))).toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://nonstring-url.example'))).toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://infinite-timestamp.example'))).toBeNull();
  });

  it('keeps only the newest entries when the count cap is exceeded', () => {
    for (let i = 0; i < 105; i += 1) {
      // app-0 is oldest, app-104 is newest; all well within the TTL
      seedEntry(`https://app-${i}.example`, Date.now() - (104 - i) * 1000);
    }

    iconCache.pruneIconCache();

    // The 5 oldest entries (app-0..app-4) are evicted, the 100 newest remain
    expect(localStorage.getItem(cacheKeyFor('https://app-0.example'))).toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://app-4.example'))).toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://app-5.example'))).not.toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://app-104.example'))).not.toBeNull();
    expect(countIconCacheKeys()).toBe(100);
  });

  it('does not sweep the cache when saving a new icon', () => {
    seedEntry('https://stale.example', Date.now() - oneWeek - 1);

    expect(iconCache.saveIconToCache('https://new.example', 'data:image/png;base64,new')).toBe(true);

    // The write path stays O(1): stale entries are left for the page-load sweep
    expect(localStorage.getItem(cacheKeyFor('https://new.example'))).not.toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://stale.example'))).not.toBeNull();
  });

  it('prunes stale entries when saving hits the storage quota', () => {
    seedEntry('https://stale.example', Date.now() - oneWeek - 1);
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    try {
      expect(iconCache.saveIconToCache('https://new.example', 'data:image/png;base64,new')).toBe(false);
      expect(localStorage.getItem(cacheKeyFor('https://stale.example'))).toBeNull();
    } finally {
      setItem.mockRestore();
    }
  });

  it('prunes once per page load through cacheExistingAppIcons', async () => {
    seedEntry('https://stale.example', Date.now() - oneWeek - 1);

    await iconCache.cacheExistingAppIcons();

    expect(localStorage.getItem(cacheKeyFor('https://stale.example'))).toBeNull();
  });

  it('serves a fresh valid entry and evicts a stale one on read', () => {
    seedEntry('https://fresh.example', Date.now());
    seedEntry('https://stale.example', Date.now() - oneWeek - 1);

    expect(iconCache.loadIconFromCache('https://fresh.example')).toBe('data:image/png;base64,icon');
    // The stale entry is evicted on the read path, not merely skipped
    expect(iconCache.loadIconFromCache('https://stale.example')).toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://stale.example'))).toBeNull();
  });

  it('does not serve a JSON-parseable entry with a non-string dataUrl', () => {
    localStorage.setItem(
      cacheKeyFor('https://numeric-dataurl.example'),
      JSON.stringify({ url: 'https://numeric-dataurl.example', dataUrl: 42, timestamp: Date.now() })
    );
    localStorage.setItem(
      cacheKeyFor('https://object-dataurl.example'),
      JSON.stringify({ url: 'https://object-dataurl.example', dataUrl: { nope: true }, timestamp: Date.now() })
    );

    expect(iconCache.loadIconFromCache('https://numeric-dataurl.example')).toBeNull();
    expect(iconCache.loadIconFromCache('https://object-dataurl.example')).toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://numeric-dataurl.example'))).toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://object-dataurl.example'))).toBeNull();
  });

  it('does not let a non-finite timestamp bypass the TTL on read', () => {
    localStorage.setItem(
      cacheKeyFor('https://nan-timestamp.example'),
      JSON.stringify({ url: 'https://nan-timestamp.example', dataUrl: 'data:image/png;base64,icon', timestamp: 'not-a-number' })
    );

    expect(iconCache.loadIconFromCache('https://nan-timestamp.example')).toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://nan-timestamp.example'))).toBeNull();
  });

  it('rejects an entry whose stored url does not match the requested one', () => {
    localStorage.setItem(
      cacheKeyFor('https://requested.example'),
      JSON.stringify({ url: 'https://different.example', dataUrl: 'data:image/png;base64,icon', timestamp: Date.now() })
    );

    expect(iconCache.loadIconFromCache('https://requested.example')).toBeNull();
    expect(localStorage.getItem(cacheKeyFor('https://requested.example'))).toBeNull();
  });
});

describe('VisibilityInterval', () => {
  it('is globally available', () => {
    expect(typeof VisibilityInterval).toBe('function');
  });

  it('continues running after a callback error', () => {
    vi.useFakeTimers();

    const error = new Error('temporary failure');
    const callback = vi.fn()
      .mockImplementationOnce(() => {
        throw error;
      });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const interval = new VisibilityInterval(callback, 1000);

    try {
      vi.advanceTimersByTime(2000);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(consoleError).toHaveBeenCalledWith('VisibilityInterval callback error:', error);
      expect(interval.isRunning).toBe(true);
    } finally {
      interval.destroy();
      consoleError.mockRestore();
      vi.useRealTimers();
    }
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

      const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
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

        if (originalHiddenDescriptor) {
          Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
        } else {
          delete document.hidden;
        }
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
