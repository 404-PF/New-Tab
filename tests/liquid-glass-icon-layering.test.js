import { readFileSync } from 'node:fs';

describe('liquid glass icon tile layering (#1155)', () => {
  const css = readFileSync('css/liquid-glass.css', 'utf8');
  const js = readFileSync('src/ui/liquid-glass.js', 'utf8');

  it('makes the icon tile background see-through in liquid mode', () => {
    expect(css).toMatch(
      /body\.glass-liquid \.app-icon \.icon\[data-liquid-glass\]\s*\{\s*background: rgba\(255, 255, 255, 0\.04\);/
    );
  });

  it('stacks the glyph above the warp layer', () => {
    expect(css).toMatch(
      /\.icon\[data-liquid-glass\] > img\s*\{\s*position: relative;\s*z-index: 1;/
    );
  });

  it('uses a gentle displacement scale for icon tiles', () => {
    const m = js.match(/icon: \{[^}]*scale: (\d+)/);
    expect(Number(m[1])).toBeLessThanOrEqual(14);
  });
});
