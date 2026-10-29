import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { injectScript } from '../helpers/inject-script.js';
import { pointer } from '../helpers/pointer-event.js';
import { expectNoStackedKeydownListeners } from '../helpers/keydown-listener-tally.js';
import {
  installGamepadStub,
  removeGamepadStub,
  makeGamepad,
  pressButton,
  releaseButton
} from '../helpers/gamepad.js';

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

describe('Snake FPS readout (#1036)', () => {
  afterEach(() => {
    localStorage.removeItem('games_fps_enabled');
  });

  it('mounts no readout while the setting is off', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);

    expect(container.querySelector('.games-fps-display')).toBeNull();

    game.destroy();
    container.remove();
  });

  it('mounts the readout on the stage when the setting is on and tears it down on destroy', () => {
    localStorage.setItem('games_fps_enabled', 'true');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);

    const el = container.querySelector('.games-fps-display');
    expect(el).not.toBeNull();
    expect(el.closest('.games-snake-stage')).not.toBeNull();

    game.destroy();
    expect(container.querySelector('.games-fps-display')).toBeNull();
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

    // Space signals readiness.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__snakeReady.isStarted()).toBe(true);
    expect(stage.querySelector('.games-ready-overlay')).toBeNull();

    game.destroy();
    container.remove();
  });

  it('starts on a direction key and records it as the first input (#1021)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);

    // A direction key on the ready screen starts the run instead of being
    // swallowed, and the pressed direction is queued and faced at once.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }));
    expect(window.__snakeReady.isStarted()).toBe(true);
    expect(container.querySelector('.games-ready-overlay')).toBeNull();
    const state = game.serialize();
    expect(state.direction).toBe('up');
    expect(state.directionQueue).toEqual(['up']);

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

    // Continue the saved run and let ticks drive it into a wall. The saved
    // state queues nextDirection 'up', so the first tick turns north from
    // y=10 toward the top wall; the saved tick interval is BASE - 4*2 = 112ms,
    // so advancing well past that guarantees game over.
    vi.useFakeTimers();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();

    expect(window.GameRegistry.hasSave('snake')).toBe(false);
    window.GameRegistry.destroyCurrent();
    el.remove();
  });
});

describe('Snake save validation regressions (review #654)', () => {
  function makeBase() {
    return {
      snake: [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
      ],
      food: { x: 5, y: 5 },
      direction: 'right',
      nextDirection: 'right',
      score: 0
    };
  }

  it('rejects snakes shorter than three segments', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    const state = makeBase();
    state.snake = state.snake.slice(0, 2);

    game.init(container, state);
    expect(window.__snakeReady.isStarted()).toBe(false);

    game.destroy();
    container.remove();
  });

  it('rejects duplicate body cells', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    const state = makeBase();
    state.snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }];

    game.init(container, state);
    expect(window.__snakeReady.isStarted()).toBe(false);

    game.destroy();
    container.remove();
  });

  it('rejects a queued turn opposite the travel direction', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    const state = makeBase();
    state.direction = 'right';
    state.nextDirection = 'left'; // would kill the run on the first tick

    game.init(container, state);
    expect(window.__snakeReady.isStarted()).toBe(false);

    game.destroy();
    container.remove();
  });

  it('keeps the stored save while a restored run waits on Continue', () => {
    localStorage.setItem('games_saves', JSON.stringify({
      snake: { state: makeBase(), savedAt: 1 }
    }));

    let el = document.getElementById('games-game-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'games-game-container';
      document.body.appendChild(el);
    }

    // Launch restores onto the ready screen; serialize reports "nothing yet"
    // so closing/switching must NOT delete the save (P1 regression).
    expect(window.GameRegistry.launch('snake')).toBe(true);
    expect(el.querySelector('.games-ready-overlay')).not.toBeNull();
    window.GameRegistry.destroyCurrent();
    expect(window.GameRegistry.hasSave('snake')).toBe(true);

    // Relaunch still offers Continue with the same snapshot.
    window.GameRegistry.launch('snake');
    expect(el.querySelector('.games-ready-overlay .games-ready-start').textContent).toBe('Continue');

    window.GameRegistry.destroyCurrent();
    el.remove();
  });

  it('discards a stale save whose restore was rejected', () => {
    localStorage.setItem('games_saves', JSON.stringify({
      snake: { state: { snake: [{ x: 1, y: 1 }], direction: 'right', score: 0 }, savedAt: 1 }
    }));

    let el = document.getElementById('games-game-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'games-game-container';
      document.body.appendChild(el);
    }

    expect(window.GameRegistry.launch('snake')).toBe(true); // restore rejected
    window.GameRegistry.destroyCurrent();
    expect(window.GameRegistry.hasSave('snake')).toBe(false);

    el.remove();
  });
});

