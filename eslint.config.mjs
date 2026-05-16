import js from '@eslint/js';
import globals from 'globals';

// Cross-file globals shared between src/ scripts loaded via bootstrap.js
const srcGlobals = {
  ...globals.browser,
  chrome: 'readonly',
  // core/utils.js
  visibilityManager: 'readonly',
  VisibilityInterval: 'readonly',
  validateUrl: 'readonly',
  isValidUrl: 'readonly',
  isMalformedUrl: 'readonly',
  isSearchQuery: 'readonly',
  normalizeUrl: 'readonly',
  iconCache: 'readonly',
  translateValidationMessage: 'readonly',
  // core/app-grid-state.js
  AppGridState: 'readonly',
  // core/app-grid-storage.js
  AppGridStorage: 'readonly',
  // core/main.js
  updateTime: 'readonly',
  // core/update-checker.js
  updateChecker: 'readonly',
  // data/motto.js
  mottos: 'readonly',
  // ui/settings.js
  applyBg: 'readonly',
  // features/todo.js
  showToast: 'readonly',
  // ai/*.js
  NetworkDetector: 'readonly',
  OfflineMode: 'readonly',
  OpenRouterAPI: 'readonly',
  AIStore: 'readonly',
  AIRenderer: 'readonly',
};

export default [
  { ignores: ['coverage/', 'node_modules/', '.husky/', '.git/'] },

  js.configs.recommended,

  // Main source files (loaded as scripts via <script> tags)
  {
    files: ['src/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: srcGlobals,
    },
    rules: {
      'no-unused-vars': ['warn', { vars: 'local', args: 'after-used' }],
      'no-console': 'off',
      'no-redeclare': 'off',
      'no-useless-escape': 'off',
      'preserve-caught-error': 'off',
      'no-case-declarations': 'off',
    }
  },

  // src/core/version.js uses module.exports for Node compatibility
  {
    files: ['src/core/version.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...srcGlobals,
        module: 'readonly',
      }
    },
  },

  // Test files (ES modules, jsdom environment)
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.vitest,
        ...srcGlobals,
        chrome: 'readonly',
      }
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'after-used' }],
      'no-console': 'off',
      'no-undef': 'off',
    }
  },

  // Background tools (Node.js CommonJS)
  {
    files: ['background/tools/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      }
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'after-used' }],
      'no-console': 'off',
      'no-undef': 'off',
    }
  },

  // Config files (ES modules in Node.js)
  {
    files: ['eslint.config.mjs', 'vitest.config.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
      }
    }
  }
];
