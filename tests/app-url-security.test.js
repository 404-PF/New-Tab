import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/core/app-grid-storage.js');
  injectScript('src/core/app-grid-state.js');
});

beforeEach(() => {
  localStorage.clear();
});

describe('custom app URL security', () => {
  it('replaces unsafe and invalid persisted URL values with a harmless hash', () => {
    localStorage.setItem('customApps', JSON.stringify([
      { id: 'js', name: 'JavaScript', url: 'JaVaScRiPt:alert(1)' },
      { id: 'data', name: 'Data', url: 'data:text/html,<svg onload=alert(1)>' },
      { id: 'blob', name: 'Blob', url: 'blob:https://example.com/id' },
      { id: 'unknown', name: 'Unknown', url: 'custom:payload' },
      { id: 'protocol-relative', name: 'Protocol Relative', url: '//attacker.example/payload' },
      { id: 'backslash-authority', name: 'Backslash Authority', url: '/\\attacker.example/path' },
      { id: 'bare-backslash-authority', name: 'Bare Backslash Authority', url: '\\attacker.example/path' },
      { id: 'https-backslash', name: 'HTTPS Backslash', url: 'https:\\attacker.example/path' },
      { id: 'invalid-array', name: 'Invalid Array', url: ['javascript:alert(1)'] },
      { id: 'invalid-null', name: 'Invalid Null', url: null },
      { id: 'safe-http', name: 'HTTP', url: 'http://example.com' },
      { id: 'safe-https', name: 'HTTPS', url: 'https://example.com' },
      { id: 'safe-hash', name: 'Hash', url: '#' },
      { id: 'safe-relative', name: 'Relative', url: '/internal/path' },
      { id: 'safe-mailto', name: 'Mailto', url: 'MaIlTo:test@example.com' },
      { id: 'safe-tel', name: 'Tel', url: 'TEL:+123456789' },
      { id: 'safe-geo', name: 'Geo', url: 'geo:37.786971,-122.399677' },
      { id: 'safe-sip', name: 'SIP', url: 'sip:user@example.com' },
      { id: 'safe-magnet', name: 'Magnet', url: 'magnet:?xt=urn:btih:example' },
      { id: 'bare-host', name: 'Bare Host', url: 'example.org' }
    ]));

    const apps = AppGridStorage.loadCustomApps();

    expect(apps.map(app => app.url)).toEqual([
      '#', '#', '#', '#', '#', '#', '#', '#', '#', '#',
      'http://example.com',
      'https://example.com',
      '#',
      '/internal/path',
      'MaIlTo:test@example.com',
      'TEL:+123456789',
      'geo:37.786971,-122.399677',
      'sip:user@example.com',
      'magnet:?xt=urn:btih:example',
      'https://example.org'
    ]);

    expect(window.getSafeCustomAppUrl('httpbin.org:8080')).toBe('https://httpbin.org:8080');
    expect(window.getSafeCustomAppUrl('/\\attacker.example/path')).toBe('#');

    expect(JSON.parse(localStorage.getItem('customApps')).map(app => app.url)).toEqual(
      apps.map(app => app.url)
    );
  });

  it('rejects unsafe and invalid URLs on save instead of persisting them', () => {
    for (const url of [
      'javascript:alert(1)',
      'DaTa:text/html,<script>alert(1)</script>',
      ['javascript:alert(1)'],
      null,
      '\\attacker.example/path'
    ]) {
      expect(AppGridStorage.saveCustomApps([
        { id: 'bad', name: 'Bad', url }
      ])).toBe(false);
      expect(localStorage.getItem('customApps')).toBeNull();
    }
  });

  it('preserves known-safe custom schemes on save', () => {
    const apps = [
      { id: 'mail', name: 'Mail', url: 'mailto:test@example.com' },
      { id: 'tel', name: 'Tel', url: 'tel:+123456789' },
      { id: 'geo', name: 'Geo', url: 'geo:37.786971,-122.399677' },
      { id: 'sip', name: 'SIP', url: 'sip:user@example.com' },
      { id: 'magnet', name: 'Magnet', url: 'magnet:?xt=urn:btih:example' }
    ];

    expect(AppGridStorage.saveCustomApps(apps)).toBe(true);
    expect(JSON.parse(localStorage.getItem('customApps'))).toEqual(apps);
  });

  it('prevents AppGridState.addApp from persisting unsafe app URLs', () => {
    expect(AppGridState.addApp({
      id: 'unsafe-app',
      name: 'Unsafe App',
      url: 'JaVaScRiPt:alert(document.domain)'
    })).toBe(false);

    expect(AppGridState.getCustomApps()).toEqual([]);
    expect(AppGridState.getOrder()).toBeNull();
  });
});
