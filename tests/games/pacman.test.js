import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import {
  installPacmanTestEnvironment,
  mountPacman,
  dispatchKey,
  resetGamesHub
} from '../helpers/pacman-test-env.js';
import {
  installGamepadStub,
  removeGamepadStub,
  makeGamepad,
  pressButton,
  releaseButton,
  installFramePump
} from '../helpers/gamepad.js';

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

// Keep every ghost in the house for a long stretch so movement specs can
// tick across several tiles without an unlucky collision resetting Pac-Man.
function parkGhosts() {
  window.__pacmanTest.setPositions({
    ghosts: [
      { inHouse: true, releaseAt: 1e9 },
      { inHouse: true, releaseAt: 1e9 },
      { inHouse: true, releaseAt: 1e9 },
      { inHouse: true, releaseAt: 1e9 }
    ]
  });
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
  it('steers with Arrow/WASD keys using a single intended direction', () => {
    const container = makeContainer();
    startWithSpace();

    pressKey('ArrowRight');
    expect(window.__pacmanTest.getState().pendingDir).toBe('right');
    expect(window.__pacmanTest.getState().queuedDirs).toEqual(['right']);
    window.__pacmanTest.tick(0.25);
    const after = window.__pacmanTest.getState();
    expect(after.pacman.x).toBeCloseTo(10.125, 5);
    expect(after.pacman.dir).toBe('right');
    expect(after.pendingDir).toBeNull();

    // The last press wins when several directions arrive between tiles and a
    // repeat of the intended direction is a no-op.
    window.__pacmanTest.setPositions({ pacman: { x: 6, y: 13, dir: 'left' } });
    pressKey('ArrowDown');
    pressKey('ArrowUp');
    pressKey('KeyW');
    expect(window.__pacmanTest.getState().pendingDir).toBe('up');
    window.__pacmanTest.tick(0.2);
    expect(window.__pacmanTest.getState().pacman.dir).toBe('up');

    getGame().destroy();
    container.remove();
  });

  it('ignores a press of the direction Pac-Man is already heading', () => {
    const container = makeContainer();
    startWithSpace();

    window.__pacmanTest.setPositions({ pacman: { x: 6, y: 13, dir: 'left' } });
    pressKey('ArrowLeft');
    expect(window.__pacmanTest.getState().pendingDir).toBeNull();

    getGame().destroy();
    container.remove();
  });

  it('reverses immediately mid-corridor and clears the intention', () => {
    const container = makeContainer();
    startWithSpace();

    window.__pacmanTest.setPositions({ pacman: { x: 7, y: 13, dir: 'left' } });
    window.__pacmanTest.tick(0.02);
    expect(window.__pacmanTest.getState().pacman.x).toBeLessThan(7);

    pressKey('ArrowRight');
    expect(window.__pacmanTest.getState().pendingDir).toBeNull();
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

  it('steers with a held direction key on the next tick instead of dropping auto-repeat (#1016)', () => {
    const container = makeContainer();
    startWithSpace();

    window.__pacmanTest.setPositions({ pacman: { x: 6, y: 13, dir: 'left' } });
    const held = () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', key: 'ArrowDown', repeat: true, bubbles: true }));

    // Auto-repeats of a held direction key queue a turn (they used to be
    // discarded, so the intent was lost until the key was pressed again).
    held();
    expect(window.__pacmanTest.getState().queuedDirs).toEqual(['down']);
    // Repeats are idempotent: the queue keeps one pending intent only.
    held();
    held();
    expect(window.__pacmanTest.getState().queuedDirs).toEqual(['down']);

    window.__pacmanTest.tick(0.2);
    expect(window.__pacmanTest.getState().pacman.dir).toBe('down');

    getGame().destroy();
    container.remove();
  });

  it('retries a held direction key while a stale intent is pending (#1016)', () => {
    const container = makeContainer();
    startWithSpace();

    window.__pacmanTest.setPositions({
      pacman: { x: 6, y: 13, dir: 'left', queuedDirs: ['down', 'right'] }
    });
    const held = () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', key: 'ArrowDown', repeat: true, bubbles: true }));

    // The legacy queue collapses to its last intent; the held repeat replaces
    // that stale intent instead of being lost behind a full buffer.
    held();
    expect(window.__pacmanTest.getState().queuedDirs).toEqual(['down']);

    // The next tick applies 'down'; the still-held key is now the direction
    // in effect, so its repeats must not invent a second intent either.
    window.__pacmanTest.tick(0.05);
    held();
    expect(window.__pacmanTest.getState().queuedDirs).toEqual([]);
    window.__pacmanTest.tick(0.3);
    expect(window.__pacmanTest.getState().pacman.dir).toBe('down');

    getGame().destroy();
    container.remove();
  });

  it('does not flicker pause while Space is held (#1016)', () => {
    const container = makeContainer();
    startWithSpace();

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true }));
    expect(window.__pacmanTest.getState().paused).toBe(false);

    pressKey('Space');
    expect(window.__pacmanTest.getState().paused).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true }));
    expect(window.__pacmanTest.getState().paused).toBe(true);

    getGame().destroy();
    container.remove();
  });

  it('swallows page scroll for held direction keys but not modified shortcuts (#876)', () => {
    const container = makeContainer();
    startWithSpace();

    const held = new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft', repeat: true, cancelable: true, bubbles: true });
    document.dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);

    const modified = new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft', repeat: true, ctrlKey: true, cancelable: true, bubbles: true });
    document.dispatchEvent(modified);
    expect(modified.defaultPrevented).toBe(false);

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

describe('Pac-Man intended direction across junctions (#1018)', () => {
  it('applies a turn pressed after a junction at the next junction where it is legal', () => {
    const container = makeContainer();
    startWithSpace();
    parkGhosts();

    // Travelling down column 14: the right opening at (14,11) has just been
    // passed, so right is a wall at (14,12) when the press lands.
    window.__pacmanTest.setPositions({ pacman: { x: 14, y: 12.4, dir: 'down' } });
    pressKey('ArrowRight');
    expect(window.__pacmanTest.getState().pendingDir).toBe('right');

    // The wall press survives the straight tile instead of being discarded.
    window.__pacmanTest.tick(0.05);
    const mid = window.__pacmanTest.getState();
    expect(mid.pacman.dir).toBe('down');
    expect(mid.pendingDir).toBe('right');

    // The next junction at (14,13) has a right opening: the turn lands there.
    window.__pacmanTest.tick(0.7);
    const done = window.__pacmanTest.getState();
    expect(done.pacman.dir).toBe('right');
    expect(done.pacman.x).toBeGreaterThan(14);
    expect(done.pendingDir).toBeNull();

    getGame().destroy();
    container.remove();
  });

  it('drops a wall press at the first junction where it is not walkable', () => {
    const container = makeContainer();
    startWithSpace();
    parkGhosts();

    // Down column 4, the first junction (4,5) opens left but not right, while
    // a right opening exists far below at (4,9) - the stale press must not
    // fire there.
    window.__pacmanTest.setPositions({ pacman: { x: 4, y: 4.2, dir: 'down' } });
    pressKey('ArrowRight');
    expect(window.__pacmanTest.getState().pendingDir).toBe('right');

    window.__pacmanTest.tick(0.05);
    expect(window.__pacmanTest.getState().pendingDir).toBe('right');

    window.__pacmanTest.tick(0.2);
    const afterJunction = window.__pacmanTest.getState();
    expect(afterJunction.pendingDir).toBeNull();
    expect(afterJunction.pacman.dir).toBe('down');

    window.__pacmanTest.tick(1.0);
    const end = window.__pacmanTest.getState();
    expect(end.pacman.dir).toBe('down');
    expect(end.pendingDir).toBeNull();

    getGame().destroy();
    container.remove();
  });
});

describe('Pac-Man buffered-turn indicator (#1020)', () => {
  it('signals a pending turn until the junction takes it', () => {
    const container = makeContainer();
    startWithSpace();
    parkGhosts();
    const cellSize = window.__pacmanTest.constants.cellSize;
    const ctx = document.createElement('canvas').getContext('2d');
    const moveToSpy = vi.spyOn(ctx, 'moveTo');
    // The wedge starts its path (radius + 5) px ahead of Pac-Man's centre.
    const centreOf = (state) => ({
      x: (state.pacman.x + 0.5) * cellSize,
      y: (state.pacman.y + 0.5) * cellSize
    });

    expect(window.__pacmanTest.getState().indicatorDirection).toBeNull();

    // Travelling down column 14; a right turn is buffered past the junction
    // at (14,11), so the wedge is visible while the intent is held.
    window.__pacmanTest.setPositions({ pacman: { x: 14, y: 12.4, dir: 'down' } });
    pressKey('ArrowRight');
    const buffered = window.__pacmanTest.getState();
    expect(buffered.pendingDir).toBe('right');
    expect(buffered.indicatorDirection).toBe('right');

    // The mark survives the straight tile where the turn is not yet legal,
    // and the canvas shows it: the body path first, then the wedge tip.
    window.__pacmanTest.tick(0.05);
    const shown = window.__pacmanTest.getState();
    expect(shown.indicatorDirection).toBe('right');
    const centre = centreOf(shown);
    const tip = [centre.x + (cellSize / 2 - 2 + 5), centre.y];
    expect(moveToSpy.mock.calls).toEqual([[centre.x, centre.y], tip]);

    // It clears the moment the turn applies at the next junction.
    window.__pacmanTest.tick(0.7);
    const done = window.__pacmanTest.getState();
    expect(done.pacman.dir).toBe('right');
    expect(done.pendingDir).toBeNull();
    expect(done.indicatorDirection).toBeNull();

    // With nothing buffered the next frame starts only the body path: no wedge.
    moveToSpy.mockClear();
    window.__pacmanTest.tick(0);
    const rest = centreOf(window.__pacmanTest.getState());
    expect(moveToSpy.mock.calls).toEqual([[rest.x, rest.y]]);

    moveToSpy.mockRestore();
    getGame().destroy();
    container.remove();
  });

  it('clears the indicator when a wall press is dropped at a junction', () => {
    const container = makeContainer();
    startWithSpace();
    parkGhosts();

    // Down column 4, right is a wall at the first junction (4,5): the
    // buffered intent is signalled, then dropped there.
    window.__pacmanTest.setPositions({ pacman: { x: 4, y: 4.2, dir: 'down' } });
    pressKey('ArrowRight');
    expect(window.__pacmanTest.getState().indicatorDirection).toBe('right');

    window.__pacmanTest.tick(0.25);
    const after = window.__pacmanTest.getState();
    expect(after.pendingDir).toBeNull();
    expect(after.indicatorDirection).toBeNull();
    expect(after.pacman.dir).toBe('down');

    getGame().destroy();
    container.remove();
  });

  it('does not signal a buffered intent that only re-affirms the heading', () => {
    const container = makeContainer();
    startWithSpace();

    window.__pacmanTest.setPositions({ pacman: { x: 7, y: 13, dir: 'left' } });
    pressKey('ArrowDown');
    expect(window.__pacmanTest.getState().indicatorDirection).toBe('down');

    // Pressing the current heading behind a buffered intent replaces it, but
    // that is not a pending turn, so no wedge is drawn for it.
    pressKey('ArrowLeft');
    const state = window.__pacmanTest.getState();
    expect(state.pendingDir).toBe('left');
    expect(state.indicatorDirection).toBeNull();

    getGame().destroy();
    container.remove();
  });

  it('keeps the wedge on screen while the respawn blink hides Pac-Man', () => {
    const container = makeContainer();
    startWithSpace();
    collideWithGhost();
    expect(window.__pacmanTest.getState().lives).toBe(2);
    parkGhosts();

    // Land on a blink-hidden phase (an odd 150 ms slot) inside the window.
    window.__pacmanTest.tick(0.14);
    const phase = window.__pacmanTest.getState();
    expect(Math.floor(phase.clockMs / 150) % 2).toBe(1);

    window.__pacmanTest.setPositions({ pacman: { x: 14, y: 12.4, dir: 'down', pendingDir: 'right' } });
    const cellSize = window.__pacmanTest.constants.cellSize;
    const ctx = document.createElement('canvas').getContext('2d');
    const moveToSpy = vi.spyOn(ctx, 'moveTo');
    window.__pacmanTest.tick(0);

    const state = window.__pacmanTest.getState();
    expect(state.indicatorDirection).toBe('right');
    const centreX = (state.pacman.x + 0.5) * cellSize;
    const centreY = (state.pacman.y + 0.5) * cellSize;
    // The blink still hides the body (no path started at its centre) while
    // the static wedge is drawn ahead of Pac-Man, so the mark never flashes.
    expect(moveToSpy.mock.calls).toEqual([[centreX + (cellSize / 2 - 2 + 5), centreY]]);

    moveToSpy.mockRestore();
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
    // Legacy pre-#1018 snapshots only carry the FIFO; its last entry wins.
    delete saved.pacman.pendingDir;
    saved.pacman.queuedDirs = ['left', 'up'];

    expect(window.__pacmanTest.applyRestoredState(saved)).toBe(true);
    expect(window.__pacmanTest.getState().pendingDir).toBe('up');
    expect(window.__pacmanTest.getState().queuedDirs).toEqual(['up']);

    getGame().destroy();
    container.remove();
  });

  it('serializes the intended direction and resumes it behind Continue', () => {
    const container = makeContainer();
    startWithSpace();
    pressKey('ArrowRight');
    expect(window.__pacmanTest.getState().pendingDir).toBe('right');

    const saved = getGame().serialize();
    expect(saved.pacman.pendingDir).toBe('right');
    expect(window.__pacmanTest.validateSavedState(saved)).toBe(true);

    getGame().destroy();
    container.innerHTML = '';
    getGame().init(container, saved);
    expect(window.__pacmanTest.getState().pendingDir).toBe('right');
    expect(container.querySelector('.games-ready-start').textContent).toBe('Continue');

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

    const badPending = { ...valid, pacman: { ...valid.pacman, pendingDir: 'diagonal' } };
    expect(d.validateSavedState(badPending)).toBe(false);

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

// jsdom has no PointerEvent constructor, so pointer gestures are dispatched
// as MouseEvent with pointer event types (listeners match on type only).
function pointer(type, x, y) {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
}

describe('Pac-Man pointer steering and D-pad (#1019)', () => {
  it('renders an accessible touch D-pad inside the stage', () => {
    const container = makeContainer();

    const pad = container.querySelector('.games-pacman-stage .games-dpad');
    expect(pad).not.toBeNull();
    expect(pad.getAttribute('role')).toBe('group');
    expect(pad.querySelectorAll('.games-dpad-btn')).toHaveLength(4);

    getGame().destroy();
    container.remove();
  });

  it('queues a swipe turn as soon as the gesture crosses the threshold, before pointerup', () => {
    const container = makeContainer();
    startWithSpace();
    const canvas = container.querySelector('.games-pacman-canvas');

    canvas.dispatchEvent(pointer('pointerdown', 150, 150));
    canvas.dispatchEvent(pointer('pointermove', 150, 100));
    // No pointerup yet: the turn is already queued (threshold-crossing).
    expect(window.__pacmanTest.getState().queuedDirs).toContain('up');

    getGame().destroy();
    container.remove();
  });

  it('keeps steering when the gesture ends outside the canvas (pointer capture)', () => {
    const container = makeContainer();
    startWithSpace();
    const canvas = container.querySelector('.games-pacman-canvas');

    canvas.dispatchEvent(pointer('pointerdown', 150, 150));
    canvas.dispatchEvent(pointer('pointermove', 150, 100));
    // Finger leaves the board before lifting; capture keeps the turn queued.
    document.dispatchEvent(pointer('pointerup', 400, 10));

    expect(window.__pacmanTest.getState().queuedDirs).toContain('up');

    getGame().destroy();
    container.remove();
  });

  it('does not steer on a tap, and a tap restarts a finished run', () => {
    const container = makeContainer();
    startWithSpace();
    const canvas = container.querySelector('.games-pacman-canvas');

    // Tap while alive: no direction queued.
    canvas.dispatchEvent(pointer('pointerdown', 150, 150));
    canvas.dispatchEvent(pointer('pointerup', 150, 150));
    expect(window.__pacmanTest.getState().queuedDirs).toEqual([]);

    // After game over a tap restarts the run.
    window.__pacmanTest.forceGameOver();
    expect(window.__pacmanTest.getState().gameOver).toBe(true);
    canvas.dispatchEvent(pointer('pointerdown', 150, 150));
    canvas.dispatchEvent(pointer('pointerup', 150, 150));
    expect(window.__pacmanTest.getState().gameOver).toBe(false);
    expect(window.__pacmanTest.getState().started).toBe(true);

    getGame().destroy();
    container.remove();
  });

  it('queues turns from the D-pad buttons and ignores them after game over', () => {
    const container = makeContainer();
    startWithSpace();
    const pad = container.querySelector('.games-dpad');

    // Tap-to-press queues immediately (pointerdown).
    pad.querySelector('.games-dpad-up').dispatchEvent(pointer('pointerdown', 0, 0));
    expect(window.__pacmanTest.getState().queuedDirs).toEqual(['up']);

    // The pointer tap's compatibility click (detail 1) must not double-fire:
    // a non-opposite direction would queue if the click fired unchecked.
    pad.querySelector('.games-dpad-left').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(window.__pacmanTest.getState().queuedDirs).toEqual(['up']);

    // Keyboard/assistive-tech activation (click detail 0) also steers; the
    // last press replaces the pending intent.
    pad.querySelector('.games-dpad-left').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(window.__pacmanTest.getState().queuedDirs).toEqual(['left']);

    // Steering is inert after game over (restart stays a tap).
    window.__pacmanTest.forceGameOver();
    pad.querySelector('.games-dpad-up').dispatchEvent(pointer('pointerdown', 0, 0));
    expect(window.__pacmanTest.getState().gameOver).toBe(true);

    getGame().destroy();
    container.remove();
  });

  it('ignores swipes while the ready screen is still up', () => {
    const container = makeContainer();
    const canvas = container.querySelector('.games-pacman-canvas');

    canvas.dispatchEvent(pointer('pointerdown', 150, 150));
    canvas.dispatchEvent(pointer('pointermove', 150, 100));
    expect(window.__pacmanTest.getState().started).toBe(false);
    expect(window.__pacmanTest.getState().queuedDirs).toEqual([]);

    getGame().destroy();
    container.remove();
  });

  it('detaches gesture and D-pad listeners on destroy', () => {
    const container = makeContainer();
    startWithSpace();

    const canvas = container.querySelector('.games-pacman-canvas');
    const upBtn = container.querySelector('.games-dpad-up');
    const canvasRemovals = vi.spyOn(canvas, 'removeEventListener');
    const buttonRemovals = vi.spyOn(upBtn, 'removeEventListener');

    getGame().destroy();
    // Listener cleanup is the real signal: stale handlers would still
    // return harmlessly, so a no-throw dispatch alone proves nothing.
    expect(canvasRemovals).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(canvasRemovals).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(canvasRemovals).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(canvasRemovals).toHaveBeenCalledWith('pointercancel', expect.any(Function));
    expect(buttonRemovals).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(buttonRemovals).toHaveBeenCalledWith('click', expect.any(Function));

    // The stage (canvas + pad) is torn down with the container; dispatching at
    // the detached nodes must not throw or resurrect game state.
    expect(() => {
      canvas.dispatchEvent(pointer('pointerdown', 150, 150));
      canvas.dispatchEvent(pointer('pointermove', 150, 100));
      upBtn.dispatchEvent(pointer('pointerdown', 0, 0));
    }).not.toThrow();
    expect(window.__pacmanTest.getState().started).toBe(false);

    canvasRemovals.mockRestore();
    buttonRemovals.mockRestore();
    container.remove();
  });
});

describe('Pac-Man gamepad input (#1022)', () => {
  let stub = null;
  let pad = null;
  let pump = null;

  beforeEach(() => {
    stub = installGamepadStub();
    pad = makeGamepad();
    stub.pads = [pad];
    pump = installFramePump();
  });

  afterEach(() => {
    pump.restore();
    removeGamepadStub();
  });

  it('ignores steering on the ready screen and lifts it from Start', () => {
    const container = makeContainer();
    expect(window.__pacmanTest.getState().started).toBe(false);

    pressButton(pad, 14); // D-pad left must not steer or start the run
    pump.step();
    expect(window.__pacmanTest.getState().started).toBe(false);
    expect(window.__pacmanTest.getState().pendingDir).toBeNull();
    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();

    releaseButton(pad, 14);
    pump.step();
    pressButton(pad, 9); // Start behaves like Space on the ready screen
    pump.step();
    expect(window.__pacmanTest.getState().started).toBe(true);
    expect(container.querySelector('.games-ready-overlay')).toBeNull();
  });

  it('lifts the ready screen from A', () => {
    const container = makeContainer();

    pressButton(pad, 0); // A/Cross starts instead of restarting here
    pump.step();
    expect(window.__pacmanTest.getState().started).toBe(true);
    expect(container.querySelector('.games-ready-overlay')).toBeNull();
  });

  it('steers with the D-pad through the same queueTurn path as the keyboard', () => {
    makeContainer();
    startWithSpace();

    pressButton(pad, 13); // D-pad down
    pump.step();
    expect(window.__pacmanTest.getState().pendingDir).toBe('down');
  });

  it('toggles pause from Start and resumes on the next press', () => {
    makeContainer();
    startWithSpace();

    pressButton(pad, 9); // Start pauses
    pump.step();
    expect(window.__pacmanTest.getState().paused).toBe(true);
    expect(window.__pacmanTest.getState().manualPause).toBe(true);

    releaseButton(pad, 9); // releasing Start is not a toggle
    pump.step();
    expect(window.__pacmanTest.getState().paused).toBe(true);

    pressButton(pad, 9); // Start again resumes
    pump.step();
    expect(window.__pacmanTest.getState().paused).toBe(false);
    expect(window.__pacmanTest.getState().manualPause).toBe(false);
  });

  it('restarts a finished run with A', () => {
    makeContainer();
    startWithSpace();
    window.__pacmanTest.forceGameOver();
    expect(window.__pacmanTest.getState().gameOver).toBe(true);

    pressButton(pad, 0); // A/Cross restarts
    pump.step();
    expect(window.__pacmanTest.getState().gameOver).toBe(false);
    expect(window.__pacmanTest.getState().started).toBe(true);
  });

  it('stops the poller on destroy', () => {
    makeContainer();
    pump.step();
    expect(stub.calls).toBeGreaterThan(0);

    getGame().destroy();
    const callsAfterDestroy = stub.calls;
    expect(pump.pendingCount()).toBe(0);
    pump.step(3);
    expect(stub.calls).toBe(callsAfterDestroy);
  });
});
