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

  it.each([
    ['5 mm to cm', '5 mm = 0.5 cm'],
    ['10 yd to m', '10 yd = 9.144 m'],
    ['1 mg to g', '1 mg = 0.001 g'],
    ['1 ton to kg', '1 ton = 907.1847 kg'],
    ['5 毫米 to 厘米', '5 mm = 0.5 cm'],
    ['10 码 to 米', '10 yd = 9.144 m'],
    ['1 毫克 to 克', '1 mg = 0.001 g'],
    ['1 吨 to 千克', '1 ton = 907.1847 kg'],
    ['1 mm to km', '1 mm = 0.000001 km'],
    ['1 mg to ton', '1 mg = 1.10231e-9 ton'],
    ['100 F to C', '100°F = 37.78°C']
  ])('converts %s offline', (query, content) => {
    expect(OfflineMode.getResponse(query)).toEqual({ success: true, content, mode: 'offline' });
  });

  it.each([
    ['5 km to kg', 'km', 'kg'],
    ['5 km to constructor', 'km', 'constructor'],
    ['5 km to unknown', 'km', 'unknown'],
    ['5 公里 to unknown', '公里', 'unknown']
  ])('reports %s as a failure with a useful error', (query, from, to) => {
    const result = OfflineMode.getResponse(query);
    expect(result).toMatchObject({ success: false, mode: 'offline' });
    expect(result.error).toContain(`can't convert from ${from} to ${to}`);
    expect(result.content).toBe(result.error);
    expect(result.content).not.toContain('NaN');
  });

  it('keeps non-conversion queries available to the knowledge base', () => {
    expect(OfflineMode.parseConversion('help')).toBeNull();
    expect(OfflineMode.getResponse('help').content).toContain('offline');
  });

  it.each(['3 people in room', '5 constructor to kg'])(
    'leaves %s to the ordinary fallback', query => {
      expect(OfflineMode.parseConversion(query)).toBeNull();
      expect(OfflineMode.getResponse(query)).toMatchObject({ success: true, mode: 'offline' });
      expect(OfflineMode.getResponse(query).content).toContain('couldn\'t process that specific request');
    }
  );

  it('preserves existing knowledge-base matching for unknown source units', () => {
    expect(OfflineMode.parseConversion('5 days to go')).toBeNull();
    expect(OfflineMode.getResponse('5 days to go')).toEqual(OfflineMode.getResponse('day'));
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
});