// Start a fresh snake run on the ready screen and signal readiness. Shared by
// the frame-driven input (#876) and turn-queue (#1017) suites.
function startGame() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const game = window.GameRegistry.get('snake');
  game.init(container);
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  expect(window.__snakeReady.isStarted()).toBe(true);
  return { container, game };
}

describe('Snake frame-driven input (#876)', () => {
  it('advances logic on animation frames instead of setInterval', () => {
    vi.useFakeTimers();
    let container = null;
    let game = null;
    let setIntervalSpy = null;
    try {
      setIntervalSpy = vi.spyOn(window, 'setInterval');
      ({ container, game } = startGame());
      // The game loop is rAF-driven: starting and playing never touches
      // setInterval, so timer drift/coalescing cannot delay a queued turn.
      expect(setIntervalSpy).not.toHaveBeenCalled();

      const headBefore = game.serialize().snake[0];
      vi.advanceTimersByTime(400); // ~25 frames → several ticks at base speed
      const headAfter = game.serialize().snake[0];
      expect(headAfter).not.toEqual(headBefore);
      expect(headAfter.x).toBeGreaterThan(headBefore.x);
      expect(headAfter.y).toBe(headBefore.y);

      expect(setIntervalSpy).not.toHaveBeenCalled();
    } finally {
      if (setIntervalSpy) setIntervalSpy.mockRestore();
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
    }
  });

  it('steers with a held direction key on the next tick instead of dropping auto-repeat (#1016)', () => {
    vi.useFakeTimers();
    let container = null;
    let game = null;
    try {
      ({ container, game } = startGame());
      // A held direction key's auto-repeat is steering input: the first
      // repeat queues the turn and the next tick applies it (auto-repeat
      // used to be discarded, so the intent was lost until re-pressed).
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', repeat: true }));
      vi.advanceTimersByTime(200);
      expect(game.serialize().direction).toBe('up');

      // Repeats stay idempotent while the key is still held.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', repeat: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', repeat: true }));
      expect(game.serialize().directionQueue).toEqual([]);
      vi.advanceTimersByTime(100);
      expect(game.serialize().direction).toBe('up');
    } finally {
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
    }
  });

  it('does not flicker pause while Space is held (#1016)', () => {
    vi.useFakeTimers();
    let container = null;
    let game = null;
    try {
      ({ container, game } = startGame());
      const headBefore = game.serialize().snake[0];
      // A repeated Space is dropped, so the held key never toggles pause.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', repeat: true }));
      vi.advanceTimersByTime(300);
      const headAfter = game.serialize().snake[0];
      expect(headAfter).not.toEqual(headBefore);
      // A fresh Space still pauses.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
      const headWhilePaused = game.serialize().snake[0];
      vi.advanceTimersByTime(300);
      expect(game.serialize().snake[0]).toEqual(headWhilePaused);
    } finally {
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
    }
  });

  it('does not stack keydown listeners between consecutive plays', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    expectNoStackedKeydownListeners(window.GameRegistry.get('snake'), container);
  });
});

