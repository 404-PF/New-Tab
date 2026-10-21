import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';

const CORE_CSS_PATH = resolve(process.cwd(), 'css/core.css');
const GLASS_CSS_PATH = resolve(process.cwd(), 'css/glass.css');
const HTML_PATH = resolve(process.cwd(), 'New-Tab.html');
const SETTINGS_JS_PATH = resolve(process.cwd(), 'src/ui/settings.js');

function readCoreCss() {
  return readFileSync(CORE_CSS_PATH, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
}

function readGlassCss() {
  return readFileSync(GLASS_CSS_PATH, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
}

beforeAll(() => {
  // Replace the bare settings-modal stub from tests/setup.js with a menu and
  // sections so settings.js attaches real tab-switching handlers on inject.
  document.getElementById('settings-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="settings-modal">
      <div>
        <div class="settings-body">
          <nav class="settings-menu">
            <button type="button" class="settings-menu-item selected" data-section="general">General</button>
            <button type="button" class="settings-menu-item" data-section="background">Background</button>
            <button type="button" class="settings-menu-item" data-section="about">About</button>
          </nav>
          <div class="settings-content">
            <section class="settings-section selected" data-section="general"></section>
            <section class="settings-section" data-section="background"></section>
            <section class="settings-section" data-section="about"></section>
          </div>
        </div>
      </div>
    </div>
  `);
  injectScript('src/core/motion.js');
  injectScript('src/ui/color-picker.js');
  injectScript('src/ui/font-picker.js');
  injectScript('src/ui/settings.js');
});

describe('Settings modal entrance blur (#875)', () => {
  it('keeps the full-screen backdrop blur off the animated overlay state', () => {
    const css = readCoreCss();

    const baseRule = css.match(/#settings-modal\s*\{[^}]*\}/);
    expect(baseRule).not.toBeNull();
    expect(baseRule[0]).not.toMatch(/backdrop-filter/);
    expect(baseRule[0]).toMatch(/transition:\s*opacity 0\.18s ease-out;/);

    const openRule = css.match(/#settings-modal\.modal-open\s*\{[^}]*\}/);
    expect(openRule).not.toBeNull();
    expect(openRule[0]).toMatch(/backdrop-filter:\s*blur\(16px\)/);
    expect(openRule[0]).toMatch(/-webkit-backdrop-filter:\s*blur\(16px\)/);
    // The blur lands only after the fade finishes, so the overlay never
    // re-blurs on every animation frame. Engines that only honor the
    // prefixed property must be delayed by the same amount.
    expect(openRule[0]).toMatch(/transition:\s*opacity 0\.18s ease-out,\s*backdrop-filter 0\.01s linear 0\.18s/);
    expect(openRule[0]).toMatch(/-webkit-backdrop-filter 0\.01s linear 0\.18s/);
  });

  it('does not stack a second live blur on the settings dialog', () => {
    const css = readCoreCss();
    const dialogRule = css.match(/#settings-modal > div\s*\{[^}]*\}/);
    expect(dialogRule).not.toBeNull();
    expect(dialogRule[0]).not.toMatch(/backdrop-filter/);

    const glass = readGlassCss();
    const glassDialogOverride = glass.match(/body\.light-theme #settings-modal > div\s*\{[^}]*\}/);
    expect(glassDialogOverride).not.toBeNull();
    expect(glassDialogOverride[0]).toMatch(/backdrop-filter:\s*none/);
  });

  it('mirrors the delayed single blur for the light glass theme', () => {
    const glass = readGlassCss();

    // #settings-modal no longer shares the always-on overlay blur group.
    expect(glass).not.toMatch(/body\.light-theme :is\(\s*#settings-modal,/);

    const overlayRule = glass.match(/body\.light-theme #settings-modal\s*\{[^}]*\}/);
    expect(overlayRule).not.toBeNull();
    expect(overlayRule[0]).toMatch(/background:\s*var\(--glass-overlay\)/);
    expect(overlayRule[0]).toMatch(/backdrop-filter:\s*none/);

    const openRule = glass.match(/body\.light-theme #settings-modal\.modal-open\s*\{[^}]*\}/);
    expect(openRule).not.toBeNull();
    expect(openRule[0]).toMatch(/backdrop-filter:\s*blur\(var\(--glass-overlay-blur\)\)/);
    expect(openRule[0]).toMatch(/transition:\s*opacity 0\.18s ease-out,\s*backdrop-filter 0\.01s linear 0\.18s/);
    expect(openRule[0]).toMatch(/-webkit-backdrop-filter 0\.01s linear 0\.18s/);
  });
});

describe('Settings menu and section transitions (#875)', () => {
  it('scopes menu-item transitions to an explicit property list', () => {
    const css = readCoreCss();
    const rule = css.match(/\.settings-menu-item\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();

    const transition = rule[0].match(/transition:\s*([^;]+);/);
    expect(transition).not.toBeNull();
    const props = transition[1];
    expect(props).not.toMatch(/\ball\b/);
    expect(props).not.toContain('font-weight');
    ['background', 'color', 'transform', 'box-shadow'].forEach((prop) => {
      expect(props, prop).toContain(prop);
    });
  });

  it('stacks sections in one grid cell and crossfades via opacity/visibility', () => {
    const css = readCoreCss();

    const contentRule = css.match(/\.settings-content\s*\{[^}]*\}/);
    expect(contentRule).not.toBeNull();
    expect(contentRule[0]).toMatch(/display:\s*grid/);
    expect(contentRule[0]).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);

    // The reduced-motion override at the top of the file uses the same bare
    // selector; the visual base rule is the one that grid-stacks the
    // sections.
    const sectionRules = [...css.matchAll(/\.settings-section\s*\{[^}]*\}/g)]
      .map((match) => match[0]);
    const sectionRule = sectionRules.find((rule) => /grid-area:/.test(rule));
    expect(sectionRule).toBeDefined();
    expect(sectionRule).toMatch(/grid-area:\s*1 \/ 1/);
    expect(sectionRule).toMatch(/opacity:\s*0/);
    expect(sectionRule).toMatch(/visibility:\s*hidden/);
    // Size-contained inactive tabs stay out of the shared scroller, so short
    // tabs no longer scroll through the tallest section's empty space.
    expect(sectionRule).toMatch(/content-visibility:\s*hidden/);
    // Exit fade: this rule is the after-change style when `.selected` is
    // removed, so it carries the crossfade. `content-visibility` is discrete;
    // its explicit transition keeps the outgoing section painted until the
    // fade completes instead of snapping hidden on the first frame. The
    // duration is deliberately short so the tab swap reads as instant.
    expect(sectionRule).toMatch(/transition:[^;]*opacity 0\.09s ease-out/);
    expect(sectionRule).toMatch(/transition:[^;]*visibility 0\.09s ease-out/);
    expect(sectionRule).toMatch(/content-visibility 0\.09s ease-out allow-discrete/);

    // Only the visual rule uses `.selected`; the reduced-motion override
    // targets the base selector so it also disables the exit fade.
    const selectedRules = [...css.matchAll(/\.settings-section\.selected\s*\{[^}]*\}/g)]
      .map((match) => match[0]);
    expect(selectedRules.length).toBe(1);
    const visibleRule = selectedRules[0];
    expect(visibleRule).toMatch(/opacity:\s*1/);
    expect(visibleRule).toMatch(/visibility:\s*visible/);
    expect(visibleRule).toMatch(/content-visibility:\s*visible/);
  });

  it('disables the settings modal animations under prefers-reduced-motion', () => {
    const css = readCoreCss();
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{(?:[^{}]*\{[^{}]*\}[^{}]*)*\}/);
    expect(reduced).not.toBeNull();
    expect(reduced[0]).toMatch(/#settings-modal/);
    expect(reduced[0]).toMatch(/#settings-modal > div/);
    expect(reduced[0]).toMatch(/\.settings-menu-item/);
    // The bare `.settings-section` selector covers both the entry transition
    // (on `.selected`) and the exit transition (on the base rule); bind the
    // declaration to that selector so it cannot pass via a sibling selector.
    expect(reduced[0]).toMatch(
      /\.settings-section\s*\{[^}]*transition:\s*none\s*!important/
    );
  });

  it('keeps New-Tab.html sections free of inline display toggles', () => {
    const html = readFileSync(HTML_PATH, 'utf-8');
    const parsedHtml = document.implementation.createHTMLDocument('New Tab');
    parsedHtml.documentElement.innerHTML = html;
    const sections = parsedHtml.querySelectorAll('#settings-modal .settings-section');

    expect(sections.length).toBeGreaterThan(0);
    sections.forEach((section) => {
      expect(section.style.display, section.getAttribute('data-section')).toBe('');
    });
    // The default tab matches the menu's pre-selected item so the page still
    // shows a section before (or without) JavaScript.
    expect(parsedHtml.querySelector('.settings-section.selected[data-section="general"]')).not.toBeNull();
  });
});

describe('Settings tab switching without display toggles (#875)', () => {
  it('starts on the About tab with exactly one selected section', () => {
    const sections = document.querySelectorAll('#settings-modal .settings-section');
    expect(sections.length).toBe(3);

    const selected = document.querySelectorAll('#settings-modal .settings-section.selected');
    expect(selected.length).toBe(1);
    expect(selected[0].getAttribute('data-section')).toBe('about');

    sections.forEach((section) => expect(section.style.display).toBe(''));
  });

  it('switches sections via the selected class and leaves display untouched', () => {
    const generalItem = document.querySelector(
      '#settings-modal .settings-menu-item[data-section="general"]'
    );
    const general = document.querySelector('#settings-modal .settings-section[data-section="general"]');
    const about = document.querySelector('#settings-modal .settings-section[data-section="about"]');

    generalItem.click();

    expect(generalItem.classList.contains('selected')).toBe(true);
    expect(general.classList.contains('selected')).toBe(true);
    expect(about.classList.contains('selected')).toBe(false);
    // Switching must never reintroduce display-based show/hide, and both
    // sections stay rendered so the crossfade has no relayout.
    expect(general.style.display).toBe('');
    expect(about.style.display).toBe('');
    expect(general.isConnected).toBe(true);
    expect(about.isConnected).toBe(true);
  });

  it('does not hardcode display toggles for settings sections in settings.js', () => {
    const settingsJs = readFileSync(SETTINGS_JS_PATH, 'utf-8');
    expect(settingsJs).not.toMatch(/s\.style\.display\s*=\s*'(block|none)'/);
  });
});

describe('Settings animations stay snappy (#875)', () => {
  it('keeps the modal entrance under 200ms', () => {
    const css = readCoreCss();
    const dialogRule = css.match(/#settings-modal > div\s*\{[^}]*\}/);
    expect(dialogRule).not.toBeNull();

    const transition = dialogRule[0].match(/transition:\s*([^;]+);/);
    expect(transition).not.toBeNull();
    // 0.3s with an overshooting spring made the panel feel like it trailed
    // the click; anything at or above 0.3s regresses that.
    expect(transition[1]).not.toMatch(/0\.3s/);
    expect(transition[1]).toMatch(/opacity 0\.18s ease-out/);
    expect(transition[1]).toMatch(/transform 0\.18s ease-out/);
  });

  it('keeps the menu hover feedback under 200ms', () => {
    const css = readCoreCss();
    const rule = css.match(/\.settings-menu-item\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();

    const transition = rule[0].match(/transition:\s*([^;]+);/);
    expect(transition).not.toBeNull();
    expect(transition[1]).not.toMatch(/0\.25s/);
    ['background', 'color', 'transform', 'box-shadow'].forEach((prop) => {
      expect(transition[1], prop).toMatch(new RegExp(`${prop} 0\\.15s ease-out`));
    });
  });

  it('keeps the tab crossfade under 100ms', () => {
    const css = readCoreCss();
    const sectionRules = [...css.matchAll(/\.settings-section\s*\{[^}]*\}/g)].map((m) => m[0]);
    const sectionRule = sectionRules.find((rule) => /grid-area:/.test(rule));
    expect(sectionRule).toBeDefined();

    const transitions = [...sectionRule.matchAll(/transition:[^;]*;/g)].map((m) => m[0]);
    // Both the fallback and the allow-discrete declaration must use the short
    // duration; a stale 0.15s on either one makes the swap read as laggy.
    expect(transitions.length).toBe(2);
    transitions.forEach((declaration) => {
      expect(declaration).not.toMatch(/0\.15s/);
      expect(declaration).toMatch(/0\.09s ease-out/);
    });

    const selected = css.match(/\.settings-section\.selected\s*\{[^}]*\}/);
    expect(selected).not.toBeNull();
    expect(selected[0]).toMatch(/transition:\s*opacity 0\.09s ease-out;/);
  });
});
