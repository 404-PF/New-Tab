import { readFileSync } from 'fs';
import { resolve } from 'path';

const GLASS_CSS_PATH = resolve(process.cwd(), 'css/glass.css');
const APP_CSS_PATH = resolve(process.cwd(), 'css/app.css');
const STYLE_CSS_PATH = resolve(process.cwd(), 'style.css');

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

describe('Light-theme glassmorphism for Todo and Notes (#809)', () => {
  it('loads glass.css after app.css so light glass wins equal-specificity rules', () => {
    const style = readFileSync(STYLE_CSS_PATH, 'utf-8');
    const appIndex = style.indexOf('css/app.css');
    const glassIndex = style.indexOf('css/glass.css');

    expect(appIndex).toBeGreaterThan(-1);
    expect(glassIndex).toBeGreaterThan(appIndex);
  });

  it('defines light-theme glass tokens with an opaque backdrop-filter fallback', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');

    expect(css).toMatch(
      /body\.light-theme\s*\{[\s\S]*?--glass-surface:\s*rgba\(255,\s*255,\s*255,\s*0\.88\)/
    );
    expect(css).toMatch(/--glass-text-primary:\s*#0f172a/);
    expect(css).toMatch(/--glass-text-secondary:\s*#334155/);
    expect(css).toMatch(/--glass-text-muted:\s*#475569/);
    expect(css).toMatch(
      /@supports \(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)/
    );
    expect(css).toMatch(
      /@supports \(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\s*\{\s*:root\s*\{[\s\S]*?body\.light-theme\s*\{[\s\S]*?--glass-surface:\s*rgba\(255,\s*255,\s*255,\s*0\.56\)/
    );
  });

  it('keeps Todo and Notes widgets out of the shared light glass groups', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');
    // Several shared :is() groups contain an ID, which gives every member
    // ID-level specificity and would override the dark-mirror block.
    const widgets = /^\s*\.(todo-section|notes-section|todo-input-container|todo-item|note-item|notes-add-btn|notes-search-input|filter-pill|todo-stats-toggle)(\.active)?,?\s*$/m;
    const groups = [...css.matchAll(/body\.light-theme :is\(((?:[^()]|\([^()]*\))*)\)[^{]*\{/g)];
    expect(groups.length).toBeGreaterThan(0);
    groups.forEach((group) => expect(group[1]).not.toMatch(widgets));
  });

  it('gives light-theme Todo and Notes the exact dark-theme glass surfaces', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');
    const appCss = readFileSync(APP_CSS_PATH, 'utf-8');
    const escape = (sel) => sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const decls = (block) =>
      Object.fromEntries(
        block
          .split(';')
          .map((d) => d.split(':'))
          .filter((p) => p.length >= 2)
          .map(([k, ...v]) => [k.trim(), v.join(':').trim()])
      );
    const pairs = [
      '.todo-section',
      '.todo-input-container',
      '.todo-item',
      '.notes-add-btn',
      '.notes-search-input',
      '.note-item',
    ];
    pairs.forEach((sel) => {
      const dark = appCss.match(new RegExp(`^${escape(sel)}\\s*\\{([^}]*)\\}`, 'm'));
      const light = css.match(new RegExp(`^body\\.light-theme ${escape(sel)}\\s*\\{([^}]*)\\}`, 'm'));
      expect(dark, sel).not.toBeNull();
      expect(light, sel).not.toBeNull();
      const d = decls(dark[1]);
      const l = decls(light[1]);
      ['background', 'border', 'border-radius', 'box-shadow', 'backdrop-filter'].forEach((prop) => {
        if (d[prop] !== undefined && l[prop] !== undefined) {
          expect(l[prop], `${sel} ${prop}`).toBe(d[prop]);
        }
      });
    });
    // The dark Notes panel has no surface of its own.
    expect(css).toMatch(/^body\.light-theme \.notes-section\s*\{[^}]*background:\s*transparent;[^}]*backdrop-filter:\s*none;/m);
  });

  it('mirrors the dark theme blur radii on light panels and cards', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');
    const appCss = readFileSync(APP_CSS_PATH, 'utf-8');

    const darkPanelBlur = appCss.match(
      /\.todo-section\s*\{[^}]*backdrop-filter:\s*blur\((\d+px)\)/
    );
    const darkCardBlur = appCss.match(
      /\.todo-item\s*\{[^}]*backdrop-filter:\s*blur\((\d+px)\)/
    );
    const panelBlur = css.match(/--glass-blur:\s*(\d+px)/);
    const cardBlur = css.match(/--glass-blur-card:\s*(\d+px)/);

    expect(darkPanelBlur).not.toBeNull();
    expect(darkCardBlur).not.toBeNull();
    expect(panelBlur).not.toBeNull();
    expect(cardBlur).not.toBeNull();
    expect(panelBlur[1]).toBe(darkPanelBlur[1]);
    expect(cardBlur[1]).toBe(darkCardBlur[1]);
  });

  it('keeps light-theme note tag pills and grip styled', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');
    expect(css).toMatch(/body\.light-theme :is\(\.note-tag-filter-btn, \.note-tag-suggestion\)\s*\{/);
    expect(css).toMatch(/body\.light-theme \.note-grip\s*\{[^}]*color:\s*rgba\(15, 23, 42, 0\.5\)/);
  });

  it('keeps dark-theme base todo/notes rules untouched in app.css', () => {
    const appCss = readFileSync(APP_CSS_PATH, 'utf-8');

    expect(appCss).toMatch(
      /\.todo-section\s*\{[^}]*background:\s*rgba\(255, 255, 255, 0\.02\);[^}]*backdrop-filter:\s*blur\(20px\)/
    );
    expect(appCss).toMatch(/\.notes-section\s*\{\s*width: var\(--todo-list-width, 75%\);/);
    expect(appCss).toMatch(/\.note-item\s*\{[^}]*background:\s*rgba\(255, 255, 255, 0\.06\)/);
    expect(appCss).toMatch(/\.todo-item\s*\{[^}]*background:\s*rgba\(255, 255, 255, 0\.06\)/);
  });

  it('removes legacy near-opaque light-theme overrides that fought the glass cascade', () => {
    const appCss = readFileSync(APP_CSS_PATH, 'utf-8');

    expect(appCss).not.toMatch(/body\.light-theme \.todo-section\s*\{/);
    expect(appCss).not.toMatch(/body\.light-theme \.todo-item\s*\{/);
    expect(appCss).not.toMatch(/body\.light-theme \.todo-input-container\s*\{/);
    expect(appCss).not.toMatch(/body\.light-theme \.todo-stats-panel\s*\{/);
    expect(appCss).not.toMatch(/body\.light-theme \.todo-stats-toggle\s*\{/);
    expect(appCss).not.toMatch(/body\.light-theme \.todo-stat-card\s*\{/);
    expect(appCss).not.toMatch(/body\.light-theme \.notes-add-btn\s*\{/);
    expect(appCss).not.toMatch(/body\.light-theme \.note-item\s*\{/);
    expect(appCss).not.toMatch(/body\.light-theme \.notes-search-input\s*\{/);
  });
});

describe('Light-theme note grip contrast', () => {
  it('keeps the drag-handle dots at 3:1 or better against a white note card', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');
    const match = css.match(
      /body\.light-theme \.note-grip\s*\{\s*color:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/
    );
    expect(match).not.toBeNull();
    const [r, g, b, a] = match.slice(1).map(Number);
    const blended = [r, g, b].map((c) => c * a + 255 * (1 - a));
    const contrast = (1.05) / (luminance(blended) + 0.05);
    expect(contrast).toBeGreaterThanOrEqual(3);
  });
});

describe('Light-theme notes search focus indicator', () => {
  it('gives the notes search input an explicit focus-visible outline', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');
    const rule = css.match(/body\.light-theme \.notes-search-input:focus-visible,[\s\S]*?\{([\s\S]*?)\}/);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/outline:\s*2px solid/);
  });
});

describe('Light-theme frosted panel contrast', () => {
  it('keeps primary text at WCAG AA against the frosted panel surface', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');

    const surface = css.match(
      /@supports \(backdrop-filter: blur\(1px\)\)[\s\S]*?body\.light-theme\s*\{[\s\S]*?--glass-surface:\s*rgba\(255, 255, 255, ([\d.]+)\)/
    );
    expect(surface).not.toBeNull();
    expect(css).toMatch(/--glass-text-primary:\s*#0f172a/);

    const blended = 255 * Number(surface[1]);
    const contrast =
      (luminance([blended, blended, blended]) + 0.05) / (luminance([15, 23, 42]) + 0.05);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the primary text color for the light-theme empty-notes text', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');
    const rule = css.match(/body\.light-theme \.notes-empty\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/color:\s*var\(--glass-text-primary\)/);
    const mutedGroups = [...css.matchAll(/body\.light-theme :is\(([^)]*)\)\s*\{\s*color:\s*var\(--glass-text-muted\)/g)];
    expect(mutedGroups.length).toBeGreaterThan(0);
    mutedGroups.forEach((group) => expect(group[1]).not.toMatch(/\.notes-empty/));
  });
});
