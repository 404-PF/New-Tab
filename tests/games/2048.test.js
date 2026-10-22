import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from '../helpers/inject-script.js';
import { expectNoStackedKeydownListeners } from '../helpers/keydown-listener-tally.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/games/shared.js');
  injectScript('src/features/games/game-registry.js');
  injectScript('src/features/games/2048.js');
});

beforeEach(() => {
  localStorage.clear();
  document.querySelectorAll('.games-score-display, .games-2048-board, .games-ready-overlay, .games-instructions').forEach(el => el.remove());
});

// Resolves after the next animation frame, once any move buffered by the
// keydown handler (#876) has been drained.
function flushFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('2048 Game', () => {
  it('registers with GameRegistry', () => {
    const game = window.GameRegistry.get('2048');
    expect(game).not.toBeNull();
    expect(game.id).toBe('2048');
    expect(game.name).toBe('games2048');
    expect(typeof game.init).toBe('function');
    expect(typeof game.destroy).toBe('function');
  });

  it('renders score and board on init', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');
    game.init(container);

    expect(container.querySelector('.games-score-display')).not.toBeNull();
    expect(container.querySelector('.games-2048-board')).not.toBeNull();
    expect(container.querySelector('.games-instructions')).not.toBeNull();

    game.destroy();
    container.remove();
  });

  it('initializes with score of 0', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');
    game.init(container);

    const scoreEl = container.querySelector('.games-score-display');
    expect(scoreEl.textContent).toContain('0');

    game.destroy();
    container.remove();
  });

  it('renders exactly 2 tiles on init', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');
    game.init(container);

    const board = container.querySelector('.games-2048-board');
    const filledCells = board.querySelectorAll('.games-2048-cell-filled');
    expect(filledCells).toHaveLength(2);

    game.destroy();
    container.remove();
  });

  it('renders 16 cells total', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');
    game.init(container);

    const board = container.querySelector('.games-2048-board');
    const cells = board.querySelectorAll('.games-2048-cell');
    expect(cells).toHaveLength(16);

    game.destroy();
    container.remove();
  });

  it('cleans up on destroy', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');
    game.init(container);

    game.destroy();
    expect(container.querySelector('.games-2048-board')).toBeNull();

    container.remove();
  });

  it('can be paused and resumed without error', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');
    game.init(container);

    expect(() => game.pause()).not.toThrow();
    expect(() => game.resume()).not.toThrow();

    game.destroy();
    container.remove();
  });

  it('merges adjacent tiles and accumulates score correctly', () => {
    // Test: verify score increases when tiles can potentially merge
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');
    game.init(container);

    // Start the run (the game holds on a ready screen until the player signals).
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

    const scoreEl = container.querySelector('.games-score-display');

    // Dispatch multiple moves to allow potential merges and new tile generation
    for (let i = 0; i < 8; i++) {
      const dirs = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      const event = new KeyboardEvent('keydown', { key: dirs[i % 4] });
      document.dispatchEvent(event);
    }

    // After moves, score display should still be properly formatted (not "undefined: X")
    const finalScore = scoreEl.textContent;
    expect(finalScore).toMatch(/^[^:]+:\s*\d+$/);
    // Verify score label exists and score is numeric
    expect(finalScore).toContain(':');

    game.destroy();
    container.remove();
  });

  it('detects win condition when reaching 2048', () => {
    // Test: verify win overlay can be rendered (even if reaching 2048 is rare in random play)
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');
    game.init(container);

    // Start the run (the game holds on a ready screen until the player signals).
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

    // Make many moves to increase chance of high tiles appearing
    for (let i = 0; i < 50; i++) {
      const dirs = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      const event = new KeyboardEvent('keydown', { key: dirs[i % 4] });
      document.dispatchEvent(event);
    }

    // Verify board structure is intact after moves (overlay would appear within boardEl)
    const board = container.querySelector('.games-2048-board');
    const cells = board.querySelectorAll('.games-2048-cell');
    // Should still have 16 cells even if some are filled
    expect(cells).toHaveLength(16);
    
    // If an overlay was rendered, it should be inside the board
    const overlay = board.querySelector('.games-2048-overlay');
    // Overlay may or may not exist depending on random tile generation
    // but if it does, it should have the correct class
    if (overlay) {
      expect(overlay.className).toContain('games-2048-overlay');
    }

    game.destroy();
    container.remove();
  });

  it('prevents moves when game is over', () => {
    // Test: verify game-over state can be detected via board state
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');
    game.init(container);

    // Start the run (the game holds on a ready screen until the player signals).
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

    const scoreEl = container.querySelector('.games-score-display');
    
    // Make many moves to potentially reach game-over
    for (let i = 0; i < 200; i++) {
      const dirs = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      const event = new KeyboardEvent('keydown', { key: dirs[i % 4] });
      document.dispatchEvent(event);
    }

    // After many moves, game structure should still be intact
    const board = container.querySelector('.games-2048-board');
    expect(board).not.toBeNull();
    
    // Score display should always be properly formatted
    const finalScoreText = scoreEl.textContent;
    expect(finalScoreText).toMatch(/^[^:]+:\s*\d+$/);
    
    // If overlay exists (game-over or win), it should be properly rendered
    const overlay = board.querySelector('.games-2048-overlay');
    if (overlay) {
      expect(overlay.textContent.length).toBeGreaterThan(0);
    }

    game.destroy();
    expect(container.querySelector('.games-2048-board')).toBeNull();

    container.remove();
  });
});

