// #1158: tier-2 surfaces (settings dialog, add-app dialog, folder popup,
// context menu, search-history popover, toasts) join the liquid glass
// pipeline. They carry data-liquid-glass="panel", their classic blur is
// suppressed only while enhanced, their content stacks above the warp, and
// the warp waits out each surface's entrance (#875) so it never re-samples
// the backdrop mid-animation.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';
import { itWhenLiquidEnabled } from './helpers/liquid-glass-flag.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const HTML = read('New-Tab.html');
const LIQUID_CSS = read('css/liquid-glass.css');

// Each tier-2 rule below is a standalone `body.glass-liquid ...` block; the
// comments are stripped first so the match starts on the selector itself.
// Selector runs collapse to single spaces first, so a reflow (e.g. the
// newline before `).glass--liquid`) does not change which rule is found.
const collapse = (s) => s.replace(/\s+/g, ' ');

function cssBlock(fragment) {
  const block = collapse(LIQUID_CSS.replace(/\/\*[\s\S]*?\*\//g, ''))
    .split('}')
    .find((b) => b.includes(collapse(fragment)));
  expect(block, `liquid-glass.css block containing "${fragment}"`).toBeDefined();
  return block.trim();
}

describe('tier-2 surface marks (#1158)', () => {
  it('marks the static dialogs and folder card in the markup', () => {
    expect(HTML).toMatch(/<div id="settings-modal">\s*<div data-liquid-glass="panel">/);
    expect(HTML).toMatch(/<div id="add-app-modal">\s*<div data-liquid-glass="panel">/);
    expect(HTML).toMatch(/<div class="folder-popup-content" data-liquid-glass="panel">/);
  });

  it('marks each JS-built surface at creation', () => {
    expect(read('src/features/context-menu.js')).toMatch(
      /contextMenu\.className = 'app-context-menu';\s*\n\s*contextMenu\.setAttribute\('data-liquid-glass', 'panel'\);/
    );
    expect(read('src/core/toast.js')).toMatch(
      /toast\.setAttribute\('data-liquid-glass', 'panel'\);/
    );
    expect(read('src/core/main.js')).toMatch(
      /searchHistoryPanel\.setAttribute\('data-liquid-glass', 'panel'\);/
    );
  });

  it('wraps the toast message in an element so it can be raised above the warp', () => {
    expect(read('src/core/toast.js')).toMatch(
      /const messageEl = document\.createElement\('span'\);/
    );
    expect(read('src/core/toast.js')).toMatch(
      /messageEl\.className = 'toast-message';/
    );
  });
});

describe('tier-2 classic blur suppression (#1158)', () => {
  it('suppresses each marked surface\'s own backdrop-filter under liquid glass', () => {
    const block = cssBlock('.toast-notification\n).glass--liquid {');
    for (const selector of [
      '#settings-modal > div',
      '#add-app-modal > div',
      '.folder-popup-content',
      '.app-context-menu',
      '.search-history-panel',
      '.toast-notification'
    ]) {
      expect(block).toContain(selector);
    }
    expect(block).toContain('body.glass-liquid :is(');
    expect(block).toContain('-webkit-backdrop-filter: none');
    expect(block).toContain('backdrop-filter: none');
  });

  it('keys the suppression on .glass--liquid so marked-but-unenhanced surfaces keep classic blur', () => {
    const block = cssBlock('.toast-notification\n).glass--liquid {');
    expect(block).toMatch(/\)\.glass--liquid \{/);
  });

  it('keeps the #1066 todo widget guard intact', () => {
    expect(read('css/features.css')).toMatch(
      /#todo-app-widget-host \.todo-section\s*\{[^}]*backdrop-filter: none/
    );
  });
});

describe('tier-2 liquid fill and tint (#1158)', () => {
  const strip = () => LIQUID_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const blockWith = (fragment) =>
    collapse(strip()).split('}').find((b) => b.includes(collapse(fragment)));

  it('drops the near-opaque surface fill alongside the classic blur, keyed on .glass--liquid', () => {
    const block = blockWith('.toast-notification\n).glass--liquid {');
    expect(block).toContain('background: transparent');
    expect(block).toMatch(/\)\.glass--liquid \{/);
  });

  it('restates the transparent fill for the light theme instead of leaning on load order', () => {
    const block = blockWith('body.glass-liquid.light-theme :is(');
    expect(block).toBeDefined();
    expect(block.trim().startsWith('body.glass-liquid.light-theme :is(')).toBe(true);
    expect(block).toContain('background: transparent');
    expect(block).toContain('.toast-notification');
  });

  it('rides the tint on the warp layer, one rule per theme for the panels', () => {
    const dark = blockWith(').glass--liquid > .glass__warp {');
    expect(dark).toBeDefined();
    expect(dark).toContain('rgba(15, 23, 42, 0.55)');
    expect(dark).not.toContain('light-theme');

    const light = strip()
      .split('}')
      .find(
        (b) =>
          b.includes('.glass__warp') &&
          b.includes('light-theme') &&
          b.includes('rgba(255, 255, 255, 0.6)')
      );
    expect(light, 'light-theme warp tint block').toBeDefined();
    expect(light).toContain('rgba(255, 255, 255, 0.6)');
    expect(light).not.toContain('toast-notification');
  });

  it('keeps each toast type colour as its warp tint, after the base tints', () => {
    const types = [
      ['toast-error', '220, 53, 69'],
      ['toast-success', '40, 167, 69'],
      ['toast-info', '33, 150, 243'],
      ['toast-warning', '255, 152, 0']
    ];
    for (const [type, rgb] of types) {
      const block = blockWith(`.${type}.glass--liquid > .glass__warp`);
      expect(block, `warp tint for ${type}`).toBeDefined();
      expect(block).toContain(`background: rgba(${rgb}, 0.7)`);
    }
    // The light base tint must precede the type tints so a typed
    // light-theme toast resolves to its type colour.
    const source = strip();
    const lightToastIndex = source.indexOf(
      'body.glass-liquid.light-theme .toast-notification.glass--liquid > .glass__warp'
    );
    const typeIndex = source.indexOf('.toast-error.glass--liquid > .glass__warp');
    expect(lightToastIndex).toBeGreaterThanOrEqual(0);
    expect(typeIndex).toBeGreaterThan(lightToastIndex);
  });
});

describe('tier-2 content stacking (#1158, mirroring #1155)', () => {
  it('raises every direct child above the warp on all six surfaces', () => {
    const block = cssBlock('.glass--liquid > *:not(.glass__warp)');
    expect(block).toContain('body.glass-liquid :is(');
    expect(block).toContain('z-index: 1');
    expect(block).toContain('position: relative');
    for (const excluded of ['.glass__warp', '.glass__highlight', '.glass__over-light', '.glass__hover']) {
      expect(block).toContain(`:not(${excluded})`);
    }
    for (const selector of [
      '#settings-modal > div',
      '#add-app-modal > div',
      '.folder-popup-content',
      '.app-context-menu',
      '.search-history-panel',
      '.toast-notification'
    ]) {
      expect(block).toContain(selector);
    }
  });
});

describe('tier-2 entrance gating (#1158, mirroring #875)', () => {
  it('holds the warp back while the settings dialog is closed, 0.18s after opening', () => {
    const closed = cssBlock('#settings-modal:not(.modal-open)');
    expect(closed).toContain('backdrop-filter: none');
    expect(closed).toContain('-webkit-backdrop-filter: none');

    const open = cssBlock('#settings-modal.modal-open > div.glass--liquid');
    expect(open).toContain('backdrop-filter: var(--lg-filter)');
    expect(open).toMatch(
      /transition: backdrop-filter 0\.01s linear 0\.18s allow-discrete,\s+-webkit-backdrop-filter 0\.01s linear 0\.18s allow-discrete/
    );
  });

  it('holds the warp back while the add-app dialog is closed, 0.3s after opening', () => {
    const open = cssBlock('#add-app-modal.modal-open > div.glass--liquid');
    expect(open).toMatch(
      /transition: backdrop-filter 0\.01s linear 0\.3s allow-discrete,\s+-webkit-backdrop-filter 0\.01s linear 0\.3s allow-discrete/
    );
    expect(cssBlock('#add-app-modal:not(.modal-open)')).toContain('backdrop-filter: none');
  });

  it('holds the warp back until the toast is shown, 0.3s after the show class lands', () => {
    const open = cssBlock('.toast-notification.show.glass--liquid');
    expect(open).toMatch(
      /transition: backdrop-filter 0\.01s linear 0\.3s allow-discrete,\s+-webkit-backdrop-filter 0\.01s linear 0\.3s allow-discrete/
    );
    const closed = cssBlock('.toast-notification:not(.show)');
    expect(closed).toContain('backdrop-filter: none');
  });

  it('waits out the context menu\'s 0.2s menuFadeIn with a delayed warp animation', () => {
    const block = cssBlock('.app-context-menu.glass--liquid .glass__warp');
    expect(block).toContain('-webkit-backdrop-filter: none');
    expect(block).toContain('backdrop-filter: none');
    expect(block).toContain('animation: liquidGlassWarpIn 0.01s linear 0.2s forwards');

    const keyframes = LIQUID_CSS.match(
      /@keyframes liquidGlassWarpIn \{[\s\S]*?to \{[\s\S]*?backdrop-filter: var\(--lg-filter\)/
    );
    expect(keyframes, '@keyframes liquidGlassWarpIn ends on var(--lg-filter)').not.toBeNull();
  });

  it('scopes every new rule to body.glass-liquid so classic mode is untouched', () => {
    const stripped = LIQUID_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const newRules = [
      '.toast-notification\n).glass--liquid {',
      '.glass--liquid > *:not(.glass__warp)',
      '#settings-modal:not(.modal-open)',
      '#settings-modal.modal-open > div.glass--liquid',
      '#add-app-modal.modal-open > div.glass--liquid',
      '.toast-notification.show.glass--liquid',
      '.app-context-menu.glass--liquid .glass__warp'
    ];
    for (const fragment of newRules) {
      const block = stripped.split('}').find((b) => b.includes(fragment));
      expect(block, `block for ${fragment}`).toBeDefined();
      expect(block.trim().startsWith('body.glass-liquid'), `${fragment} must start with body.glass-liquid`).toBe(true);
      if (fragment === '#settings-modal:not(.modal-open)') {
        for (const selector of block.split('{')[0].split(',')) {
          expect(selector.trim().startsWith('body.glass-liquid'), `closed-state selector ${selector}`).toBe(true);
        }
      }
    }
  });
});

describe('tier-2 scroll containers (#1158)', () => {
  it('moves the folder card scroll onto the apps grid', () => {
    const core = read('css/core.css');
    const content = core.match(/\.folder-popup-content \{[^}]*\}/)[0];
    expect(content).not.toMatch(/overflow-y:\s*auto/);
    expect(content).toMatch(/overflow:\s*hidden/);
    expect(content).toMatch(/flex-direction:\s*column/);

    const apps = core.match(/\.folder-popup-apps \{[^}]*\}/)[0];
    expect(apps).toMatch(/overflow-y:\s*auto/);

    const header = core.match(/\.folder-popup-header \{[^}]*\}/)[0];
    expect(header).toMatch(/flex-shrink:\s*0/);
  });

  it('moves the add-app dialog scroll onto the inner wrapper', () => {
    const core = read('css/core.css');
    const panel = core.match(/#add-app-modal > div \{[^}]*\}/)[0];
    expect(panel).not.toMatch(/overflow-y:\s*auto/);
    expect(panel).toMatch(/overflow:\s*hidden/);
    expect(panel).toMatch(/display:\s*flex/);
    // The #1158/#1066 sizing declarations stay in the panel rule.
    expect(panel).toMatch(/max-width:\s*min\(var\(--modal-width-md\), calc\(100vw - 32px\)\)/);
    expect(panel).toMatch(/max-height:\s*var\(--overlay-max-height\)/);

    const wrapper = core.match(/\.add-app-scroll \{[^}]*\}/)[0];
    expect(wrapper).toMatch(/overflow-y:\s*auto/);
    expect(wrapper).toMatch(/min-height:\s*0/);

    expect(HTML).toMatch(
      /<div data-liquid-glass="panel">\s*(?:<!--[\s\S]*?-->\s*)?<div class="add-app-scroll">/
    );
  });
});

describe('tier-2 enhancement pipeline (#1158)', () => {
  function fakeCanvasContext() {
    return {
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: () => {}
    };
  }

  let getContextSpy;

  beforeEach(() => {
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(fakeCanvasContext);
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
    globalThis.CSS = { supports: () => true };
    globalThis.SVGFilterElement = function SVGFilterElement() {};
    window.prefersReducedMotion = () => false;
    window.onReducedMotionChange = () => () => {};
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    window.LiquidGlass?.release();
    document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
    getContextSpy.mockRestore();
    vi.restoreAllMocks();
    delete globalThis.CSS;
    delete globalThis.SVGFilterElement;
  });

  function loadGlass(style) {
    localStorage.setItem('liquidGlassEnabled', style === 'liquid' ? 'true' : 'false');
    localStorage.setItem('theme', 'dark');
    injectScript('src/data/liquid-glass-maps.js');
    injectScript('src/ui/liquid-glass.js');
    injectScript('src/core/toast.js');
    window.LiquidGlass.init();
  }

  itWhenLiquidEnabled('enhances a toast raised after init through the observer', async () => {
    loadGlass('liquid');

    const handle = window.showToast('refract me', 'info');
    await vi.waitFor(() => {
      expect(handle.element.querySelector('.glass__warp')).not.toBeNull();
    });
    expect(handle.element.getAttribute('data-liquid-glass')).toBe('panel');
    expect(handle.element.classList.contains('glass--liquid')).toBe(true);
    // The message rides in an element child so the raise rule can stack it
    // above the absolutely positioned warp layer.
    expect(handle.element.querySelector(':scope > .toast-message')).not.toBeNull();
    expect(handle.element.querySelector('.toast-message').textContent).toBe('refract me');
    handle.dismiss();
  });

  itWhenLiquidEnabled('enhances a marked surface from the static markup shape', async () => {
    document.getElementById('settings-modal')?.remove();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="settings-modal"><div data-liquid-glass="panel"></div></div>'
    );
    loadGlass('liquid');

    const panel = document.querySelector('#settings-modal > div');
    await vi.waitFor(() => {
      expect(panel.querySelector('.glass__warp')).not.toBeNull();
    });
    expect(panel.classList.contains('glass--liquid')).toBe(true);
    document.getElementById('settings-modal')?.remove();
  });

  it('leaves a classic-style toast unenhanced', () => {
    loadGlass('classic');

    const handle = window.showToast('classic', 'info');
    expect(handle.element.getAttribute('data-liquid-glass')).toBe('panel');
    expect(handle.element.querySelector('.glass__warp')).toBeNull();
    expect(handle.element.classList.contains('glass--liquid')).toBe(false);
    expect(document.body.classList.contains('glass-liquid')).toBe(false);
    handle.dismiss();
  });
});
