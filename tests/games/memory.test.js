import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from '../helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/games/shared.js');
  injectScript('src/features/games/game-registry.js');
  injectScript('src/features/games/memory.js');
});

beforeEach(() => {
  localStorage.clear();
  document.querySelectorAll('.games-memory-stats, .games-memory-grid, .games-ready-overlay, .games-instructions').forEach(el => el.remove());
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
    expect(cards).toHaveLength(16);

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

  it('can be paused and resumed without error', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    expect(() => game.pause()).not.toThrow();
    expect(() => game.resume()).not.toThrow();

    game.destroy();
    container.remove();
  });

  it('keeps a lone revealed card flipped across pause', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    // Start the run (the game holds on a ready screen until the player signals).
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

    const cards = container.querySelectorAll('.games-memory-card');
    cards[0].click();

    const flippedEl = container.querySelector('.games-memory-card-flipped');
    expect(flippedEl).not.toBeNull();

    game.pause();
    game.resume();

    expect(flippedEl.classList.contains('games-memory-card-flipped')).toBe(true);

    game.destroy();
    container.remove();
  });
});

describe('Memory ready state (#597)', () => {
  it('shows a ready screen and does not flip cards until the player starts', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
    expect(window.__memoryReady.isStarted()).toBe(false);

    // Clicks while ready are ignored: every card stays face down.
    const cards = container.querySelectorAll('.games-memory-card');
    cards[0].click();
    cards.forEach(card => {
      expect(card.textContent).toBe('?');
    });
    expect(window.__memoryReady.isStarted()).toBe(false);

    // Space signals readiness.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__memoryReady.isStarted()).toBe(true);
    expect(container.querySelector('.games-ready-overlay')).toBeNull();

    game.destroy();
    container.remove();
  });

  it('cleans up the ready screen on destroy before starting', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
    game.destroy();

    expect(container.querySelector('.games-ready-overlay')).toBeNull();
    // Starting after destroy is a no-op (listeners are gone).
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__memoryReady.isStarted()).toBe(false);

    container.remove();
  });

  it('does not start the ticker during a pre-start visibility cycle after relaunch', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');

    // First run: start the run so timer state (startTime/pausedAt) is populated.
    game.init(container);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    game.pause();
    game.destroy();

    // Relaunch: the game holds on the ready screen again. setupBoard() keeps the
    // previous startTime, so a pre-start visibility cycle must not leak into the
    // timer while the ready screen is active.
    game.init(container);
    expect(window.__memoryReady.isStarted()).toBe(false);
    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();

    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    try {
      // A visibility cycle while still on the ready screen must not start the ticker.
      game.pause();
      game.resume();

      expect(window.__memoryReady.isStarted()).toBe(false);
      expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
      expect(setIntervalSpy).not.toHaveBeenCalled();
    } finally {
      setIntervalSpy.mockRestore();
    }

    game.destroy();
    container.remove();
  });
});
