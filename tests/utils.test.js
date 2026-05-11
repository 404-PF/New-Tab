import { describe, it, expect, beforeAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
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
});

describe('VisibilityInterval', () => {
  it('is globally available', () => {
    expect(typeof VisibilityInterval).toBe('function');
  });
});

describe('visibilityManager', () => {
  it('is globally available', () => {
    expect(typeof visibilityManager).toBe('object');
  });
});
