import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';
import { itWhenLiquidEnabled } from './helpers/liquid-glass-flag.js';

function readRepoFile(relativePath) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function fakeCanvasContext() {
  return {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {}
  };
}

function loadLiquidGlass() {
  localStorage.setItem('theme', 'dark');
  localStorage.setItem('liquidGlassEnabled', 'true');
  globalThis.CSS = { supports: () => true };
  globalThis.SVGFilterElement = function SVGFilterElement() {};
  injectScript('src/data/liquid-glass-maps.js');
  injectScript('src/ui/liquid-glass.js');
  return window.LiquidGlass;
}

function markedPanel(tag = 'section', sizeClass = 'panel') {
  const el = document.createElement(tag);
  el.setAttribute('data-liquid-glass', sizeClass);
  document.body.appendChild(el);
  return el;
}

describe('feature panel marking (#1159)', () => {
  it.each([
    ['todo section', /<div class="todo-section" data-liquid-glass="panel">/],
    ['notes section', /<div class="notes-section" data-liquid-glass="panel">/],
    ['extra timezones', /<div id="extra-timezones" class="extra-timezones" data-liquid-glass="panel">/],
    ['ai chat modal', /<div id="ai-chat-modal" data-liquid-glass="panel">/],
    ['weather app modal', /<div id="weather-app-modal"[^>]*data-liquid-glass="panel">/],
    ['todo app modal', /<div id="todo-app-modal"[^>]*data-liquid-glass="panel">/],
    ['games app dialog', /<dialog id="games-app-modal"[^>]*data-liquid-glass="panel">/],
    ['games hub content', /<div class="games-hub-content" id="games-hub-content" data-liquid-glass="panel">/]
  ])('marks the %s in the production markup', (_, pattern) => {
    expect(readRepoFile('New-Tab.html')).toMatch(pattern);
  });

  it('leaves the settings modal unmarked so #875 keeps its blur handoff', () => {
    const html = readRepoFile('New-Tab.html');
    expect(html).not.toMatch(/settings-modal[^>]*data-liquid-glass/);
  });

  it.each([
    ['src/features/pomodoro.js', /widget\.setAttribute\('data-liquid-glass', 'panel'\)/],
    ['src/features/timezone-clocks.js', /chip\.setAttribute\('data-liquid-glass', 'panel'\)/],
    ['src/features/release-notes.js', /class="release-notes-dialog" data-liquid-glass="panel"/]
  ])('marks the JS-built surface in %s at creation', (file, pattern) => {
    expect(readRepoFile(file)).toMatch(pattern);
  });

  it('keeps the host guard and the enhancement exclusion in liquid-glass.js', () => {
    const source = readRepoFile('src/ui/liquid-glass.js');
    expect(source).toMatch(/el\.closest\('#todo-app-widget-host'\)/);
    expect(source).toMatch(/parent\.closest\('\.glass--liquid'\)/);
    expect(source).toMatch(/if \(isExcluded\(el\)\) \{\s*release\(el\);\s*return false;/);
  });
});

describe('feature panel layering CSS (#1159)', () => {
  const css = readRepoFile('css/liquid-glass.css');

  it('sinks the warp below in-flow content and gives enhanced panels a stacking context', () => {
    expect(css).toMatch(/:where\(body\.glass-liquid \.glass--liquid\)\s*\{\s*z-index:\s*0;/);
    expect(css).toMatch(/body\.glass-liquid \.glass__warp\s*\{\s*z-index:\s*-1;/);
  });

  it('keeps marked dialogs on the UA top-layer layout', () => {
    expect(css).toMatch(/body\.glass-liquid dialog\[data-liquid-glass\]\s*\{\s*position:\s*fixed;/);
  });

  it('drops the panel blurs that out-specify the generic reset', () => {
    expect(css).toMatch(
      /body\.glass-liquid #ai-chat-modal\.glass--liquid,\s*body\.glass-liquid \.release-notes-dialog\.glass--liquid\s*\{\s*-webkit-backdrop-filter:\s*none;\s*backdrop-filter:\s*none;/
    );
  });

  it('loads liquid-glass.css after every stylesheet it overrides', () => {
    const style = readRepoFile('style.css');
    const liquidIndex = style.indexOf('css/liquid-glass.css');
    expect(liquidIndex).toBeGreaterThan(-1);
    ['css/app.css', 'css/features.css', 'css/glass.css'].forEach((file) => {
      const index = style.indexOf(file);
      expect(index).toBeGreaterThan(-1);
      expect(liquidIndex).toBeGreaterThan(index);
    });
  });
});

describe('feature panel enhancement (#1159)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.getElementById('liquid-glass-defs')?.remove();
    document.body.classList.remove('glass-liquid');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(fakeCanvasContext);
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
    window.prefersReducedMotion = () => false;
    window.onReducedMotionChange = () => () => {};
    window.LiquidGlassMaps?._clearCacheForTests();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    window.LiquidGlass?.release();
    vi.restoreAllMocks();
    delete globalThis.CSS;
    delete globalThis.SVGFilterElement;
  });

  itWhenLiquidEnabled('enhances a panel-marked surface with the panel filter', () => {
    const lg = loadLiquidGlass();
    const panel = markedPanel();
    expect(lg.enhance(panel)).toBe(true);
    const warp = panel.querySelector(':scope > .glass__warp');
    expect(warp).not.toBeNull();
    expect(warp.style.getPropertyValue('--lg-filter')).toContain('url(#lg-standard-panel)');
    expect(panel.classList.contains('glass--liquid')).toBe(true);
  });

  itWhenLiquidEnabled('refuses to enhance a marked element inside the todo widget host', () => {
    const lg = loadLiquidGlass();
    const host = document.createElement('div');
    host.id = 'todo-app-widget-host';
    document.body.appendChild(host);
    const section = markedPanel();
    host.appendChild(section);

    expect(lg.enhance(section)).toBe(false);
    expect(section.querySelector('.glass__warp')).toBeNull();
    expect(section.classList.contains('glass--liquid')).toBe(false);
  });

  itWhenLiquidEnabled('strips the warp when an enhanced panel moves into the todo widget host', async () => {
    loadLiquidGlass();
    const section = markedPanel();
    await vi.waitFor(() => expect(section.querySelector('.glass__warp')).not.toBeNull());

    const host = document.createElement('div');
    host.id = 'todo-app-widget-host';
    document.body.appendChild(host);
    host.appendChild(section);

    await vi.waitFor(() => expect(section.querySelector('.glass__warp')).toBeNull());
    expect(section.classList.contains('glass--liquid')).toBe(false);
  });

  itWhenLiquidEnabled('re-enhances the panel when it leaves the todo widget host', async () => {
    const lg = loadLiquidGlass();
    const host = document.createElement('div');
    host.id = 'todo-app-widget-host';
    document.body.appendChild(host);
    const section = markedPanel();
    host.appendChild(section);
    expect(section.querySelector('.glass__warp')).toBeNull();

    document.body.appendChild(section);
    await vi.waitFor(() => expect(section.querySelector('.glass__warp')).not.toBeNull());
    expect(lg.isLiquid()).toBe(true);
  });

  itWhenLiquidEnabled('skips a marked child inside an already enhanced ancestor', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('data-liquid-glass', 'panel');
    const hub = document.createElement('div');
    hub.id = 'games-hub-content';
    hub.setAttribute('data-liquid-glass', 'panel');
    dialog.appendChild(hub);
    document.body.appendChild(dialog);

    const lg = loadLiquidGlass();

    expect(dialog.querySelector(':scope > .glass__warp')).not.toBeNull();
    expect(hub.querySelector('.glass__warp')).toBeNull();
    expect(hub.classList.contains('glass--liquid')).toBe(false);
    expect(lg.enhance(hub)).toBe(false);
    expect(hub.querySelector('.glass__warp')).toBeNull();
  });

  it('does not enhance panels under reduced motion', () => {
    const lg = loadLiquidGlass();
    window.prefersReducedMotion = () => true;
    const panel = markedPanel();
    expect(lg.enhance(panel)).toBe(false);
    expect(panel.querySelector('.glass__warp')).toBeNull();
  });
});
