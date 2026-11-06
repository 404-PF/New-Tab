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

  it('uses a gentle displacement scale for icon tiles', () => {
    const m = js.match(/icon: \{[^}]*scale: (\d+)/);
    expect(Number(m[1])).toBeLessThanOrEqual(14);
  });

  it('keeps the light-theme tile override above glass.css and free of backdrop-filter', () => {
    const exclusions = dragStates.map((s) => `:not(.${s})`).join('');
    const selector = `body.light-theme.glass-liquid #app-grid .app-icon${exclusions} .icon[data-liquid-glass]`;
    const block = css.split('}').find((b) => b.includes(`${selector} {`));
    expect(block).toBeDefined();
    expect(block).toMatch(/background: rgba\(255, 255, 255, 0\.04\);/);
    expect(block).toContain('\n  border: none;');
    expect(block).toContain('\n  -webkit-backdrop-filter: none;');
    expect(block).toContain('\n  backdrop-filter: none;');
  });

  it('preserves the pressed-state shadow on light-theme tiles', () => {
    const exclusions = dragStates.map((s) => `:not(.${s})`).join('');
    const selector = `body.light-theme.glass-liquid #app-grid .app-icon:active${exclusions} .icon[data-liquid-glass]`;
    const block = css.split('}').find((b) => b.includes(`${selector} {`));
    expect(block).toBeDefined();
    expect(block).toContain('box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);');
  });
});
