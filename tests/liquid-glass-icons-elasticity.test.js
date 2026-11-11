import { readFileSync } from 'fs';
import { injectScript } from './helpers/inject-script.js';
import { itWhenLiquidEnabled } from './helpers/liquid-glass-flag.js';

const css = readFileSync('css/liquid-glass.css', 'utf8');
const dragSrc = readFileSync('src/features/drag-drop.js', 'utf8');

function fakeCanvasContext() {
  return {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {}
  };
}

function loadLiquidGlass() {
  localStorage.setItem('liquidGlassEnabled', 'true');
  globalThis.CSS = { supports: () => true };
  globalThis.SVGFilterElement = function SVGFilterElement() {};
  injectScript('src/data/liquid-glass-maps.js');
  injectScript('src/ui/liquid-glass.js');
  return window.LiquidGlass;
}

function buildGrid() {
  document.body.innerHTML =
    '<div id="clock"></div><div id="motto-container"></div>' +
    '<div id="app-grid"><a class="app-icon"><span class="icon"></span></a></div>';
  const motto = document.getElementById('motto-container');
  motto.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
}

function buildHeroTargets() {
  document.getElementById('motto-container').insertAdjacentHTML('afterend',
    '<div id="weather-widget"></div><div id="focus-mode-indicator"></div>');
  const targets = ['motto-container', 'weather-widget', 'focus-mode-indicator']
    .map((id) => document.getElementById(id));
  targets.forEach((el) => { el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }); });
  return targets;
}

