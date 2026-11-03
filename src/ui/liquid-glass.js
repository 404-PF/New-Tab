// src/ui/liquid-glass.js - Liquid glass core: structure injection, shared SVG
// filter registry, capability probe, and MutationObserver pickup.
//
// Activation is opt-in via localStorage `glassStyle` ('liquid' | 'classic',
// default 'classic'). The settings control ships separately; until then the
// page stays on Classic blur styling. When the probe fails or the style is
// 'classic', every entry point here is a no-op.
//
// Consumers mark elements with `data-liquid-glass="icon|panel|pill"` (or call
// `LiquidGlass.enhance(el, opts)`); the observer enhances marked elements that
// are added to the DOM later, such as JS-built popovers.

(function () {
  'use strict';

  const STORAGE_KEY = 'glassStyle';
  const ATTR = 'data-liquid-glass';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DEFS_ID = 'liquid-glass-defs';
  const WARP_CLASS = 'glass__warp';
  const OVERLAY_CLASSES = ['glass__highlight', 'glass__over-light', 'glass__hover'];
  const LAYER_CLASSES = [WARP_CLASS, ...OVERLAY_CLASSES];
  const ROOT_CLASS = 'glass-liquid';

  const SIZE_CLASSES = {
    icon: { mapSize: 128, radius: 24, scale: 40, blur: 2 },
    panel: { mapSize: 256, radius: 48, scale: 60, blur: 12 },
    pill: { mapSize: 128, radius: 32, scale: 30, blur: 8 }
  };
  const DEFAULT_MAP = 'standard';
  const DEFAULT_SIZE_CLASS = 'panel';

  // Elements currently carrying the liquid structure.
  const enhanced = new Set();
  // Filter ids already defined in the shared <defs>, keyed by `${map}:${size}`.
  const filterIds = new Map();
  let defsRoot = null;
  let observer = null;
  let probeResult = null;
  let unsubscribeMotion = null;

  function getGlassStyle() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'liquid' ? 'liquid' : 'classic';
    } catch (e) {
      console.warn('Failed to read glassStyle:', e);
      return 'classic';
    }
  }

  function runProbe() {
    const hasCss = typeof CSS !== 'undefined' && typeof CSS.supports === 'function';
    const checks = {
      backdropUrl: hasCss && CSS.supports('backdrop-filter', 'url(#x) blur(2px)'),
      filterUrl: hasCss && CSS.supports('filter', 'url(#x)'),
      notFirefox: !/firefox/i.test(navigator.userAgent || ''),
      svgFilterElement: typeof SVGFilterElement !== 'undefined'
    };
    const supported = Object.values(checks).every(Boolean);
    return { supported, checks };
  }

  function getProbe() {
    if (probeResult === null) {
      probeResult = runProbe();
      console.info('Liquid glass probe:', probeResult.supported ? 'supported' : 'unsupported', probeResult.checks);
    }
    return probeResult;
  }

  function isLiquid() {
    return getGlassStyle() === 'liquid' && getProbe().supported;
  }

  function isReducedMotion() {
    return typeof window.prefersReducedMotion === 'function' && window.prefersReducedMotion();
  }

  function ensureDefs() {
    if (defsRoot && defsRoot.isConnected) return defsRoot;
    let svg = document.getElementById(DEFS_ID);
    if (!svg) {
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('id', DEFS_ID);
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.position = 'absolute';
      svg.appendChild(document.createElementNS(SVG_NS, 'defs'));
      document.body.appendChild(svg);
    }
    defsRoot = svg.querySelector('defs');
    return defsRoot;
  }

  // One <filter> per {map, sizeClass} pair; reused by every element that asks.
  function ensureFilter(mapName, sizeClass) {
    const key = `${mapName}:${sizeClass}`;
    if (filterIds.has(key)) return filterIds.get(key);

    const size = SIZE_CLASSES[sizeClass];
    const mapUrl = window.LiquidGlassMaps
      ? window.LiquidGlassMaps.build(mapName, size.mapSize, size.mapSize, size.radius)
      : '';
    if (!mapUrl) return null;

    const defs = ensureDefs();
    const id = `lg-${mapName}-${sizeClass}`;
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    const image = document.createElementNS(SVG_NS, 'feImage');
    image.setAttribute('x', '0');
    image.setAttribute('y', '0');
    image.setAttribute('width', '100%');
    image.setAttribute('height', '100%');
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('result', 'map');
    image.setAttribute('href', mapUrl);
    filter.appendChild(image);

    // Per-channel displacement with slightly different scales gives a cheap
    // chromatic-aberration split (see spike/liquid-glass/index.html).
    const channels = [
      { name: 'r', scale: size.scale, matrix: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0' },
      { name: 'g', scale: size.scale + 2, matrix: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0' },
      { name: 'b', scale: size.scale + 4, matrix: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0' }
    ];
    const blendInputs = [];
    channels.forEach((c) => {
      const displace = document.createElementNS(SVG_NS, 'feDisplacementMap');
      displace.setAttribute('in', 'SourceGraphic');
      displace.setAttribute('in2', 'map');
      displace.setAttribute('scale', String(-c.scale));
      displace.setAttribute('xChannelSelector', 'R');
      displace.setAttribute('yChannelSelector', 'G');
      displace.setAttribute('result', `d${c.name}`);
      filter.appendChild(displace);

      const matrix = document.createElementNS(SVG_NS, 'feColorMatrix');
      matrix.setAttribute('in', `d${c.name}`);
      matrix.setAttribute('type', 'matrix');
      matrix.setAttribute('values', c.matrix);
      matrix.setAttribute('result', `${c.name}Only`);
      filter.appendChild(matrix);
      blendInputs.push(`${c.name}Only`);
    });

    const blendR = document.createElementNS(SVG_NS, 'feBlend');
    blendR.setAttribute('in', blendInputs[0]);
    blendR.setAttribute('in2', blendInputs[1]);
    blendR.setAttribute('mode', 'screen');
    blendR.setAttribute('result', 'rg');
    filter.appendChild(blendR);

    const blendB = document.createElementNS(SVG_NS, 'feBlend');
    blendB.setAttribute('in', 'rg');
    blendB.setAttribute('in2', blendInputs[2]);
    blendB.setAttribute('mode', 'screen');
    filter.appendChild(blendB);

    defs.appendChild(filter);
    filterIds.set(key, id);
    return id;
  }

  function resolveSizeClass(el, opts) {
    const candidate = (opts && opts.sizeClass) || el.getAttribute(ATTR);
    return SIZE_CLASSES[candidate] ? candidate : DEFAULT_SIZE_CLASS;
  }

  function enhance(el, opts) {
    if (!(el instanceof Element)) return false;
    if (enhanced.has(el)) return true;
    if (!isLiquid() || isReducedMotion()) return false;

    const sizeClass = resolveSizeClass(el, opts);
    const mapName = (opts && opts.map) || DEFAULT_MAP;
    const filterId = ensureFilter(mapName, sizeClass);
    if (!filterId) return false;

    if (el.querySelector(':scope > .' + WARP_CLASS)) stripLayers(el);

    const size = SIZE_CLASSES[sizeClass];
    const warp = document.createElement('span');
    warp.className = WARP_CLASS;
    warp.setAttribute('aria-hidden', 'true');
    warp.style.setProperty(
      '--lg-filter',
      `blur(${size.blur}px) saturate(160%) url(#${filterId})`
    );
    el.insertBefore(warp, el.firstChild);

    OVERLAY_CLASSES.forEach((cls) => {
      const span = document.createElement('span');
      span.className = cls;
      span.setAttribute('aria-hidden', 'true');
      el.appendChild(span);
    });

    el.classList.add('glass--liquid');
    enhanced.add(el);
    return true;
  }

  function stripLayers(el) {
    el.querySelectorAll(':scope > .' + LAYER_CLASSES.join(', :scope > .')).forEach((node) => {
      node.remove();
    });
  }

  function release(el) {
    if (el === undefined) {
      teardown();
      return true;
    }
    if (!(el instanceof Element) || !enhanced.has(el)) return false;
    stripLayers(el);
    el.classList.remove('glass--liquid');
    enhanced.delete(el);
    return true;
  }

  function enhanceAll(root) {
    const scope = root || document;
    scope.querySelectorAll(`[${ATTR}]`).forEach((el) => enhance(el));
  }

  function collectMarked(node) {
    if (!(node instanceof Element)) return [];
    const list = node.matches(`[${ATTR}]`) ? [node] : [];
    return list.concat(Array.from(node.querySelectorAll(`[${ATTR}]`)));
  }

  function startObserver() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.removedNodes.forEach((node) => {
          Array.from(enhanced).filter((el) => node.contains(el)).forEach((el) => release(el));
        });
        record.addedNodes.forEach((node) => {
          collectMarked(node).forEach((el) => enhance(el));
        });
        if (record.type === 'attributes') {
          if (record.target.hasAttribute(ATTR)) {
            enhance(record.target);
          } else {
            release(record.target);
          }
        }
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [ATTR]
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function releaseAll() {
    Array.from(enhanced).forEach((el) => release(el));
  }

  function teardown() {
    stopObserver();
    if (unsubscribeMotion) {
      unsubscribeMotion();
      unsubscribeMotion = null;
    }
    releaseAll();
    document.body.classList.remove(ROOT_CLASS);
  }

  function init() {
    if (!document.body) return;
    if (typeof window.onReducedMotionChange === 'function' && !unsubscribeMotion) {
      unsubscribeMotion = window.onReducedMotionChange((reduced) => {
        if (reduced) {
          releaseAll();
        } else if (isLiquid()) {
          enhanceAll();
        }
      });
    }
    if (!isLiquid()) {
      teardown();
      return;
    }
    document.body.classList.add(ROOT_CLASS);
    startObserver();
    if (!isReducedMotion()) enhanceAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.LiquidGlass = {
    enhance,
    release,
    isLiquid,
    init,
    getGlassStyle
  };
})();