describe('Snake turn queue depth and apply-time veto (#1017)', () => {
  // Step the rAF logic loop one animation frame at a time and snapshot
  // serialize() after each frame, so per-tick direction changes stay
  // observable even though the accumulator schedules ticks asynchronously.
  function sampleFrames(game, count) {
    const samples = [];
    for (let i = 0; i < count; i++) {
      vi.advanceTimersByTime(16);
      samples.push(game.serialize());
    }
    return samples;
  }

  function makeSavedRun(directionQueue) {
    return {
      snake: [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
      ],
      food: { x: 5, y: 5 },
      direction: 'right',
      nextDirection: 'up',
      directionQueue: directionQueue,
      score: 0
    };
  }

  describe('live turn queue', () => {
    let container = null;
    let game = null;

    beforeEach(() => {
      vi.useFakeTimers();
      ({ container, game } = startGame());
      vi.advanceTimersByTime(200);
    });

    afterEach(() => {
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
      container = null;
      game = null;
    });

    it('honours two distinct turns pressed inside one tick on consecutive ticks', () => {
      expect(game.serialize().direction).toBe('right');
      const before = game.serialize().snake[0];

      // The fast-flick case: both presses land inside one tick window.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight' }));

      const samples = sampleFrames(game, 20);
      // The first press faces 'up' immediately (#1021), so direction alone
      // no longer marks the move: find the tick whose head went north.
      const upIdx = samples.findIndex((s) => s && s.snake[0].y === before.y - 1 && s.snake[0].x === before.x);
      expect(upIdx).toBeGreaterThan(-1);
      // The first queued turn moves the head north one cell.
      expect(samples[upIdx].direction).toBe('up');
      expect(samples[upIdx].snake[0]).toEqual({ x: before.x, y: before.y - 1 });
      // The second applies on a following tick, moving east again.
      const rightIdx = samples.findIndex((s, i) => i > upIdx && s && s.direction === 'right');
      expect(rightIdx).toBeGreaterThan(upIdx);
      expect(samples[rightIdx].snake[0]).toEqual({ x: before.x + 1, y: before.y - 1 });
      expect(samples[rightIdx].directionQueue).toEqual([]);
    });

    it('drops a queued turn that would reverse the head at apply time', () => {
      expect(game.serialize().direction).toBe('right');

      // Up is legal when pressed; Down reverses the post-up heading and
      // must be dropped at apply time instead of ever executing.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown' }));

      const samples = sampleFrames(game, 25);
      const upIdx = samples.findIndex((s) => s && s.direction === 'up');
      expect(upIdx).toBeGreaterThan(-1);
      // After the up-turn the snake keeps heading north: the queued
      // reversal is dropped, never causing a self-collision.
      const after = samples.slice(upIdx);
      expect(after.every((s) => s && s.direction === 'up')).toBe(true);
      const ys = after.map((s) => s.snake[0].y);
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i]).toBeLessThanOrEqual(ys[i - 1]);
      }
      expect(Math.min(...ys)).toBeLessThan(ys[0]);
    });

    it('queues an immediate reversal press but never applies it', () => {
      const before = game.serialize().snake[0];

      // The enqueue-time opposite veto is gone: Left is accepted into the
      // queue, but it reverses the travel direction and must be dropped
      // at apply time.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft' }));
      expect(game.serialize().directionQueue).toEqual(['left']);

      const samples = sampleFrames(game, 15);
      expect(samples.every((s) => s && s.direction === 'right')).toBe(true);
      const xs = samples.map((s) => s.snake[0].x);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
      }
      expect(xs[xs.length - 1]).toBeGreaterThan(before.x);
    });

    it('does not let duplicate presses of the current direction fill the queue', () => {
      expect(game.serialize().direction).toBe('right');

      // Spamming the current direction (non-repeat presses) never fills
      // the buffer: each exact duplicate is rejected at enqueue time.
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight' }));
      }
      expect(game.serialize().directionQueue).toEqual([]);

      // A real turn still fits: queued for the per-tick drain and faced in
      // the same frame the key lands (#1021).
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }));
      expect(game.serialize().directionQueue).toEqual(['up']);
      expect(game.serialize().direction).toBe('up');
      const samples = sampleFrames(game, 15);
      expect(samples.findIndex((s) => s && s.direction === 'up')).toBeGreaterThan(-1);
    });
  });

  it('round-trips a 3-deep turn queue through save/restore and applies it in order', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container, makeSavedRun(['up', 'down', 'left']));
    // The validator accepts a full-depth queue whose later entries reverse
    // earlier ones: since the veto moved to apply time, such a queue is a
    // legal on-disk state that tick() drains safely.
    expect(container.querySelector('.games-ready-overlay .games-ready-start').textContent).toBe('Continue');

    vi.useFakeTimers();
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      const samples = sampleFrames(game, 25);

      // Tick 1 applies 'up'; tick 2 drops the reversed 'down' and applies
      // 'left'; 'down' never executes in either direction order.
      const upIdx = samples.findIndex((s) => s && s.direction === 'up');
      expect(upIdx).toBeGreaterThan(-1);
      const leftIdx = samples.findIndex((s, i) => i > upIdx && s && s.direction === 'left');
      expect(leftIdx).toBeGreaterThan(upIdx);
      expect(samples.some((s) => s && s.direction === 'down')).toBe(false);
      // Up moved north one cell, then left moved west one cell.
      expect(samples[leftIdx].snake[0]).toEqual({
        x: samples[upIdx].snake[0].x - 1,
        y: samples[upIdx].snake[0].y
      });
    } finally {
      vi.useRealTimers();
      game.destroy();
      container.remove();
    }
  });

  it('rejects a saved queue longer than the buffer cap', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    // Four entries exceed MAX_QUEUED_TURNS (3).
    game.init(container, makeSavedRun(['up', 'left', 'down', 'right']));
    // Restore rejected: the ready screen offers Start on a fresh board.
    expect(container.querySelector('.games-ready-overlay .games-ready-start').textContent).toBe('Start');

    game.destroy();
    container.remove();
  });
});

