import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/data/backgrounds.js');
});

describe('built-in backgrounds', () => {
  it('exposes distinct static, video, and interactive definitions with lookup support', () => {
    expect(window._backgrounds.length).toBeGreaterThan(0);
    expect(window._getStaticBackgrounds().every(background => !background.type)).toBe(true);
    expect(window._getVideoBackgrounds().every(background => background.type === 'video')).toBe(true);
    expect(window._getInteractiveBackgrounds().every(background => background.type === 'interactive')).toBe(true);
    const first = window._backgrounds[0];
    expect(window._findBackgroundUrlById(first.id)).toBe(first.url);
  });
});
