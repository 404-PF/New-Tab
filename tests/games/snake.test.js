import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from '../helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/games/shared.js');
  injectScript('src/features/games/game-registry.js');
  injectScript('src/features/games/snake.js');
});

beforeEach(() => {
  localStorage.clear();
  document.querySelectorAll('.games-score-display, .games-snake-canvas, .games-snake-stage, .games-ready-overlay, .games-instructions').forEach(el => el.remove());
});

describe('Snake Game', () => {
  it('registers with GameRegistry', () => {
    const game = window.GameRegistry.get('snake');
    expect(game).not.toBeNull();
    expect(game.id).toBe('snake');
    expect(game.name).toBe('gamesSnake');
    expect(typeof game.init).toBe('function');
    expect(typeof game.destroy).toBe('function');
    expect(typeof game.pause).toBe('function');
    expect(typeof game.resume).toBe('function');
  });

  it('renders score display and canvas on init', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);

    expect(container.querySelector('.games-score-display')).not.toBeNull();
    expect(container.querySelector('.games-snake-canvas')).not.toBeNull();
    expect(container.querySelector('.games-instructions')).not.toBeNull();

    game.destroy();
    container.remove();
  });

  it('initializes with a score of 0', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);

    const scoreEl = container.querySelector('.games-score-display');
    expect(scoreEl.textContent).toContain('0');

    game.destroy();
    container.remove();
  });

  it('has a canvas with correct dimensions', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);

    const canvas = container.querySelector('.games-snake-canvas');
    expect(canvas.width).toBe(300); // 20 * 15
    expect(canvas.height).toBe(300);

    game.destroy();
    container.remove();
  });

  it('cleans up on destroy', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);

    game.destroy();
    expect(container.querySelector('.games-snake-canvas')).toBeNull();
    expect(container.querySelector('.games-score-display')).toBeNull();

    container.remove();
  });

  it('can be paused and resumed without error', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);

    expect(() => game.pause()).not.toThrow();
    expect(() => game.resume()).not.toThrow();

    game.destroy();
    container.remove();
  });
});

describe('Snake ready state (#597)', () => {
  it('shows a ready screen on init and does not start until the player starts', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);

    const stage = container.querySelector('.games-snake-stage');
    expect(stage).not.toBeNull();
    expect(stage.querySelector('.games-ready-overlay')).not.toBeNull();
    expect(window.__snakeReady.isStarted()).toBe(false);

    // Steering while ready is ignored.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight' }));
    expect(window.__snakeReady.isStarted()).toBe(false);

    // Space signals readiness.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__snakeReady.isStarted()).toBe(true);
    expect(stage.querySelector('.games-ready-overlay')).toBeNull();

    game.destroy();
    container.remove();
  });

  it('does not resume an un-started game into play', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);

    // A visibility cycle while still on the ready screen must not start the loop.
    game.pause();
    game.resume();
    expect(window.__snakeReady.isStarted()).toBe(false);

    game.destroy();
    container.remove();
  });

  it('cleans up the ready screen on destroy before starting', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);

    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
    game.destroy();

    expect(container.querySelector('.games-ready-overlay')).toBeNull();
    // Starting after destroy is a no-op (listeners are gone).
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__snakeReady.isStarted()).toBe(false);

    container.remove();
  });
});

describe('Snake dynamic difficulty (#589)', () => {
  it('exposes the difficulty helpers', () => {
    const d = window.__snakeDifficulty;
    expect(d).toBeTypeOf('object');
    expect(typeof d.tickMsForScore).toBe('function');
    expect(typeof d.levelForScore).toBe('function');
  });

  it('starts at the base speed and shrinks the tick interval as the score grows, floored at min', () => {
    const d = window.__snakeDifficulty;
    expect(d.tickMsForScore(0)).toBe(d.baseTickMs);
    // 10 foods eaten (score 100) → 10 × tickMsPerFood slower interval.
    expect(d.tickMsForScore(100)).toBe(d.baseTickMs - 10 * d.tickMsPerFood);
    // 30 foods eaten (score 300) → at the floor.
    expect(d.tickMsForScore(300)).toBe(d.minTickMs);
    // Never faster than the floor, even at extreme scores.
    expect(d.tickMsForScore(100000)).toBe(d.minTickMs);
    expect(d.minTickMs).toBeLessThan(d.baseTickMs);
  });

  it('increments the level as the snake eats', () => {
    const d = window.__snakeDifficulty;
    const scoreAtLevelTwo = 10 * d.foodsPerLevel;
    expect(d.levelForScore(0)).toBe(1);
    expect(d.levelForScore(scoreAtLevelTwo - 1)).toBe(1);
    expect(d.levelForScore(scoreAtLevelTwo)).toBe(2);
    expect(d.levelForScore(scoreAtLevelTwo * 2)).toBe(3);
  });

  it('shows a level indicator in the score display on init', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);

    const scoreEl = container.querySelector('.games-score-display');
    // The HUD renders as "Score: 0  ·  Level: 1" on init. Assert the fully
    // formatted segments so a '1' floating anywhere in the text can't
    // masquerade as a rendered level (e.g. a non-zero score).
    expect(scoreEl.textContent).toContain('Score: 0');
    expect(scoreEl.textContent).toContain('Level: 1');

    game.destroy();
    container.remove();
  });
});