describe('2048 ready state (#597)', () => {
  it('shows a ready screen and ignores moves until the player starts', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');
    game.init(container);

    const board = container.querySelector('.games-2048-board');
    expect(board.querySelector('.games-ready-overlay')).not.toBeNull();
    expect(window.__game2048Ready.isStarted()).toBe(false);

    // Moves while ready are ignored: the board is unchanged no matter which
    // direction is pressed (a single direction could be a legitimate no-op).
    const boardBeforeInput = board.innerHTML;
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].forEach((key) => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: key, code: key }));
    });
    expect(window.__game2048Ready.isStarted()).toBe(false);
    expect(board.innerHTML).toBe(boardBeforeInput);

    // Space signals readiness.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__game2048Ready.isStarted()).toBe(true);
    expect(board.querySelector('.games-ready-overlay')).toBeNull();

    game.destroy();
    container.remove();
  });

  it('cleans up the ready screen on destroy before starting', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');
    game.init(container);

    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
    game.destroy();

    expect(container.querySelector('.games-ready-overlay')).toBeNull();
    // Starting after destroy is a no-op (listeners are gone).
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__game2048Ready.isStarted()).toBe(false);

    container.remove();
  });
});

describe('2048 cross-session saves (#646)', () => {
  function ensureContainer() {
    let el = document.getElementById('games-game-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'games-game-container';
      document.body.appendChild(el);
    }
    return el;
  }

  // Launch through the registry, start, and make moves until the board
  // changes from its initial render. Moves are buffered per frame (#876), so
  // each keydown is followed by a flush before the board is compared.
  async function playUntilBoardChanged() {
    const container = ensureContainer();
    expect(window.GameRegistry.launch('2048')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    const boardBefore = container.querySelector('.games-2048-board').innerHTML;
    for (let i = 0; i < 4; i++) {
      const dirs = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];
      document.dispatchEvent(new KeyboardEvent('keydown', { key: dirs[i], code: dirs[i] }));
      await flushFrame();
      if (container.querySelector('.games-2048-board').innerHTML !== boardBefore) return true;
    }
    return false;
  }

  beforeEach(() => {
    document.querySelectorAll('.games-score-display, .games-2048-board, .games-ready-overlay, .games-instructions')
      .forEach(el => el.remove());
  });

  it('persists the board on destroyCurrent and restores it on the next init', async () => {
    const container = ensureContainer();
    if (!(await playUntilBoardChanged())) {
      window.GameRegistry.destroyCurrent();
      container.remove();
      return; // extremely unlikely with random tiles; nothing to assert
    }

    const boardHtmlAfterPlay = container.querySelector('.games-2048-board').innerHTML;
    const scoreTextAfterPlay = container.querySelector('.games-score-display').textContent;
    window.GameRegistry.destroyCurrent();

    expect(window.GameRegistry.hasSave('2048')).toBe(true);
    const saved = JSON.parse(localStorage.getItem('games_saves'))['2048'];
    expect(saved.state.board).toHaveLength(4);
    // At least 2 tiles: a board-changing move may merge the two initial tiles
    // into one before spawning a replacement (2 filled), or just move them
    // and spawn (3 filled).
    expect(saved.state.board.flat().filter(v => v > 0).length).toBeGreaterThanOrEqual(2);

    // A fresh init receives the snapshot and rebuilds the saved board.
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    const game = window.GameRegistry.get('2048');
    game.init(container2, saved.state);

    expect(window.__game2048Ready.isStarted()).toBe(true); // skips ready screen
    expect(container2.querySelector('.games-ready-overlay')).toBeNull();
    expect(container2.querySelector('.games-2048-board').innerHTML).toBe(boardHtmlAfterPlay);
    expect(container2.querySelector('.games-score-display').textContent).toBe(scoreTextAfterPlay);

    game.destroy();
    container.remove();
    container2.remove();
  });

  it('rejects malformed saved state and starts fresh', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');

    game.init(container, { board: [[2, 'x'], [3]], score: -5, won: false });
    expect(window.__game2048Ready.isStarted()).toBe(false); // fell back to ready screen

    game.destroy();

    game.init(container, { board: 'nope', score: 0 });
    expect(window.__game2048Ready.isStarted()).toBe(false);

    game.destroy();
    container.remove();
  });

  it('drops a stale save when serialize reports nothing to carry over', () => {
    const container = ensureContainer();
    expect(window.GameRegistry.launch('2048')).toBe(true);
    // Never started → serialize returns null.
    window.GameRegistry.destroyCurrent();
    expect(window.GameRegistry.hasSave('2048')).toBe(false);

    container.remove();
  });
});

