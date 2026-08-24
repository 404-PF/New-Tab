import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from '../helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/games/shared.js');
  injectScript('src/features/games/game-registry.js');
});

beforeEach(() => {
  // Tear the registry down first: destroying the running game re-persists its
  // snapshot, so storage must be cleared afterwards.
  window.GameRegistry._reset && window.GameRegistry._reset();
  localStorage.clear();
  document.querySelectorAll('#games-game-container').forEach(el => el.remove());
});

// A minimal game that records how it was initialized and can report a
// serializable snapshot.
function registerSaveableGame(id, state) {
  let initArgs = null;
  window.GameRegistry.register({
    id: id,
    name: id,
    init: (container, savedState) => {
      initArgs = { container: container, savedState: savedState };
      if (state && state.onInit) state.onInit();
    },
    destroy: () => {
      if (state && state.onDestroy) state.onDestroy();
    },
    serialize: () => (state ? state.snapshot : undefined)
  });
  return {
    initArgs: () => initArgs,
    setSnapshot: (value) => { state.snapshot = value; }
  };
}

function ensureContainer() {
  let container = document.getElementById('games-game-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'games-game-container';
    document.body.appendChild(container);
  }
  return container;
}

describe('GameRegistry saves (#646)', () => {
  it('exposes the save API', () => {
    expect(typeof window.GameRegistry.hasSave).toBe('function');
    expect(typeof window.GameRegistry.getSave).toBe('function');
    expect(typeof window.GameRegistry.clearSave).toBe('function');
  });

  it('does not persist anything for games without serialize', () => {
    window.GameRegistry.register({ id: 'plain-game', name: 'Plain', init: () => {}, destroy: () => {} });
    ensureContainer();
    window.GameRegistry.launch('plain-game');
    expect(window.GameRegistry.hasSave('plain-game')).toBe(false);
    window.GameRegistry.destroyCurrent();
    expect(localStorage.getItem('games_saves')).toBeNull();
  });

  it('persists a snapshot on destroyCurrent and passes it to the next launch', () => {
    const game = registerSaveableGame('save-game', { snapshot: { level: 3 } });
    ensureContainer();
    window.GameRegistry.launch('save-game');
    game.setSnapshot({ level: 7 });
    window.GameRegistry.destroyCurrent();

    expect(window.GameRegistry.hasSave('save-game')).toBe(true);
    const raw = JSON.parse(localStorage.getItem('games_saves'));
    expect(raw['save-game'].state).toEqual({ level: 7 });
    expect(typeof raw['save-game'].savedAt).toBe('number');

    // Relaunch hands the persisted state to init as the second argument.
    window.GameRegistry.launch('save-game');
    expect(game.initArgs().savedState).toEqual({ level: 7 });

    // The save stays until the game reaches a terminal state or is cleared.
    expect(window.GameRegistry.hasSave('save-game')).toBe(true);

    // Destroy again first: launch() is a no-op for a running game.
    window.GameRegistry.destroyCurrent();
    window.GameRegistry.clearSave('save-game');
    expect(window.GameRegistry.hasSave('save-game')).toBe(false);
    expect(JSON.parse(localStorage.getItem('games_saves'))['save-game']).toBeUndefined();

    // A launch after clearing starts fresh.
    window.GameRegistry.launch('save-game');
    expect(game.initArgs().savedState).toBeUndefined();
  });

  it('keeps separate snapshots per game', () => {
    registerSaveableGame('save-a', { snapshot: { n: 1 } });
    registerSaveableGame('save-b', { snapshot: { n: 2 } });
    ensureContainer();
    window.GameRegistry.launch('save-a');
    window.GameRegistry.launch('save-b'); // destroys save-a first, serializing its snapshot
    window.GameRegistry.destroyCurrent(); // serializes save-b

    const raw = JSON.parse(localStorage.getItem('games_saves'));
    expect(raw['save-a'].state).toEqual({ n: 1 });
    expect(raw['save-b'].state).toEqual({ n: 2 });
  });

  it('drops the save when serialize returns null (terminal state)', () => {
    const game = registerSaveableGame('terminal-game', { snapshot: { hp: 5 } });
    ensureContainer();
    window.GameRegistry.launch('terminal-game');
    window.GameRegistry.destroyCurrent();
    expect(window.GameRegistry.hasSave('terminal-game')).toBe(true);

    game.setSnapshot(null); // e.g. game over was reached before teardown
    window.GameRegistry.launch('terminal-game');
    window.GameRegistry.destroyCurrent();
    expect(window.GameRegistry.hasSave('terminal-game')).toBe(false);
    expect(localStorage.getItem('games_saves')).toBe('{}');
  });

  it('survives corrupt games_saves payloads', () => {
    localStorage.setItem('games_saves', 'not json');
    expect(window.GameRegistry.hasSave('x')).toBe(false);
    expect(window.GameRegistry.getSave('x')).toBeNull();
    expect(() => window.GameRegistry.clearSave('x')).not.toThrow();

    localStorage.setItem('games_saves', '[1,2]');
    expect(window.GameRegistry.getSave('y')).toBeNull();
  });

  it('serializes when the page is hidden (new tab opened)', () => {
    const game = registerSaveableGame('hidden-game', { snapshot: { mid: 'run' } });
    ensureContainer();
    window.GameRegistry.launch('hidden-game');

    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });

    expect(window.GameRegistry.hasSave('hidden-game')).toBe(true);
    expect(window.GameRegistry.getSave('hidden-game').state).toEqual({ mid: 'run' });

    // Relaunch restores (destroy first — launch() is a no-op while running).
    window.GameRegistry.destroyCurrent();
    window.GameRegistry.launch('hidden-game');
    expect(game.initArgs().savedState).toEqual({ mid: 'run' });
  });

  it('serializes on pagehide (page unload / browser close)', () => {
    const game = registerSaveableGame('unload-game', { snapshot: { late: true } });
    ensureContainer();
    window.GameRegistry.launch('unload-game');

    window.dispatchEvent(new Event('pagehide'));

    expect(window.GameRegistry.hasSave('unload-game')).toBe(true);
    expect(window.GameRegistry.getSave('unload-game').state).toEqual({ late: true });

    window.GameRegistry.destroyCurrent();
    window.GameRegistry.launch('unload-game');
    expect(game.initArgs().savedState).toEqual({ late: true });
  });

  it('swallows errors thrown from serialize', () => {
    window.GameRegistry.register({
      id: 'throwing-game',
      name: 'Throwing',
      init: () => {},
      destroy: () => {},
      serialize: () => { throw new Error('boom'); }
    });
    ensureContainer();
    window.GameRegistry.launch('throwing-game');
    expect(() => window.GameRegistry.destroyCurrent()).not.toThrow();
    expect(window.GameRegistry.getCurrentGame()).toBeNull();
  });
});
