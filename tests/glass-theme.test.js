import { readFileSync } from 'fs';
import { resolve } from 'path';

const GLASS_CSS_PATH = resolve(process.cwd(), 'css/glass.css');
const APP_CSS_PATH = resolve(process.cwd(), 'css/app.css');
const STYLE_CSS_PATH = resolve(process.cwd(), 'style.css');

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

  it('styles the light-theme todo and notes panel surfaces with frosted glass', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');

    const primary = css.match(
      /body\.light-theme :is\(\s*\.search-bar,[\s\S]*?\.todo-section,[\s\S]*?\.notes-section,[\s\S]*?\)\s*\{[\s\S]*?\}/
    );
    expect(primary).toBeTruthy();
    expect(primary[0]).toMatch(/background:\s*var\(--glass-surface\)/);
    expect(primary[0]).toMatch(/border:\s*1px solid var\(--glass-border\)/);
    expect(primary[0]).toMatch(/box-shadow:\s*var\(--glass-shadow\)/);
    expect(primary[0]).toMatch(
      /backdrop-filter:\s*blur\(var\(--glass-blur\)\)\s*saturate\(var\(--glass-saturate\)\)/
    );
  });

  it('styles light-theme todo and note list items as lightweight glass cards', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');

    const lightweight = css.match(
      /body\.light-theme :is\(\s*\.todo-item,\s*\.note-item,[\s\S]*?\)\s*\{[\s\S]*?\}/
    );
    expect(lightweight).toBeTruthy();
    expect(lightweight[0]).toMatch(/background:\s*var\(--glass-surface-subtle\)/);
    expect(lightweight[0]).toMatch(/border-color:\s*var\(--glass-border-subtle\)/);
  });

  it('styles light-theme notes inner controls (search, tag pills, add button, grip)', () => {
    const css = readFileSync(GLASS_CSS_PATH, 'utf-8');

    const nested = css.match(
      /body\.light-theme :is\(\s*\.todo-input-container,[\s\S]*?\.notes-search-input\s*\)\s*\{[\s\S]*?\}/
    );
    expect(nested).toBeTruthy();
    expect(nested[0]).toMatch(/background:\s*var\(--glass-control\)/);
    expect(nested[0]).toMatch(/color:\s*var\(--glass-text-primary\)/);

    expect(css).toMatch(/body\.light-theme \.notes-section\s*\{[\s\S]*?radial-gradient[\s\S]*?var\(--glass-surface\)/);
    expect(css).toMatch(/body\.light-theme \.note-item\s*\{[^}]*background:\s*rgba\(255, 255, 255, 0\.42\)/);
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
  function channel(c) {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }
  function luminance([r, g, b]) {
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

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
