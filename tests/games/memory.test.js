import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from '../helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/games/shared.js');
  injectScript('src/features/games/game-registry.js');
  injectScript('src/features/games/memory.js');
});

beforeEach(() => {
  localStorage.clear();
  document.querySelectorAll('.games-memory-stats, .games-memory-grid, .games-ready-overlay, .games-instructions').forEach(el => el.remove());
});

describe('Memory Match Game', () => {
  it('registers with GameRegistry', () => {
    const game = window.GameRegistry.get('memory');
    expect(game).not.toBeNull();
    expect(game.id).toBe('memory');
    expect(game.name).toBe('gamesMemory');
    expect(typeof game.init).toBe('function');
    expect(typeof game.destroy).toBe('function');
  });

  it('renders stats bar and grid on init', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    expect(container.querySelector('.games-memory-stats')).not.toBeNull();
    expect(container.querySelector('.games-memory-grid')).not.toBeNull();
    expect(container.querySelector('.games-instructions')).not.toBeNull();

    game.destroy();
    container.remove();
  });

  it('initializes with 0 moves', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    const movesEl = container.querySelector('.games-memory-moves');
    expect(movesEl.textContent).toContain('0');

    game.destroy();
    container.remove();
  });

  it('creates 16 cards (8 pairs)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    const cards = container.querySelectorAll('.games-memory-card');
    expect(cards).toHaveLength(16);

    game.destroy();
    container.remove();
  });

  it('cards start face down', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    const cards = container.querySelectorAll('.games-memory-card');
    cards.forEach(card => {
      expect(card.textContent).toBe('?');
      expect(card.classList.contains('games-memory-card-flipped')).toBe(false);
      expect(card.classList.contains('games-memory-card-matched')).toBe(false);
    });

    game.destroy();
    container.remove();
  });

  it('cleans up on destroy', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    game.destroy();
    expect(container.querySelector('.games-memory-grid')).toBeNull();
    expect(container.querySelector('.games-memory-stats')).toBeNull();

    container.remove();
  });

  it('can be paused and resumed without error', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    expect(() => game.pause()).not.toThrow();
    expect(() => game.resume()).not.toThrow();

    game.destroy();
    container.remove();
  });

  it('keeps a lone revealed card flipped across pause', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    // Start the run (the game holds on a ready screen until the player signals).
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

    const cards = container.querySelectorAll('.games-memory-card');
    cards[0].click();

    const flippedEl = container.querySelector('.games-memory-card-flipped');
    expect(flippedEl).not.toBeNull();

    game.pause();
    game.resume();

    expect(flippedEl.classList.contains('games-memory-card-flipped')).toBe(true);

    game.destroy();
    container.remove();
  });
});

describe('Memory ready state (#597)', () => {
  it('shows a ready screen and does not flip cards until the player starts', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
    expect(window.__memoryReady.isStarted()).toBe(false);

    // Clicks while ready are ignored: every card stays face down.
    const cards = container.querySelectorAll('.games-memory-card');
    cards[0].click();
    cards.forEach(card => {
      expect(card.textContent).toBe('?');
    });
    expect(window.__memoryReady.isStarted()).toBe(false);

    // Space signals readiness.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__memoryReady.isStarted()).toBe(true);
    expect(container.querySelector('.games-ready-overlay')).toBeNull();

    game.destroy();
    container.remove();
  });

  it('cleans up the ready screen on destroy before starting', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container);

    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
    game.destroy();

    expect(container.querySelector('.games-ready-overlay')).toBeNull();
    // Starting after destroy is a no-op (listeners are gone).
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(window.__memoryReady.isStarted()).toBe(false);

    container.remove();
  });

  it('does not start the ticker during a pre-start visibility cycle after relaunch', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');

    // First run: start the run so timer state (startTime/pausedAt) is populated.
    game.init(container);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    game.pause();
    expect(window.__memoryReady.getPausedAt()).toBeGreaterThan(0);
    game.destroy();

    // Relaunch: the game holds on the ready screen again. setupBoard() keeps the
    // previous startTime, so a pre-start visibility cycle must not leak into the
    // timer while the ready screen is active.
    game.init(container);
    expect(window.__memoryReady.isStarted()).toBe(false);
    expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
    // The stale pausedAt from the first run must not survive into the ready state.
    expect(window.__memoryReady.getPausedAt()).toBe(0);

    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    try {
      // Simulate a stale pausedAt surviving into the ready state (as if
      // setupBoard had not reset it) so the resume() guard itself is exercised:
      // even with pausedAt > 0 and a populated startTime, resume() must not
      // start the ticker while the game is still unstarted.
      window.__memoryReady.setPausedAt(Date.now());

      // A visibility cycle while still on the ready screen must not start the ticker.
      game.pause();
      game.resume();

      expect(window.__memoryReady.isStarted()).toBe(false);
      expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
      expect(setIntervalSpy).not.toHaveBeenCalled();
    } finally {
      setIntervalSpy.mockRestore();
    }

    game.destroy();
    container.remove();
  });
});