describe('liquid glass icons + elasticity (#1110)', () => {
  beforeAll(() => {
    injectScript('src/core/app-grid-state.js');
  });

  let reducedCb;
  let visibilityCb;
  let rafQueue;

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(fakeCanvasContext);
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
    vi.spyOn(console, 'info').mockImplementation(() => {});
    reducedCb = null;
    visibilityCb = null;
    window.prefersReducedMotion = () => false;
    window.onReducedMotionChange = (cb) => { reducedCb = cb; return () => {}; };
    window.visibilityManager = {
      isVisible: true,
      onChange: (cb) => { visibilityCb = cb; return () => {}; }
    };
    rafQueue = [];
    vi.stubGlobal('requestAnimationFrame', (fn) => { rafQueue.push(fn); return rafQueue.length; });
    vi.stubGlobal('cancelAnimationFrame', (id) => { rafQueue[id - 1] = () => {}; });
    if (window.__appGridState) window.__appGridState.reset();
    buildGrid();
  });

  afterEach(() => {
    window.LiquidGlass?.release();
    document.body.classList.remove('glass-drag-active', 'glass-liquid');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete globalThis.CSS;
    delete globalThis.SVGFilterElement;
  });

  const flush = () => {
    const q = rafQueue;
    rafQueue = [];
    q.forEach((fn) => fn());
  };
  const move = (x, y) => document.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));

  const settle = () => new Promise((r) => setTimeout(r, 0));

  itWhenLiquidEnabled('does not enhance icons before the grid is rendered, then does on appGridReady', async () => {
    loadLiquidGlass();
    const icon = document.querySelector('.icon');
    expect(icon.hasAttribute('data-liquid-glass')).toBe(false);
    window.__appGridState.setPhase('rendered');
    expect(icon.getAttribute('data-liquid-glass')).toBe('icon');
    await settle();
    expect(icon.querySelector('.glass__warp')).not.toBeNull();
    expect(icon.classList.contains('glass--liquid')).toBe(true);
  });

  itWhenLiquidEnabled('waits for the fadeSlideUp entrance animation before enhancing icons', () => {
    loadLiquidGlass();
    const grid = document.getElementById('app-grid');
    const icon = document.querySelector('.icon');
    let running = true;
    grid.getAnimations = () => (running ? [{ animationName: 'fadeSlideUp' }] : []);
    window.__appGridState.setPhase('rendered');
    expect(icon.hasAttribute('data-liquid-glass')).toBe(false);
    const other = new Event('animationend', { bubbles: true });
    other.animationName = 'dropBounce';
    icon.dispatchEvent(other);
    expect(icon.hasAttribute('data-liquid-glass')).toBe(false);
    running = false;
    const done = new Event('animationend');
    done.animationName = 'fadeSlideUp';
    grid.dispatchEvent(done);
    expect(icon.getAttribute('data-liquid-glass')).toBe('icon');
  });

  itWhenLiquidEnabled('enhances icons added after render', async () => {
    loadLiquidGlass();
    window.__appGridState.setPhase('rendered');
    const a = document.createElement('a');
    a.className = 'app-icon';
    a.innerHTML = '<span class="icon"></span>';
    document.getElementById('app-grid').appendChild(a);
    await settle();
    expect(a.querySelector('.icon').getAttribute('data-liquid-glass')).toBe('icon');
    expect(a.querySelector('.glass__warp')).not.toBeNull();
  });

  it('drag-drop toggles the highlight-only degradation state', () => {
    expect(dragSrc).toContain('classList.add(\'glass-drag-active\')');
    expect(dragSrc).toContain('classList.remove(\'glass-drag-active\')');
    expect(css).toMatch(/glass-drag-active \.app-icon \.glass__warp[\s\S]*display: none/);
    expect(css).toContain('.app-icon.drag-over .glass__warp');
    expect(css).toContain('.app-icon.drag-drop-landed .glass__warp');
  });

  itWhenLiquidEnabled('applies elasticity via translate (never transform) on T1 targets', () => {
    const targets = buildHeroTargets();
    loadLiquidGlass();
    move(150, 50);
    flush();
    targets.forEach((el) => {
      expect(el.style.translate).not.toBe('');
      expect(el.style.transform).toBe('');
    });
  });

  itWhenLiquidEnabled('leaves the search bar and clock out of elasticity', () => {
    buildHeroTargets();
    document.getElementById('clock').getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    document.getElementById('app-grid').insertAdjacentHTML('beforebegin',
      '<div class="search-bar-wrapper"></div>');
    const search = document.querySelector('.search-bar-wrapper');
    search.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    loadLiquidGlass();
    move(150, 50);
    flush();
    expect(document.getElementById('clock').style.translate).toBe('');
    expect(search.style.translate).toBe('');
    expect(search.hasAttribute('data-liquid-glass')).toBe(false);
  });

  itWhenLiquidEnabled('keeps the glass layers in place while elasticity moves a hero', () => {
    const targets = buildHeroTargets();
    loadLiquidGlass();
    move(150, 50);
    flush();
    targets.forEach((el) => {
      expect(el.style.translate).not.toBe('');
      expect(el.classList.contains('glass--liquid')).toBe(true);
      expect(el.querySelector(':scope > .glass__warp')).not.toBeNull();
      expect(el.querySelector(':scope > .glass__highlight')).not.toBeNull();
      el.querySelectorAll(':scope > .glass__warp, :scope > .glass__highlight').forEach((layer) => {
        expect(layer.style.translate).toBe('');
        expect(layer.style.transform).toBe('');
      });
    });
  });

  itWhenLiquidEnabled('resets elasticity offsets when an app drag starts', () => {
    loadLiquidGlass();
    move(150, 50);
    flush();
    expect(document.getElementById('motto-container').style.translate).not.toBe('');
    document.dispatchEvent(new Event('dragstart', { bubbles: true }));
    expect(document.getElementById('motto-container').style.translate).toBe('');
  });

  itWhenLiquidEnabled('freezes elasticity while dragging', () => {
    loadLiquidGlass();
    document.body.classList.add('glass-drag-active');
    move(150, 50);
    flush();
    expect(document.getElementById('motto-container').style.translate).toBe('');
  });

  itWhenLiquidEnabled('disables and clears elasticity under reduced motion', () => {
    loadLiquidGlass();
    move(150, 50);
    flush();
    window.prefersReducedMotion = () => true;
    reducedCb(true);
    expect(document.getElementById('motto-container').style.translate).toBe('');
    move(150, 50);
    flush();
    expect(document.getElementById('motto-container').style.translate).toBe('');
  });

  itWhenLiquidEnabled('pauses and resets when the tab hides', () => {
    loadLiquidGlass();
    move(150, 50);
    flush();
    visibilityCb(false);
    expect(document.getElementById('motto-container').style.translate).toBe('');
    move(150, 50);
    expect(rafQueue.filter((f) => f.name === 'step')).toHaveLength(0);
  });

  it('does nothing in classic mode', () => {
    localStorage.setItem('liquidGlassEnabled', 'false');
    injectScript('src/data/liquid-glass-maps.js');
    injectScript('src/ui/liquid-glass.js');
    move(150, 50);
    expect(rafQueue).toHaveLength(0);
    window.__appGridState?.setPhase('rendered');
    expect(document.querySelector('.icon').hasAttribute('data-liquid-glass')).toBe(false);
  });
});


