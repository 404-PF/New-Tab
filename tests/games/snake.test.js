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

    // A visibility cycle while still on the ready screen must not start the loop
    // nor leave the ready screen.
    game.pause();
    game.resume();
    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
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

describe('Snake cross-session saves (#646)', () => {
  function makeSavedState() {
    return {
      snake: [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
      ],
      food: { x: 5, y: 5 },
      direction: 'right',
      nextDirection: 'up',
      score: 40 // level 1 + 4 foods eaten → tickMs = BASE - 4*2
    };
  }

  it('restores a saved run onto the ready screen', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container, makeSavedState());

    expect(window.__snakeReady.isStarted()).toBe(false);
    const overlay = container.querySelector('.games-ready-overlay');
    expect(overlay).not.toBeNull();
    // The ready screen offers Continue rather than Start.
    expect(overlay.querySelector('.games-ready-start').textContent).toBe('Continue');

    // The HUD reflects the restored score and level.
    const scoreEl = container.querySelector('.games-score-display');
    expect(scoreEl.textContent).toContain('Score: 40');
    expect(scoreEl.textContent).toContain('Level: 1'); // floor(4/5) + 1

    game.destroy();
    container.remove();
  });

  it('continues the restored run when the player signals readiness', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container, makeSavedState());

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__snakeReady.isStarted()).toBe(true);

    game.destroy();
    container.remove();
  });

  it('rejects malformed or impossible saved runs and starts fresh', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');

    const bad = [
      { snake: [{ x: 0, y: 0 }], food: null, direction: 'right', score: 0 },                    // length 1
      { snake: makeSavedState().snake, direction: 'diagonal', score: 0 },                       // bad direction
      { snake: makeSavedState().snake, direction: 'right', score: -3 },                         // negative score
      { snake: [{ x: 10, y: 10 }, { x: 99, y: 2 }], direction: 'right', score: 0 },             // out of bounds segment
      { snake: [{ x: 5, y: 5 }, { x: 5, y: 5 }], direction: 'right', score: 0 }                 // self-overlap
    ];
    bad.forEach((state) => {
      game.init(container, state);
      expect(window.__snakeReady.isStarted()).toBe(false);
      // A fresh board starts with score 0.
      expect(container.querySelector('.games-score-display').textContent).toContain('Score: 0');
      game.destroy();
    });

    container.remove();
  });

  it('persists a live run through destroyCurrent and restores via launch', () => {
    let el = document.getElementById('games-game-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'games-game-container';
      document.body.appendChild(el);
    }
    expect(window.GameRegistry.launch('snake')).toBe(true);

    // Start the run so serialize() has something to snapshot.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    window.__snakeDifficulty && expect(true).toBe(true);

    window.GameRegistry.destroyCurrent();

    // The initial snake (score 0) is a valid live run worth saving.
    expect(window.GameRegistry.hasSave('snake')).toBe(true);
    const saved = JSON.parse(localStorage.getItem('games_saves')).snake;
    expect(saved.state.snake.length).toBe(3);
    expect(saved.state.score).toBe(0);
    expect(saved.state.direction).toBe('right');

    window.GameRegistry.launch('snake');
    expect(el.querySelector('.games-ready-overlay .games-ready-start').textContent).toBe('Continue');

    window.GameRegistry.destroyCurrent();
    el.remove();
  });

  it('drops the save when the run ends', () => {
    localStorage.setItem('games_saves', JSON.stringify({
      snake: { state: makeSavedState(), savedAt: 1 }
    }));

    let el = document.getElementById('games-game-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'games-game-container';
      document.body.appendChild(el);
    }
    window.GameRegistry.launch('snake');

    // Continue the saved run (head at x=10 heading right) and let ticks drive
    // the snake into the wall. The saved tick interval is BASE - 4*2 = 112ms;
    // advancing well past that guarantees game over.
    vi.useFakeTimers();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();

    expect(window.GameRegistry.hasSave('snake')).toBe(false);
    window.GameRegistry.destroyCurrent();
    el.remove();
  });
});
