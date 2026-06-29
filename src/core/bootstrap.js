(function () {
  const SCRIPT_BOOTSTRAP_TIMEOUT_MS = 8000;

  // Safe fallbacks for motion helpers. `src/core/motion.js` overwrites these
  // with the real implementation once it loads, but keeping no-ops here lets
  // the rest of the bootstrap pipeline tolerate a motion.js load failure.
  window.crossfadeDelayMs = window.crossfadeDelayMs || function (duration) {
    return duration;
  };
  window.prefersReducedMotion = window.prefersReducedMotion || function () {
    return false;
  };
  window.onReducedMotionChange = window.onReducedMotionChange || function () {
    return function () {};
  };

  const scriptSources = [
    'src/data/motto.js',
    'src/data/backgrounds.js',
    'src/data/custom-backgrounds.js',
    'src/core/version.js',
    'src/core/utils.js',
    'src/core/motion.js',
    'src/core/dom-ready.js',
    'src/core/app-grid-storage.js',
    'src/core/main.js',
    'src/core/app-grid-state.js',
    // app-manager.js must execute before add-app-modal.js, context-menu.js,
    // and app-folders.js. This ordering currently relies on script.async = false
    // in loadScript(), which preserves insertion/execution order even though
    // Promise.all starts all downloads in parallel.
    'src/ui/app-manager.js',
    'src/features/drag-drop.js',
    'src/ui/add-app-modal.js',
    'src/ui/add-app.js',
    'src/ui/color-picker.js',
    'src/ui/font-picker.js',
    'src/features/interactive-background.js',
    'src/core/languages.js',
    'src/ui/settings.js',
    'src/features/data-manager.js',
    'src/features/context-menu.js',
    'src/features/app-folders.js',
    'src/core/update-checker.js',
    'src/features/onboarding.js',
    'src/features/todo.js',
    'src/features/notes.js',
    'src/features/simple-mode.js',
    'src/ai/network-detector.js',
    'src/ai/offline-mode.js',
    'src/ai/openrouter.js',
    'src/ai/markdown-parser.js',
    'src/ai/ai-store.js',
    'src/ai/ai-renderer.js',
    'src/ai/ai-service.js',
    'src/features/weather.js',
    'src/features/weather-app.js',
    'src/features/background-rotation.js',
    'src/features/shortcuts.js',
    'src/features/auto-theme.js'
  ];

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${source}`));
      document.body.appendChild(script);
    });
  }

  const ready = window.__storageBridgeReady || Promise.resolve();

  // Safety timeout: if the storage bridge never resolves (chrome.storage stall)
  // this race ensures scripts are loaded after a reasonable delay. Without this
  // the New Tab stays permanently blank if __storageBridgeReady hangs.
  let fallbackTimerId;
  const fallbackPromise = new Promise(function (resolve) {
    fallbackTimerId = setTimeout(function () {
      console.warn(
        '[bootstrap] __storageBridgeReady did not resolve within ' +
        (SCRIPT_BOOTSTRAP_TIMEOUT_MS / 1000) + ' s. Forcing script load. ' +
        'Settings may use stale or default values until chrome.storage responds.'
      );
      resolve();
    }, SCRIPT_BOOTSTRAP_TIMEOUT_MS);
  });

  // Clear the fallback timeout when ready resolves or rejects to prevent
  // spurious warnings if ready wins the race
  ready.finally(function () {
    clearTimeout(fallbackTimerId);
  });

  const readyWithFallback = Promise.race([
    ready,
    fallbackPromise
  ]);

  function showErrorOverlay(failedSources) {
    const t = window.i18n && window.i18n.t ? window.i18n.t.bind(window.i18n) : function (_k, fb) { return fb; };

    const overlay = document.createElement('div');
    overlay.id = 'bootstrap-error-overlay';
    overlay.setAttribute('style',
      'position:fixed;inset:0;z-index:99999;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'background:#1a1a2e;color:#e0e0e0;font-family:system-ui,-apple-system,sans-serif;' +
      'padding:2rem;text-align:center;'
    );

    const heading = document.createElement('h2');
    heading.textContent = t('bootstrapErrorTitle', 'Extension failed to load');
    heading.setAttribute('style', 'margin:0 0 1rem;font-size:1.4rem;color:#ff6b6b;');

    const description = document.createElement('p');
    description.textContent = t('bootstrapErrorDesc', 'The following module(s) could not be loaded:');
    description.setAttribute('style', 'margin:0 0 0.75rem;opacity:0.8;');

    const list = document.createElement('ul');
    list.setAttribute('style', 'list-style:none;padding:0;margin:0 0 1.5rem;');
    failedSources.forEach(function (src) {
      const item = document.createElement('li');
      item.textContent = src;
      item.setAttribute('style',
        'font-family:monospace;background:#2d2d44;padding:0.4rem 0.8rem;' +
        'margin:0.3rem 0;border-radius:4px;'
      );
      list.appendChild(item);
    });

    const hint = document.createElement('p');
    hint.textContent = t('bootstrapErrorHint', 'If the problem persists, reinstall the extension.');
    hint.setAttribute('style', 'margin:0;opacity:0.6;font-size:0.9rem;');

    const reloadBtn = document.createElement('button');
    reloadBtn.textContent = t('bootstrapErrorReload', 'Reload');
    reloadBtn.setAttribute('style',
      'margin-top:1rem;padding:0.5rem 1.5rem;border:none;border-radius:6px;' +
      'background:#ff6b6b;color:#fff;font-size:1rem;cursor:pointer;'
    );
    reloadBtn.addEventListener('click', function () { location.reload(); });

    overlay.appendChild(heading);
    overlay.appendChild(description);
    overlay.appendChild(list);
    overlay.appendChild(hint);
    overlay.appendChild(reloadBtn);
    document.body.appendChild(overlay);
  }

  readyWithFallback.then(() => {
    // Kick off all script downloads in parallel. Execution order is preserved
    // because loadScript() sets script.async = false; changing that would break
    // ordering assumptions in scriptSources.
    return Promise.allSettled(scriptSources.map(src => loadScript(src)));
  }).then((results) => {
    const failedSources = [];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        failedSources.push(scriptSources[index]);
        console.error('Failed to load script:', scriptSources[index], result.reason);
      }
    });

    if (failedSources.length > 0) {
      showErrorOverlay(failedSources);
    }
  }).catch((error) => {
    console.error('Failed to bootstrap New-Tab scripts:', error);
  });
})();
