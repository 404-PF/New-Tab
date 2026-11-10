// src/ui/liquid-glass.js - Liquid glass core: structure injection, shared SVG
// filter registry, capability probe, and MutationObserver pickup.
//
// Liquid Glass is an enhancement of the dark and light themes. It is on unless
// the Settings > Themes toggle (localStorage `liquidGlassEnabled`) is 'false'.
// When the toggle is off or the probe fails, enhance() does nothing and init()
// tears down any existing glass.
//
// Consumers mark elements with `data-liquid-glass="icon|panel|pill"` (or call
// `LiquidGlass.enhance(el, opts)`); the observer enhances marked elements that
// are added to the DOM later, such as JS-built popovers. The T1 hero widgets
// (search, motto, weather, clock, focus indicator) and the app icons mark
// themselves through markHeroWidgets()/markAppIcons().

(function () {
  'use strict';

  const LIQUID_GLASS_ENABLED = true;
  const STORAGE_KEY = 'liquidGlassEnabled';
  const ATTR = 'data-liquid-glass';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DEFS_ID = 'liquid-glass-defs';
  const WARP_CLASS = 'glass__warp';
  const OVERLAY_CLASSES = ['glass__highlight', 'glass__over-light', 'glass__hover'];
  const LAYER_CLASSES = [WARP_CLASS, ...OVERLAY_CLASSES];
  const ROOT_CLASS = 'glass-liquid';

  const SIZE_CLASSES = {
    icon: { mapSize: 128, radius: 24, scale: 12, blur: 1 },
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
      return localStorage.getItem(STORAGE_KEY) === 'false' ? 'classic' : 'liquid';
    } catch (e) {
      console.warn('Failed to read Liquid Glass setting:', e);
      return 'liquid';
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
    return LIQUID_GLASS_ENABLED && getGlassStyle() === 'liquid' && getProbe().supported;
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

  // #1066: the on-page todo widget is relocated into the app modal while it
  // is open; a warp layer there would nest inside the modal surface's
  // backdrop-filter and sample it instead of the page. #1159: a marked child
  // never enhances inside an already enhanced ancestor for the same reason —
  // its warp would refract the ancestor's warped output, not the page.
  function isExcluded(el) {
    if (el.closest('#todo-app-widget-host')) return true;
    const parent = el.parentElement;
    return Boolean(parent) && Boolean(parent.closest('.glass--liquid'));
  }

  function enhance(el, opts) {
    if (!(el instanceof Element)) return false;
    if (isExcluded(el)) {
      release(el);
      return false;
    }
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
    // #1159: an ancestor can be marked after a child is already enhanced (the
    // observer only enhances the element that changed), which would leave both
    // warp layers active. Release enhanced descendants now that this element
    // is a backdrop root for them.
    Array.from(enhanced).forEach((child) => {
      if (child !== el && el.contains(child)) release(child);
    });
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
    if (!(el instanceof Element)) return false;
    cancelEntranceWaiter(el);
    if (!enhanced.has(el)) return false;
    stripLayers(el);
    el.classList.remove('glass--liquid');
    enhanced.delete(el);
    return true;
  }

  function enhanceAll(root) {
    const scope = root || document;
    scope.querySelectorAll(`[${ATTR}]`).forEach((el) => enhance(el));
  }

  // Runs cb once el's fadeSlideUp* entrance animation has finished. Events
  // bubbling from children or for other animations are ignored, and pending
  // callbacks are tracked so teardown can cancel them (#1157).
  const entranceWaiters = new Map();

  function whenEntranceSettled(el, cb) {
    if (entranceWaiters.has(el)) return;
    const onSettled = (e) => {
      if (e.target !== el || !/^fadeSlideUp/.test(e.animationName || '')) return;
      el.removeEventListener('animationend', onSettled);
      el.removeEventListener('animationcancel', onSettled);
      entranceWaiters.delete(el);
      cb();
    };
    entranceWaiters.set(el, onSettled);
    el.addEventListener('animationend', onSettled);
    el.addEventListener('animationcancel', onSettled);
  }

  // Dropping an element (marker removed, node detached, teardown) must also
  // drop its pending entrance callback, otherwise the waiter can enhance it
  // again after the observer released it.
  function cancelEntranceWaiter(el) {
    const onSettled = entranceWaiters.get(el);
    if (!onSettled) return;
    el.removeEventListener('animationend', onSettled);
    el.removeEventListener('animationcancel', onSettled);
    entranceWaiters.delete(el);
  }

  // Widgets such as #weather-widget rebuild their innerHTML and reset their
  // className on every render, wiping the injected layers and the marker
  // class; rebuild them so the warp survives a data update (#1157).
  function restoreLayers(el) {
    if (!enhanced.has(el)) return;
    const warp = el.querySelector(':scope > .' + WARP_CLASS);
    if (warp && el.classList.contains('glass--liquid')) return;
    release(el);
    if (!isLiquid() || isReducedMotion()) return;
    if (hasEntranceAnimation(el)) {
      whenEntranceSettled(el, () => {
        // The marker can be removed while the entrance is still running;
        // never restore layers onto an element the observer already released.
        if (el.hasAttribute(ATTR) && isLiquid() && !isReducedMotion()) enhance(el);
      });
      return;
    }
    enhance(el);
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
          // release() only covers enhanced elements; a detached hero whose
          // entrance waiter is still pending must drop that waiter too,
          // otherwise the removed subtree stays retained in the map.
          Array.from(entranceWaiters.keys())
            .filter((el) => node.contains(el))
            .forEach((el) => cancelEntranceWaiter(el));
        });
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) markAppIcons(node);
          collectMarked(node).forEach((el) => enhance(el));
        });
        if (record.type === 'attributes') {
          if (record.target.hasAttribute(ATTR)) {
            enhance(record.target);
          } else {
            release(record.target);
          }
        } else if (record.target instanceof Element) {
          // childList: an enhanced element whose children were swapped out
          // (weather re-render, icon badge rebuild) needs its layers back.
          restoreLayers(record.target);
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

  // ---- T3 app icons -------------------------------------------------------

  const ICON_SELECTOR = '#app-grid .app-icon .icon';
  let iconListenerAttached = false;

  function isGridRendered() {
    return !!(window.__appGridState && window.__appGridState.phase === 'rendered');
  }

  function markAppIcons(root) {
    if (!isGridRendered() || !isLiquid() || isReducedMotion()) return;
    if (hasEntranceAnimation(document.getElementById('app-grid'))) return;
    const scope = root || document;
    const icons = scope.querySelectorAll ? Array.from(scope.querySelectorAll(ICON_SELECTOR)) : [];
    if (scope.matches && scope.matches(ICON_SELECTOR)) icons.push(scope);
    icons.forEach((icon) => {
      if (!icon.hasAttribute(ATTR)) icon.setAttribute(ATTR, 'icon');
    });
  }

  function hasEntranceAnimation(el) {
    if (!el || typeof el.getAnimations !== 'function') return false;
    return el.getAnimations().some((a) => /^fadeSlideUp/.test(a.animationName || ''));
  }

  // Icons are enhanced only after the grid entrance animation has finished so
  // the warped backdrop never runs during fadeSlideUp.
  function enhanceIconsWhenSettled() {
    const grid = document.getElementById('app-grid');
    if (grid && hasEntranceAnimation(grid)) {
      const cleanup = () => {
        grid.removeEventListener('animationend', done);
        grid.removeEventListener('animationcancel', done);
      };
      const done = (e) => {
        if (e.target !== grid || !/^fadeSlideUp/.test(e.animationName || '')) return;
        cleanup();
        markAppIcons();
      };
      grid.addEventListener('animationend', done);
      grid.addEventListener('animationcancel', done);
      return;
    }
    markAppIcons();
  }

  function onAppGridReady() {
    enhanceIconsWhenSettled();
  }

  function startIcons() {
    if (!iconListenerAttached) {
      window.addEventListener('appGridReady', onAppGridReady);
      iconListenerAttached = true;
    }
    if (isGridRendered()) enhanceIconsWhenSettled();
  }

  function stopIcons() {
    if (iconListenerAttached) {
      window.removeEventListener('appGridReady', onAppGridReady);
      iconListenerAttached = false;
    }
    document.querySelectorAll(ICON_SELECTOR + `[${ATTR}]`).forEach((icon) => {
      icon.removeAttribute(ATTR);
    });
  }

  // ---- T1 hero widgets + mouse elasticity --------------------------------

  // The five tier-1 hero surfaces (#1157) are marked with their own size
  // class so enhanceAll()/the observer inject the glass layers exactly like
  // the app icons; the same selectors drive mouse elasticity.
  const HERO_GLASS = [
    { selector: '.search-bar-wrapper', sizeClass: 'pill' },
    { selector: '#motto-container', sizeClass: 'panel' },
    { selector: '#weather-widget', sizeClass: 'panel' },
    { selector: '#clock', sizeClass: 'panel' },
    { selector: '#focus-mode-indicator', sizeClass: 'pill' }
  ];
  const ELASTIC_SELECTORS = HERO_GLASS.map((hero) => hero.selector);
  const ELASTIC_RADIUS = 320;
  const ELASTIC_MAX = 6;
  const SPRING = 0.14;
  const DAMPING = 0.72;
  const SETTLE = 0.05;

  // el -> { x, y, vx, vy, tx, ty }
  const springs = new Map();
  let pointer = null;
  let frame = 0;
  let elasticityOn = false;
  let unsubscribeVisibility = null;
  let pageVisible = true;

  function isDragging() {
    return document.body.classList.contains('glass-drag-active');
  }

  function isFrozen(el) {
    return isDragging() || hasEntranceAnimation(el);
  }

  function canAnimate() {
    return elasticityOn && pageVisible && !isReducedMotion() && isLiquid() && !isDragging();
  }

  function applyOffset(el, x, y) {
    // Individual `translate` composes with existing `transform` (for example
    // the translateX(-50%) centering on #motto-container).
    if (Math.abs(x) < SETTLE && Math.abs(y) < SETTLE) {
      el.style.removeProperty('translate');
    } else {
      el.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
    }
  }

  function computeTarget(el) {
    if (!pointer || isFrozen(el)) return { tx: 0, ty: 0 };
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return { tx: 0, ty: 0 };
    const s = springs.get(el);
    const dx = pointer.x - (rect.left + rect.width / 2 - (s ? s.x : 0));
    const dy = pointer.y - (rect.top + rect.height / 2 - (s ? s.y : 0));
    const dist = Math.hypot(dx, dy);
    if (dist > ELASTIC_RADIUS || dist === 0) return { tx: 0, ty: 0 };
    const pull = (1 - dist / ELASTIC_RADIUS) * ELASTIC_MAX;
    return { tx: (dx / dist) * pull, ty: (dy / dist) * pull };
  }

  function step() {
    frame = 0;
    if (!canAnimate()) {
      resetElasticity();
      return;
    }
    let moving = false;
    springs.forEach((s, el) => {
      const { tx, ty } = computeTarget(el);
      s.vx = (s.vx + (tx - s.x) * SPRING) * DAMPING;
      s.vy = (s.vy + (ty - s.y) * SPRING) * DAMPING;
      s.x += s.vx;
      s.y += s.vy;
      const settled = Math.abs(s.vx) < 0.01 && Math.abs(s.vy) < 0.01 &&
        Math.abs(tx - s.x) < SETTLE && Math.abs(ty - s.y) < SETTLE;
      if (settled) {
        s.x = tx;
        s.y = ty;
        s.vx = 0;
        s.vy = 0;
      } else {
        moving = true;
      }
      applyOffset(el, s.x, s.y);
    });
    if (moving) schedule();
  }

  function schedule() {
    if (!frame && canAnimate()) frame = requestAnimationFrame(step);
  }

  function onPointerMove(e) {
    pointer = { x: e.clientX, y: e.clientY };
    schedule();
  }

  function onPointerLeave() {
    pointer = null;
    schedule();
  }

  function resetElasticity() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    springs.forEach((s, el) => {
      s.x = s.y = s.vx = s.vy = 0;
      el.style.removeProperty('translate');
    });
  }

  function startElasticity() {
    if (elasticityOn) return;
    elasticityOn = true;
    ELASTIC_SELECTORS.forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) springs.set(el, { x: 0, y: 0, vx: 0, vy: 0 });
    });
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('dragstart', resetElasticity);
    pageVisible = !(window.visibilityManager && window.visibilityManager.isVisible === false);
    if (window.visibilityManager && typeof window.visibilityManager.onChange === 'function') {
      unsubscribeVisibility = window.visibilityManager.onChange((visible) => {
        pageVisible = visible;
        if (!visible) {
          resetElasticity();
        }
      });
    }
  }

  function stopElasticity() {
    if (!elasticityOn) return;
    resetElasticity();
    elasticityOn = false;
    springs.clear();
    pointer = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.documentElement.removeEventListener('pointerleave', onPointerLeave);
    document.removeEventListener('dragstart', resetElasticity);
    if (unsubscribeVisibility) {
      unsubscribeVisibility();
      unsubscribeVisibility = null;
    }
  }

  // Marks the hero widgets with their size class (like markAppIcons does for
  // tiles) so the observer/enhanceAll inject the layers. A widget still
  // running its fadeSlideUp entrance waits for animationend first so the warp
  // never renders mid-entrance (#1157).
  function markHeroWidgets() {
    if (!isLiquid() || isReducedMotion()) return;
    HERO_GLASS.forEach((hero) => {
      const el = document.querySelector(hero.selector);
      if (!el || el.hasAttribute(ATTR) || entranceWaiters.has(el)) return;
      if (hasEntranceAnimation(el)) {
        whenEntranceSettled(el, () => {
          if (isLiquid() && !isReducedMotion() && !el.hasAttribute(ATTR)) {
            el.setAttribute(ATTR, hero.sizeClass);
          }
        });
        return;
      }
      el.setAttribute(ATTR, hero.sizeClass);
    });
  }

  // Drops the markers the hero widgets gained so Classic mode is left with
  // the plain markup and no liquid-glass state.
  function stopHeroWidgets() {
    entranceWaiters.forEach((onSettled, el) => {
      el.removeEventListener('animationend', onSettled);
      el.removeEventListener('animationcancel', onSettled);
    });
    entranceWaiters.clear();
    ELASTIC_SELECTORS.forEach((sel) => {
      document.querySelectorAll(`${sel}[${ATTR}]`).forEach((el) => {
        el.removeAttribute(ATTR);
      });
    });
  }

  function teardown() {
    stopObserver();
    stopIcons();
    stopHeroWidgets();
    stopElasticity();
    if (unsubscribeMotion) {
      unsubscribeMotion();
      unsubscribeMotion = null;
    }
    releaseAll();
    document.body.classList.remove(ROOT_CLASS);
  }

  function syncSettingsCard() {
    const checkbox = document.getElementById('liquid-glass-setting');
    const card = checkbox && checkbox.closest('.setting-card');
    if (card) card.hidden = !getProbe().supported;
  }

  function onStorageChange(e) {
    if (e.key !== STORAGE_KEY) return;
    const checkbox = document.getElementById('liquid-glass-setting');
    if (checkbox) checkbox.checked = getGlassStyle() === 'liquid';
    init();
  }

  function init() {
    if (!document.body) return;
    syncSettingsCard();
    if (typeof window.onReducedMotionChange === 'function' && !unsubscribeMotion) {
      unsubscribeMotion = window.onReducedMotionChange((reduced) => {
        if (reduced) {
          // Same cleanup as Classic: drop the hero markers too, otherwise
          // :where(body.glass-liquid [data-liquid-glass]) keeps applying the
          // relative-position rule to every hero while the effect is off.
          stopHeroWidgets();
          releaseAll();
          stopElasticity();
        } else if (isLiquid()) {
          markAppIcons();
          markHeroWidgets();
          enhanceAll();
          startElasticity();
        }
      });
    }
    if (!isLiquid()) {
      teardown();
      return;
    }
    document.body.classList.add(ROOT_CLASS);
    startObserver();
    startIcons();
    if (!isReducedMotion()) {
      markHeroWidgets();
      enhanceAll();
      startElasticity();
    }
  }

  window.addEventListener('storage', onStorageChange);

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
