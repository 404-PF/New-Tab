// src/core/utils.js - Common utility functions

(function () {
  'use strict';

  function createUrlValidationResult(status, url, message, originalInput) {
    return {
      status,
      url,
      message,
      originalInput
    };
  }

  function detectUrlInput(input) {
    const hasDot = input.includes('.');
    const isIP = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(input);
    const isLocalhost = /^localhost(:\d+)?$/.test(input.toLowerCase());
    const hasProtocol = /^https?:\/\//i.test(input);

    return {
      hasDot,
      isIP,
      isLocalhost,
      hasProtocol,
      looksLikeUrl: hasDot || isIP || isLocalhost || hasProtocol
    };
  }

  function normalizeUrlForParsing(input, hasProtocol) {
    if (hasProtocol) {
      return input;
    }

    return 'https://' + input;
  }

  function validateHostname(hostname, detection, url, originalInput) {
    if (!hostname) {
      return createUrlValidationResult('malformed', null, 'Invalid URL: missing hostname', originalInput);
    }

    const validHostnameChars = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
    if (!validHostnameChars.test(hostname) && !detection.isIP && !detection.isLocalhost) {
      return createUrlValidationResult('malformed', null, 'Invalid URL: hostname contains invalid characters', originalInput);
    }

    const isIpHostname = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const hostnameParts = hostname.split('.');
    if (hostnameParts.length > 1 && !detection.isIP && !isIpHostname) {
      const tld = hostnameParts[hostnameParts.length - 1];
      if (tld.length < 2) {
        return createUrlValidationResult('malformed', null, 'Invalid URL: top-level domain too short', originalInput);
      }
      return null;
    }

    if (!detection.isIP && !isIpHostname && !detection.isLocalhost && (url.port || url.pathname.length > 1)) {
      return createUrlValidationResult('malformed', null, 'Invalid URL: incomplete domain name', originalInput);
    }

    return null;
  }

  function validateIpv4Hostname(hostname, originalInput) {
    const ip = hostname.split('.');
    for (const part of ip) {
      const num = parseInt(part, 10);
      if (num > 255) {
        return createUrlValidationResult('malformed', null, 'Invalid URL: IP address out of range', originalInput);
      }
    }

    return null;
  }

  // URL Validation Utility
  // Returns an object with status, url, message, and originalInput
  function validateUrl(input) {
    const originalInput = input.trim();
    
    if (!originalInput) {
      return createUrlValidationResult('undetectable', null, 'Please enter a URL or search query', input);
    }

    const detection = detectUrlInput(originalInput);
    
    if (!detection.looksLikeUrl) {
      return createUrlValidationResult('undetectable', null, 'This URL appears to be invalid. Press Enter to Create', originalInput);
    }

    const urlToParse = normalizeUrlForParsing(originalInput, detection.hasProtocol);

    try {
      const url = new URL(urlToParse);
      const hostname = url.hostname;

      const hostnameValidation = validateHostname(hostname, detection, url, originalInput);
      if (hostnameValidation) {
        return hostnameValidation;
      }

      const isIpHostname = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
      if (isIpHostname) {
        const ipValidation = validateIpv4Hostname(hostname, originalInput);
        if (ipValidation) {
          return ipValidation;
        }
      }

      return createUrlValidationResult('valid', url, 'Valid URL', originalInput);

    } catch (e) {
      return createUrlValidationResult('malformed', null, 'Malformed URL: ' + (e.message || 'could not parse'), originalInput);
    }
  }

  function translateValidationMessage(message) {
    if (!message) return '';

    const translateFn = (window.i18n && window.i18n.t) ? window.i18n.t : (key => key);

    const messageMap = {
      'Please enter a URL or search query': 'validationPleaseEnter',
      'This URL appears to be invalid. Press Enter to Create': 'validationInvalidAppears',
      'Invalid URL: missing hostname': 'validationMissingHostname',
      'Invalid URL: hostname contains invalid characters': 'validationInvalidChars',
      'Invalid URL: top-level domain too short': 'validationTldTooShort',
      'Invalid URL: incomplete domain name': 'validationIncompleteDomain',
      'Invalid URL: IP address out of range': 'validationIpOutOfRange',
      'Valid URL': 'validationValid'
    };

    if (message.startsWith('Malformed URL:')) {
      return translateFn('validationMalformed');
    }

    const key = messageMap[message];
    return key ? translateFn(key) : message;
  }

  // Check if input is a valid URL (simple boolean version)
  function isValidUrl(string) {
    const result = validateUrl(string);
    return result.status === 'valid';
  }

  // Check if input looks like a URL but is malformed
  function isMalformedUrl(string) {
    const result = validateUrl(string);
    return result.status === 'malformed';
  }

  // Check if input doesn't look like a URL at all
  function isSearchQuery(string) {
    const result = validateUrl(string);
    return result.status === 'undetectable';
  }

  // Get the normalized URL (with protocol)
  function normalizeUrl(input) {
    const result = validateUrl(input);
    if (result.status === 'valid' && result.url) {
      return result.url.href;
    }
    return null;
  }

  // Icon caching utilities
  const iconCache = {
    // Fetch an icon and convert to data URL
    async fetchIconAsDataUrl(iconUrl) {
      if (!iconUrl || typeof iconUrl !== 'string' || (!iconUrl.startsWith('http') && !iconUrl.startsWith('data:'))) {
        return null;
      }
      try {
        const response = await fetch(iconUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.warn('Failed to fetch icon:', iconUrl, error);
        return null;
      }
    },

    // Save icon to localStorage cache
    saveIconToCache(iconUrl, dataUrl) {
      if (!dataUrl) return false;
      try {
        const cacheKey = `iconCache_${btoa(encodeURIComponent(iconUrl))}`;
        const cacheEntry = {
          url: iconUrl,
          dataUrl: dataUrl,
          timestamp: Date.now()
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
        return true;
      } catch (error) {
        if (error.name === 'QuotaExceededError') {
          console.warn('localStorage quota exceeded, cannot cache icon');
        } else {
          console.warn('Failed to cache icon:', error);
        }
        return false;
      }
    },

    // Load icon from cache
    loadIconFromCache(iconUrl) {
      try {
        const cacheKey = `iconCache_${btoa(encodeURIComponent(iconUrl))}`;
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return null;

        const entry = JSON.parse(cached);
        // Check if cache is stale (older than 7 days)
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - entry.timestamp > oneWeek) {
          localStorage.removeItem(cacheKey);
          return null;
        }
        return entry.dataUrl;
      } catch (error) {
        console.warn('Failed to load cached icon:', error);
        return null;
      }
    },

    // Get icon URL with caching
    async getIconWithCache(iconUrl) {
      // Check cache first
      const cached = this.loadIconFromCache(iconUrl);
      if (cached) return cached;

      // Fetch and cache
      const dataUrl = await this.fetchIconAsDataUrl(iconUrl);
      if (dataUrl) {
        this.saveIconToCache(iconUrl, dataUrl);
      }
      return dataUrl || iconUrl; // Return original URL if caching fails
    },

    // Check if we're offline
    isOffline() {
      return !navigator.onLine;
    },

    // Get icon URL with offline support
    async getIconUrl(iconUrl) {
      // If offline, try cache
      if (this.isOffline()) {
        const cached = this.loadIconFromCache(iconUrl);
        return cached || iconUrl; // Return cached or original
      }

      // Online: use cache with network fallback
      return this.getIconWithCache(iconUrl);
    },

    // Cache icons for existing apps
    async cacheExistingAppIcons() {
      try {
        const apps = window.AppGridState.getCustomApps();
        const appSnapshotsById = new Map(
          apps.map((app) => [app.id, {
            url: app.url,
            icon: app.icon
          }])
        );
        const promises = apps.map(async (app) => {
          if (app.icon && !app.cachedIcon) {
            try {
              const cachedIcon = await this.getIconWithCache(app.icon);
              if (cachedIcon && cachedIcon !== app.icon) {
                app.cachedIcon = cachedIcon;
              }
            } catch (error) {
              console.warn(`Failed to cache icon for ${app.name}:`, error);
            }
          }
          return app;
        });

        const updatedApps = await Promise.all(promises);
        const cachedIconsById = new Map(
          updatedApps
            .filter((app) => app.cachedIcon)
            .map((app) => [app.id, app.cachedIcon])
        );

        window.AppGridState.updateCustomApps((latestApps) => {
          return latestApps.map((app) => {
            const cachedIcon = cachedIconsById.get(app.id);
            const snapshot = appSnapshotsById.get(app.id);
            if (
              !cachedIcon ||
              !snapshot ||
              app.cachedIcon ||
              app.url !== snapshot.url ||
              app.icon !== snapshot.icon
            ) {
              return app;
            }

            return {
              ...app,
              cachedIcon
            };
          });
        });
        return updatedApps;
      } catch (error) {
        console.warn('Failed to cache existing app icons:', error);
        return [];
      }
    }
  };

  // Page Visibility Manager - handles background tab optimizations
  const visibilityManager = {
    isVisible: !document.hidden,
    callbacks: [],

    syncVisibility() {
      const wasVisible = this.isVisible;
      this.isVisible = !document.hidden;

      if (wasVisible !== this.isVisible) {
        // Snapshot the callback list so unsubscribe/remove logic during one
        // handler does not skip the next subscriber.
        this.callbacks.slice().forEach(cb => cb(this.isVisible));
      }
    },

    init() {
      const handleVisibilityChange = () => this.syncVisibility();

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleVisibilityChange);
      window.addEventListener('pageshow', handleVisibilityChange);
    },

    onChange(callback) {
      this.callbacks.push(callback);
      return () => {
        const index = this.callbacks.indexOf(callback);
        if (index > -1) this.callbacks.splice(index, 1);
      };
    },

    whenVisible(callback) {
      if (this.isVisible) callback();
      else {
        const unsubscribe = this.onChange((visible) => {
          if (visible) {
            callback();
            unsubscribe();
          }
        });
      }
    }
  };

  // Visibility-aware interval manager
  class VisibilityInterval {
    constructor(callback, interval, runImmediately = false) {
      this.callback = callback;
      this.interval = interval;
      this.intervalId = null;
      this.isRunning = false;

      if (runImmediately) callback();

      this.start();

      // Subscribe to visibility changes
      this.unsubscribe = visibilityManager.onChange((visible) => {
        if (visible) {
          this.start();
          // Sync immediately when becoming visible
          callback();
        } else {
          this.stop();
        }
      });
    }

    start() {
      if (this.isRunning || !visibilityManager.isVisible) return;
      this.isRunning = true;
      this.intervalId = setInterval(() => {
        try {
          this.callback();
        } catch (error) {
          console.error('VisibilityInterval callback error:', error);
        }
      }, this.interval);
    }

    stop() {
      this.isRunning = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }

    destroy() {
      this.stop();
      if (this.unsubscribe) this.unsubscribe();
    }
  }

  // Initialize visibility manager
  visibilityManager.init();

  // Validate icon URLs to reject javascript: and other unsafe schemes
  function validateIconUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();

    // If the value contains a scheme (eg. "http:", "javascript:") only
    // allow the safe schemes we explicitly permit. This rejects dangerous
    // pseudo-schemes like "javascript:" while allowing http(s) and data images.
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
    if (hasScheme) {
      if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
        return trimmed;
      }
      return null;
    }

    // No scheme -> treat as a relative or root-relative path. Allow it if it
    // doesn't contain suspicious characters (whitespace or markup characters).
    // This permits values like "images/icon.svg", "./icons/app.png" and
    // "/images/icons/foo.svg" which are common for bundled extension assets.
    if (/^[^\s<>"']+$/.test(trimmed)) {
      return trimmed;
    }

    return null;
  }

  // Escape HTML entities to prevent XSS
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c] || c));
  }

  function useAppIconFallback(image) {
    if (!image) return;
    image.src = 'images/icons/globe.svg';
  }

  document.addEventListener('error', function (event) {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.hasAttribute('data-app-icon')) {
      image.removeAttribute('data-app-icon');
      useAppIconFallback(image);
    }
  }, true);

  // Make utilities available globally
  window.visibilityManager = visibilityManager;
  window.VisibilityInterval = VisibilityInterval;
  window.validateUrl = validateUrl;
  window.isValidUrl = isValidUrl;
  window.isMalformedUrl = isMalformedUrl;
  window.isSearchQuery = isSearchQuery;
  window.normalizeUrl = normalizeUrl;
  window.iconCache = iconCache;
  window.validateIconUrl = validateIconUrl;
  window.escapeHtml = escapeHtml;
  window.translateValidationMessage = translateValidationMessage;

})();
