import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/games/shared.js');
  injectScript('src/features/games/game-registry.js');
});

beforeEach(() => {
  localStorage.clear();
  // Reset registry state
  window.GameRegistry._reset && window.GameRegistry._reset();
  // Remove transient nodes
  document.querySelectorAll('.games-hub-card, .games-game-header, #games-game-container').forEach(el => el.remove());
  const modal = document.getElementById('games-app-modal');
  if (modal) modal.classList.remove('modal-open');
  const hub = document.getElementById('games-hub-content');
  if (hub) hub.innerHTML = '';
});

describe('GameRegistry', () => {
  it('exposes the expected API', () => {
    expect(typeof window.GameRegistry.register).toBe('function');
    expect(typeof window.GameRegistry.list).toBe('function');
    expect(typeof window.GameRegistry.get).toBe('function');
    expect(typeof window.GameRegistry.launch).toBe('function');
    expect(typeof window.GameRegistry.destroyCurrent).toBe('function');
    expect(typeof window.GameRegistry.getStats).toBe('function');
    expect(typeof window.GameRegistry.updateStats).toBe('function');
  });

  it('registers a valid game', () => {
    const result = window.GameRegistry.register({
      id: 'test-game',
      name: 'Test Game',
      description: 'A test game',
      icon: '🎮',
      init: () => {},
      destroy: () => {}
    });
    expect(result).toBe(true);
    expect(window.GameRegistry.get('test-game')).not.toBeNull();
  });

  it('rejects invalid game definitions', () => {
    expect(window.GameRegistry.register(null)).toBe(false);
    expect(window.GameRegistry.register({ id: 'bad' })).toBe(false);
    expect(window.GameRegistry.register({ id: 'bad2', name: 'Bad', init: () => {} })).toBe(false);
  });

  it('rejects duplicate game IDs', () => {
    window.GameRegistry.register({
      id: 'dup-game',
      name: 'Dup',
      init: () => {},
      destroy: () => {}
    });
    expect(window.GameRegistry.register({
      id: 'dup-game',
      name: 'Dup 2',
      init: () => {},
      destroy: () => {}
    })).toBe(false);
  });

  it('lists registered games', () => {
    window.GameRegistry.register({
      id: 'list-game-1',
      name: 'List Game 1',
      init: () => {},
      destroy: () => {}
    });
    window.GameRegistry.register({
      id: 'list-game-2',
      name: 'List Game 2',
      init: () => {},
      destroy: () => {}
    });
    const games = window.GameRegistry.list();
    expect(games.length).toBeGreaterThanOrEqual(2);
    expect(games.some(g => g.id === 'list-game-1')).toBe(true);
    expect(games.some(g => g.id === 'list-game-2')).toBe(true);
  });

  it('returns null for unknown game', () => {
    expect(window.GameRegistry.get('nonexistent')).toBeNull();
  });

  it('launches a game into the container', () => {
    let initCalled = false;
    window.GameRegistry.register({
      id: 'launch-game',
      name: 'Launch',
      init: (container) => {
        initCalled = true;
        container.innerHTML = '<div class="test-game">Launched</div>';
      },
      destroy: () => {}
    });

    let container = document.getElementById('games-game-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'games-game-container';
      document.body.appendChild(container);
    }

    const result = window.GameRegistry.launch('launch-game');
    expect(result).toBe(true);
    expect(initCalled).toBe(true);
    expect(container.querySelector('.test-game')).not.toBeNull();
  });

  it('destroys current game when launching a different one', () => {
    let destroyCalled = false;
    const container = document.createElement('div');
    container.id = 'games-game-container';
    document.body.appendChild(container);
    window.GameRegistry.register({
      id: 'destroy-test-1',
      name: 'D1',
      init: () => {},
      destroy: () => { destroyCalled = true; }
    });
    window.GameRegistry.register({
      id: 'destroy-test-2',
      name: 'D2',
      init: () => {},
      destroy: () => {}
    });

    window.GameRegistry.launch('destroy-test-1');
    expect(window.GameRegistry.getCurrentGame()).not.toBeNull();
    window.GameRegistry.launch('destroy-test-2');
    expect(destroyCalled).toBe(true);
    container.remove();
  });

  it('persists and reads stats', () => {
    window.GameRegistry.updateStats('stats-game', { highScore: 100, gamesPlayed: 1 });
    const stats = window.GameRegistry.getStats('stats-game');
    expect(stats.highScore).toBe(100);
    expect(stats.gamesPlayed).toBe(1);
  });

  it('merges stat updates', () => {
    window.GameRegistry.updateStats('merge-game', { highScore: 50 });
    window.GameRegistry.updateStats('merge-game', { gamesPlayed: 3 });
    const stats = window.GameRegistry.getStats('merge-game');
    expect(stats.highScore).toBe(50);
    expect(stats.gamesPlayed).toBe(3);
  });

  it('returns empty stats for unknown game', () => {
    const stats = window.GameRegistry.getStats('unknown-game');
    expect(stats).toEqual({});
  });

  it('handles a primitive games_stats value', () => {
    localStorage.setItem('games_stats', '5');
    expect(window.GameRegistry.getStats('primitive-game')).toEqual({});
    window.GameRegistry.updateStats('primitive-game', { highScore: 10 });
    expect(window.GameRegistry.getStats('primitive-game').highScore).toBe(10);
  });

  it('launched games can hold in a ready state until the player starts', () => {
    let started = false;
    window.GameRegistry.register({
      id: 'ready-game',
      name: 'Ready Game',
      init: (container) => {
        window.gamesHelpers.createReadyScreen(container, {
          text: 'Ready?',
          buttonText: 'Start',
          onStart: () => { started = true; }
        });
      },
      destroy: () => {}
    });

    let container = document.getElementById('games-game-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'games-game-container';
      document.body.appendChild(container);
    }

    const result = window.GameRegistry.launch('ready-game');
    expect(result).toBe(true);
    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
    expect(started).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(started).toBe(true);
    expect(container.querySelector('.games-ready-overlay')).toBeNull();

    container.remove();
  });
});
