import { injectScript } from './helpers/inject-script.js';
import vm from 'vm';

const SUPPORTED_LANGUAGE_CODES = ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru'];

describe('motto data', () => {
  let mottoData;

  beforeAll(() => {
    const context = vm.createContext({});
    injectScript('src/data/motto.js', context);
    injectScript('tests/helpers/expose-motto-data.js', context);
    mottoData = context.mottoData;
  });

  it('provides non-empty English and Chinese motto collections', () => {
    expect(mottoData.en.length).toBeGreaterThan(0);
    expect(mottoData.zh.length).toBeGreaterThan(0);
    expect(mottoData.en.every(motto => typeof motto === 'string' && motto.length > 0)).toBe(true);
  });

  it('defines a motto collection for every supported UI language', () => {
    SUPPORTED_LANGUAGE_CODES.forEach(code => {
      expect(Array.isArray(mottoData[code]), `missing mottos for ${code}`).toBe(true);
      expect(mottoData[code].length).toBe(66);
      expect(
        mottoData[code].every(motto => typeof motto === 'string' && motto.length > 0),
        `empty motto entry in ${code}`
      ).toBe(true);
    });
  });

  it('keeps every locale aligned with the English collection', () => {
    SUPPORTED_LANGUAGE_CODES.forEach(code => {
      expect(mottoData[code].length, `length mismatch for ${code}`).toBe(mottoData.en.length);
    });
  });

  it('formats every entry with the attribution separator', () => {
    SUPPORTED_LANGUAGE_CODES.forEach(code => {
      mottoData[code].forEach(motto => {
        expect(motto, `bad separator in ${code}: ${motto}`).toContain('————');
      });
    });
  });
});
