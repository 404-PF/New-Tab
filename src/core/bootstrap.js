(function () {
  const SCRIPT_BOOTSTRAP_TIMEOUT_MS = 8000;

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
    'src/features/weather.js'
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

  readyWithFallback.then(() => {
    // Kick off all script downloads in parallel. Execution order is preserved
    // because loadScript() sets script.async = false; changing that would break
    // ordering assumptions in scriptSources.
    return Promise.all(scriptSources.map(src =>
      loadScript(src).catch(e => {
        console.error('Failed to load script:', src, e);
        // Swallow the error so other scripts continue loading.
      })
    ));
  }).catch((error) => {
    console.error('Failed to bootstrap New-Tab scripts:', error);
  });
})();
