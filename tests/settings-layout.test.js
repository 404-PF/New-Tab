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