describe('Snake buffered-turn indicator (#1020)', () => {
  const CHEVRON_STROKE = 'rgba(255, 255, 255, 0.5)';
  let context;
  let getContextSpy;

  // Stub the 2D context so specs can assert the mark that is actually drawn
  // on the head, not only the queue state the renderer reads. Every stroke()
  // records the strokeStyle in effect at call time, which is how the chevron
  // (drawn last, after the segment outlines) is told apart.
  beforeEach(() => {
    const gradient = () => ({ addColorStop() {} });
    context = { strokeStyles: [], createLinearGradient: gradient, createRadialGradient: gradient };
    ['drawImage', 'fillRect', 'strokeRect', 'clearRect', 'beginPath', 'closePath', 'arc',
      'arcTo', 'ellipse', 'moveTo', 'lineTo', 'fill', 'save', 'restore', 'translate', 'fillText'
    ].forEach((name) => { context[name] = () => {}; });
    context.stroke = () => { context.strokeStyles.push(context.strokeStyle); };
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  });

  afterEach(() => {
    getContextSpy.mockRestore();
  });

  it('signals a queued turn on the head until the tick applies it', () => {
    vi.useFakeTimers();
    let container = null;
    let game = null;
    try {
      ({ container, game } = startGame());
      // Moving right; queue an up-turn. The drawn head mark (the chevron on
      // the canvas) tracks the buffered direction from the moment it lands.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }));
      expect(game.serialize().directionQueue).toEqual(['up']);
      expect(window.__snakeReady.pendingTurnDirection()).toBe('up');
      expect(context.strokeStyles).toContain(CHEVRON_STROKE);

      // Once a tick applies the turn the queue empties and the mark clears.
      vi.advanceTimersByTime(400);
      expect(game.serialize().direction).toBe('up');
      expect(game.serialize().directionQueue).toEqual([]);
      expect(window.__snakeReady.pendingTurnDirection()).toBeNull();
    } finally {
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
    }
  });

  it('points the indicator at the first queued turn, not the last press', () => {
    vi.useFakeTimers();
    let container = null;
    let game = null;
    try {
      ({ container, game } = startGame());
      // Up then Left while moving right buffers two turns: the queue head is
      // the one tick() applies next (and the one nextDirection reports), so
      // the eyes/chevron must follow it — the last press would aim back into
      // the neck and leave the first turn unmarked.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft' }));
      expect(game.serialize().directionQueue).toEqual(['up', 'left']);
      expect(game.serialize().nextDirection).toBe('up');
      expect(window.__snakeReady.pendingTurnDirection()).toBe('up');
      expect(context.strokeStyles).toContain(CHEVRON_STROKE);
    } finally {
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
    }
  });

  it('clears the indicator when a buffered reversal is dropped at apply time', () => {
    vi.useFakeTimers();
    let container = null;
    let game = null;
    try {
      ({ container, game } = startGame());
      // Left reverses the rightward heading: it is accepted into the queue
      // (the enqueue-time veto is gone, #1017) and signalled, then dropped
      // at apply time — the indicator must not outlive the drop.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft' }));
      expect(window.__snakeReady.pendingTurnDirection()).toBe('left');
      expect(context.strokeStyles).toContain(CHEVRON_STROKE);

      vi.advanceTimersByTime(400);
      expect(game.serialize().direction).toBe('right');
      expect(game.serialize().directionQueue).toEqual([]);
      expect(window.__snakeReady.pendingTurnDirection()).toBeNull();
    } finally {
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
    }
  });

  it('shows no indicator while the queue is empty', () => {
    const { container, game } = startGame();
    expect(window.__snakeReady.pendingTurnDirection()).toBeNull();
    expect(context.strokeStyles).not.toContain(CHEVRON_STROKE);

    game.destroy();
    container.remove();
  });

  it('paints the mark when reduced motion leaves no render loop (#1020)', () => {
    const previousMotion = window.prefersReducedMotion;
    window.prefersReducedMotion = () => true;
    vi.useFakeTimers();
    let container = null;
    let game = null;
    try {
      ({ container, game } = startGame());
      context.strokeStyles.length = 0;

      // Keyboard path: the accepted turn redraws straight away, because no
      // rAF render loop runs to pick it up while reduced motion is on.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }));
      expect(window.__snakeReady.pendingTurnDirection()).toBe('up');
      expect(context.strokeStyles).toContain(CHEVRON_STROKE);

      // Let the tick apply it so the gesture below is the only buffered
      // turn — the indicator tracks the queue head, and with the queue
      // emptied that head is the gesture's direction.
      vi.advanceTimersByTime(400);
      expect(game.serialize().directionQueue).toEqual([]);

      // The gesture path redraws on acceptance the same way.
      context.strokeStyles.length = 0;
      const canvas = container.querySelector('.games-snake-canvas');
      canvas.dispatchEvent(pointer('pointerdown', 150, 150));
      canvas.dispatchEvent(pointer('pointermove', 150, 200));
      expect(window.__snakeReady.pendingTurnDirection()).toBe('down');
      expect(context.strokeStyles).toContain(CHEVRON_STROKE);
    } finally {
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
      if (previousMotion === undefined) delete window.prefersReducedMotion;
      else window.prefersReducedMotion = previousMotion;
    }
  });
});

