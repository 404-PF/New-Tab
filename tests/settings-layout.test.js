import { readFileSync } from 'fs';
import { resolve } from 'path';

const CORE_CSS_PATH = resolve(process.cwd(), 'css/core.css');
const FEATURES_CSS_PATH = resolve(process.cwd(), 'css/features.css');
const HTML_PATH = resolve(process.cwd(), 'New-Tab.html');

describe('Settings layout stability (#512)', () => {
  it('uses a stable modal width and reserves scrollbar space', () => {
    const css = readFileSync(CORE_CSS_PATH, 'utf-8');

    expect(css).toMatch(/#settings-modal > div\s*\{[^}]*width:\s*min\(720px, calc\(100vw - 32px\)\)/);
    expect(css).toMatch(/\.settings-body\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.settings-content\s*\{[^}]*min-width:\s*0[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto[^}]*scrollbar-gutter:\s*stable/);
    expect(css).toMatch(/\.settings-section\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/\.settings-menu-item\s*\{[^}]*min-width:\s*0[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/);
  });

  it('keeps the sidebar scrollable and pinned while the content scrolls', () => {
    const css = readFileSync(CORE_CSS_PATH, 'utf-8');

    expect(css).toMatch(/\.settings-menu\s*\{[^}]*overflow-y:\s*scroll/);
    expect(css).toMatch(/\.settings-body\s*\{[^}]*height:\s*min\(640px, var\(--overlay-max-height\)\)/);
    expect(css).not.toMatch(/\.settings-body\s*\{[^}]*height:\s*min\(640px, var\(--overlay-max-height\), 400px\)/);
  });

  it('keeps all settings sections nested inside the content area', () => {
    const html = readFileSync(HTML_PATH, 'utf-8');
    const parsedHtml = document.implementation.createHTMLDocument('New Tab');
    parsedHtml.documentElement.innerHTML = html;
    const settingsContent = parsedHtml.querySelector('#settings-modal .settings-content');
    const sections = parsedHtml.querySelectorAll('.settings-section');

    expect(settingsContent).not.toBeNull();
    expect(sections.length).toBeGreaterThan(0);
    expect(parsedHtml.querySelector('[data-section="about"]')).not.toBeNull();
    sections.forEach((section) => {
      expect(settingsContent.contains(section)).toBe(true);
    });
  });

  it('keeps the narrow layout centered with contained scrolling', () => {
    const css = readFileSync(FEATURES_CSS_PATH, 'utf-8');
    const mq = css.match(/@media screen and \(max-width: 600px\) \{(?:[^{}]*\{[^{}]*\}[^{}]*)*\}/);
    expect(mq).toBeTruthy();

    expect(mq[0]).toMatch(/#settings-modal\s*\{[^}]*justify-content:\s*center/);
    expect(mq[0]).toMatch(/#settings-modal > div\s*\{[^}]*width:\s*calc\(100vw - 24px\)[^}]*min-width:\s*0/);
    expect(mq[0]).toMatch(/\.settings-content\s*\{[^}]*min-height:\s*0[^}]*max-height:\s*none/);
    expect(mq[0]).toMatch(/\.settings-body\s*\{[^}]*height:\s*min\(720px, calc\(85vh - 20px\)\)[^}]*max-height:\s*min\(720px, calc\(85vh - 20px\)\)/);
  });
});

describe('Background readability overlay (#709)', () => {
  it('places the overlay after the transition snapshot inside the background container', () => {
    const html = readFileSync(HTML_PATH, 'utf-8');
    const parsedHtml = document.implementation.createHTMLDocument('New Tab');
    parsedHtml.documentElement.innerHTML = html;
    const container = parsedHtml.getElementById('background-container');
    const overlay = parsedHtml.getElementById('bg-overlay');
    const transition = parsedHtml.getElementById('bg-transition-overlay');

    expect(container).not.toBeNull();
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    expect(overlay.classList.contains('background-overlay')).toBe(true);
    expect(container.contains(overlay)).toBe(true);
    expect(container.lastElementChild).toBe(overlay);
    expect(transition.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('places the readability controls between playback and rotation', () => {
    const html = readFileSync(HTML_PATH, 'utf-8');
    const parsedHtml = document.implementation.createHTMLDocument('New Tab');
    parsedHtml.documentElement.innerHTML = html;
    const section = parsedHtml.getElementById('bg-overlay-section');
    const rotation = parsedHtml.getElementById('bg-rotation-section');
    const playback = parsedHtml.querySelector('#bg-live-section .bg-playback-controls');
    const controlIds = [
      'bg-overlay-dim',
      'bg-overlay-blur',
      'bg-tint-strength',
      'bg-tint-color',
      'bg-overlay-reset',
      'bg-overlay-dim-value',
      'bg-overlay-blur-value',
      'bg-tint-strength-value',
    ];

    expect(section).not.toBeNull();
    expect(playback.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.compareDocumentPosition(rotation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    controlIds.forEach((id) => {
      const control = parsedHtml.getElementById(id);
      expect(control, id).not.toBeNull();
      expect(section.contains(control), id).toBe(true);
    });
    ['bg-overlay-dim', 'bg-overlay-blur', 'bg-tint-strength', 'bg-tint-color', 'bg-overlay-reset'].forEach((id) => {
      expect(parsedHtml.getElementById(id).closest('.setting-card'), id).not.toBeNull();
    });
  });

  it('styles the overlay, reduced motion, the video blur fallback, and light-theme ranges', () => {
    const css = readFileSync(CORE_CSS_PATH, 'utf-8');

    expect(css).toMatch(/\.background-container\s*\{[^}]*--bg-overlay-opacity:\s*0;/);
    expect(css).toMatch(/\.background-overlay\s*\{[^}]*z-index:\s*5;[^}]*pointer-events:\s*none;[^}]*backdrop-filter:\s*blur\(var\(--bg-overlay-blur\)\);/);
    expect(css).toMatch(/\.background-overlay\.inactive\s*\{[^}]*display:\s*none;/);
    expect(css).toMatch(/\.bg-overlay-blur-media \.background-full\s*\{[^}]*filter:\s*blur\(var\(--bg-overlay-blur\)\);[^}]*transform:\s*scale\(1\.05\);/);
    expect(css).toMatch(/\.bg-overlay-blur-media:has\(\.background-full\.loaded\) \.background-overlay\s*\{[^}]*backdrop-filter:\s*none;/);
    expect(css).toMatch(/filter:\s*blur\(var\(--bg-overlay-blur\)\);[^}]*transform:\s*translate3d\(0,\s*0,\s*0\)\s*scale\(1\.05\);/);
    expect(css).not.toMatch(/\.background-overlay\s*\{[^}]*transition:/);

    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{(?:[^{}]*\{[^{}]*\}[^{}]*)*\}/);
    expect(reduced).toBeTruthy();
    expect(reduced[0]).toMatch(/\.background-transition-overlay\s*\{[^}]*transition:\s*none;/);
    expect(reduced[0]).not.toMatch(/\.background-overlay/);
    expect(css).toMatch(/body\.light-theme #bg-overlay-section input\[type="range"\]/);
    expect(css).not.toMatch(/body\.simple-mode[^{]*\.background-overlay/);
    expect(css).not.toMatch(/data-focus-mode[^{]*\.background-overlay/);
  });
});