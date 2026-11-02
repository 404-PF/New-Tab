import { existsSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/data/backgrounds.js');
});

function fileAssetPaths() {
  return window._backgrounds
    .flatMap(background => [background.url, background.thumb])
    .filter(asset => typeof asset === 'string' && !asset.startsWith('data:'));
}

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

describe('built-in background asset paths', () => {
  it('keeps every wallpaper and thumbnail inside the backgrounds folder', () => {
    const assets = fileAssetPaths();
    expect(assets.length).toBeGreaterThan(0);
    assets.forEach((asset) => {
      expect(asset.startsWith('backgrounds/')).toBe(true);
    });
  });

  it('resolves every wallpaper and thumbnail to a file on disk', () => {
    fileAssetPaths().forEach((asset) => {
      expect(existsSync(resolve(process.cwd(), asset))).toBe(true);
    });
  });

  it('keeps live wallpapers under backgrounds/live_backgrounds/', () => {
    const videoUrls = window._getVideoBackgrounds().map(background => background.url);
    expect(videoUrls.length).toBeGreaterThan(0);
    videoUrls.forEach((url) => {
      expect(url.startsWith('backgrounds/live_backgrounds/')).toBe(true);
    });
  });

  it('keeps thumbnails under backgrounds/thumbs/', () => {
    const thumbs = window._backgrounds
      .map(background => background.thumb)
      .filter(thumb => !thumb.startsWith('data:'));
    expect(thumbs.length).toBeGreaterThan(0);
    thumbs.forEach((thumb) => {
      expect(thumb.startsWith('backgrounds/thumbs/')).toBe(true);
    });
  });

  // Keep built-in asset names free of spaces (see issue #1094) so the
  // filenames match the renamed live wallpapers and avoid encoding edge cases.
  it('keeps asset paths free of raw spaces', () => {
    const assets = fileAssetPaths();
    expect(assets.length).toBeGreaterThan(0);
    assets.forEach((asset) => {
      expect(asset).not.toContain(' ');
    });
  });
});