describe('Snake immediate turn application (#1021)', () => {
  let container = null;
  let game = null;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ container, game } = startGame());
    vi.advanceTimersByTime(200);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (game) game.destroy();
    if (container) container.remove();
    container = null;
    game = null;
  });

  it('faces a legal queued turn in the same frame the key lands', () => {
    const snakeBefore = game.serialize().snake;
    expect(game.serialize().direction).toBe('right');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }));

    // Facing changed with no tick in between. The queue is left intact, so
    // tick() still drains exactly one entry per tick: only the facing
    // moved earlier (#1021).
    const state = game.serialize();
    expect(state.direction).toBe('up');
    expect(state.directionQueue).toEqual(['up']);
    // No cell moved when the turn applied: the interpolation anchors are
    // untouched, so nothing snaps or teleports.
    expect(state.snake).toEqual(snakeBefore);

    // The head's next move is exactly one cell north on the next tick.
    let moved = null;
    for (let i = 0; i < 15 && !moved; i++) {
      vi.advanceTimersByTime(16);
      const sample = game.serialize();
      if (sample.snake[0].x !== snakeBefore[0].x || sample.snake[0].y !== snakeBefore[0].y) {
        moved = sample;
      }
    }
    expect(moved).not.toBeNull();
    expect(moved.snake[0]).toEqual({ x: snakeBefore[0].x, y: snakeBefore[0].y - 1 });
    expect(moved.direction).toBe('up');
  });

  it('never applies a reversal immediately', () => {
    const before = game.serialize().snake[0];

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft' }));

    // Left is accepted into the queue (the enqueue-time opposite veto is
    // gone, #1017) but reverses the heading: it is never applied on press,
    // and tick() drops it at apply time.
    const queued = game.serialize();
    expect(queued.directionQueue).toEqual(['left']);
    expect(queued.direction).toBe('right');
    expect(queued.snake[0]).toEqual(before);

    const samples = [];
    for (let i = 0; i < 15; i++) {
      vi.advanceTimersByTime(16);
      samples.push(game.serialize());
    }
    expect(samples.every((s) => s && s.direction === 'right')).toBe(true);
    expect(samples[samples.length - 1].directionQueue).toEqual([]);
    // The run kept travelling east: the reversal never executed.
    expect(samples[samples.length - 1].snake[0].x).toBeGreaterThan(before.x);
  });

  it('does not apply a queued turn immediately while paused', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' })); // manual pause
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }));

    // Paused: the press is queued but the facing does not move, and the
    // board stays frozen.
    expect(game.serialize().direction).toBe('right');
    expect(game.serialize().directionQueue).toEqual(['up']);
    const frozen = game.serialize().snake;
    vi.advanceTimersByTime(300);
    expect(game.serialize().snake).toEqual(frozen);

    // Resuming lets the per-tick drain apply the held turn.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
    let advanced = null;
    for (let i = 0; i < 15 && !advanced; i++) {
      vi.advanceTimersByTime(16);
      const sample = game.serialize();
      if (sample.direction === 'up') advanced = sample;
    }
    expect(advanced).not.toBeNull();
    expect(advanced.directionQueue).toEqual([]);
  });

  it('faces a swipe or D-pad turn immediately, like the keyboard path', () => {
    const canvas = container.querySelector('.games-snake-canvas');

    canvas.dispatchEvent(pointer('pointerdown', 150, 150));
    canvas.dispatchEvent(pointer('pointermove', 150, 100));

    // Gesture steering shares the keyboard's instant facing (#1021): the
    // queue keeps the entry for the per-tick drain, and the facing moved
    // with the gesture.
    const state = game.serialize();
    expect(state.directionQueue).toContain('up');
    expect(state.direction).toBe('up');
  });

  it('round-trips a snapshot taken immediately after a turn is faced (#1021)', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }));
    const snapshot = game.serialize();
    expect(snapshot.direction).toBe('up');
    expect(snapshot.directionQueue).toEqual(['up']);

    // A faced queue head is a legal live state since #1021: the snapshot
    // must restore (Continue) instead of being rejected as corrupt.
    game.destroy();
    container.remove();
    game = null;
    container = null;
    const restoredContainer = document.createElement('div');
    document.body.appendChild(restoredContainer);
    const restored = window.GameRegistry.get('snake');
    restored.init(restoredContainer, snapshot);
    expect(restoredContainer.querySelector('.games-ready-overlay .games-ready-start').textContent).toBe('Continue');

    restored.destroy();
    restoredContainer.remove();
  });
});

