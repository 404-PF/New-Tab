import { injectScript } from './helpers/inject-script.js';
import vm from 'vm';

describe('motto data', () => {
  let mottoData;
  let supportedLanguageCodes;

  beforeAll(() => {
    // Read the UI language codes from the same source the app uses so a newly
    // added language cannot ship without a motto collection check.
    injectScript('src/core/languages.js');
    supportedLanguageCodes = window.i18n.getSupportedLanguages().map(language => language.code);

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
    supportedLanguageCodes.forEach(code => {
      expect(Array.isArray(mottoData[code]), `missing mottos for ${code}`).toBe(true);
      expect(mottoData[code].length).toBe(66);
      expect(
        mottoData[code].every(motto => typeof motto === 'string' && motto.length > 0),
        `empty motto entry in ${code}`
      ).toBe(true);
    });
  });

  it('keeps every locale aligned with the English collection', () => {
    supportedLanguageCodes.forEach(code => {
      expect(mottoData[code].length, `length mismatch for ${code}`).toBe(mottoData.en.length);
      if (code !== 'en') {
        mottoData[code].forEach((motto, index) => {
          expect(motto, `${code} motto ${index} is still English`).not.toBe(mottoData.en[index]);
        });
      }
    });
  });

  it('formats every entry with the attribution separator', () => {
    supportedLanguageCodes.forEach(code => {
      mottoData[code].forEach(motto => {
        expect(motto, `bad separator in ${code}: ${motto}`).toContain('————');
      });
    });
  });
});
