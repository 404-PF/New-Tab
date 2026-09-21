import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { installFlappyBirdTestEnvironment } from '../helpers/flappy-bird-test-env.js';

beforeAll(() => {
  installFlappyBirdTestEnvironment(vi);
});

beforeEach(() => {
  if (window.GameRegistry?.getCurrentGame?.()) {
    window.GameRegistry.destroyCurrent();
  }
  localStorage.clear();
  document.body.innerHTML = '';
});

afterAll(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function getGame() {
  return window.GameRegistry.get('flappy-bird');
}

function makeContainer() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  getGame().init(container);
  return container;
}

function startWithSpace() {
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
}

describe('Flappy Bird registration and ready state', () => {
  it('registers with the GameRegistry contract', () => {
    const game = getGame();
    expect(game).not.toBeNull();
    expect(game.id).toBe('flappy-bird');
    expect(game.name).toBe('gamesFlappyBird');
    expect(game.description).toBe('gamesFlappyBirdDesc');
    expect(game.icon).toBe('🐦');
    expect(typeof game.init).toBe('function');
    expect(typeof game.destroy).toBe('function');
    expect(typeof game.pause).toBe('function');
    expect(typeof game.resume).toBe('function');
    expect(typeof game.serialize).toBe('function');
  });

  it('renders behind the shared ready screen and does not start until Space', () => {
    const container = makeContainer();
    const state = window.__flappyBirdTest.getState();

    expect(container.querySelector('.games-flappy-canvas')).not.toBeNull();
    expect(container.querySelector('.games-flappy-stage')).not.toBeNull();
    expect(container.querySelector('.games-flappy-instructions')).not.toBeNull();
    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
    expect(state.started).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
    expect(window.__flappyBirdTest.getState().started).toBe(false);

    startWithSpace();
    expect(window.__flappyBirdTest.getState().started).toBe(true);
    expect(container.querySelector('.games-ready-overlay')).toBeNull();

    getGame().destroy();
    container.remove();
  });
});

describe('Flappy Bird difficulty helpers', () => {
  it('ramps speed and gap difficulty every five points with hard floors', () => {
    const d = window.__flappyBirdTest;
    expect(d.levelForScore(0)).toBe(1);
    expect(d.levelForScore(4)).toBe(1);
    expect(d.levelForScore(5)).toBe(2);
    expect(d.speedForScore(0)).toBe(d.constants.baseSpeed);
    expect(d.speedForScore(5)).toBe(d.constants.baseSpeed + d.constants.speedStep);
    expect(d.speedForScore(10000)).toBe(d.constants.maxSpeed);
    expect(d.gapForScore(0)).toBe(d.constants.baseGap);
    expect(d.gapForScore(10000)).toBe(d.constants.minGap);
  });
});

describe('Flappy Bird input and lifecycle', () => {
  it('flaps with ArrowUp/W and pauses/resumes with Space', () => {
    const container = makeContainer();
    startWithSpace();

    const before = window.__flappyBirdTest.getState();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp' }));
    const afterFlap = window.__flappyBirdTest.getState();
    expect(afterFlap.bird.vy).toBeLessThan(before.bird.vy);

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__flappyBirdTest.getState().paused).toBe(true);
    expect(window.__flappyBirdTest.getState().manualPause).toBe(true);

    getGame().resume();
    expect(window.__flappyBirdTest.getState().paused).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__flappyBirdTest.getState().paused).toBe(false);
    expect(window.__flappyBirdTest.getState().manualPause).toBe(false);

    getGame().destroy();
    container.remove();
  });

  it('flaps on canvas click and removes all handlers on destroy', () => {
    const container = makeContainer();
    startWithSpace();
    const canvas = container.querySelector('.games-flappy-canvas');

    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(window.__flappyBirdTest.getState().bird.vy).toBe(-430);

    getGame().destroy();
    expect(container.innerHTML).toBe('');

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp' }));
    expect(window.__flappyBirdTest.getState().started).toBe(false);
  });
});