describe('Snake pointer steering and D-pad (#1019)', () => {
  function startSnake() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);
    // The ready screen lifts on Space, same as a real player.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__snakeReady.isStarted()).toBe(true);
    return { container, game };
  }

  it('renders an accessible touch D-pad inside the stage', () => {
    const { container, game } = startSnake();

    const pad = container.querySelector('.games-snake-stage .games-dpad');
    expect(pad).not.toBeNull();
    expect(pad.getAttribute('role')).toBe('group');
    expect(pad.querySelectorAll('.games-dpad-btn')).toHaveLength(4);

    game.destroy();
    container.remove();
  });

  it('queues a swipe turn as soon as the gesture crosses the threshold, before pointerup', () => {
    const { container, game } = startSnake();
    const canvas = container.querySelector('.games-snake-canvas');

    canvas.dispatchEvent(pointer('pointerdown', 150, 150));
    canvas.dispatchEvent(pointer('pointermove', 150, 100));
    // No pointerup yet: the turn is already queued (threshold-crossing).
    expect(game.serialize().directionQueue).toContain('up');

    game.destroy();
    container.remove();
  });

  it('moves focus from a focused button to the canvas on a mouse drag (#1024)', () => {
    const { container, game } = startSnake();
    const canvas = container.querySelector('.games-snake-canvas');

    // A leftover focused button must lose focus on the first mouse press;
    // otherwise Space would re-activate the button instead of pausing.
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    expect(document.activeElement).toBe(button);

    // A held primary button is a steering gesture, and the swallowed
    // pointerdown default keeps the drag from starting a native text
    // selection around the board.
    const down = pointer('pointerdown', 150, 150, { pointerType: 'mouse', button: 0 });
    canvas.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(canvas);
    canvas.dispatchEvent(pointer('pointermove', 150, 100, { pointerType: 'mouse', buttons: 1 }));
    expect(game.serialize().directionQueue).toContain('up');

    game.destroy();
    container.remove();
    button.remove();
  });

  it('captures the pointer on down and releases it on end', () => {
    const { container, game } = startSnake();
    const canvas = container.querySelector('.games-snake-canvas');
    const captured = [];
    canvas.setPointerCapture = (id) => { captured.push(id); };
    canvas.releasePointerCapture = vi.fn();

    // Capture on down is what keeps a real gesture alive after the finger
    // leaves the canvas; jsdom cannot retarget events, so assert the
    // capture contract the browser relies on and that the turn from the
    // gesture stays queued throughout.
    canvas.dispatchEvent(pointer('pointerdown', 150, 150, { pointerId: 7 }));
    expect(captured).toEqual([7]);
    canvas.dispatchEvent(pointer('pointermove', 150, 100));
    expect(game.serialize().directionQueue).toContain('up');
    canvas.dispatchEvent(pointer('pointerup', 400, 10, { pointerId: 7 }));
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(game.serialize().directionQueue).toContain('up');

    game.destroy();
    container.remove();
  });

  it('does not steer on a tap, and a tap restarts a finished run', () => {
    const { container, game } = startSnake();
    const canvas = container.querySelector('.games-snake-canvas');

    // Tap while alive: no direction queued.
    canvas.dispatchEvent(pointer('pointerdown', 150, 150));
    canvas.dispatchEvent(pointer('pointerup', 150, 150));
    expect(game.serialize().directionQueue).toEqual([]);

    // After game over a tap restarts the run.
    window.__snakeReady.forceGameOver();
    expect(window.__snakeReady.isGameOver()).toBe(true);
    canvas.dispatchEvent(pointer('pointerdown', 150, 150));
    canvas.dispatchEvent(pointer('pointerup', 150, 150));
    expect(window.__snakeReady.isGameOver()).toBe(false);
    expect(window.__snakeReady.isStarted()).toBe(true);

    game.destroy();
    container.remove();
  });

  it('queues turns from the D-pad buttons and ignores them after game over', () => {
    const { container, game } = startSnake();
    const pad = container.querySelector('.games-dpad');

    // Tap-to-press queues immediately (pointerdown).
    pad.querySelector('.games-dpad-up').dispatchEvent(pointer('pointerdown', 0, 0));
    expect(game.serialize().directionQueue).toEqual(['up']);

    // The pointer tap's compatibility click (detail 1) must not double-fire:
    // a non-opposite direction would queue if the click fired unchecked.
    pad.querySelector('.games-dpad-left').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(game.serialize().directionQueue).toEqual(['up']);

    // Keyboard/assistive-tech activation (click detail 0) also steers.
    pad.querySelector('.games-dpad-left').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(game.serialize().directionQueue).toEqual(['up', 'left']);

    // Steering is inert after game over (restart stays a tap).
    window.__snakeReady.forceGameOver();
    pad.querySelector('.games-dpad-up').dispatchEvent(pointer('pointerdown', 0, 0));
    expect(window.__snakeReady.isGameOver()).toBe(true);

    game.destroy();
    container.remove();
  });

  it('detaches gesture and D-pad listeners on destroy', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

    const canvas = container.querySelector('.games-snake-canvas');
    const pad = container.querySelector('.games-dpad');
    const upBtn = pad.querySelector('.games-dpad-up');
    const canvasRemovals = vi.spyOn(canvas, 'removeEventListener');
    const buttonRemovals = vi.spyOn(upBtn, 'removeEventListener');

    game.destroy();
    // Listener cleanup is the real signal: stale handlers would still
    // return harmlessly, so a no-throw dispatch alone proves nothing.
    expect(canvasRemovals).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(canvasRemovals).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(canvasRemovals).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(canvasRemovals).toHaveBeenCalledWith('pointercancel', expect.any(Function));
    expect(buttonRemovals).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(buttonRemovals).toHaveBeenCalledWith('click', expect.any(Function));
    expect(container.querySelector('.games-dpad')).toBeNull();

    // The stage (canvas + pad) is torn down with the container; dispatching at
    // the detached nodes must not throw or resurrect game state.
    expect(() => {
      canvas.dispatchEvent(pointer('pointerdown', 150, 150));
      canvas.dispatchEvent(pointer('pointermove', 150, 100));
      upBtn.dispatchEvent(pointer('pointerdown', 0, 0));
    }).not.toThrow();
    expect(window.__snakeReady.isStarted()).toBe(false);

    canvasRemovals.mockRestore();
    buttonRemovals.mockRestore();
    container.remove();
  });

  it('ignores swipes while the ready screen is still up', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('snake');
    game.init(container);
    const canvas = container.querySelector('.games-snake-canvas');

    canvas.dispatchEvent(pointer('pointerdown', 150, 150));
    canvas.dispatchEvent(pointer('pointermove', 150, 100));
    expect(window.__snakeReady.isStarted()).toBe(false);

    // The ignored swipes left nothing behind: starting the run afterwards
    // still shows an empty turn queue.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__snakeReady.isStarted()).toBe(true);
    expect(game.serialize().directionQueue).toEqual([]);

    game.destroy();
    container.remove();
  });

  it('leaves Space alone while a D-pad button is focused so it stays activatable', () => {
    vi.useFakeTimers();
    let container = null;
    let game = null;
    try {
      ({ container, game } = startSnake());
      const headBefore = game.serialize().snake[0];
      const upBtn = container.querySelector('.games-dpad-up');
      upBtn.focus();
      const e = new KeyboardEvent('keydown', { key: ' ', code: 'Space', cancelable: true, bubbles: true });
      upBtn.dispatchEvent(e);

      expect(e.defaultPrevented).toBe(false);
      // Space went to the button, not the pause toggle: the run keeps ticking.
      vi.advanceTimersByTime(300);
      expect(game.serialize().snake[0]).not.toEqual(headBefore);
    } finally {
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
    }
  });
});

