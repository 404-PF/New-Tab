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
});

const CSS_FILES = ['css/shell.css', 'css/core.css', 'css/features.css', 'css/app.css', 'css/glass.css'];
const WIDGET_EXCLUSION =
  ':where(:not(.todo-section, .notes-section, .todo-section *, .notes-section *))';
const WIDGET_NAME = /\.(todo|note|filter-(pill|badge))|#(todo|notes)/;

function selectorParts(selector) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of selector) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts.map((p) => p.replace(/\s+/g, ' '));
}

function themedSelectors() {
  return CSS_FILES.flatMap((file) => {
    const css = readFileSync(resolve(process.cwd(), file), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
    return [...css.matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1].trim())
      .filter((sel) => sel.includes('light-theme') && !sel.startsWith('@'))
      .flatMap((sel) => selectorParts(sel).map((part) => ({ file, part })));
  });
}

describe('Light-theme Todo and Notes parity with the dark theme (#809)', () => {
  it('scopes every light-theme selector naming a Todo or Notes element out of the widgets', () => {
    const offenders = themedSelectors().filter(
      ({ part }) => part.includes('light-theme') && WIDGET_NAME.test(part) && !part.includes(WIDGET_EXCLUSION)
    );
    expect(offenders).toEqual([]);
  });

  it('scopes generic light-theme control rules out of the widgets', () => {
    const parts = themedSelectors().map(({ part }) => part);
    [
      'body.light-theme button:focus-visible',
      'body.light-theme select:focus-visible',
      'body.light-theme input',
      'body.light-theme textarea',
    ].forEach((prefix) => {
      const matching = parts.filter((p) => p.startsWith(prefix));
      expect(matching.length, prefix).toBeGreaterThan(0);
      matching.forEach((p) => expect(p, p).toContain(':where(:not('));
    });
  });

  it('places the zero-specificity exclusion before any pseudo-element', () => {
    themedSelectors()
      .filter(({ part }) => part.includes('::'))
      .forEach(({ part }) => {
        expect(part, part).not.toMatch(/::[\w-]+(\([^)]*\))?:where/);
        // Pseudo-elements are invalid inside :is()/:where() and drop the rule.
        expect(part, part).not.toMatch(/:(is|where)\([^)]*::/);
      });
  });

  it('has no dark-only or light-only Todo/Notes overrides left', () => {
    const app = readFileSync(APP_CSS_PATH, 'utf-8');
    const glass = readFileSync(GLASS_CSS_PATH, 'utf-8');
    expect(app).not.toMatch(/body:not\(\.light-theme\)\s+\.(todo|note)/);
    expect(app).not.toMatch(/body\.light-theme \.todo-title\s*\{/);
    expect(glass).not.toMatch(/body\.light-theme \.notes-empty\s*\{/);
    expect(glass).not.toMatch(/body\.light-theme \.(todo-section|notes-section|todo-item|note-item)\s*\{/);
  });
});

const SHELL_CSS_PATH = resolve(process.cwd(), 'css/shell.css');
const FEATURES_CSS_PATH = resolve(process.cwd(), 'css/features.css');
const NEW_TAB_HTML_PATH = resolve(process.cwd(), 'New-Tab.html');

describe('Motto action buttons share the pill glass treatment (#975)', () => {
  it('includes both buttons in the light-theme primary surface group', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');
    const match = css.match(
      /body\.light-theme :is\(([^)]*)\)[^{]*\{[^}]*background:\s*var\(--glass-surface\)/
    );
    expect(match).not.toBeNull();
    expect(match[1]).toContain('#motto-container');
    expect(match[1]).toContain('#refresh-motto-btn');
    expect(match[1]).toContain('#copy-motto-btn');
  });

  it('gives both buttons the shared control hover tokens on their own rule', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');
    const match = css.match(
      /body\.light-theme :is\(\s*#refresh-motto-btn,\s*#copy-motto-btn\s*\)[^{]*\{[^}]*\}/
    );
    expect(match).not.toBeNull();
    expect(match[0]).toContain('var(--glass-control-hover)');
    expect(match[0]).toContain('var(--glass-border-hover)');
    expect(match[0]).toContain(':hover');
  });

  it('restates the focus ring above the light-theme primary-surface shadow', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');
    const rule = css.match(
      /body\.light-theme :is\(\s*#refresh-motto-btn,\s*#copy-motto-btn\s*\):focus-visible[^{]*\{([^}]*)\}/
    );
    expect(rule).not.toBeNull();
    expect(rule[1]).toContain('var(--glass-focus-ring)');
    expect(rule[1]).toMatch(/outline:\s*none/);
  });

  it('keeps the motto button IDs out of the shared control hover group', () => {
    // ID selectors inside the shared :is() group would raise every member to
    // ID-level specificity and override sibling states such as
    // .weather-choice-button.active, so the buttons use a dedicated rule.
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');
    const shared = css.match(
      /body\.light-theme :is\(([^)]*)\):is\(:hover, :active, \.active\)[^{]*\{[^}]*--glass-control-hover/
    );
    expect(shared).not.toBeNull();
    expect(shared[1]).not.toMatch(/#(refresh|copy)-motto-btn/);
  });

  it('pins the dark-theme base rule to theme-controlled colors with a 24px hit area and pointer cursor', () => {
    const css = readFileSync(SHELL_CSS_PATH, 'utf-8');
    const rule = css.match(/#refresh-motto-btn,\s*#copy-motto-btn\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    const body = rule[1];
    expect(body).toContain('cursor: pointer');
    expect(body).toMatch(/(?<![\w-])width:\s*24px/);
    expect(body).toMatch(/(?<![\w-])height:\s*24px/);
    expect(body).toMatch(/(?<![\w-])color:\s*inherit/);
    expect(body).toMatch(/background:\s*var\(--glass-control\)/);
    expect(body).not.toMatch(/rgb\(200,\s*200,\s*200\)/);
    expect(body).not.toMatch(/transition:\s*all/);
    expect(body).toMatch(/transition:[^;]*background-color/);
    expect(body).toMatch(/transition:[^;]*transform/);
  });

  it('replaces the lift+glow hover with scale and a visible dark tint', () => {
    const css = readFileSync(SHELL_CSS_PATH, 'utf-8');
    const rule = css.match(
      /#refresh-motto-btn:hover,\s*#copy-motto-btn:hover\s*\{([^}]*)\}/
    );
    expect(rule).not.toBeNull();
    const body = rule[1];
    expect(body).toMatch(/transform:\s*scale\(1\.08\)/);
    expect(body).not.toMatch(/translateY/);
    expect(body).not.toMatch(/box-shadow/);
    expect(body).not.toMatch(/rgba\(33,\s*150,\s*243/);
    expect(body).not.toContain('var(--glass-control-hover)');
    expect(body).toMatch(/background:\s*rgba\(15,\s*23,\s*42,\s*0\.12\)/);
  });

  it('adds a dark-theme focus-visible ring via the shared glass token', () => {
    const css = readFileSync(SHELL_CSS_PATH, 'utf-8');
    const rule = css.match(
      /#refresh-motto-btn:focus-visible,\s*#copy-motto-btn:focus-visible\s*\{([^}]*)\}/
    );
    expect(rule).not.toBeNull();
    expect(rule[1]).toContain('var(--glass-focus-ring)');
  });

  it('drops the legacy hardcoded light-theme motto button overrides', () => {
    const css = readFileSync(FEATURES_CSS_PATH, 'utf-8');
    expect(css).not.toMatch(/#refresh-motto-btn/);
    expect(css).not.toMatch(/#copy-motto-btn/);
  });

  it('wires the aria-labels to the existing translation keys', () => {
    const html = readFileSync(NEW_TAB_HTML_PATH, 'utf-8');
    expect(html).toMatch(
      /id="refresh-motto-btn"[^>]*aria-label="Refresh motto"[^>]*data-i18n-aria-label="refreshMotto"/
    );
    expect(html).toMatch(
      /id="copy-motto-btn"[^>]*aria-label="Copy motto"[^>]*data-i18n-aria-label="copyMotto"/
    );
  });
});
