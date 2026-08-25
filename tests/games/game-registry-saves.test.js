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
    // Serialize-hook contract: object persists, false discards, null/undefined
    // reports "nothing right now".
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

  it('keeps the stored save when a launched save reports null (pre-start)', () => {
    const game = registerSaveableGame('prestart-game', { snapshot: null });
    ensureContainer();
    localStorage.setItem('games_saves', JSON.stringify({
      'prestart-game': { state: { waiting: true }, savedAt: 1 }
    }));

    window.GameRegistry.launch('prestart-game');
    expect(window.GameRegistry.hasSave('prestart-game')).toBe(true);
    // Teardown (close modal) without starting must not delete the save.
    window.GameRegistry.destroyCurrent();
    expect(window.GameRegistry.hasSave('prestart-game')).toBe(true);

    // And a relaunch restores it; once the game reports live state, the
    // snapshot it returns supersedes the stored one.
    game.setSnapshot({ live: 1 });
    window.GameRegistry.launch('prestart-game');
    expect(game.initArgs().savedState).toEqual({ waiting: true });
    window.GameRegistry.destroyCurrent();
    expect(window.GameRegistry.getSave('prestart-game').state).toEqual({ live: 1 });
  });

  it('treats a malformed envelope as no save and clears it on teardown', () => {
    registerSaveableGame('envelope-game', { snapshot: { n: 1 } });
    ensureContainer();
    localStorage.setItem('games_saves', JSON.stringify({
      'envelope-game': {}
    }));
    // No Continue is offered for a malformed entry.
    expect(window.GameRegistry.hasSave('envelope-game')).toBe(false);

    window.GameRegistry.launch('envelope-game');
    window.GameRegistry.destroyCurrent();
    // The live snapshot replaces the malformed entry.
    expect(window.GameRegistry.getSave('envelope-game').state).toEqual({ n: 1 });
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

    // Shadow document.hidden with an own property, then restore whatever was
    // there before so later tests observe the real accessor.
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    const originalHidden = document.hidden;
    try {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(document, 'hidden', originalDescriptor);
      } else {
        delete document.hidden;
      }
    }
    expect(document.hidden).toBe(originalHidden);

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

  it('does not serialize a game whose init threw', () => {
    let serializeCalls = 0;
    localStorage.setItem('games_saves', JSON.stringify({
      'broken-init-game': { state: { prior: true }, savedAt: 1 }
    }));
    window.GameRegistry.register({
      id: 'broken-init-game',
      name: 'Broken Init',
      init: () => { throw new Error('mount failed'); },
      destroy: () => {},
      serialize: () => { serializeCalls++; return { partial: true }; }
    });
    ensureContainer();

    expect(window.GameRegistry.launch('broken-init-game')).toBe(false);
    // A half-mounted game cannot report trustworthy state; its save is left
    // exactly as it was.
    expect(serializeCalls).toBe(0);
    expect(window.GameRegistry.getSave('broken-init-game').state).toEqual({ prior: true });
    expect(window.GameRegistry.getCurrentGame()).toBeNull();
  });
});

describe('Save envelope hardening (review #654 round 2)', () => {
  it('does not offer Continue for a non-object snapshot', () => {
    registerSaveableGame('primitive-state-game', { snapshot: { n: 1 } });
    localStorage.setItem('games_saves', JSON.stringify({
      'primitive-state-game': { state: false, savedAt: 1 },
      'also-primitive': { state: 'nope', savedAt: 2 }
    }));
    expect(window.GameRegistry.hasSave('primitive-state-game')).toBe(false);
    expect(window.GameRegistry.getSave('primitive-state-game')).toBeNull();

    // A live run still overwrites the malformed entry normally.
    ensureContainer();
    window.GameRegistry.launch('primitive-state-game');
    window.GameRegistry.destroyCurrent();
    expect(window.GameRegistry.getSave('primitive-state-game').state).toEqual({ n: 1 });
  });
});
