import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/data/custom-backgrounds.js');
});

describe('custom backgrounds', () => {
  it('exposes management helpers and recognizes only custom IDs', () => {
    expect(window._customBackgrounds.isCustom('custom_123')).toBe(true);
    expect(window._customBackgrounds.isCustom('Beach - Australia')).toBe(false);
    expect(window._customBackgrounds.getAll).toBeTypeOf('function');
    expect(window._customBackgrounds.revokeAll).toBeTypeOf('function');
  });
});
