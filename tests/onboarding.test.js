import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/features/onboarding.js');
});

beforeEach(() => {
  localStorage.clear();
  window.onboardingTour.reset();
});

describe('OnboardingTour class', () => {
  it('isCompleted returns true when localStorage has flag', () => {
    expect(window.onboardingTour.isCompleted()).toBe(false);
    localStorage.setItem('onboardingCompleted', 'true');
    expect(window.onboardingTour.isCompleted()).toBe(true);
  });

  it('markCompleted sets flag and clears saved step', () => {
    localStorage.setItem('onboardingStep', '3');
    window.onboardingTour.markCompleted();
    expect(localStorage.getItem('onboardingCompleted')).toBe('true');
    expect(localStorage.getItem('onboardingStep')).toBeNull();
    expect(window.onboardingTour.completed).toBe(true);
  });

  it('reset clears all onboarding keys', () => {
    localStorage.setItem('onboardingCompleted', 'true');
    localStorage.setItem('onboardingStep', '5');
    window.onboardingTour.reset();
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
    expect(localStorage.getItem('onboardingStep')).toBeNull();
    expect(window.onboardingTour.completed).toBe(false);
    expect(window.onboardingTour.currentStep).toBe(0);
  });
});

describe('Progress saving on navigation', () => {
  function startAndGetStep(n) {
    window.onboardingTour.start(n);
    return window.onboardingTour.currentStep;
  }

  it('saves step on nextStep', () => {
    startAndGetStep(0);
    window.onboardingTour.nextStep();
    expect(localStorage.getItem('onboardingStep')).toBe('1');
    window.onboardingTour.nextStep();
    expect(localStorage.getItem('onboardingStep')).toBe('2');
    window.onboardingTour.end(true);
  });

  it('saves step on prevStep', () => {
    startAndGetStep(3);
    window.onboardingTour.prevStep();
    expect(localStorage.getItem('onboardingStep')).toBe('2');
    window.onboardingTour.end(true);
  });

  it('saves step on goToStep', () => {
    startAndGetStep(0);
    window.onboardingTour.goToStep(5);
    expect(localStorage.getItem('onboardingStep')).toBe('5');
    window.onboardingTour.end(true);
  });

  it('end(false) preserves saved step without marking completed', () => {
    window.onboardingTour.currentStep = 4;
    window.onboardingTour.isActive = true;
    window.onboardingTour.completed = false;
    window.onboardingTour.end(false);
    expect(localStorage.getItem('onboardingStep')).toBe('4');
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
    expect(window.onboardingTour.completed).toBe(false);
  });

  it('end(true) marks completed and clears saved step', () => {
    localStorage.setItem('onboardingStep', '9');
    window.onboardingTour.isActive = true;
    window.onboardingTour.completed = false;
    window.onboardingTour.end(true);
    expect(localStorage.getItem('onboardingCompleted')).toBe('true');
    expect(localStorage.getItem('onboardingStep')).toBeNull();
    expect(window.onboardingTour.completed).toBe(true);
  });

  it('end() with no argument defaults to dismiss (preserves step)', () => {
    window.onboardingTour.currentStep = 2;
    window.onboardingTour.isActive = true;
    window.onboardingTour.completed = false;
    window.onboardingTour.end();
    expect(localStorage.getItem('onboardingStep')).toBe('2');
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
  });

  it('close button saves progress for resume', () => {
    const tour = window.onboardingTour;
    tour.start(4);
    const closeBtn = document.querySelector('.onboarding-close-btn');
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
    expect(localStorage.getItem('onboardingStep')).toBe('4');
    expect(tour.completed).toBe(false);
  });

  it('nextStep on last step calls end(true)', () => {
    window.onboardingTour.currentStep = window.onboardingTour.steps.length - 1;
    window.onboardingTour.isActive = true;
    window.onboardingTour.completed = false;
    window.onboardingTour.nextStep();
    expect(localStorage.getItem('onboardingCompleted')).toBe('true');
    expect(localStorage.getItem('onboardingStep')).toBeNull();
  });
});

describe('Resume behavior', () => {
  it('start accepts a step parameter', () => {
    expect(window.onboardingTour.currentStep).toBe(0);
    window.onboardingTour.completed = false;
    window.onboardingTour.start(5);
    expect(window.onboardingTour.currentStep).toBe(5);
    // Clean up overlay
    window.onboardingTour.end(true);
  });

  it('start is a no-op when tour is already completed', () => {
    window.onboardingTour.completed = true;
    window.onboardingTour.currentStep = 7;
    window.onboardingTour.start(0);
    // Should not reset step or set completed to false
    expect(window.onboardingTour.currentStep).toBe(7);
    expect(window.onboardingTour.completed).toBe(true);
  });

  it('start works after reset (restart path)', () => {
    window.onboardingTour.reset();
    window.onboardingTour.start(0);
    expect(window.onboardingTour.completed).toBe(false);
    expect(window.onboardingTour.currentStep).toBe(0);
    window.onboardingTour.end(true);
  });
});

