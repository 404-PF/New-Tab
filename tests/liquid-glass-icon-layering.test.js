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

  it('drops the own backdrop-filter of every enhanced element, prefixed and unprefixed', () => {
    const block = css.split('}').find((b) => /body\.glass-liquid \.glass--liquid \{/.test(b));
    expect(block).toBeDefined();
    expect(block).toMatch(/(^|[\s;{])backdrop-filter: none;/);
    expect(block).toMatch(/-webkit-backdrop-filter: none;/);
  });

  it('restores the original blur where the warp layer is hidden', () => {
    expect(css).toMatch(/\.app-icon\.drag-over \.icon\.glass--liquid \{[^}]*backdrop-filter: blur\(var\(--glass-blur-card\)\)/);
    expect(css).toMatch(/\.app-icon\.folder-icon\.drag-over-folder \.icon\.glass--liquid[^{]*\{[^}]*backdrop-filter: blur\(var\(--glass-overlay-blur\)\)/);
  });

  it('keeps the folder drop and rejection outlines out of the dark-theme border reset', () => {
    expect(css).toContain(
      'body.glass-liquid.light-theme .app-icon.folder-icon:not(.drag-over-folder):not(.drag-over-folder-rejected) .icon[data-liquid-glass].glass--liquid {'
    );
  });

  it('excludes exactly the enhanced tiles from every light theme .icon surface and hover rule', () => {
    const mirror = '.icon:not(:where(.app-icon .icon[data-liquid-glass].glass--liquid))';
    ['css/glass.css', 'css/features.css'].forEach((file) => {
      const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      const selectors = source.split('{').map((chunk) => chunk.split('}').pop());
      const bare = selectors.filter((s) => /(^|[\s(,])\.icon(?![\w-])(?!:not)/.test(s) && !/\.app-icon[\w.-]*\s+\.icon/.test(s));
      expect(bare, file).toEqual([]);
    });
    const glass = readFileSync('css/glass.css', 'utf8');
    expect(glass.split(mirror).length - 1).toBe(2);
    expect(readFileSync('css/features.css', 'utf8')).toContain(`body.light-theme ${mirror} {`);
  });

  it('uses a gentle displacement scale for icon tiles', () => {
    const m = js.match(/icon: \{[^}]*scale: (\d+)/);
    expect(Number(m[1])).toBeLessThanOrEqual(14);
  });
});
