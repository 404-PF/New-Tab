import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import {
  installPacmanTestEnvironment,
  mountPacman,
  dispatchKey,
  resetGamesHub
} from '../helpers/pacman-test-env.js';

beforeAll(() => {
  installPacmanTestEnvironment(vi);
});

beforeEach(resetGamesHub);

afterAll(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const getGame = () => window.GameRegistry.get('pacman');
const makeContainer = mountPacman;
const startWithSpace = () => dispatchKey('Space');
const pressKey = dispatchKey;

// Put Pac-Man and the first ghost on the same tile and advance one tick.
function collideWithGhost() {
  window.__pacmanTest.setPositions({
    pacman: { x: 6, y: 13, dir: 'left' },
    ghosts: [{ x: 6, y: 13, inHouse: false, eaten: false }]
  });
  window.__pacmanTest.tick(0.01);
}

describe('Pac-Man registration and ready state', () => {
  it('registers with the GameRegistry contract', () => {
    const game = getGame();
    expect(game).toMatchObject({
      id: 'pacman',
      name: 'gamesPacman',
      description: 'gamesPacmanDesc',
      icon: '👻'
    });
    ['init', 'destroy', 'pause', 'resume', 'serialize'].forEach((method) => {
      expect(game[method], method).toBeTypeOf('function');
    });
  });

  it('renders behind the shared ready screen and does not start until Space', () => {
    const container = makeContainer();
    const state = window.__pacmanTest.getState();

    expect(container.querySelector('.games-pacman-canvas')).not.toBeNull();
    expect(container.querySelector('.games-pacman-stage')).not.toBeNull();
    expect(container.querySelector('.games-pacman-instructions')).not.toBeNull();
    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
    expect(state.started).toBe(false);

    pressKey('ArrowRight');
    expect(window.__pacmanTest.getState().started).toBe(false);

    startWithSpace();
    expect(window.__pacmanTest.getState().started).toBe(true);
    expect(container.querySelector('.games-ready-overlay')).toBeNull();

    getGame().destroy();
    container.remove();
  });
});

describe('Pac-Man maze validation', () => {
  it('accepts the built-in maze', () => {
    const result = window.__pacmanTest.validateMaze();
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects malformed mazes', () => {
    const d = window.__pacmanTest;

    expect(d.validateMazeData(['###', '##']).ok).toBe(false);
    expect(d.validateMazeData(['###', '#X#', '###']).ok).toBe(false);

    const noDots = Array.from({ length: 22 }, (_r, r) =>
      Array.from({ length: 19 }, (_c, c) => (r === 0 || r === 21 || c === 0 || c === 18) ? '#' : ' ').join('')
    );
    const noDotsResult = d.validateMazeData(noDots);
    expect(noDotsResult.ok).toBe(false);
    expect(noDotsResult.errors.join(' ')).toContain('at least one dot');

    // A maze with dots but no power pellets is malformed.
    const noPellets = Array.from({ length: 22 }, (_r, r) =>
      Array.from({ length: 19 }, (_c, c) => (r === 0 || r === 21 || c === 0 || c === 18) ? '#' : '.')
    );
    noPellets[8][9] = 'D';
    noPellets[9][9] = 'H';
    const noPelletsResult = d.validateMazeData(noPellets.map((row) => row.join('')));
    expect(noPelletsResult.ok).toBe(false);
    expect(noPelletsResult.errors.join(' ')).toContain('power pellet');

    // Full-size corridor maze with a sealed single-tile pocket.
    const pocket = Array.from({ length: 22 }, (_r, r) =>
      Array.from({ length: 19 }, (_c, c) => (r === 0 || r === 21 || c === 0 || c === 18) ? '#' : '.').join('')
    );
    const pocketRows = pocket.map((row) => row.split(''));
    pocketRows[1][1] = 'o';
    pocketRows[8][9] = 'D';
    pocketRows[9][9] = 'H';
    pocketRows[4][10] = '#';
    pocketRows[5][9] = '#';
    pocketRows[5][11] = '#';
    pocketRows[6][10] = '#';
    const pocketResult = d.validateMazeData(pocketRows.map((row) => row.join('')));
    expect(pocketResult.ok).toBe(false);
    expect(pocketResult.errors.join(' ')).toContain('unreachable walkable tile at 10,5');
  });
});

describe('Pac-Man difficulty helpers', () => {
  it('ramps speed every level with hard caps', () => {
    const d = window.__pacmanTest;
    const c = d.constants;
    expect(d.speedForLevel(1).pacman).toBe(c.basePacmanSpeed);
    expect(d.speedForLevel(1).ghost).toBe(c.baseGhostSpeed);
    expect(d.speedForLevel(2).pacman).toBe(c.basePacmanSpeed + c.pacmanSpeedStep);
    expect(d.speedForLevel(2).ghost).toBe(c.baseGhostSpeed + c.ghostSpeedStep);
    expect(d.speedForLevel(1000).pacman).toBe(c.maxPacmanSpeed);
    expect(d.speedForLevel(1000).ghost).toBe(c.maxGhostSpeed);
  });

  it('shortens the frightened window per level with a floor', () => {
    const d = window.__pacmanTest;
    const c = d.constants;
    expect(d.frightenedMsForLevel(1)).toBe(c.baseFrightenedMs);
    expect(d.frightenedMsForLevel(2)).toBe(c.baseFrightenedMs - c.frightenedMsStep);
    expect(d.frightenedMsForLevel(1000)).toBe(c.minFrightenedMs);
  });
});

describe('Pac-Man input and movement', () => {
  it('steers with Arrow/WASD keys using a queued-turn buffer', () => {
    const container = makeContainer();
    startWithSpace();

    pressKey('ArrowRight');
    expect(window.__pacmanTest.getState().queuedDirs).toEqual(['right']);
    window.__pacmanTest.tick(0.25);
    const after = window.__pacmanTest.getState();
    expect(after.pacman.x).toBeCloseTo(10.125, 5);
    expect(after.pacman.dir).toBe('right');

    // A second and third press while the buffer is full are dropped.
    window.__pacmanTest.setPositions({ pacman: { x: 6, y: 13, dir: 'left' } });
    pressKey('ArrowDown');
    pressKey('ArrowUp');
    pressKey('KeyW');
    expect(window.__pacmanTest.getState().queuedDirs.length).toBeLessThanOrEqual(2);
    window.__pacmanTest.tick(0.2);
    expect(window.__pacmanTest.getState().pacman.dir).toBe('down');

    getGame().destroy();
    container.remove();
  });

  it('reverses immediately mid-corridor and clears the queue', () => {
    const container = makeContainer();
    startWithSpace();

    window.__pacmanTest.setPositions({ pacman: { x: 7, y: 13, dir: 'left' } });
    window.__pacmanTest.tick(0.02);
    expect(window.__pacmanTest.getState().pacman.x).toBeLessThan(7);

    pressKey('ArrowRight');
    expect(window.__pacmanTest.getState().queuedDirs).toEqual([]);
    window.__pacmanTest.tick(0.05);
    const state = window.__pacmanTest.getState();
    expect(state.pacman.dir).toBe('right');
    expect(state.pacman.x).toBeGreaterThan(7);

    getGame().destroy();
    container.remove();
  });

  it('supports WASD codes', () => {
    const container = makeContainer();
    startWithSpace();
    window.__pacmanTest.setPositions({ pacman: { x: 6, y: 13, dir: 'left' } });
    pressKey('KeyS');
    window.__pacmanTest.tick(0.05);
    expect(window.__pacmanTest.getState().pacman.dir).toBe('down');
    getGame().destroy();
    container.remove();
  });

  it('ignores steering while an editable element has focus', () => {
    const container = makeContainer();
    startWithSpace();

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    pressKey('ArrowRight', input);
    expect(window.__pacmanTest.getState().queuedDirs).toEqual([]);
    input.remove();

    getGame().destroy();
    container.remove();
  });

  it('pauses with Space and resume() is a no-op while manually paused', () => {
    const container = makeContainer();
    startWithSpace();

    pressKey('Space');
    expect(window.__pacmanTest.getState().paused).toBe(true);
    expect(window.__pacmanTest.getState().manualPause).toBe(true);

    getGame().resume();
    expect(window.__pacmanTest.getState().paused).toBe(true);

    pressKey('Space');
    expect(window.__pacmanTest.getState().paused).toBe(false);
    expect(window.__pacmanTest.getState().manualPause).toBe(false);

    getGame().pause();
    expect(window.__pacmanTest.getState().paused).toBe(true);
    getGame().resume();
    expect(window.__pacmanTest.getState().paused).toBe(false);

    getGame().destroy();
    container.remove();
  });

  it('does not start or resume an un-started ready screen', () => {
    const container = makeContainer();

    getGame().pause();
    getGame().resume();

    expect(window.__pacmanTest.getState().started).toBe(false);
    expect(window.__pacmanTest.getState().paused).toBe(false);
    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();

    getGame().destroy();
    container.remove();
  });
});

describe('Pac-Man scoring, ghosts, and lives', () => {
  it('eats dots for 10 points', () => {
    const container = makeContainer();
    startWithSpace();
    const before = window.__pacmanTest.getState().dotsRemaining;

    window.__pacmanTest.setPositions({ pacman: { x: 2, y: 3, dir: 'left' } });
    window.__pacmanTest.tick(0.25);

    const state = window.__pacmanTest.getState();
    expect(state.score).toBe(10);
    expect(state.dotsRemaining).toBe(before - 1);
    expect(state.pacman.x).toBeCloseTo(1, 5);

    getGame().destroy();
    container.remove();
  });

  it('eats power pellets for 50 points and starts the frightened window', () => {
    const container = makeContainer();
    startWithSpace();

    window.__pacmanTest.setPositions({ pacman: { x: 2, y: 17, dir: 'left' } });
    window.__pacmanTest.tick(0.25);

    const state = window.__pacmanTest.getState();
    expect(state.score).toBe(50);
    expect(state.frightened).toBe(true);

    // The window expires once its duration elapses.
    window.__pacmanTest.setFrightened(300);
    window.__pacmanTest.tick(0.2);
    expect(window.__pacmanTest.getState().frightened).toBe(true);
    window.__pacmanTest.tick(0.2);
    expect(window.__pacmanTest.getState().frightened).toBe(false);

    getGame().destroy();
    container.remove();
  });

  it('scores frightened ghosts 200/400 and sends them back to the house', () => {
    const container = makeContainer();
    startWithSpace();
    window.__pacmanTest.setFrightened(5000);
    window.__pacmanTest.setPositions({
      pacman: { x: 1, y: 17, dir: 'right' },
      ghosts: [
        { x: 1, y: 17, inHouse: false, eaten: false },
        { x: 1, y: 17, inHouse: false, eaten: false }
      ]
    });
    window.__pacmanTest.tick(0.01);

    const state = window.__pacmanTest.getState();
    expect(state.score).toBe(200 + 400);
    expect(state.frightenedChain).toBe(2);
    expect(state.ghosts[0].eaten).toBe(true);
    expect(state.ghosts[1].eaten).toBe(true);

    getGame().destroy();
    container.remove();
  });

  it('loses a life on collision with a non-frightened ghost', () => {
    const container = makeContainer();
    startWithSpace();

    collideWithGhost();

    const state = window.__pacmanTest.getState();
    expect(state.lives).toBe(2);
    expect(state.gameOver).toBe(false);
    expect(state.pacman.x).toBe(window.__pacmanTest.constants.pacmanSpawn.x);

    getGame().destroy();
    container.remove();
  });

  it('is invulnerable for a brief window after losing a life', () => {
    const container = makeContainer();
    startWithSpace();

    collideWithGhost();
    expect(window.__pacmanTest.getState().lives).toBe(2);

    // Collision during the respawn window must not cost another life.
    collideWithGhost();
    expect(window.__pacmanTest.getState().lives).toBe(2);

    getGame().destroy();
    container.remove();
  });

  it('advances to the next level when the last dot is eaten', () => {
    const container = makeContainer();
    startWithSpace();

    const saved = getGame().serialize();
    saved.dots = saved.dots.map((row) => row.map(() => 0));
    saved.dots[3][1] = 1;
    saved.pacman = {
      x: 2, y: 3, dir: 'left',
      a: { x: 2, y: 3 }, b: null, queuedDirs: []
    };
    expect(window.__pacmanTest.applyRestoredState(saved)).toBe(true);

    window.__pacmanTest.tick(0.25);

    const state = window.__pacmanTest.getState();
    expect(state.level).toBe(2);
    expect(state.dotsRemaining).toBeGreaterThan(100);
    expect(state.score).toBe(10);

    getGame().destroy();
    container.remove();
  });

  it('switches from scatter to chase after the scatter window', () => {
    const container = makeContainer();
    startWithSpace();
    expect(window.__pacmanTest.getState().mode).toBe('scatter');
    window.__pacmanTest.tick(7.1);
    expect(window.__pacmanTest.getState().mode).toBe('chase');
    getGame().destroy();
    container.remove();
  });

  it('ends the run, clears the save, and records stats on the last life', () => {
    const container = makeContainer();
    startWithSpace();
    window.__pacmanTest.tick(0.25);

    const saved = getGame().serialize();
    saved.lives = 1;
    expect(window.__pacmanTest.applyRestoredState(saved)).toBe(true);

    localStorage.setItem('games_saves', JSON.stringify({
      'pacman': { state: saved, savedAt: 1 }
    }));

    collideWithGhost();

    const state = window.__pacmanTest.getState();
    expect(state.gameOver).toBe(true);
    expect(state.lives).toBe(0);
    expect(window.GameRegistry.hasSave('pacman')).toBe(false);
    expect(window.GameRegistry.getStats('pacman')).toEqual({
      highScore: 10,
      gamesPlayed: 1
    });

    getGame().destroy();
    container.remove();
  });
});

describe('Pac-Man save and restore', () => {
  it('serializes null before the run starts', () => {
    const container = makeContainer();
    expect(getGame().serialize()).toBeNull();
    getGame().destroy();
    container.remove();
  });

  it('serializes a live run and restores it behind Continue', () => {
    const container = makeContainer();
    startWithSpace();
    window.__pacmanTest.tick(0.25);
    const saved = getGame().serialize();

    expect(saved).not.toBeNull();
    expect(saved.mazeId).toBe(window.__pacmanTest.constants.mazeId);
    expect(saved.lives).toBe(3);
    expect(saved.dots.length).toBe(window.__pacmanTest.constants.gridRows);
    expect(window.__pacmanTest.validateSavedState(saved)).toBe(true);

    getGame().destroy();
    container.innerHTML = '';
    getGame().init(container, saved);

    expect(window.__pacmanTest.getState().started).toBe(false);
    expect(container.querySelector('.games-ready-start').textContent).toBe('Continue');
    expect(getGame().serialize()).toBeNull();

    getGame().destroy();
    container.remove();
  });

  it('restores the queued turns saved with a snapshot', () => {
    const container = makeContainer();
    startWithSpace();
    window.__pacmanTest.tick(0.25);
    const saved = getGame().serialize();
    saved.pacman.queuedDirs = ['up'];

    expect(window.__pacmanTest.applyRestoredState(saved)).toBe(true);
    expect(window.__pacmanTest.getState().queuedDirs).toEqual(['up']);

    getGame().destroy();
    container.remove();
  });

  it('rejects corrupt endpoints on an entity saved at a tile centre', () => {
    const container = makeContainer();
    startWithSpace();
    const saved = getGame().serialize();
    const { x, y } = window.__pacmanTest.constants.pacmanSpawn;
    saved.pacman = { ...saved.pacman, x, y, a: { x, y }, b: { x: 0, y: 0 } };
    expect(window.__pacmanTest.validateSavedState(saved)).toBe(false);

    saved.pacman = { ...saved.pacman, a: { x: 0.5, y }, b: null };
    expect(window.__pacmanTest.validateSavedState(saved)).toBe(false);

    getGame().destroy();
    container.remove();
  });

  it('round-trips a live snapshot through applyRestoredState', () => {
    const container = makeContainer();
    startWithSpace();
    window.__pacmanTest.tick(0.25);
    const saved = getGame().serialize();
    const scoreBefore = window.__pacmanTest.getState().score;
    const dotsBefore = window.__pacmanTest.getState().dotsRemaining;

    getGame().destroy();
    container.innerHTML = '';
    getGame().init(container);
    startWithSpace();
    expect(window.__pacmanTest.applyRestoredState(saved)).toBe(true);
    window.__pacmanTest.tick(0);

    const state = window.__pacmanTest.getState();
    expect(state.score).toBe(scoreBefore);
    expect(state.dotsRemaining).toBe(dotsBefore);

    getGame().destroy();
    container.remove();
  });

  it('rejects malformed or corrupt snapshots', () => {
    const container = makeContainer();
    startWithSpace();
    window.__pacmanTest.tick(0.25);
    const d = window.__pacmanTest;
    const valid = getGame().serialize();

    expect(d.validateSavedState(valid)).toBe(true);
    expect(d.validateSavedState(null)).toBe(false);
    expect(d.validateSavedState({ ...valid, mazeId: 'nope' })).toBe(false);
    expect(d.validateSavedState({ ...valid, score: -1 })).toBe(false);
    expect(d.validateSavedState({ ...valid, lives: 0 })).toBe(false);
    expect(d.validateSavedState({ ...valid, level: 0 })).toBe(false);

    const badDir = { ...valid, pacman: { ...valid.pacman, dir: 'diagonal' } };
    expect(d.validateSavedState(badDir)).toBe(false);

    const onWall = {
      ...valid,
      pacman: { ...valid.pacman, x: 0, y: 0, dir: 'right', a: { x: 0, y: 0 }, b: null }
    };
    expect(d.validateSavedState(onWall)).toBe(false);

    const shortDots = { ...valid, dots: [[0, 1]] };
    expect(d.validateSavedState(shortDots)).toBe(false);

    const dotInWall = {
      ...valid,
      dots: valid.dots.map((row, r) => row.map((v, c) => (r === 0 && c === 0 ? 1 : v)))
    };
    expect(d.validateSavedState(dotInWall)).toBe(false);

    const overlap = {
      ...valid,
      ghosts: valid.ghosts.map((ghost, i) => (i === 0
        ? { ...ghost, x: valid.pacman.x, y: valid.pacman.y, eaten: false, inHouse: false }
        : ghost))
    };
    expect(d.validateSavedState(overlap)).toBe(false);

    const tooManyQueued = {
      ...valid,
      pacman: { ...valid.pacman, queuedDirs: ['up', 'down', 'left'] }
    };
    expect(d.validateSavedState(tooManyQueued)).toBe(false);

    getGame().destroy();
    container.remove();
  });

  it('discards a corrupt save on launch and starts fresh', () => {
    localStorage.setItem('games_saves', JSON.stringify({
      'pacman': { state: { junk: true }, savedAt: 1 }
    }));

    const container = document.createElement('div');
    document.body.appendChild(container);
    getGame().init(container, { junk: true });

    const startBtn = container.querySelector('.games-ready-start');
    expect(startBtn).not.toBeNull();
    expect(startBtn.textContent).not.toBe('Continue');
    expect(window.GameRegistry.hasSave('pacman')).toBe(false);

    getGame().destroy();
    container.remove();
  });
});

describe('Pac-Man persistence through GameRegistry', () => {
  it('persists a live run through destroyCurrent and restores it', () => {
    const host = document.createElement('div');
    host.id = 'games-game-container';
    document.body.appendChild(host);

    expect(window.GameRegistry.launch('pacman')).toBe(true);
    startWithSpace();
    window.__pacmanTest.tick(0.25);
    window.GameRegistry.destroyCurrent();

    expect(window.GameRegistry.hasSave('pacman')).toBe(true);
    const stored = JSON.parse(localStorage.getItem('games_saves'));
    expect(stored['pacman'].state.mazeId).toBe(window.__pacmanTest.constants.mazeId);

    expect(window.GameRegistry.launch('pacman')).toBe(true);
    expect(host.querySelector('.games-ready-start').textContent).toBe('Continue');

    window.GameRegistry.destroyCurrent();
    host.remove();
  });

  it('returns null from serialize after game over so no stale save lingers', () => {
    const container = makeContainer();
    startWithSpace();
    window.__pacmanTest.forceGameOver();
    expect(getGame().serialize()).toBeNull();
    getGame().destroy();
    container.remove();
  });
});

describe('Pac-Man cleanup', () => {
  it('removes all handlers and empties the container on destroy', () => {
    const container = makeContainer();
    startWithSpace();

    getGame().destroy();
    expect(container.innerHTML).toBe('');

    pressKey('ArrowRight');
    expect(window.__pacmanTest.getState().started).toBe(false);
    expect(window.__pacmanTest.getState().pacman).toBeNull();

    container.remove();
  });
});
