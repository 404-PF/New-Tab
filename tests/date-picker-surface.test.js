import { readFileSync } from 'fs';
import { resolve } from 'path';

const APP_CSS_PATH = resolve(process.cwd(), 'css/app.css');
const GLASS_CSS_PATH = resolve(process.cwd(), 'css/glass.css');

const appCss = () => readFileSync(APP_CSS_PATH, 'utf-8');
const glassCss = () => readFileSync(GLASS_CSS_PATH, 'utf-8');

describe('Todo date picker opaque surface and stacking (issue #855)', () => {
  it('gives the input-bar custom calendar a fully opaque dark background', () => {
    const css = appCss();
    const rule = css.match(/^\.custom-calendar\s*\{([^}]*)\}/m);

    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/background:\s*#141414;/);
    expect(rule[1]).not.toMatch(/background:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.(8|9)/);
    // backdrop-filter stays as a progressive enhancement over the opaque fill.
    expect(rule[1]).toMatch(/backdrop-filter:\s*blur\(20px\)/);
  });

  it('matches the inline date picker surface so the variants stay consistent', () => {
    const css = appCss();
    const rule = css.match(/^\.inline-date-picker\s*\{([^}]*)\}/m);

    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/background:\s*#141414;/);
  });

  it('keeps an opaque light-theme surface in app.css, not the glass cascade', () => {
    const css = appCss();

    expect(css).toMatch(
      /body\.light-theme \.custom-calendar\s*\{[^}]*background:\s*#ffffff;/
    );
    // glass.css deliberately excludes the .todo-section subtree from the shared
    // light glass groups, so the light surface has to live in app.css.
    expect(glassCss()).not.toMatch(/body\.light-theme \.custom-calendar\s*\{/);
  });

  it('restyles the calendar chrome for the light surface so controls stay readable', () => {
    const css = appCss();

    expect(css).toMatch(/body\.light-theme \.calendar-nav-btn\s*\{[^}]*color:\s*#1f2937;/);
    expect(css).toMatch(/body\.light-theme \.calendar-title span\s*\{[^}]*color:\s*#1f2937;/);
    expect(css).toMatch(
      /body\.light-theme \.calendar-weekdays span\s*\{[^}]*color:\s*rgba\(31, 41, 55, 0\.6\)/
    );
    expect(css).toMatch(/body\.light-theme \.calendar-btn\.secondary\s*\{[^}]*color:\s*#1f2937;/);
  });

  it('lifts .todo-section above the fixed footer/motto layers while a picker is open', () => {
    const css = appCss();
    const rule = css.match(/\.todo-section:has\(([^)]*)\)\s*\{([^}]*)\}/);

    expect(rule).not.toBeNull();
    expect(rule[1]).toContain('.custom-calendar.visible');
    expect(rule[1]).toContain('.inline-date-picker.visible');
    // Above #motto-container (1999) and .footer-left/.footer-right (2000),
    // below drag overlay (3000) and modals (10000+).
    expect(rule[2]).toMatch(/z-index:\s*2001;/);
  });

  it('keeps the edit-modal calendar variant on the shared opaque surface', () => {
    const css = appCss();
    const rule = css.match(/\.todo-edit-date-picker \.custom-calendar\s*\{([^}]*)\}/);

    expect(rule).not.toBeNull();
    // Only stacking/position overrides here — the surface comes from
    // .custom-calendar so the edit-modal picker stays consistent.
    expect(rule[1]).not.toMatch(/background:/);
  });
});
