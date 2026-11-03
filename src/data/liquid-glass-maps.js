// src/data/liquid-glass-maps.js - Static displacement maps for liquid glass.
//
// Map generation technique adapted from rdev/liquid-glass-react (MIT License,
// Copyright (c) rdev), src/utils.ts. The `shader` mode from that library is
// intentionally not ported: it relies on unstable WebGL behaviour in extensions.
//
// Each map is an RGBA image where the R and G channels encode the x/y
// displacement vector (128 = no displacement). Maps are rendered once per
// dimension pair and cached as PNG data URLs for use by feImage.

(function () {
  'use strict';

  const cache = new Map();

  const generators = {
    // Edge bulge: content near the border is pushed toward the centre.
    standard(x, y, w, h, radius) {
      const edge = Math.min(Math.min(x, w - 1 - x), Math.min(y, h - 1 - y));
      const t = Math.max(0, 1 - edge / radius);
      const bulge = t * t;
      return [
        (x < w / 2 ? 1 : -1) * bulge,
        (y < h / 2 ? 1 : -1) * bulge
      ];
    },
    // Radial: displacement grows with distance from the centre (lens-like).
    polar(x, y, w, h) {
      const cx = w / 2;
      const cy = h / 2;
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const k = r * r * (1 - r);
      return [-dx * k * 2, -dy * k * 2];
    },
    // Prominent: wider, stronger edge bulge for pronounced refraction.
    prominent(x, y, w, h, radius) {
      const edge = Math.min(Math.min(x, w - 1 - x), Math.min(y, h - 1 - y));
      const t = Math.max(0, 1 - edge / (radius * 1.5));
      const bulge = Math.pow(t, 1.5);
      return [
        (x < w / 2 ? 1 : -1) * bulge,
        (y < h / 2 ? 1 : -1) * bulge
      ];
    }
  };

  const DEFAULT_SIZE = 256;
  const DEFAULT_RADIUS = 40;

  function render(name, w, h, radius) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return '';
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const gen = generators[name];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [nx, ny] = gen(x, y, w, h, radius);
        const idx = (y * w + x) * 4;
        data[idx] = 128 + Math.max(-1, Math.min(1, nx)) * 127;
        data[idx + 1] = 128 + Math.max(-1, Math.min(1, ny)) * 127;
        data[idx + 2] = 128;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }

  // Returns a PNG data URL for the named map, or '' when a 2D canvas is
  // unavailable (e.g. non-browser test environments).
  function build(name, w = DEFAULT_SIZE, h = DEFAULT_SIZE, radius = DEFAULT_RADIUS) {
    if (!Object.hasOwn(generators, name)) return '';
    const key = `${name}:${w}x${h}:${radius}`;
    if (!cache.has(key)) {
      cache.set(key, render(name, w, h, radius));
    }
    return cache.get(key);
  }

  window.LiquidGlassMaps = {
    names: Object.freeze(['standard', 'polar', 'prominent']),
    build,
    _clearCacheForTests() {
      cache.clear();
    }
  };
})();
