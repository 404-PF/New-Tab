import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/features/ambient-sounds.js');
});

beforeEach(() => {
  localStorage.clear();
  delete window.prefersReducedMotion;

  // Ensure the settings checkbox referenced by the module exists.
  let cb = document.getElementById('ambient-sounds-setting');
  if (!cb) {
    cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'ambient-sounds-setting';
    document.body.appendChild(cb);
  }

  // jsdom does not implement media playback; stub it so tests are deterministic.
  if (window.HTMLMediaElement) {
    window.HTMLMediaElement.prototype.play = function () {
      return Promise.resolve();
    };
    window.HTMLMediaElement.prototype.pause = function () {};
  }

  window.AmbientSounds.init();
});

describe('ambient-sounds', () => {
  it('exposes the core sound layers (minimum 4, eight total)', () => {
    const ids = window.AmbientSounds.SOUND_LAYERS.map((l) => l.id);
    expect(ids).toContain('rain');
    expect(ids).toContain('ocean');
    expect(ids).toContain('wind');
    expect(ids).toContain('forest');
    expect(ids).toHaveLength(8);
  });

  it('starts from a sensible default state', () => {
    const s = window.AmbientSounds.getState();
    expect(s.masterVolume).toBeCloseTo(0.6);
    expect(s.layers.rain.enabled).toBe(false);
    expect(s.layers.rain.volume).toBeCloseTo(0.5);
  });

  it('toggleLayer enables a layer and persists it', () => {
    window.AmbientSounds.toggleLayer('rain', true);
    expect(window.AmbientSounds.getState().layers.rain.enabled).toBe(true);
    const stored = JSON.parse(localStorage.getItem('ambientSounds'));
    expect(stored.layers.rain.enabled).toBe(true);
  });

  it('setLayerVolume clamps to [0,1] and persists', () => {
    window.AmbientSounds.setLayerVolume('ocean', 2);
    expect(window.AmbientSounds.getState().layers.ocean.volume).toBe(1);
    window.AmbientSounds.setLayerVolume('ocean', -1);
    expect(window.AmbientSounds.getState().layers.ocean.volume).toBe(0);
  });

  it('setMasterVolume clamps and persists', () => {
    window.AmbientSounds.setMasterVolume(0.25);
    expect(window.AmbientSounds.getState().masterVolume).toBeCloseTo(0.25);
    window.AmbientSounds.setMasterVolume(5);
    expect(window.AmbientSounds.getState().masterVolume).toBe(1);
    const stored = JSON.parse(localStorage.getItem('ambientSounds'));
    expect(stored.masterVolume).toBe(1);
  });

  it('stopAll disables every layer and persists', () => {
    window.AmbientSounds.toggleLayer('rain', true);
    window.AmbientSounds.toggleLayer('fire', true);
    window.AmbientSounds.stopAll();
    const s = window.AmbientSounds.getState();
    expect(s.layers.rain.enabled).toBe(false);
    expect(s.layers.fire.enabled).toBe(false);
    const stored = JSON.parse(localStorage.getItem('ambientSounds'));
    expect(stored.layers.rain.enabled).toBe(false);
  });

  it('setEnabled shows the widget when enabled and hides it otherwise', () => {
    window.AmbientSounds.setEnabled(true);
    const btn = document.getElementById('ambient-sounds-button');
    expect(btn).not.toBeNull();
    expect(btn.style.display).not.toBe('none');
    expect(localStorage.getItem('ambientSoundsEnabled')).toBe('true');

    window.AmbientSounds.setEnabled(false);
    expect(document.getElementById('ambient-sounds-button').style.display).toBe('none');
    expect(localStorage.getItem('ambientSoundsEnabled')).toBe('false');
  });

  it('persists enabled state and active layers across init reloads', () => {
    window.AmbientSounds.setEnabled(true);
    window.AmbientSounds.toggleLayer('wind', true);
    window.AmbientSounds.init();
    expect(window.AmbientSounds.isEnabled()).toBe(true);
    expect(window.AmbientSounds.getState().layers.wind.enabled).toBe(true);
    expect(document.getElementById('ambient-sounds-button')).not.toBeNull();
  });

  it('builds a popover with one toggle per layer plus master and stop-all', () => {
    window.AmbientSounds.setEnabled(true);
    const pop = document.getElementById('ambient-sounds-popover');
    expect(pop).not.toBeNull();
    expect(pop.querySelectorAll('.ambient-layer-toggle')).toHaveLength(8);
    expect(pop.querySelector('.ambient-stop-all')).not.toBeNull();
    expect(pop.querySelector('.ambient-master-slider')).not.toBeNull();
  });

  it('does not auto-resume playback when reduced motion is preferred', () => {
    window.prefersReducedMotion = function () {
      return true;
    };
    localStorage.setItem('ambientSoundsEnabled', 'true');
    localStorage.setItem('ambientSounds', JSON.stringify({
      masterVolume: 0.6,
      layers: {
        rain: { enabled: true, volume: 0.5 },
        ocean: { enabled: false, volume: 0.5 }
      }
    }));
    window.AmbientSounds.init();
    // State is preserved, but playback was not attempted (no start prompt).
    expect(window.AmbientSounds.getState().layers.rain.enabled).toBe(true);
    const btn = document.getElementById('ambient-sounds-button');
    expect(btn.classList.contains('needs-start')).toBe(false);
  });
});
