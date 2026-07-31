import { readFileSync } from 'fs';
import { resolve } from 'path';

const CORE_CSS_PATH = resolve(process.cwd(), 'css/core.css');
const FEATURES_CSS_PATH = resolve(process.cwd(), 'css/features.css');

describe('Settings layout stability (#512)', () => {
  it('uses a stable modal width and reserves scrollbar space', () => {
    const css = readFileSync(CORE_CSS_PATH, 'utf-8');

    expect(css).toMatch(/#settings-modal > div\s*\{[^}]*width:\s*min\(720px, calc\(100vw - 32px\)\)/);
    expect(css).toMatch(/\.settings-body\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.settings-content\s*\{[^}]*min-width:\s*0[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto[^}]*scrollbar-gutter:\s*stable/);
    expect(css).toMatch(/\.settings-section\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/\.settings-menu-item\s*\{[^}]*min-width:\s*0[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/);
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