// tests/migrate-legacy.test.js
//
// Unit tests for src/features/migrate-legacy.js. The takeover is gated behind
// MIGRATION_ENABLED (false in this repo), so specs drive the overlay through
// the window.__migrateLegacyTest seam: forceInit builds the dialog and wires
// the Escape / Tab focus-trap handlers, and isRemindLaterActive exposes the
// 7-day "remind me later" TTL directly. The source exports the seam only under
// jsdom, so it never ships reachable in the extension build.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

const seam = () => window.__migrateLegacyTest;

function getOverlay() {
  return document.getElementById('legacy-migration-overlay');
}

function pressKey(key, shiftKey) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    shiftKey: shiftKey === true
  });
  document.dispatchEvent(event);
  return event;
}

// The remind-later write settles on the microtask queue (the chrome.storage
// mock answers set() synchronously), so one macrotask hop drains the whole
// setItemAsync -> markRemindLater -> dismissal chain.
function flushRemindLater() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeAll(() => {
  // warnIfMisconfigured intentionally logs under the non-canonical test
  // extension ID; keep the suite output clean.
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    injectScript('src/core/dom-ready.js');
    injectScript('src/features/migrate-legacy.js');
  } finally {
    warnSpy.mockRestore();
  }
});

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  localStorage.clear();
});

afterEach(async () => {
  // Escape both removes the document keydown listener installed by
  // initLegacyMigration and drops the overlay, so nothing leaks between
  // tests. Restore mocks first so a spec that left setItemAsync mocked
  // cannot block this dismissal, then flush the async write before clearing
  // storage so the timestamp cannot leak into the next test.
  vi.restoreAllMocks();
  if (getOverlay()) {
    pressKey('Escape');
    await flushRemindLater();
  }
  localStorage.clear();
});

describe('isRemindLaterActive (7-day TTL)', () => {
  it('is false when no dismissal is stored', () => {
    expect(seam().isRemindLaterActive()).toBe(false);
  });

  it('is true immediately after markRemindLater', () => {
    seam().markRemindLater();
    expect(seam().isRemindLaterActive()).toBe(true);
  });

  it('expires once the stored timestamp is at least the TTL old', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      seam().markRemindLater();

      vi.setSystemTime(Date.now() + seam().REMIND_LATER_TTL_MS - 1);
      expect(seam().isRemindLaterActive()).toBe(true);

      vi.setSystemTime(Date.now() + 1); // exactly TTL after the dismissal
      expect(seam().isRemindLaterActive()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is false for invalid, zero, or negative stored values', () => {
    localStorage.setItem(seam().REMIND_LATER_KEY, 'not-a-number');
    expect(seam().isRemindLaterActive()).toBe(false);

    localStorage.setItem(seam().REMIND_LATER_KEY, '0');
    expect(seam().isRemindLaterActive()).toBe(false);

    localStorage.setItem(seam().REMIND_LATER_KEY, '-5');
    expect(seam().isRemindLaterActive()).toBe(false);
  });
});

describe('seam availability', () => {
  it('is not exported outside the jsdom test environment', () => {
    // The seam (and its forceInit bypass of MIGRATION_ENABLED) must be
    // unreachable in the shipped extension build, where the user agent is
    // Chrome's, never jsdom's.
    const nav = window.navigator;
    const ownDescriptor = Object.prototype.hasOwnProperty.call(nav, 'userAgent')
      ? Object.getOwnPropertyDescriptor(nav, 'userAgent')
      : null;
    delete window.__migrateLegacyTest;
    try {
      Object.defineProperty(nav, 'userAgent', {
        configurable: true,
        value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      });
      injectScript('src/features/migrate-legacy.js');
      expect(window.__migrateLegacyTest).toBeUndefined();
    } finally {
      if (ownDescriptor) {
        Object.defineProperty(nav, 'userAgent', ownDescriptor);
      } else {
        delete nav.userAgent;
      }
      injectScript('src/features/migrate-legacy.js');
    }
    expect(window.__migrateLegacyTest).toBeDefined();
  });
});

describe('overlay focus trap and dismissal', () => {
  it('stays inert in the normal build (MIGRATION_ENABLED is false)', () => {
    // Production init already ran at injection time via window.onDomReady.
    expect(getOverlay()).toBeNull();
  });

  it('forceInit builds the dialog and focuses the primary action', () => {
    seam().forceInit();
    const overlay = getOverlay();
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    const buttons = overlay.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('is suppressed while a remind-later dismissal is active', () => {
    seam().markRemindLater();
    seam().forceInit();
    expect(getOverlay()).toBeNull();
  });

  it('Tab on the last button wraps focus to the first', () => {
    seam().forceInit();
    const buttons = getOverlay().querySelectorAll('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    last.focus();
    const event = pressKey('Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('Shift+Tab on the first button wraps focus to the last', () => {
    seam().forceInit();
    const buttons = getOverlay().querySelectorAll('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    first.focus();
    const event = pressKey('Tab', true);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('Tab from outside the overlay is pulled back inside', () => {
    seam().forceInit();
    const overlay = getOverlay();
    const first = overlay.querySelector('button');

    const outside = document.createElement('button');
    outside.id = 'migration-focus-outside';
    document.body.appendChild(outside);
    try {
      outside.focus();
      expect(overlay.contains(document.activeElement)).toBe(false);
      pressKey('Tab');
      expect(document.activeElement).toBe(first);
    } finally {
      outside.remove();
    }
  });

  it('ignores keys other than Tab and Escape', () => {
    seam().forceInit();
    const event = pressKey('a');
    expect(event.defaultPrevented).toBe(false);
    expect(getOverlay()).not.toBeNull();
  });

  it('Escape dismisses the overlay and persists remind-later', async () => {
    seam().forceInit();
    pressKey('Escape');
    await flushRemindLater();
    expect(getOverlay()).toBeNull();
    expect(seam().isRemindLaterActive()).toBe(true);
  });

  it('keeps the takeover open and surfaces the save error when the write fails', async () => {
    seam().forceInit();
    vi.spyOn(localStorage, 'setItemAsync').mockResolvedValue(false);
    pressKey('Escape');
    await flushRemindLater();
    expect(getOverlay()).not.toBeNull();
    expect(document.getElementById('legacy-migration-save-error').hidden).toBe(false);
  });

  it('restores focus to the previously focused element on dismiss', async () => {
    const opener = document.createElement('button');
    opener.id = 'migration-focus-opener';
    document.body.appendChild(opener);
    try {
      opener.focus();
      expect(document.activeElement).toBe(opener);

      seam().forceInit();
      expect(document.activeElement).not.toBe(opener);

      pressKey('Escape');
      await flushRemindLater();
      expect(getOverlay()).toBeNull();
      expect(document.activeElement).toBe(opener);
    } finally {
      opener.remove();
    }
  });
});
