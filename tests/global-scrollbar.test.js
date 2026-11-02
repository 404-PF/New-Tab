// tests/global-scrollbar.test.js
// #989: one slim scroll-bar treatment for in-component scrollable
// surfaces, sourced from :root custom properties in css/core.css
// instead of the three divergent per-component blocks that used to live
// in css/app.css and css/features.css. #1098: the rules are scoped to
// body and its descendants so the dashboard viewport scroller (html)
// keeps the browser's native scrollbar.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CORE_CSS_PATH = resolve(process.cwd(), 'css/core.css');
const FEATURES_CSS_PATH = resolve(process.cwd(), 'css/features.css');
const APP_CSS_PATH = resolve(process.cwd(), 'css/app.css');
const GLASS_CSS_PATH = resolve(process.cwd(), 'css/glass.css');
const SHELL_CSS_PATH = resolve(process.cwd(), 'css/shell.css');

const CORE_CSS = readFileSync(CORE_CSS_PATH, 'utf-8');
const FEATURES_CSS = readFileSync(FEATURES_CSS_PATH, 'utf-8');
const APP_CSS = readFileSync(APP_CSS_PATH, 'utf-8');

describe('Shared slim scrollbars (#989, #1098)', () => {
  it('defines the scrollbar tokens once on :root from the AI chat reference', () => {
    const root = CORE_CSS.match(/:root\s*\{([^}]*)\}/);
    expect(root, ':root block in css/core.css').toBeTruthy();
    const body = root[1];

    expect(body).toMatch(/--scrollbar-size:\s*6px/);
    expect(body).toMatch(/--scrollbar-radius:\s*3px/);
    expect(body).toMatch(/--scrollbar-track:\s*transparent/);
    expect(body).toMatch(/--scrollbar-thumb:\s*rgba\(255, 255, 255, 0\.2\)/);
    expect(body).toMatch(/--scrollbar-thumb-hover:\s*rgba\(255, 255, 255, 0\.3\)/);
  });

  it('styles component surfaces with one scoped rule set reading the variables', () => {
    expect(CORE_CSS).toMatch(/body,\s*body \*\s*\{\s*scrollbar-width:\s*thin;\s*scrollbar-color:\s*var\(--scrollbar-thumb\)\s+var\(--scrollbar-track\);/);
    expect(CORE_CSS).toMatch(/body::-webkit-scrollbar,\s*body \*::-webkit-scrollbar\s*\{\s*width:\s*var\(--scrollbar-size\);\s*height:\s*var\(--scrollbar-size\);/);
    expect(CORE_CSS).toMatch(/body::-webkit-scrollbar-track,\s*body \*::-webkit-scrollbar-track\s*\{\s*background:\s*var\(--scrollbar-track\);/);
    expect(CORE_CSS).toMatch(/body::-webkit-scrollbar-thumb,\s*body \*::-webkit-scrollbar-thumb\s*\{\s*background:\s*var\(--scrollbar-thumb\);\s*border-radius:\s*var\(--scrollbar-radius\);/);
    expect(CORE_CSS).toMatch(/body::-webkit-scrollbar-thumb:hover,\s*body \*::-webkit-scrollbar-thumb:hover\s*\{\s*background:\s*var\(--scrollbar-thumb-hover\);/);
  });

  it('mirrors the dark values to black-on-light in the light theme', () => {
    const light = FEATURES_CSS.match(/body\.light-theme\s*\{([^}]*)\}/);
    expect(light, 'body.light-theme block in css/features.css').toBeTruthy();
    const body = light[1];

    expect(body).toMatch(/--scrollbar-thumb:\s*rgba\(0, 0, 0, 0\.2\)/);
    expect(body).toMatch(/--scrollbar-thumb-hover:\s*rgba\(0, 0, 0, 0\.3\)/);
  });

  it('keeps the standard and WebKit implementations in mutually exclusive @supports branches', () => {
    // Probe the thumb pseudo-element: Firefox 153+ evaluates
    // selector(::-webkit-scrollbar) as true for compatibility but does
    // not implement thumb styling, so the standard branch must key off
    // ::-webkit-scrollbar-thumb instead.
    const notWebkitIndex = CORE_CSS.indexOf('@supports not selector(::-webkit-scrollbar-thumb)');
    const webkitIndex = CORE_CSS.indexOf('@supports selector(::-webkit-scrollbar-thumb)');

    expect(notWebkitIndex, 'Firefox @supports branch in css/core.css').toBeGreaterThan(-1);
    expect(webkitIndex, 'WebKit @supports branch in css/core.css').toBeGreaterThan(notWebkitIndex);
  });

  it('keeps the root scroller on the browser default scrollbar (#1098)', () => {
    // The scoped selectors must never reach html/the viewport: an
    // unscoped universal rule would style the dashboard page scrollbar
    // again in both the standard and WebKit branches.
    expect(CORE_CSS).not.toMatch(/(?<!body )\*\s*\{\s*scrollbar-width/);
    expect(CORE_CSS).not.toMatch(/(?<!body )\*::-webkit-scrollbar/);
    expect(CORE_CSS).not.toMatch(/\bhtml\b\s*[,:{]/);

    // The light-theme root mirror only existed to theme the viewport
    // scrollbar, so it is gone with it; body.light-theme keeps the
    // token overrides for in-component bars.
    expect(FEATURES_CSS).not.toMatch(/html:has\(body\.light-theme\)/);
  });

  it('removes the former AI chat and AI topics per-component blocks', () => {
    expect(APP_CSS).not.toMatch(/#ai-chat-container::-webkit-scrollbar/);
    expect(APP_CSS).not.toMatch(/body\.light-theme #ai-chat-container::-webkit-scrollbar/);
    expect(APP_CSS).not.toMatch(/\.ai-topics-list::-webkit-scrollbar/);
  });

  it('removes the settings, modal, and picker scrollbar block', () => {
    expect(FEATURES_CSS).not.toMatch(/\.settings-content::-webkit-scrollbar/);
    expect(FEATURES_CSS).not.toMatch(/\.settings-menu::-webkit-scrollbar/);
    expect(FEATURES_CSS).not.toMatch(/#add-app-modal > div::-webkit-scrollbar/);
    expect(FEATURES_CSS).not.toMatch(/\.color-picker-popup::-webkit-scrollbar/);
    expect(FEATURES_CSS).not.toMatch(/\.font-picker-popup::-webkit-scrollbar/);
    expect(FEATURES_CSS).not.toMatch(/\.app-context-menu::-webkit-scrollbar/);
    expect(FEATURES_CSS).not.toMatch(/body\.light-theme \.settings-content/);
  });

  it('normalizes the weather hourly list and games hub onto the shared rules', () => {
    expect(FEATURES_CSS).not.toMatch(/\.weather-app-hourly-list::-webkit-scrollbar/);
    expect(FEATURES_CSS).not.toMatch(/body\.light-theme \.weather-app-hourly-list/);

    const weather = FEATURES_CSS.match(/\.weather-app-hourly-list\s*\{([^}]*)\}/);
    expect(weather, '.weather-app-hourly-list rule').toBeTruthy();
    expect(weather[1]).not.toMatch(/scrollbar/);
    expect(weather[1]).toMatch(/overflow-x:\s*auto/);

    const gamesHub = FEATURES_CSS.match(/\.games-hub-content\s*\{([^}]*)\}/);
    expect(gamesHub, '.games-hub-content rule').toBeTruthy();
    expect(gamesHub[1]).not.toMatch(/scrollbar/);
  });

  it('keeps no stray hardcoded scrollbar values outside the shared block', () => {
    [FEATURES_CSS, APP_CSS].forEach((css) => {
      expect(css).not.toMatch(/scrollbar-width/);
      expect(css).not.toMatch(/scrollbar-color/);
      expect(css).not.toMatch(/::-webkit-scrollbar/);
    });

    [GLASS_CSS_PATH, SHELL_CSS_PATH].forEach((file) => {
      const css = readFileSync(file, 'utf-8');
      expect(css).not.toMatch(/scrollbar/);
    });
  });

  it('keeps the settings-content scrollbar gutter reservation', () => {
    expect(CORE_CSS).toMatch(/\.settings-content\s*\{[^}]*scrollbar-gutter:\s*stable/);
  });
});