describe('Saved step detection in auto-start', () => {
  it('_resolveSavedStep returns saved step from localStorage', () => {
    localStorage.setItem('onboardingStep', '6');
    expect(window.onboardingTour._resolveSavedStep()).toBe(6);
  });

  it('_resolveSavedStep returns 0 when no step is saved', () => {
    localStorage.removeItem('onboardingStep');
    expect(window.onboardingTour._resolveSavedStep()).toBe(0);
  });

  it('_resolveSavedStep returns 0 for out-of-bounds step', () => {
    localStorage.setItem('onboardingStep', '999');
    expect(window.onboardingTour._resolveSavedStep()).toBe(0);
  });

  it('_resolveSavedStep returns 0 for NaN step', () => {
    localStorage.setItem('onboardingStep', 'abc');
    expect(window.onboardingTour._resolveSavedStep()).toBe(0);
  });

  it('start uses saved step when onboardingStep exists', () => {
    localStorage.setItem('onboardingStep', '6');
    window.onboardingTour.completed = false;
    window.onboardingTour.start(window.onboardingTour._resolveSavedStep());
    expect(window.onboardingTour.currentStep).toBe(6);
    window.onboardingTour.end(true);
  });

  it('start clamps out-of-bounds step index', () => {
    window.onboardingTour.completed = false;
    window.onboardingTour.start(999);
    expect(window.onboardingTour.currentStep).toBe(window.onboardingTour.steps.length - 1);
    window.onboardingTour.end(true);

    window.onboardingTour.completed = false;
    window.onboardingTour.start(-5);
    expect(window.onboardingTour.currentStep).toBe(0);
    window.onboardingTour.end(true);
  });

  it('_tryStart starts from saved step when onboardingStep exists', () => {
    localStorage.setItem('onboardingStep', '6');
    window.onboardingTour.completed = false;
    window.onboardingTour._tryStart();
    expect(window.onboardingTour.currentStep).toBe(6);
    window.onboardingTour.end(true);
  });

  it('_tryStart starts from beginning when no step is saved', () => {
    localStorage.removeItem('onboardingStep');
    window.onboardingTour.completed = false;
    window.onboardingTour._tryStart();
    expect(window.onboardingTour.currentStep).toBe(0);
    window.onboardingTour.end(true);
  });

  it('isCompleted blocks auto-start when onboardingCompleted is set', () => {
    localStorage.setItem('onboardingCompleted', 'true');
    localStorage.setItem('onboardingStep', '3');
    expect(window.onboardingTour.isCompleted()).toBe(true);
    // Auto-start callers (DOMContentLoaded / load handlers) check
    // isCompleted() before calling _tryStart(), so this guard
    // correctly prevents resuming a previously completed tour.
  });
});

describe('Immediate progress saving on language/theme selection', () => {
  it('language radio selection saves progress to next step immediately', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(0);
    const radio = document.querySelector('input[name="onboarding-language"]');
    expect(radio).not.toBeNull();
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Step should be saved immediately, not only after the 500ms timeout
    expect(localStorage.getItem('onboardingStep')).toBe('1');
    tour.end(true);
  });

  it('theme radio selection saves progress to next step immediately', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(1);
    const radio = document.querySelector('input[name="onboarding-theme"]');
    expect(radio).not.toBeNull();
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Step should be saved immediately, not only after the 500ms timeout
    expect(localStorage.getItem('onboardingStep')).toBe('2');
    tour.end(true);
  });

  it('end(false) after language selection preserves optimistically saved next step', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(0);
    const radio = document.querySelector('input[name="onboarding-language"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Radio handler saved step 1 and scheduled 500ms nextStep
    expect(localStorage.getItem('onboardingStep')).toBe('1');
    // Dismiss before the 500ms timeout fires
    tour.end(false);
    // Should keep step 1, not overwrite with currentStep (0)
    expect(localStorage.getItem('onboardingStep')).toBe('1');
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
  });

  it('end(false) after theme selection preserves optimistically saved next step', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(1);
    const radio = document.querySelector('input[name="onboarding-theme"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Radio handler saved step 2 and scheduled 500ms nextStep
    expect(localStorage.getItem('onboardingStep')).toBe('2');
    // Dismiss before the 500ms timeout fires
    tour.end(false);
    // Should keep step 2, not overwrite with currentStep (1)
    expect(localStorage.getItem('onboardingStep')).toBe('2');
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
  });

  it('radio change after end(false) does not corrupt saved step (language)', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(0);
    // Dismiss the tour — sets isActive=false, saves step 0, starts 300ms fade-out
    tour.end(false);
    expect(localStorage.getItem('onboardingStep')).toBe('0');
    // Stale radio change event during the fade-out window
    const radio = document.querySelector('input[name="onboarding-language"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Should NOT overwrite the step end(false) saved
    expect(localStorage.getItem('onboardingStep')).toBe('0');
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
  });

  it('radio change after end(false) does not corrupt saved step (theme)', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(1);
    // Dismiss the tour — sets isActive=false, saves step 1, starts 300ms fade-out
    tour.end(false);
    expect(localStorage.getItem('onboardingStep')).toBe('1');
    // Stale radio change event during the fade-out window
    const radio = document.querySelector('input[name="onboarding-theme"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Should NOT overwrite the step end(false) saved
    expect(localStorage.getItem('onboardingStep')).toBe('1');
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
  });
});

describe('Timeout cleanup', () => {
  it('reset clears pending action timeouts', () => {
    const tour = window.onboardingTour;
    tour._actionTimeouts = [123, 456];
    tour.reset();
    expect(tour._actionTimeouts).toEqual([]);
  });

  it('_clearActionTimeouts empties the timeouts array', () => {
    const tour = window.onboardingTour;
    tour._actionTimeouts = [789];
    tour._clearActionTimeouts();
    expect(tour._actionTimeouts).toEqual([]);
  });
});
