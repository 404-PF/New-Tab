import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';
import { itWhenLiquidDisabled, itWhenLiquidEnabled } from './helpers/liquid-glass-flag.js';

function fakeCanvasContext() {
  return {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {}
  };
}

function loadLiquidGlass({ style = 'liquid', theme = 'dark', supported = true } = {}) {
  localStorage.setItem('theme', theme);
  localStorage.setItem('liquidGlassEnabled', style === 'liquid' ? 'true' : 'false');
  globalThis.CSS = { supports: () => supported };
  globalThis.SVGFilterElement = supported ? function SVGFilterElement() {} : undefined;
  if (!supported) delete globalThis.SVGFilterElement;
  injectScript('src/data/liquid-glass-maps.js');
  injectScript('src/ui/liquid-glass.js');
  return window.LiquidGlass;
}

function marked(tag = 'div', sizeClass = 'panel') {
  const el = document.createElement(tag);
  el.setAttribute('data-liquid-glass', sizeClass);
  document.body.appendChild(el);
  return el;
}

describe('liquid glass core module (#1108)', () => {
  let getContextSpy;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.getElementById('liquid-glass-defs')?.remove();
    document.body.classList.remove('glass-liquid');
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(fakeCanvasContext);
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
    window.prefersReducedMotion = () => false;
    window.onReducedMotionChange = () => () => {};
    window.LiquidGlassMaps?._clearCacheForTests();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    window.LiquidGlass?.release();
    getContextSpy.mockRestore();
    vi.restoreAllMocks();
    delete globalThis.CSS;
    delete globalThis.SVGFilterElement;
  });

  describe('maps', () => {
    it('builds a data URL per named map and caches it', () => {
      loadLiquidGlass();
      const first = window.LiquidGlassMaps.build('standard', 64, 64, 10);
      expect(first).toMatch(/^data:image\/png/);
      const callsAfterFirst = getContextSpy.mock.calls.length;
      expect(window.LiquidGlassMaps.build('standard', 64, 64, 10)).toBe(first);
      expect(getContextSpy.mock.calls.length).toBe(callsAfterFirst);
      expect(window.LiquidGlassMaps.names).toEqual(['standard', 'polar', 'prominent']);
    });

    it('returns an empty string for unknown or inherited map names', () => {
      loadLiquidGlass();
      expect(window.LiquidGlassMaps.build('shader')).toBe('');
      expect(window.LiquidGlassMaps.build('constructor')).toBe('');
      expect(window.LiquidGlassMaps.build('__proto__')).toBe('');
    });

    it('returns an empty string when no canvas is available', () => {
      loadLiquidGlass();
      getContextSpy.mockImplementation(() => null);
      window.LiquidGlassMaps._clearCacheForTests();
      expect(window.LiquidGlassMaps.build('polar', 16, 16, 4)).toBe('');
    });
  });

  describe('isLiquid and probe', () => {
    itWhenLiquidEnabled('is true when the setting is on and the probe passes', () => {
      const lg = loadLiquidGlass();
      expect(lg.isLiquid()).toBe(true);
    });

    it('stays classic when the setting is off', () => {
      const lg = loadLiquidGlass({ style: 'classic' });
      expect(lg.isLiquid()).toBe(false);
      expect(lg.getGlassStyle()).toBe('classic');
    });

    itWhenLiquidEnabled.each(['dark', 'light', 'system'])('enhances the %s theme', (theme) => {
      const lg = loadLiquidGlass({ theme });
      expect(lg.isLiquid()).toBe(true);
      expect(lg.getGlassStyle()).toBe('liquid');
      expect(document.body.classList.contains('glass-liquid')).toBe(true);
      const el = marked();
      expect(lg.enhance(el)).toBe(true);
      expect(el.querySelector('.glass__warp')).not.toBeNull();
    });

    itWhenLiquidEnabled('defaults to on when the setting key is missing', () => {
      localStorage.removeItem('liquidGlassEnabled');
      globalThis.CSS = { supports: () => true };
      globalThis.SVGFilterElement = function SVGFilterElement() {};
      injectScript('src/data/liquid-glass-maps.js');
      injectScript('src/ui/liquid-glass.js');
      const lg = window.LiquidGlass;
      expect(lg.getGlassStyle()).toBe('liquid');
      expect(lg.isLiquid()).toBe(true);
    });

    it('falls back silently when the capability probe fails', () => {
      const lg = loadLiquidGlass({ supported: false });
      expect(lg.isLiquid()).toBe(false);
      const el = marked();
      expect(lg.enhance(el)).toBe(false);
      expect(el.querySelector('.glass__warp')).toBeNull();
    });

    itWhenLiquidEnabled('logs the probe result once', () => {
      const lg = loadLiquidGlass();
      lg.isLiquid();
      lg.isLiquid();
      expect(console.info).toHaveBeenCalledTimes(1);
    });
  });

  describe('enhance and release', () => {
    itWhenLiquidEnabled('injects the warp layer and highlight spans', () => {
      const lg = loadLiquidGlass();
      const el = marked();
      expect(lg.enhance(el)).toBe(true);
      expect(el.querySelector(':scope > .glass__warp')).not.toBeNull();
      expect(el.querySelector('.glass__highlight')).not.toBeNull();
      expect(el.querySelector('.glass__over-light')).not.toBeNull();
      expect(el.querySelector('.glass__hover')).not.toBeNull();
      expect(el.classList.contains('glass--liquid')).toBe(true);
    });

    itWhenLiquidEnabled('references a shared filter through the warp layer filter variable', () => {
      const lg = loadLiquidGlass();
      const el = marked('div', 'icon');
      lg.enhance(el);
      const warp = el.querySelector('.glass__warp');
      expect(warp.style.getPropertyValue('--lg-filter')).toContain('url(#lg-standard-icon)');
    });

    itWhenLiquidEnabled('is idempotent', () => {
      const lg = loadLiquidGlass();
      const el = marked();
      lg.enhance(el);
      lg.enhance(el);
      expect(el.querySelectorAll('.glass__warp')).toHaveLength(1);
      expect(el.querySelectorAll('.glass__highlight')).toHaveLength(1);
    });

    itWhenLiquidEnabled('release removes the injected nodes and is safe to repeat', () => {
      const lg = loadLiquidGlass();
      const el = marked();
      el.appendChild(document.createTextNode('label'));
      lg.enhance(el);
      expect(lg.release(el)).toBe(true);
      expect(el.querySelector('.glass__warp')).toBeNull();
      expect(el.querySelector('.glass__highlight')).toBeNull();
      expect(el.classList.contains('glass--liquid')).toBe(false);
      expect(el.textContent).toBe('label');
      expect(lg.release(el)).toBe(false);
      expect(lg.release(document.createElement('div'))).toBe(false);
    });

    itWhenLiquidEnabled('re-enhances after release', () => {
      const lg = loadLiquidGlass();
      const el = marked();
      lg.enhance(el);
      lg.release(el);
      expect(lg.enhance(el)).toBe(true);
      expect(el.querySelectorAll('.glass__warp')).toHaveLength(1);
    });

    itWhenLiquidEnabled('does not duplicate layers when a marked element is removed and re-added', async () => {
      const lg = loadLiquidGlass();
      lg.init();
      const el = marked();
      await vi.waitFor(() => expect(el.querySelector('.glass__warp')).not.toBeNull());
      const parent = el.parentNode;
      el.remove();
      await new Promise((r) => setTimeout(r, 0));
      parent.appendChild(el);
      await new Promise((r) => setTimeout(r, 0));
      expect(el.querySelectorAll('.glass__warp')).toHaveLength(1);
      expect(el.querySelectorAll('.glass__highlight')).toHaveLength(1);
    });

    it('does nothing under reduced motion', () => {
      const lg = loadLiquidGlass();
      window.prefersReducedMotion = () => true;
      const el = marked();
      expect(lg.enhance(el)).toBe(false);
      expect(el.querySelector('.glass__warp')).toBeNull();
    });
  });

  describe('filter registry', () => {
    itWhenLiquidEnabled('creates exactly one filter per map and size class', () => {
      const lg = loadLiquidGlass();
      lg.enhance(marked('div', 'icon'));
      lg.enhance(marked('div', 'icon'));
      lg.enhance(marked('span', 'icon'));
      lg.enhance(marked('div', 'panel'));

      const defs = document.querySelectorAll('#liquid-glass-defs filter');
      const ids = Array.from(defs).map((f) => f.id);
      expect(ids).toEqual(['lg-standard-icon', 'lg-standard-panel']);
      expect(document.querySelectorAll('#liquid-glass-defs')).toHaveLength(1);
    });

    itWhenLiquidEnabled('wires the displacement chain into each filter', () => {
      const lg = loadLiquidGlass();
      lg.enhance(marked('div', 'pill'));
      const filter = document.getElementById('lg-standard-pill');
      expect(filter.querySelector('feImage').getAttribute('href')).toMatch(/^data:image\/png/);
      expect(filter.querySelectorAll('feDisplacementMap')).toHaveLength(3);
    });
  });

  describe('MutationObserver pickup', () => {
    itWhenLiquidEnabled('enhances marked popovers added after init', async () => {
      const lg = loadLiquidGlass();
      lg.init();
      const popover = document.createElement('div');
      popover.setAttribute('data-liquid-glass', 'panel');
      const wrapper = document.createElement('section');
      wrapper.appendChild(popover);
      document.body.appendChild(wrapper);

      await vi.waitFor(() => {
        expect(popover.querySelector('.glass__warp')).not.toBeNull();
      });
    });

    it('release() with no argument tears down observer and structure', async () => {
      const lg = loadLiquidGlass();
      lg.init();
      const existing = marked();
      lg.enhance(existing);
      lg.release();

      expect(existing.querySelector('.glass__warp')).toBeNull();
      expect(document.body.classList.contains('glass-liquid')).toBe(false);

      const late = document.createElement('div');
      late.setAttribute('data-liquid-glass', 'panel');
      document.body.appendChild(late);
      await new Promise((r) => setTimeout(r, 0));
      expect(late.querySelector('.glass__warp')).toBeNull();
    });
  });

  describe('init and reduced motion', () => {
    itWhenLiquidEnabled('adds the body class and enhances existing marked elements when liquid', () => {
      const lg = loadLiquidGlass();
      const el = marked();
      lg.init();
      expect(document.body.classList.contains('glass-liquid')).toBe(true);
      expect(el.querySelector('.glass__warp')).not.toBeNull();
    });

    itWhenLiquidDisabled('keeps the effect off when the feature flag is disabled, even with the setting on', () => {
      const lg = loadLiquidGlass();
      const el = marked('div', 'panel');
      lg.init();
      expect(lg.isLiquid()).toBe(false);
      expect(lg.enhance(el)).toBe(false);
      expect(document.body.classList.contains('glass-liquid')).toBe(false);
      expect(document.querySelector('.glass__warp')).toBeNull();
    });

    it('shows the Liquid Glass settings card in the production markup', () => {
      const html = readFileSync(resolve(process.cwd(), 'New-Tab.html'), 'utf8');
      const cardOpen = html.match(/<div class="setting-card">\s*<div class="setting-content">\s*<label for="liquid-glass-setting"/);
      expect(cardOpen).not.toBeNull();
    });

    it('leaves classic pages untouched on init', () => {
      const lg = loadLiquidGlass({ style: 'classic' });
      const el = marked();
      lg.init();
      expect(document.body.classList.contains('glass-liquid')).toBe(false);
      expect(el.querySelector('.glass__warp')).toBeNull();
    });

    it('releases everything when reduced motion turns on', () => {
      let handler;
      window.onReducedMotionChange = (fn) => {
        handler = fn;
        return () => {};
      };
      const lg = loadLiquidGlass();
      lg.init();
      const el = marked();
      lg.enhance(el);
      handler(true);
      expect(el.querySelector('.glass__warp')).toBeNull();
    });
  });

  describe('hero widgets (#1157)', () => {
    const HERO_MARKS = [
      ['#motto-container', 'panel'],
      ['#weather-widget', 'panel'],
      ['#focus-mode-indicator', 'pill']
    ];

    function buildHeroes() {
      document.body.insertAdjacentHTML('beforeend',
        '<div id="weather-widget" class="weather-widget" style="display: none;"></div>' +
        '<button type="button" id="focus-mode-indicator" class="focus-mode-indicator" hidden></button>' +
        '<div class="container">' +
        '<div id="clock" class="clock"><span id="clock-time"></span><span id="date"></span></div>' +
        '<div class="search-bar-wrapper" role="search">' +
        '<div class="search-bar"><input type="text"></div>' +
        '<div class="search-provider-bar"></div>' +
        '</div>' +
        '</div>' +
        '<div id="motto-container"><span id="motto-text"></span><div class="motto-buttons"></div></div>'
      );
    }

    function expectHeroesUnmarked() {
      HERO_MARKS.forEach(([selector]) => {
        expect(document.querySelector(selector).hasAttribute('data-liquid-glass')).toBe(false);
      });
      expect(document.querySelector('.glass__warp')).toBeNull();
    }

    itWhenLiquidEnabled('marks the three heroes, leaves the search bar and clock plain, and injects warp plus highlight layers', () => {
      buildHeroes();
      const lg = loadLiquidGlass();
      lg.init();
      HERO_MARKS.forEach(([selector, sizeClass]) => {
        const el = document.querySelector(selector);
        expect(el.getAttribute('data-liquid-glass')).toBe(sizeClass);
        expect(el.classList.contains('glass--liquid')).toBe(true);
        expect(el.querySelector(':scope > .glass__warp')).not.toBeNull();
        expect(el.querySelector(':scope > .glass__highlight')).not.toBeNull();
        expect(el.querySelector(':scope > .glass__over-light')).not.toBeNull();
        expect(el.querySelector(':scope > .glass__hover')).not.toBeNull();
      });
      ['.search-bar-wrapper', '#clock'].forEach((selector) => {
        const el = document.querySelector(selector);
        expect(el.hasAttribute('data-liquid-glass')).toBe(false);
        expect(el.classList.contains('glass--liquid')).toBe(false);
        expect(el.querySelector('.glass__warp')).toBeNull();
      });
    });

    itWhenLiquidEnabled('defers marking a hero that is still in its fadeSlideUp entrance', async () => {
      buildHeroes();
      const motto = document.getElementById('motto-container');
      let running = true;
      motto.getAnimations = () => (running ? [{ animationName: 'fadeSlideUp' }] : []);
      loadLiquidGlass();
      expect(motto.hasAttribute('data-liquid-glass')).toBe(false);
      expect(motto.querySelector('.glass__warp')).toBeNull();
      expect(document.getElementById('weather-widget').getAttribute('data-liquid-glass')).toBe('panel');

      const other = new Event('animationend', { bubbles: true });
      other.animationName = 'dropBounce';
      motto.dispatchEvent(other);
      expect(motto.hasAttribute('data-liquid-glass')).toBe(false);

      running = false;
      const done = new Event('animationend');
      done.animationName = 'fadeSlideUp';
      motto.dispatchEvent(done);
      expect(motto.getAttribute('data-liquid-glass')).toBe('panel');
      await vi.waitFor(() => expect(motto.querySelector('.glass__warp')).not.toBeNull());
    });

    itWhenLiquidEnabled('rebuilds the layers when a hero re-renders its contents', async () => {
      buildHeroes();
      const lg = loadLiquidGlass();
      lg.init();
      const weather = document.getElementById('weather-widget');
      expect(weather.querySelector(':scope > .glass__warp')).not.toBeNull();

      // weather.js resets className and replaces innerHTML on every render,
      // which strips the injected layers and the marker class.
      weather.className = 'weather-widget weather-data';
      weather.innerHTML = '<div class="weather-current"><span class="weather-temp">21</span></div>';
      expect(weather.querySelector(':scope > .glass__warp')).toBeNull();

      await vi.waitFor(() => {
        expect(weather.querySelector(':scope > .glass__warp')).not.toBeNull();
        expect(weather.classList.contains('glass--liquid')).toBe(true);
      });
      expect(weather.querySelector('.weather-current')).not.toBeNull();
    });

    itWhenLiquidEnabled('cancels a pending layer restore when the marker is removed mid-entrance', async () => {
      buildHeroes();
      const lg = loadLiquidGlass();
      lg.init();
      const weather = document.getElementById('weather-widget');
      expect(weather.querySelector(':scope > .glass__warp')).not.toBeNull();

      // Re-render while the widget still reports a running entrance: the
      // observer releases the old layers and defers the rebuild.
      weather.getAnimations = () => [{ animationName: 'fadeSlideUp' }];
      weather.className = 'weather-widget weather-data';
      weather.innerHTML = '<div class="weather-current"><span class="weather-temp">21</span></div>';
      await new Promise((r) => setTimeout(r, 0));
      expect(weather.querySelector(':scope > .glass__warp')).toBeNull();

      // Marker goes away before the entrance settles: the pending callback
      // must not re-enhance the now-unmarked widget.
      weather.removeAttribute('data-liquid-glass');
      await new Promise((r) => setTimeout(r, 0));
      const done = new Event('animationend');
      done.animationName = 'fadeSlideUp';
      weather.dispatchEvent(done);
      expect(weather.querySelector('.glass__warp')).toBeNull();
      expect(weather.classList.contains('glass--liquid')).toBe(false);
    });

    itWhenLiquidEnabled('cancels a pending entrance waiter when the hero is detached', async () => {
      buildHeroes();
      const motto = document.getElementById('motto-container');
      motto.getAnimations = () => [{ animationName: 'fadeSlideUp' }];
      loadLiquidGlass();
      expect(motto.hasAttribute('data-liquid-glass')).toBe(false);

      // Detaching before the entrance settles must drop the waiter: the
      // removal path only released enhanced elements, so a replaced hero
      // stayed registered and could still be marked after detachment.
      motto.remove();
      await new Promise((r) => setTimeout(r, 0));
      const done = new Event('animationend');
      done.animationName = 'fadeSlideUp';
      motto.dispatchEvent(done);
      expect(motto.hasAttribute('data-liquid-glass')).toBe(false);
    });

    it('leaves the heroes untouched in classic mode', () => {
      buildHeroes();
      const lg = loadLiquidGlass({ style: 'classic' });
      lg.init();
      HERO_MARKS.forEach(([selector]) => {
        const el = document.querySelector(selector);
        expect(el.hasAttribute('data-liquid-glass')).toBe(false);
        expect(el.classList.contains('glass--liquid')).toBe(false);
        expect(el.querySelector('.glass__warp')).toBeNull();
      });
      expect(document.body.classList.contains('glass-liquid')).toBe(false);
    });

    it('leaves the heroes untouched when the capability probe fails', () => {
      buildHeroes();
      const lg = loadLiquidGlass({ supported: false });
      lg.init();
      expectHeroesUnmarked();
    });

    it('leaves the heroes untouched under reduced motion', () => {
      buildHeroes();
      window.prefersReducedMotion = () => true;
      const lg = loadLiquidGlass();
      lg.init();
      expectHeroesUnmarked();
    });

    it('restores the markers when reduced motion turns back off', () => {
      buildHeroes();
      let handler;
      window.onReducedMotionChange = (fn) => {
        handler = fn;
        return () => {};
      };
      window.prefersReducedMotion = () => true;
      const lg = loadLiquidGlass();
      lg.init();
      expect(document.querySelector('#motto-container').hasAttribute('data-liquid-glass')).toBe(false);
      window.prefersReducedMotion = () => false;
      handler(false);
      expect(document.querySelector('#motto-container').getAttribute('data-liquid-glass')).toBe('panel');
      expect(document.querySelector('#motto-container').querySelector('.glass__warp')).not.toBeNull();
    });

    itWhenLiquidEnabled('drops the hero markers when reduced motion turns on at runtime', () => {
      buildHeroes();
      let handler;
      window.onReducedMotionChange = (fn) => {
        handler = fn;
        return () => {};
      };
      window.prefersReducedMotion = () => false;
      const lg = loadLiquidGlass();
      lg.init();
      expect(document.querySelector('#motto-container').getAttribute('data-liquid-glass')).toBe('panel');
      expect(document.querySelector('.glass__warp')).not.toBeNull();
      window.prefersReducedMotion = () => true;
      handler(true);
      expectHeroesUnmarked();
      expect(document.querySelector('#motto-container').classList.contains('glass--liquid')).toBe(false);
    });

    describe('css neutralization', () => {
      const css = readFileSync('css/liquid-glass.css', 'utf8');

      it('keeps the search bar and clock out of the hero styling', () => {
        expect(css).not.toContain('search-bar-wrapper');
        expect(css).not.toMatch(/#clock/);
      });

      it('outranks the ID-scoped light-theme motto backdrop stack', () => {
        expect(css).toMatch(
          /body\.glass-liquid #motto-container\.glass--liquid\s*\{[^}]*backdrop-filter:\s*none/
        );
        expect(css).toContain('body.glass-liquid.light-theme #motto-container.glass--liquid');
      });

      it('keeps the ID-lifted glass.css light surfaces off the enhanced heroes', () => {
        const glass = readFileSync('css/glass.css', 'utf8');
        expect(glass).toContain('.search-bar,');
        expect(glass).not.toContain('.search-bar:not(');
        expect(glass).toContain('.weather-widget:not(:where(.weather-widget.glass--liquid))');
        expect(glass).toContain('.focus-mode-indicator:not(:where(.focus-mode-indicator.glass--liquid))');
      });

      it('lifts hero content above the injected layers', () => {
        expect(css).toMatch(
          /#focus-mode-indicator\s*\)\.glass--liquid > :not\(\.glass__warp\)[^{]*\{[^}]*z-index:\s*1/
        );
      });

      it('scopes every hero rule to body.glass-liquid so Classic is untouched', () => {
        const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
        noComments.split('}').forEach((chunk) => {
          const selector = chunk.split('{')[0].trim();
          if (!selector || selector.startsWith('@')) return;
          const touchesHero = /motto-container|weather-widget|focus-mode-indicator/.test(selector);
          if (touchesHero) expect(selector).toContain('body.glass-liquid');
        });
      });
    });
  });
});