describe('Snake gamepad input (#1022)', () => {
  let stub = null;
  let pad = null;

  beforeEach(() => {
    stub = installGamepadStub();
    pad = makeGamepad();
    stub.pads = [pad];
  });

  afterEach(() => {
    removeGamepadStub();
  });

  it('holds the ready screen against steering and lifts it from A', () => {
    vi.useFakeTimers();
    let container = null;
    let game = null;
    try {
      container = document.createElement('div');
      document.body.appendChild(container);
      game = window.GameRegistry.get('snake');
      game.init(container);
      expect(window.__snakeReady.isStarted()).toBe(false);
      expect(container.querySelector('.games-ready-overlay')).not.toBeNull();

      pressButton(pad, 12); // D-pad up must not steer or start the run
      vi.advanceTimersByTime(50);
      expect(window.__snakeReady.isStarted()).toBe(false);

      pressButton(pad, 0); // A lifts the ready screen instead
      vi.advanceTimersByTime(50);
      expect(window.__snakeReady.isStarted()).toBe(true);
      expect(container.querySelector('.games-ready-overlay')).toBeNull();
      // The D-pad was latched while the screen was up, so nothing queued.
      expect(game.serialize().directionQueue).toEqual([]);
    } finally {
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
    }
  });

  it('lifts the ready screen from Start', () => {
    vi.useFakeTimers();
    let container = null;
    let game = null;
    try {
      container = document.createElement('div');
      document.body.appendChild(container);
      game = window.GameRegistry.get('snake');
      game.init(container);

      pressButton(pad, 9); // Start behaves like Space on the ready screen
      vi.advanceTimersByTime(50);
      expect(window.__snakeReady.isStarted()).toBe(true);
      expect(container.querySelector('.games-ready-overlay')).toBeNull();
    } finally {
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
    }
  });

  it('steers with the D-pad through the same queueTurn path as the keyboard', () => {
    vi.useFakeTimers();
    let container = null;
    let game = null;
    try {
      ({ container, game } = startGame());

      pressButton(pad, 12); // D-pad up
      vi.advanceTimersByTime(200); // press lands, first tick applies the turn
      expect(game.serialize().direction).toBe('up');
      expect(game.serialize().directionQueue).toEqual([]);

      // The held D-pad never re-fires: only a return to neutral re-arms it,
      // so the next press queues a fresh direction instead of being swallowed.
      releaseButton(pad, 12);
      vi.advanceTimersByTime(50);
      pressButton(pad, 15); // D-pad right, perpendicular to the current up
      vi.advanceTimersByTime(50);
      const state = game.serialize();
      expect(state.directionQueue.includes('right') || state.direction === 'right').toBe(true);
    } finally {
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
    }
  });

  it('pauses and resumes from Start', () => {
    vi.useFakeTimers();
    let container = null;
    let game = null;
    try {
      ({ container, game } = startGame());
      vi.advanceTimersByTime(300); // let the run move a few cells first

      pressButton(pad, 9); // Start pauses
      vi.advanceTimersByTime(50);
      const pausedHead = game.serialize().snake[0];
      vi.advanceTimersByTime(400);
      expect(game.serialize().snake[0]).toEqual(pausedHead); // frozen

      releaseButton(pad, 9); // releasing Start is not a toggle
      vi.advanceTimersByTime(50);
      expect(game.serialize().snake[0]).toEqual(pausedHead);

      pressButton(pad, 9); // Start again resumes
      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(400);
      expect(game.serialize().snake[0]).not.toEqual(pausedHead);
    } finally {
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
    }
  });

  it('ignores Start after game over and restarts with A', () => {
    vi.useFakeTimers();
    let container = null;
    let game = null;
    try {
      ({ container, game } = startGame());
      window.__snakeReady.forceGameOver();
      expect(window.__snakeReady.isGameOver()).toBe(true);

      pressButton(pad, 9); // Start must not toggle a dead run
      vi.advanceTimersByTime(50);
      expect(window.__snakeReady.isGameOver()).toBe(true);

      releaseButton(pad, 9);
      vi.advanceTimersByTime(50);
      pressButton(pad, 0); // A/Cross restarts
      vi.advanceTimersByTime(50);
      expect(window.__snakeReady.isGameOver()).toBe(false);
      expect(window.__snakeReady.isStarted()).toBe(true);
    } finally {
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
    }
  });

  it('runs exactly one poller per mount and stops it on destroy', () => {
    vi.useFakeTimers();
    let container = null;
    let game = null;
    let host = null;
    try {
      window.GameRegistry.destroyCurrent(); // start from a clean registry
      container = document.createElement('div');
      document.body.appendChild(container);
      game = window.GameRegistry.get('snake');
      game.init(container);
      // One frame = exactly one getGamepads call when a single poller runs.
      vi.advanceTimersByTime(16);
      expect(stub.calls).toBe(1);

      game.destroy(); // teardown cancels the frame loop
      vi.advanceTimersByTime(16);
      expect(stub.calls).toBe(1);

      // A registry handoff (destroyCurrent → init) must not stack pollers.
      host = document.createElement('div');
      host.id = 'games-game-container';
      document.body.appendChild(host);
      expect(window.GameRegistry.launch('snake')).toBe(true);
      vi.advanceTimersByTime(16);
      expect(stub.calls).toBe(2);

      window.GameRegistry.destroyCurrent();
      vi.advanceTimersByTime(16);
      expect(stub.calls).toBe(2);
    } finally {
      window.GameRegistry.destroyCurrent();
      vi.useRealTimers();
      if (game) game.destroy();
      if (container) container.remove();
      if (host) host.remove();
    }
  });
});
