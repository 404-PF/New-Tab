import { injectScript } from './helpers/inject-script.js';
import vm from 'vm';

describe('motto data', () => {
  it('provides non-empty English and Chinese motto collections', () => {
    const context = vm.createContext({});
    injectScript('src/data/motto.js', context);
    injectScript('globalThis.mottoData = mottos;', context);
    const mottoData = context.mottoData;
    expect(mottoData.en.length).toBeGreaterThan(0);
    expect(mottoData.zh.length).toBeGreaterThan(0);
    expect(mottoData.en.every(motto => typeof motto === 'string' && motto.length > 0)).toBe(true);
  });
});
