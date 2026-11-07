import { readFileSync } from 'node:fs';

describe('liquid glass icon tile layering (#1155)', () => {
  const css = readFileSync('css/liquid-glass.css', 'utf8').replace(/\r\n/g, '\n');
  const js = readFileSync('src/ui/liquid-glass.js', 'utf8');
  const tile = 'body.glass-liquid .app-icon .icon[data-liquid-glass]';
  const dragStates = ['drag-over', 'drag-over-folder', 'drag-over-folder-rejected'];

  it('makes the icon tile background see-through outside drag states', () => {
    const exclusions = dragStates.map((s) => `:not(.${s})`).join('');
    const selector = `body.glass-liquid .app-icon${exclusions} .icon[data-liquid-glass]`;
    expect(css).toContain(`${selector} {\n  background: rgba(255, 255, 255, 0.04);`);
  });

  it.each(['img', 'svg'])('stacks the %s glyph above the warp layer', (tag) => {
    const block = css.split('}').find((b) => b.includes(`${tile} > ${tag}`));
    expect(block).toBeDefined();
    expect(block).toMatch(/position: relative;\s*z-index: 1;/);
  });

  it('drops the tile own backdrop-filter so the warp layer samples the wallpaper', () => {
    const selector = 'body.glass-liquid [data-liquid-glass].glass--liquid';
    expect(css).toMatch(new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')} \\{[^}]*backdrop-filter: none;`));
  });

  it('keeps enhanced tiles out of the light theme fill so they share the dark theme tokens', () => {
    const glass = readFileSync('css/glass.css', 'utf8');
    const features = readFileSync('css/features.css', 'utf8');
    expect(glass).toContain('.icon:not(.glass--liquid),');
    expect(glass.match(/\.icon:not\(\.glass--liquid\),/g)).toHaveLength(2);
    expect(glass).not.toMatch(/^\s*\.icon,\s*$/m);
    expect(features).toContain('body.light-theme .icon:not(.glass--liquid) {');
  });

  it('uses a gentle displacement scale for icon tiles', () => {
    const m = js.match(/icon: \{[^}]*scale: (\d+)/);
    expect(Number(m[1])).toBeLessThanOrEqual(14);
  });
});
