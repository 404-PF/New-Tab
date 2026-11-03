import { injectScript } from './helpers/inject-script.js';

function fakeCanvasContext() {
  return {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {}
  };
}

function loadLiquidGlass({ style = 'liquid', supported = true } = {}) {
  localStorage.setItem('glassStyle', style);
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
      expect(window.LiquidGlassMaps.build('standard', 64, 64, 10)).toBe(first);
      expect(window.LiquidGlassMaps.names).toEqual(['standard', 'polar', 'prominent']);
    });

    it('returns an empty string for unknown maps or when no canvas is available', () => {
      loadLiquidGlass();
      expect(window.LiquidGlassMaps.build('shader')).toBe('');
      getContextSpy.mockImplementation(() => null);
      window.LiquidGlassMaps._clearCacheForTests();
      expect(window.LiquidGlassMaps.build('polar', 16, 16, 4)).toBe('');
    });
  });

  describe('isLiquid and probe', () => {
    it('is true only when glassStyle is liquid and the probe passes', () => {
      const lg = loadLiquidGlass();
      expect(lg.isLiquid()).toBe(true);
    });

    it('stays classic by default and when glassStyle is unset', () => {
      const lg = loadLiquidGlass({ style: 'classic' });
      expect(lg.isLiquid()).toBe(false);
      expect(lg.getGlassStyle()).toBe('classic');
    });

    it('falls back silently when the capability probe fails', () => {
      const lg = loadLiquidGlass({ supported: false });
      expect(lg.isLiquid()).toBe(false);
      const el = marked();
      expect(lg.enhance(el)).toBe(false);
      expect(el.querySelector('.glass__warp')).toBeNull();
    });

    it('logs the probe result once', () => {
      const lg = loadLiquidGlass();
      lg.isLiquid();
      lg.isLiquid();
      expect(console.info).toHaveBeenCalledTimes(1);
    });
  });

  describe('enhance and release', () => {
    it('injects the warp layer and highlight spans', () => {
      const lg = loadLiquidGlass();
      const el = marked();
      expect(lg.enhance(el)).toBe(true);
      expect(el.querySelector(':scope > .glass__warp')).not.toBeNull();
      expect(el.querySelector('.glass__highlight')).not.toBeNull();
      expect(el.querySelector('.glass__over-light')).not.toBeNull();
      expect(el.querySelector('.glass__hover')).not.toBeNull();
      expect(el.classList.contains('glass--liquid')).toBe(true);
    });

    it('references a shared filter through the warp layer filter variable', () => {
      const lg = loadLiquidGlass();
      const el = marked('div', 'icon');
      lg.enhance(el);
      const warp = el.querySelector('.glass__warp');
      expect(warp.style.getPropertyValue('--lg-filter')).toContain('url(#lg-standard-icon)');
    });

    it('is idempotent', () => {
      const lg = loadLiquidGlass();
      const el = marked();
      lg.enhance(el);
      lg.enhance(el);
      expect(el.querySelectorAll('.glass__warp')).toHaveLength(1);
      expect(el.querySelectorAll('.glass__highlight')).toHaveLength(1);
    });

    it('release removes the injected nodes and is safe to repeat', () => {
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

    it('re-enhances after release', () => {
      const lg = loadLiquidGlass();
      const el = marked();
      lg.enhance(el);
      lg.release(el);
      expect(lg.enhance(el)).toBe(true);
      expect(el.querySelectorAll('.glass__warp')).toHaveLength(1);
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
    it('creates exactly one filter per map and size class', () => {
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

    it('wires the displacement chain into each filter', () => {
      const lg = loadLiquidGlass();
      lg.enhance(marked('div', 'pill'));
      const filter = document.getElementById('lg-standard-pill');
      expect(filter.querySelector('feImage').getAttribute('href')).toMatch(/^data:image\/png/);
      expect(filter.querySelectorAll('feDisplacementMap')).toHaveLength(3);
    });
  });

  describe('MutationObserver pickup', () => {
    it('enhances marked popovers added after init', async () => {
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
    it('adds the body class and enhances existing marked elements when liquid', () => {
      const lg = loadLiquidGlass();
      const el = marked();
      lg.init();
      expect(document.body.classList.contains('glass-liquid')).toBe(true);
      expect(el.querySelector('.glass__warp')).not.toBeNull();
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
});
