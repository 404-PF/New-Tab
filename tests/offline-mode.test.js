import { vi } from 'vitest';
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

  it('uses the platform CSPRNG when selecting a fact', () => {
    const getRandomValues = vi.fn(values => {
      values[0] = 0;
      return values;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    try {
      expect(OfflineMode.getRandomFact('en')).toContain('The human brain');
      expect(getRandomValues).toHaveBeenCalledWith(expect.any(Uint32Array));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports division by zero instead of falling back', () => {
    expect(OfflineMode.parseMath('5 / 0')).toContain('division by zero');
    expect(OfflineMode.getResponse('5 / 0').content).toContain('division by zero');
    expect(OfflineMode.getResponse('5/0').content).toContain('division by zero');
    expect(OfflineMode.getResponse('0 / 0').content).toContain('division by zero');
  });

  it('does not match the greeting key inside ordinary prose', () => {
    const proseInputs = ['which option is better', 'something', 'highlight', 'this is a test'];

    proseInputs.forEach(input => {
      const result = OfflineMode.getResponse(input);
      expect(result).toMatchObject({ success: true, mode: 'offline' });
      expect(result.content).not.toContain('Hi there!');
      expect(result.content).toContain('couldn\'t process');
      expect(OfflineMode.matchPattern(input).matched).toBe(false);
    });
  });

  it('still greets on exact greeting keys', () => {
    expect(OfflineMode.getResponse('hi').content).toContain('Hi there!');
    expect(OfflineMode.getResponse('HI').content).toContain('Hi there!');
    expect(OfflineMode.getResponse('hello').content).toContain('Hello!');
  });

  it('still partial-matches Chinese keys when the active language is zh', () => {
    const originalI18n = window.i18n;
    window.i18n = { ...(originalI18n || {}), currentLanguage: () => 'zh' };

    try {
      const help = OfflineMode.getResponse('请帮助我');
      expect(help).toMatchObject({ success: true, mode: 'offline' });
      expect(help.content).toContain('以下是我能帮助的');
      expect(OfflineMode.getResponse('现在几点了').content).toContain('现在是');
    } finally {
      window.i18n = originalI18n;
    }
  });
});
