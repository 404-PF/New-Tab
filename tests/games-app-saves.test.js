import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/games/shared.js');
  injectScript('src/features/games/game-registry.js');
  injectScript('src/features/games/games-app.js');
});

beforeEach(() => {
  // Destroy first: teardown re-persists snapshots.
  window.GameRegistry._reset && window.GameRegistry._reset();
  localStorage.clear();
  document.querySelectorAll('.games-hub-card, .games-game-header, #games-game-container').forEach(el => el.remove());
  const hub = document.getElementById('games-hub-content');
  if (hub) hub.innerHTML = '';
});

function registerGame(id) {
  window.GameRegistry.register({
    id: id,
    name: id,
    init: () => {},
    destroy: () => {},
    serialize: () => ({ snapshot: true })
  });
}

describe('Games hub Continue affordance (#646)', () => {
  it('labels a card without a save "Play" with no saved indicator', () => {
    registerGame('fresh-game');
    window.GamesApp.showHub();

    const btn = document.querySelector('.games-hub-card-play');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Play');
    expect(btn.classList.contains('games-hub-card-play-continue')).toBe(false);
    expect(document.querySelector('.games-hub-card-saved')).toBeNull();
  });

  it('labels a card with a save "Continue" and shows the saved indicator', () => {
    registerGame('saved-game');
    localStorage.setItem('games_saves', JSON.stringify({
      'saved-game': { state: { snapshot: true }, savedAt: 1 }
    }));
    window.GamesApp.showHub();

    const btn = document.querySelector('.games-hub-card-play');
    expect(btn.textContent).toBe('Continue');
    expect(btn.classList.contains('games-hub-card-play-continue')).toBe(true);
    const savedEl = document.querySelector('.games-hub-card-saved');
    expect(savedEl).not.toBeNull();
    expect(savedEl.textContent).toBe('Saved');
  });

  it('launching a game with a save passes the persisted state through', () => {
    let receivedState;
    window.GameRegistry.register({
      id: 'resume-game',
      name: 'resume-game',
      init: (_container, savedState) => { receivedState = savedState; },
      destroy: () => {},
      serialize: () => null
    });
    localStorage.setItem('games_saves', JSON.stringify({
      'resume-game': { state: { board: [1] }, savedAt: 1 }
    }));
    window.GamesApp.showHub();
    document.querySelector('.games-hub-card-play').click();

    expect(receivedState).toEqual({ board: [1] });
  });
});