describe('Memory cross-session saves (#646)', () => {
  // Build a valid snapshot for an in-progress board: 1 matched pair, one lone
  // revealed card, 3 moves, 12.5s elapsed.
  function makeSavedState() {
    const emojis = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼'];
    const deck = [];
    for (let i = 0; i < 8; i++) {
      deck.push(emojis[i], emojis[i]);
    }
    // Positional layout: cards 0/1 matched, card 2 is the lone reveal.
    const cards = deck.map((emoji, idx) => ({
      emoji: emoji,
      flipped: idx === 2,
      matched: idx < 2
    }));
    return { cards: cards, moves: 3, elapsedMs: 12500 };
  }

  it('restores a saved board and skips the ready screen', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container, makeSavedState());

    expect(window.__memoryReady.isStarted()).toBe(true);
    expect(container.querySelector('.games-ready-overlay')).toBeNull();

    // 2 matched + 1 flipped are face up; the rest show '?'.
    const cards = container.querySelectorAll('.games-memory-card');
    expect(cards[0].classList.contains('games-memory-card-matched')).toBe(true);
    expect(cards[1].classList.contains('games-memory-card-matched')).toBe(true);
    expect(cards[2].classList.contains('games-memory-card-flipped')).toBe(true);
    expect(cards[5].textContent).toBe('?');

    // Moves counter carries over.
    expect(container.querySelector('.games-memory-moves').textContent).toContain('3');

    game.destroy();
    container.remove();
  });

  it('continues the restored run: flipping the matching card completes the pair', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');
    game.init(container, makeSavedState());

    // Card 3 pairs with the lone revealed card 2 (same emoji).
    container.querySelectorAll('.games-memory-card')[3].click();
    expect(container.querySelector('.games-memory-moves').textContent).toContain('4');

    game.destroy();
    container.remove();
  });

  it('rejects malformed or impossible saved boards and starts fresh', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');

    const bad = [
      { cards: [{ emoji: '🐶', matched: false }] },                          // wrong length
      { cards: 'nope' },                                                      // not an array
      { cards: Array.from({ length: 16 }, () => ({ emoji: '👽', matched: false })) }, // unknown emoji
      { moves: -1, cards: makeSavedState().cards },                           // negative moves
      { moves: 1, elapsedMs: NaN, cards: makeSavedState().cards },            // broken elapsed time
      { moves: 1, elapsedMs: 100, cards: makeSavedState().cards.map(c => ({ ...c, flipped: true, matched: c.matched })) } // 16 face-up
    ];
    bad.forEach((state) => {
      game.init(container, state);
      expect(window.__memoryReady.isStarted()).toBe(false);
      expect(container.querySelector('.games-ready-overlay')).not.toBeNull();
      game.destroy();
    });

    container.remove();
  });

  it('persists a live run through destroyCurrent and restores it via launch', () => {
    let el = document.getElementById('games-game-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'games-game-container';
      document.body.appendChild(el);
    }
    expect(window.GameRegistry.launch('memory')).toBe(true);

    // Start, then flip two non-matching cards... positions are random, so
    // just flip one card to create mid-turn state.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    el.querySelectorAll('.games-memory-card')[0].click();

    window.GameRegistry.destroyCurrent();
    expect(window.GameRegistry.hasSave('memory')).toBe(true);
    const saved = JSON.parse(localStorage.getItem('games_saves')).memory;
    expect(saved.state.cards).toHaveLength(16);
    expect(saved.state.moves).toBe(0);

    window.GameRegistry.launch('memory');
    expect(window.__memoryReady.isStarted()).toBe(true);
    expect(el.querySelector('.games-ready-overlay')).toBeNull();
    // The lone reveal survived the round trip.
    expect(el.querySelectorAll('.games-memory-card-flipped').length + el.querySelectorAll('.games-memory-card-matched').length)
      .toBeGreaterThanOrEqual(1);

    window.GameRegistry.destroyCurrent();
    el.remove();
  });

  it('clears the save when the run completes', () => {
    localStorage.setItem('games_saves', JSON.stringify({
      memory: { state: makeSavedState(), savedAt: 1 }
    }));

    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');

    // Restore a board with 7 pairs already matched so one more match wins.
    const state = makeSavedState();
    state.cards.forEach((card, idx) => {
      card.matched = idx !== 2 && idx !== 3;
    });
    state.moves = 20;
    game.init(container, state);
    expect(window.GameRegistry.hasSave('memory')).toBe(true); // restore does not clear

    // Card 3 pairs with the revealed card 2 → final match → endGame(). The
    // match resolves on a timeout, so advance fake timers to fire it.
    vi.useFakeTimers();
    container.querySelectorAll('.games-memory-card')[3].click();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();

    expect(window.GameRegistry.hasSave('memory')).toBe(false);

    game.destroy();
    container.remove();
  });
});