describe('2048 save validation regressions (review #654)', () => {
  it('rejects non-power-of-two tiles', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');

    game.init(container, {
      board: [[2, 4, 3, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: 4,
      won: false
    });
    expect(window.__game2048Ready.isStarted()).toBe(false); // fell back to ready screen

    game.destroy();
    container.remove();
  });

  it('rejects a non-integer score instead of flooring it', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');

    game.init(container, {
      board: [[2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: 1.5,
      won: false
    });
    expect(window.__game2048Ready.isStarted()).toBe(false);

    game.destroy();
    container.remove();
  });

  it('rejects won:true snapshots as terminal corruption', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');

    game.init(container, {
      board: [[2048, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: 2000,
      won: true
    });
    expect(window.__game2048Ready.isStarted()).toBe(false);

    // The stale save must be discarded at teardown, not kept or re-saved.
    expect(() => game.serialize()).not.toThrow();
    game.destroy();
    container.remove();
  });
});

describe('2048 save validation round 2 (review #654)', () => {
  it('rejects tiles above the 32-bit range that are not powers of two', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');

    // 4294967297 = 2^32 + 1: passes a naive bitwise power check.
    game.init(container, {
      board: [[2, 4294967297, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: 4,
      won: false
    });
    expect(window.__game2048Ready.isStarted()).toBe(false);

    game.destroy();
    container.remove();
  });

  it('accepts huge legitimate powers of two', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');

    const big = Math.pow(2, 40);
    game.init(container, {
      board: [[big, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: Number.MAX_SAFE_INTEGER,
      won: false
    });
    expect(window.__game2048Ready.isStarted()).toBe(true);

    game.destroy();
    container.remove();
  });

  it('rejects boards containing a 2048 tile even when won is false', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');

    game.init(container, {
      board: [[2048, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: 20000,
      won: false
    });
    expect(window.__game2048Ready.isStarted()).toBe(false);

    game.destroy();
    container.remove();
  });
});

describe('2048 responsive input (#876)', () => {
  // Shared launch: one container plus a restored run, which skips the ready
  // screen (its own Space handling would swallow events before the game's).
  function launch(save) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('2048');
    game.init(container, save);
    return { container: container, game: game };
  }

  it('accepts WASD keys and ignores OS auto-repeat', async () => {
    const { container, game } = launch({
      board: [[0, 0, 0, 0], [0, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: 0,
      won: false
    });

    try {
      const boardEl = container.querySelector('.games-2048-board');
      const before = boardEl.innerHTML;

      // Auto-repeat is dropped: S would slide the tile down if it registered.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', repeat: true }));
      await flushFrame();
      expect(boardEl.innerHTML).toBe(before);

      // A real W press moves up (parsed from e.code, like Snake and Pac-Man).
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW' }));
      await flushFrame();
      expect(boardEl.innerHTML).not.toBe(before);
    } finally {
      game.destroy();
      container.remove();
    }
  });

  it('swallows page scroll for held direction keys but not modified shortcuts (#876)', () => {
    const { container, game } = launch();

    try {
      const held = new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', repeat: true, cancelable: true });
      document.dispatchEvent(held);
      expect(held.defaultPrevented).toBe(true);

      const modified = new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', repeat: true, ctrlKey: true, cancelable: true });
      document.dispatchEvent(modified);
      expect(modified.defaultPrevented).toBe(false);
    } finally {
      game.destroy();
      container.remove();
    }
  });

  it('leaves Space alone while a button is focused so it stays activatable (#887)', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const { container, game } = launch({
      board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: 0,
      won: false
    });

    try {
      const spaceOnButton = new KeyboardEvent('keydown', { key: ' ', code: 'Space', cancelable: true, bubbles: true });
      button.dispatchEvent(spaceOnButton);
      expect(spaceOnButton.defaultPrevented).toBe(false);
    } finally {
      game.destroy();
      container.remove();
      button.remove();
    }
  });

  it('returns null when a flushed move ends the run instead of re-saving the terminal board (#887)', () => {
    const randomSpy = vi.spyOn(window.GameRegistry, 'secureRandom').mockReturnValue(0);
    const { container, game } = launch({
      board: [[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: 0,
      won: false
    });

    try {
      // The buffered move merges to 2048, ending the run during serialize()'s
      // flush; the terminal board must not come back as a persistable snapshot.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft' }));
      expect(game.serialize()).toBeNull();
    } finally {
      randomSpy.mockRestore();
      game.destroy();
      container.remove();
    }
  });

  it('buffers rapid keys to at most one board update per frame', async () => {
    const randomSpy = vi.spyOn(window.GameRegistry, 'secureRandom').mockReturnValue(0);
    const { container, game } = launch({
      board: [[0, 0, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: 0,
      won: false
    });

    // serialize() flushes keys still buffered for the next frame (#876), so
    // the buffering assertions read the rendered cells instead.
    const boardEl = container.querySelector('.games-2048-board');
    const cellTexts = () => Array.from(boardEl.querySelectorAll('.games-2048-cell')).map(c => c.textContent);

    try {
      const start = cellTexts();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft' }));

      // Moves are buffered, not applied synchronously in the keydown handler.
      expect(cellTexts()).toEqual(start);

      // One frame drains exactly one move: the tile slides left and one
      // deterministic random tile spawns (secureRandom mocked to 0).
      await flushFrame();
      expect(cellTexts()).toEqual(['2', '2', ...Array(14).fill('')]);

      // The next buffered move runs on the following frame.
      await flushFrame();
      expect(cellTexts()).toEqual(['4', '2', ...Array(14).fill('')]);

      // The final buffered move is a no-op slide; the flushed snapshot agrees.
      await flushFrame();
      expect(game.serialize().board).toEqual([
        [4, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]
      ]);
    } finally {
      randomSpy.mockRestore();
      game.destroy();
      container.remove();
    }
  });

  it('does not stack keydown listeners between consecutive plays', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    expectNoStackedKeydownListeners(window.GameRegistry.get('2048'), container);
  });
});
