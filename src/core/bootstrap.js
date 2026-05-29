(function () {
  const scriptSources = [
    'src/data/motto.js',
    'src/data/backgrounds.js',
    'src/data/custom-backgrounds.js',
    'src/core/version.js',
    'src/core/utils.js',
    'src/core/dom-ready.js',
    'src/core/app-grid-storage.js',
    'src/core/main.js',
    'src/core/app-grid-state.js',
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
  ready.then(() => {
    // Kick off all script downloads in parallel (async=false ensures execution
    // order is preserved), wrapping each in try-catch so one failure doesn't
    // block subsequent scripts from loading.
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