describe('Flappy Bird save and restore', () => {
  it('serializes a live run and restores it behind Continue', () => {
    const container = makeContainer();
    startWithSpace();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp' }));
    const saved = getGame().serialize();

    expect(saved).not.toBeNull();
    expect(saved.bird.x).toBe(window.__flappyBirdTest.constants.birdX);
    expect(saved.pipes.length).toBeGreaterThan(0);
    expect(Number.isSafeInteger(saved.score)).toBe(true);

    getGame().destroy();
    container.innerHTML = '';
    getGame().init(container, saved);

    expect(window.__flappyBirdTest.getState().started).toBe(false);
    expect(container.querySelector('.games-ready-start').textContent).toBe('Continue');
    expect(getGame().serialize()).toBeNull();

    getGame().destroy();
    container.remove();
  });

  it('rejects malformed or impossible save geometry', () => {
    const d = window.__flappyBirdTest;
    const valid = {
      bird: { x: d.constants.birdX, y: 250, vy: 0 },
      pipes: [
        { x: 444, gapY: 240, passed: false }
      ],
      score: 0,
      speed: d.constants.baseSpeed
    };

    expect(d.validateSavedState(valid)).toBe(true);

    expect(d.validateSavedState({ ...valid, score: -1 })).toBe(false);
    expect(d.validateSavedState({ ...valid, speed: 999 })).toBe(false);
    expect(d.validateSavedState({
      ...valid,
      pipes: [{ x: 444, gapY: 240, passed: false }, { x: 450, gapY: 260, passed: false }]
    })).toBe(false);
    expect(d.validateSavedState({
      ...valid,
      bird: { x: 10, y: 250, vy: 0 }
    })).toBe(false);
    const withoutOptionalGap = makeSavedStateForValidation(valid);
    expect(d.applyRestoredState(withoutOptionalGap)).toBe(true);
  });
});

function makeSavedStateForValidation(state) {
  return {
    bird: { ...state.bird },
    pipes: state.pipes.map((pipe) => ({
      x: pipe.x,
      gapY: pipe.gapY,
      passed: pipe.passed
    })),
    score: state.score,
    speed: state.speed
  };
}

describe('Flappy Bird persistence and terminal state', () => {
  it('persists a live run through GameRegistry destroyCurrent and restores it', () => {
    const host = document.createElement('div');
    host.id = 'games-game-container';
    document.body.appendChild(host);

    expect(window.GameRegistry.launch('flappy-bird')).toBe(true);
    startWithSpace();
    window.GameRegistry.destroyCurrent();

    expect(window.GameRegistry.hasSave('flappy-bird')).toBe(true);

    const stored = JSON.parse(localStorage.getItem('games_saves'));
    expect(stored['flappy-bird'].state.bird.x).toBe(window.__flappyBirdTest.constants.birdX);
    expect(stored['flappy-bird'].state.pipes.length).toBeGreaterThan(0);

    expect(window.GameRegistry.launch('flappy-bird')).toBe(true);
    expect(host.querySelector('.games-ready-start').textContent).toBe('Continue');

    window.GameRegistry.destroyCurrent();
    host.remove();
  });

  it('clears the save and increments stats when the run reaches game over', () => {
    const container = makeContainer();
    startWithSpace();

    localStorage.setItem('games_saves', JSON.stringify({
      'flappy-bird': {
        state: getGame().serialize(),
        savedAt: 1
      }
    }));

    window.__flappyBirdTest.forceGameOver();

    expect(window.GameRegistry.hasSave('flappy-bird')).toBe(false);
    expect(window.GameRegistry.getStats('flappy-bird')).toEqual({
      highScore: 0,
      gamesPlayed: 1
    });

    getGame().destroy();
    container.remove();
  });

  it('does not start or resume an un-started ready screen', () => {
    const container = makeContainer();

    getGame().pause();
    getGame().resume();

    expect(window.__flappyBirdTest.getState().started).toBe(false);
    expect(window.__flappyBirdTest.getState().paused).toBe(false);
    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();

    getGame().destroy();
    container.remove();
  });
});
