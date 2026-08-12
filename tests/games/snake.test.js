import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from '../helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/games/game-registry.js');
  injectScript('src/features/games/snake.js');
});

beforeEach(() => {
  localStorage.clear();
  document.querySelectorAll('.games-score-display, .games-snake-canvas, .games-instructions').forEach(el => el.remove());
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
    expect(scoreEl.textContent).toContain('Score');
    expect(scoreEl.textContent).toContain('Level');
    expect(scoreEl.textContent).toContain('1');

    game.destroy();
    container.remove();
  });
});
