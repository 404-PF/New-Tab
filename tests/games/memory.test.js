import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from '../helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/storage.js');
  injectScript('src/core/utils.js');
  injectScript('src/features/games/game-registry.js');
  injectScript('src/features/games/memory.js');
});

beforeEach(() => {
  localStorage.clear();
  document.querySelectorAll('.games-memory-stats, .games-memory-grid, .games-instructions').forEach(el => el.remove());
});

describe('Memory Match Game', () => {
  it('registers with GameRegistry', () => {
    const game = window.GameRegistry.get('memory');
    expect(game).not.toBeNull();
    expect(game.id).toBe('memory');
    expect(game.name).toBe('gamesMemory');
    expect(typeof game.init).toBe('function');
    expect(typeof game.destroy).toBe('function');
  });

  it('renders stats bar and grid on init', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    expect(container.querySelector('.games-memory-stats')).not.toBeNull();
    expect(container.querySelector('.games-memory-grid')).not.toBeNull();
    expect(container.querySelector('.games-instructions')).not.toBeNull();

    game.destroy();
    container.remove();
  });

  it('initializes with 0 moves', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    const movesEl = container.querySelector('.games-memory-moves');
    expect(movesEl.textContent).toContain('0');

    game.destroy();
    container.remove();
  });

  it('creates 16 cards (8 pairs)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    const cards = container.querySelectorAll('.games-memory-card');
    expect(cards.length).toBe(16);

    game.destroy();
    container.remove();
  });

  it('cards start face down', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    const cards = container.querySelectorAll('.games-memory-card');
    cards.forEach(card => {
      expect(card.textContent).toBe('?');
      expect(card.classList.contains('games-memory-card-flipped')).toBe(false);
      expect(card.classList.contains('games-memory-card-matched')).toBe(false);
    });

    game.destroy();
    container.remove();
  });

  it('cleans up on destroy', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    game.destroy();
    expect(container.querySelector('.games-memory-grid')).toBeNull();
    expect(container.querySelector('.games-memory-stats')).toBeNull();

    container.remove();
  });
});
