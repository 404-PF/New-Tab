import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/app-grid-storage.js');
  injectScript('src/core/app-grid-state.js');
});

beforeEach(() => {
  localStorage.clear();
});

describe('custom app URL security', () => {
  it('replaces unsafe persisted URL schemes with a harmless hash', () => {
    localStorage.setItem('customApps', JSON.stringify([
      { id: 'js', name: 'JavaScript', url: 'JaVaScRiPt:alert(1)' },
      { id: 'data', name: 'Data', url: 'data:text/html,<svg onload=alert(1)>' },
      { id: 'blob', name: 'Blob', url: 'blob:https://example.com/id' },
      { id: 'unknown', name: 'Unknown', url: 'custom:payload' },
      { id: 'protocol-relative', name: 'Protocol Relative', url: '//attacker.example/payload' },
      { id: 'safe-http', name: 'HTTP', url: 'http://example.com' },
      { id: 'safe-https', name: 'HTTPS', url: 'https://example.com' },
      { id: 'safe-hash', name: 'Hash', url: '#' },
      { id: 'safe-relative', name: 'Relative', url: '/internal/path' },
      { id: 'bare-host', name: 'Bare Host', url: 'example.org' }
    ]));

    const apps = AppGridStorage.loadCustomApps();

    expect(apps.map(app => app.url)).toEqual([
      '#', '#', '#', '#', '#',
      'http://example.com',
      'https://example.com',
      '#',
      '/internal/path',
      'https://example.org'
    ]);

    expect(JSON.parse(localStorage.getItem('customApps')).map(app => app.url)).toEqual(
      apps.map(app => app.url)
    );
  });

  it('rejects unsafe URLs on save instead of persisting them', () => {
    expect(AppGridStorage.saveCustomApps([
      { id: 'bad', name: 'Bad', url: 'javascript:alert(1)' }
    ])).toBe(false);
    expect(localStorage.getItem('customApps')).toBeNull();

    expect(AppGridStorage.saveCustomApps([
      { id: 'bad', name: 'Bad', url: 'DaTa:text/html,<script>alert(1)</script>' }
    ])).toBe(false);
    expect(localStorage.getItem('customApps')).toBeNull();
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
