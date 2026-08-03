import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from '../helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/storage.js');
  injectScript('src/core/utils.js');
  injectScript('src/features/games/game-registry.js');
  injectScript('src/features/games/2048.js');
});

beforeEach(() => {
  localStorage.clear();
  document.querySelectorAll('.games-score-display, .games-2048-board, .games-instructions').forEach(el => el.remove());
});

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
    expect(filledCells.length).toBe(2);

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
    expect(cells.length).toBe(16);

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
});
