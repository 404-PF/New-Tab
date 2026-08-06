import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from '../helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/games/game-registry.js');
  injectScript('src/features/games/shared.js');
  injectScript('src/features/games/snake.js');
});

beforeEach(() => {
  localStorage.clear();
  document.querySelectorAll(
    '.games-score-display, .games-snake-canvas, .games-instructions, .games-snake-controls, .games-snake-settings, .games-snake-dpad, .games-snake-board, .games-snake-overlay, .games-snake-bonus-toast'
  ).forEach(el => el.remove());
});

function setupGame(options = {}) {
  if (options.settings) {
    Object.entries(options.settings).forEach(([key, value]) => localStorage.setItem(key, value));
  }
  if (options.highScore !== undefined) {
    window.GameRegistry.updateStats('snake', { highScore: options.highScore });
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const game = window.GameRegistry.get('snake');
  game.init(container);
  return { container, game, debug: game._debug };
}

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

describe('Snake Game speed & difficulty', () => {
  it('defaults to normal difficulty with base speed', () => {
    const { game, debug, container } = setupGame();
    expect(debug.getState().difficulty).toBe('normal');
    expect(debug.getState().tickMs).toBe(120);
    game.destroy();
    container.remove();
  });

  it('applies the saved difficulty on init', () => {
    const { game, debug, container } = setupGame({ settings: { snake_difficulty: 'hard' } });
    expect(debug.getState().difficulty).toBe('hard');
    expect(debug.getState().tickMs).toBe(100);
    game.destroy();
    container.remove();
  });

  it('speeds up as foods are eaten and clamps at the floor', () => {
    const { game, debug, container } = setupGame({ settings: { snake_difficulty: 'hard' } });
    // hard: start 100, step 5, every 2, min 45
    expect(debug.getState().tickMs).toBe(100);
    debug.simulateEatenFoods(2); // floor(2/2)=1 -> 95
    expect(debug.getState().tickMs).toBe(95);
    debug.simulateEatenFoods(20); // floor(22/2)=11 -> 45
    expect(debug.getState().tickMs).toBe(45);
    debug.simulateEatenFoods(30); // stays clamped at 45
    expect(debug.getState().tickMs).toBe(45);
    game.destroy();
    container.remove();
  });

  it('keeps constant difficulty speed regardless of foods eaten', () => {
    const { game, debug, container } = setupGame({ settings: { snake_difficulty: 'constant' } });
    debug.simulateEatenFoods(50);
    expect(debug.getState().tickMs).toBe(120);
    game.destroy();
    container.remove();
  });

  it('updates speed when difficulty is changed via the settings select', () => {
    const { game, debug, container } = setupGame();
    const select = container.querySelector('.games-snake-setting-select');
    expect(select).not.toBeNull();
    select.value = 'easy';
    select.dispatchEvent(new Event('change'));
    expect(debug.getState().difficulty).toBe('easy');
    expect(debug.getState().tickMs).toBe(130);
    expect(localStorage.getItem('snake_difficulty')).toBe('easy');
    game.destroy();
    container.remove();
  });
});

describe('Snake Game mechanics', () => {
  it('wraps the snake around edges when wrap is enabled', () => {
    const { game, debug, container } = setupGame({ settings: { snake_wrap_enabled: 'true' } });
    debug.setFood(0, 0); // keep food out of the way
    debug.setDirection('up');
    // head starts at (10,10), moving up 11 steps wraps to (10,19)
    for (let i = 0; i < 11; i++) debug.step();
    const state = debug.getState();
    expect(state.gameOver).toBe(false);
    expect(state.snake[0]).toEqual({ x: 10, y: 19 });
    game.destroy();
    container.remove();
  });

  it('ends the game on wall collision when wrap is disabled', () => {
    const { game, debug, container } = setupGame();
    debug.setFood(0, 0);
    debug.setDirection('up');
    for (let i = 0; i < 11; i++) debug.step();
    expect(debug.getState().gameOver).toBe(true);
    game.destroy();
    container.remove();
  });

  it('awards bonus points when bonus food is eaten', () => {
    const { game, debug, container } = setupGame();
    debug.setFood(0, 0); // regular food out of the way
    debug.setBonusFood(11, 10); // one cell right of the head (10,10)
    debug.step();
    const state = debug.getState();
    expect(state.score).toBe(30);
    expect(state.bonusFood).toBeNull();
    expect(container.querySelector('.games-snake-bonus-toast')).not.toBeNull();
    game.destroy();
    container.remove();
  });

  it('spawns bonus food at a requested position', () => {
    const { game, debug, container } = setupGame();
    debug.setFood(0, 0); // keep the regular food out of the way
    debug.spawnBonusFood(15, 15);
    const state = debug.getState();
    expect(state.bonusFood).toEqual({ x: 15, y: 15 });
    game.destroy();
    container.remove();
  });

  it('ends the game on obstacle collision', () => {
    const { game, debug, container } = setupGame();
    debug.setFood(0, 0);
    debug.setObstacles([{ x: 11, y: 10 }]); // one cell right of the head
    debug.step();
    expect(debug.getState().gameOver).toBe(true);
    game.destroy();
    container.remove();
  });

  it('spawns obstacles as foods are eaten', () => {
    const { game, debug, container } = setupGame();
    debug.simulateEatenFoods(5); // obstacles start at 5 foods eaten
    expect(debug.getState().obstacles.length).toBeGreaterThan(0);
    game.destroy();
    container.remove();
  });

  it('does not spawn obstacles when the toggle is off', () => {
    const { game, debug, container } = setupGame({ settings: { snake_obstacles_enabled: 'false' } });
    debug.simulateEatenFoods(20);
    expect(debug.getState().obstacles.length).toBe(0);
    game.destroy();
    container.remove();
  });
});

describe('Snake Game controls & QoL', () => {
  it('renders pause and restart buttons', () => {
    const { game, container } = setupGame();
    expect(container.querySelector('.games-snake-pause')).not.toBeNull();
    expect(container.querySelector('.games-snake-restart')).not.toBeNull();
    game.destroy();
    container.remove();
  });

  it('pauses via the on-screen button and shows an overlay', () => {
    const { game, debug, container } = setupGame();
    container.querySelector('.games-snake-pause').click();
    const state = debug.getState();
    expect(state.paused).toBe(true);
    expect(state.manualPause).toBe(true);
    expect(container.querySelector('.games-snake-overlay')).not.toBeNull();
    game.destroy();
    container.remove();
  });

  it('resumes via the on-screen button', () => {
    const { game, debug, container } = setupGame();
    const pauseBtn = container.querySelector('.games-snake-pause');
    pauseBtn.click();
    expect(debug.getState().paused).toBe(true);
    pauseBtn.click();
    expect(debug.getState().paused).toBe(false);
    game.destroy();
    container.remove();
  });

  it('restarts the game with the on-screen button', () => {
    const { game, debug, container } = setupGame();
    debug.setFood(11, 10);
    debug.step(); // eat food -> score 10
    expect(debug.getState().score).toBe(10);
    container.querySelector('.games-snake-restart').click();
    const state = debug.getState();
    expect(state.score).toBe(0);
    expect(state.gameOver).toBe(false);
    expect(state.paused).toBe(false);
    game.destroy();
    container.remove();
  });

  it('loads and displays the saved high score', () => {
    const { game, debug, container } = setupGame({ highScore: 100 });
    const state = debug.getState();
    expect(state.highScore).toBe(100);
    expect(container.querySelector('.games-score-display').textContent).toContain('100');
    game.destroy();
    container.remove();
  });

  it('persists a new high score on game over', () => {
    const { game, debug, container } = setupGame();
    debug.setFood(0, 0);
    debug.setBonusFood(11, 10);
    debug.step(); // +30 bonus points
    expect(debug.getState().score).toBe(30);
    debug.setObstacles([{ x: 12, y: 10 }]); // die on the next step
    debug.step();
    expect(debug.getState().gameOver).toBe(true);
    const stats = window.GameRegistry.getStats('snake');
    expect(stats.highScore).toBe(30);
    expect(stats.gamesPlayed).toBe(1);
    game.destroy();
    container.remove();
  });

  it('hides the D-pad when the toggle is off', () => {
    const { game, debug, container } = setupGame({ settings: { snake_dpad_enabled: 'false' } });
    const dpad = container.querySelector('.games-snake-dpad');
    expect(dpad).not.toBeNull();
    expect(dpad.style.display).toBe('none');
    expect(debug.getState().dpadEnabled).toBe(false);
    game.destroy();
    container.remove();
  });

  it('shows the D-pad when enabled and steers the snake', () => {
    const { game, debug, container } = setupGame({ settings: { snake_dpad_enabled: 'true' } });
    const dpad = container.querySelector('.games-snake-dpad');
    expect(dpad.style.display).not.toBe('none');
    expect(dpad.querySelectorAll('.games-snake-dpad-btn').length).toBe(4);
    dpad.querySelector('.games-snake-dpad-up').click();
    expect(debug.getState().nextDirection).toBe('up');
    game.destroy();
    container.remove();
  });

  it('persists setting toggles to localStorage', () => {
    const { game, debug, container } = setupGame();
    const wrapInput = container.querySelectorAll('.games-snake-setting-input')[0];
    wrapInput.checked = true;
    wrapInput.dispatchEvent(new Event('change'));
    expect(debug.getState().wrapEnabled).toBe(true);
    expect(localStorage.getItem('snake_wrap_enabled')).toBe('true');
    game.destroy();
    container.remove();
  });
});
