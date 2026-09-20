import { readFileSync } from 'fs';
import { resolve } from 'path';

const FEATURES_CSS_PATH = resolve(process.cwd(), 'css/features.css');

describe('Flappy Bird modal layout (#741)', () => {
  it('contains only the active Flappy Bird view and preserves hub scrolling elsewhere', () => {
    const css = readFileSync(FEATURES_CSS_PATH, 'utf-8');
    const activeRule = css.match(/\.games-hub-content:has\(\.games-flappy-stage\)\s*\{[^}]*\}/);

    expect(activeRule).toBeTruthy();
    expect(activeRule[0]).toMatch(/display:\s*flex/);
    expect(activeRule[0]).toMatch(/flex-direction:\s*column/);
    expect(activeRule[0]).toMatch(/min-height:\s*0/);
    expect(activeRule[0]).toMatch(/overflow:\s*hidden/);
    expect(css).toMatch(/\.games-hub-content\s*\{[^}]*overflow-y:\s*auto/);
  });

  it('lets the game stage absorb remaining height and scales the canvas to fit', () => {
    const css = readFileSync(FEATURES_CSS_PATH, 'utf-8');

    expect(css).toMatch(/\.games-hub-content:has\(\.games-flappy-stage\) #games-game-container\s*\{[^}]*display:\s*flex[^}]*flex:\s*1 1 auto[^}]*min-height:\s*0[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.games-hub-content:has\(\.games-flappy-stage\) \.games-flappy-stage\s*\{[^}]*display:\s*flex[^}]*flex:\s*1 1 auto[^}]*min-height:\s*0/);
    expect(css).toMatch(/\.games-hub-content:has\(\.games-flappy-stage\) \.games-flappy-canvas\s*\{[^}]*width:\s*auto[^}]*height:\s*auto[^}]*max-width:\s*100%[^}]*max-height:\s*100%[^}]*box-sizing:\s*border-box/);
  });
});
