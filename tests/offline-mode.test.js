import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/ai/offline-mode.js');
});

describe('OfflineMode', () => {
  it('answers math, unit conversion, and knowledge-base requests without a network', () => {
    expect(OfflineMode.getResponse('5 + 3')).toMatchObject({ success: true, mode: 'offline' });
    expect(OfflineMode.getResponse('5 + 3').content).toContain('8');
    expect(OfflineMode.getResponse('10 km to mi').content).toMatch(/6\.21/);
    expect(OfflineMode.getResponse('help').content.toLowerCase()).toContain('offline');
  });

  it('uses the active language for offline acknowledgements', () => {
    const originalI18n = window.i18n;
    window.i18n = { ...(originalI18n || {}), currentLanguage: () => 'zh' };

    try {
      expect(OfflineMode.getAcknowledgment().content).toContain('离线');
    } finally {
      window.i18n = originalI18n;
    }
  });
});