describe('Memory save validation regressions (review #654)', () => {
  it('accepts a real snapshot that contains completed pairs', () => {
    // In play, matched cards keep flipped=true until the next render; the
    // serializer normalizes them, but a validator must not reject such a
    // board wholesale — pair consistency is what matters.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');

    const state = {
      cards: [],
      moves: 2,
      elapsedMs: 5000
    };
    const emojis = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼'];
    for (let i = 0; i < 8; i++) {
      state.cards.push({ emoji: emojis[i], matched: i < 1 });
      state.cards.push({ emoji: emojis[i], matched: i < 1 });
    }
    game.init(container, state);
    expect(window.__memoryReady.isStarted()).toBe(true);
    expect(container.querySelectorAll('.games-memory-card-matched')).toHaveLength(2);

    game.destroy();
    container.remove();
  });

  it('rejects boards whose pairs disagree on matched', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');

    const cards = [];
    const emojis = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼'];
    for (let i = 0; i < 8; i++) {
      cards.push({ emoji: emojis[i], matched: i === 0 });
      cards.push({ emoji: emojis[i], matched: false }); // same pair, disagrees
    }
    game.init(container, { cards: cards, moves: 1, elapsedMs: 1000 });
    expect(window.__memoryReady.isStarted()).toBe(false);

    game.destroy();
    container.remove();
  });

  it('rejects boards with an odd emoji count', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const game = window.GameRegistry.get('memory');

    const cards = [];
    const emojis = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼'];
    // 7 pairs plus one extra 🐶 (3 occurrences) — parity broken at length 16.
    for (let i = 0; i < 7; i++) {
      cards.push({ emoji: emojis[i], matched: false });
      cards.push({ emoji: emojis[i], matched: false });
    }
    cards.push({ emoji: emojis[0], matched: false });

    game.init(container, { cards: cards, moves: 0, elapsedMs: 0 });
    expect(window.__memoryReady.isStarted()).toBe(false);

    game.destroy();
    container.remove();
  });

  it('saves paused elapsed time from pausedAt, not wall clock', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000000);
      let el = document.getElementById('games-game-container');
      if (!el) {
        el = document.createElement('div');
        el.id = 'games-game-container';
        document.body.appendChild(el);
      }
      expect(window.GameRegistry.launch('memory')).toBe(true);
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

      el.querySelectorAll('.games-memory-card')[0].click();
      // Pause freezes the timer at pausedAt.
      window.GameRegistry.getCurrentGame().pause();

      // Time passes while hidden...
      vi.advanceTimersByTime(60000);
      vi.setSystemTime(1060000);

      window.GameRegistry.destroyCurrent();
      const saved = JSON.parse(localStorage.getItem('games_saves')).memory;
      // Elapsed must be measured to the pause point (~0s), not include the
      // 60s hidden interval.
      expect(saved.state.elapsedMs).toBeLessThan(5000);

      el.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Memory pausedAt lifecycle (review #654 round 2)', () => {
  it('resumes measuring from wall clock after a pause/resume cycle', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000000);
      let el = document.getElementById('games-game-container');
      if (!el) {
        el = document.createElement('div');
        el.id = 'games-game-container';
        document.body.appendChild(el);
      }
      expect(window.GameRegistry.launch('memory')).toBe(true);
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

      el.querySelectorAll('.games-memory-card')[0].click();
      const game = window.GameRegistry.getCurrentGame();
      game.pause();

      // Resume: the run is live again and pausedAt must be cleared so the
      // next serialize stamps at the current time, not the old pause point.
      vi.setSystemTime(1005000);
      game.resume();
      vi.advanceTimersByTime(30000);
      vi.setSystemTime(1035000);

      window.GameRegistry.destroyCurrent();
      const saved = JSON.parse(localStorage.getItem('games_saves')).memory;
      // Elapsed ≈ 30s (30s post-resume; pre-pause is ~0 and the 0.5s pause is not counted), not ~0.5s (which
      // would mean post-resume time was lost).
      expect(saved.state.elapsedMs).toBeGreaterThan(25000);
      el.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});
