// tests/popup-shell.test.js
// #877/#890: every top-middle pop-up (.toast-notification, .eye-care-reminder)
// shares one shell look in css/app.css instead of shipping per-family shell
// styling. #890 folded the update and manual-check banners into the toast
// family, so only the toast and the interactive eye-care reminder remain.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';

const APP_CSS_PATH = resolve(process.cwd(), 'css/app.css');
const FEATURES_CSS_PATH = resolve(process.cwd(), 'css/features.css');
const UPDATE_CHECKER_PATH = resolve(process.cwd(), 'src/core/update-checker.js');

const APP_CSS = readFileSync(APP_CSS_PATH, 'utf-8');
const FEATURES_CSS = readFileSync(FEATURES_CSS_PATH, 'utf-8');

const SHELL_SELECTORS = [
  '.toast-notification',
  '.eye-care-reminder',
];

const RETIRED_FAMILIES = [
  '.update-notification',
  '.manual-check-notification',
];

const SHELL_RULE_PATTERN =
  /\.toast-notification,\s*\n\s*\.eye-care-reminder\s*\{([^}]*)\}/;

const SHELL_LIGHT_RULE_PATTERN =
  /body\.light-theme \.toast-notification,\s*\n\s*body\.light-theme \.eye-care-reminder\s*\{([^}]*)\}/;

const SHELL_PROPERTIES = [
  'position',
  'top',
  'left',
  'transform',
  'background',
  'backdrop-filter',
  'border',
  'border-radius',
  'box-shadow',
  'color',
  'font-size',
  'font-weight',
  'animation',
  'transition',
];

function ruleBody(css, pattern, label = 'CSS rule') {
  const match = css.match(pattern);
  expect(match, 'Missing ' + label).toBeTruthy();
  return match[1];
}

function declaration(body, property) {
  const match = body.match(
    new RegExp('(?:^|;)\\s*' + property + '\\s*:\\s*([^;}]*)\\s*(?:;|$)')
  );
  return match ? match[1].trim() : null;
}

function expectDeclaration(body, property, expected) {
  expect(declaration(body, property), property).toBe(expected);
}

function familyRule(selector) {
  return ruleBody(
    FEATURES_CSS,
    new RegExp('(?:^|\\n)' + selector.replace('.', '\\.') + '\\s*\\{([^}]*)\\}', 'm'),
    selector + ' rule in css/features.css'
  );
}

function familyRuleLacksShell(body, selector) {
  SHELL_PROPERTIES.forEach((property) => {
    expect(declaration(body, property), selector + ' ' + property).toBeNull();
  });
}

describe('Shared top-middle pop-up shell (#877, #890)', () => {
  it('defines one shell rule covering both remaining pop-up families with the toast look', () => {
    const body = ruleBody(APP_CSS, SHELL_RULE_PATTERN, 'shared shell rule in css/app.css');

    expectDeclaration(body, 'position', 'fixed');
    expectDeclaration(body, 'top', '20px');
    expectDeclaration(body, 'left', '50%');
    expectDeclaration(body, 'transform', 'translateX(-50%)');
    expectDeclaration(body, 'background', 'rgba(0, 0, 0, 0.9)');
    expectDeclaration(body, 'backdrop-filter', 'blur(16px)');
    expectDeclaration(body, '-webkit-backdrop-filter', 'blur(16px)');
    expectDeclaration(body, 'color', 'white');
    expectDeclaration(body, 'border', '1px solid rgba(255, 255, 255, 0.1)');
    expectDeclaration(body, 'border-radius', '12px');
    expectDeclaration(body, 'box-shadow', '0 4px 16px rgba(0, 0, 0, 0.3)');
    expectDeclaration(body, 'font-size', '14px');
    expectDeclaration(body, 'font-weight', '500');
    expectDeclaration(body, 'animation', 'popupSlideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)');
    expectDeclaration(body, 'transition', 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)');

    // The shared look is written down once: never re-declared by a family rule.
    expect(FEATURES_CSS).not.toMatch(/popupSlideDown|background:\s*rgba\(0, 0, 0, 0\.9\)/);
  });

  it('drops the retired update and manual-check notification families entirely (#890)', () => {
    RETIRED_FAMILIES.forEach((selector) => {
      const escaped = selector.replace('.', '\\.');
      expect(APP_CSS).not.toMatch(new RegExp(escaped));
      expect(FEATURES_CSS).not.toMatch(new RegExp('(?:^|\\n)' + escaped + '\\s*\\{'));
    });
  });

  it('keeps only family layout on the per-family rules in css/features.css', () => {
    const eyeCare = familyRule('.eye-care-reminder');
    familyRuleLacksShell(eyeCare, '.eye-care-reminder');
    expectDeclaration(eyeCare, 'width', 'min(560px, calc(100vw - 32px))');
    expectDeclaration(eyeCare, 'z-index', '5001');
  });

  it('keeps the toast-only mechanics layered on top of the shell', () => {
    const toast = ruleBody(
      APP_CSS,
      /(?:^|\n)\.toast-notification\s*\{([^}]*)\}/m,
      '.toast-notification rule in css/app.css'
    );

    expectDeclaration(toast, 'padding', '12px 24px');
    expectDeclaration(toast, 'z-index', '4000');
    expectDeclaration(toast, 'opacity', '0');
    expectDeclaration(toast, 'animation', 'none');
    expectDeclaration(toast, 'transform', 'translateX(-50%) translateY(-20px)');
    expect(APP_CSS).toMatch(/\.toast-notification\.show\s*\{\s*\n\s*opacity: 1;/);
  });

  it('re-enables pointer events on the optional toast action only (#890)', () => {
    const action = ruleBody(
      APP_CSS,
      /(?:^|\n)\.toast-notification \.toast-action\s*\{([^}]*)\}/m,
      '.toast-action rule in css/app.css'
    );

    expectDeclaration(action, 'pointer-events', 'auto');
  });

  it('drops the superseded per-family keyframes for the shared animation', () => {
    expect(FEATURES_CSS).not.toMatch(
      /updateNotificationSlideIn|manualCheckNotificationSlideIn|eye-care-reminder-slide-down/
    );
    expect(APP_CSS).toMatch(/@keyframes popupSlideDown\s*\{/);
    expect(APP_CSS).toMatch(
      /from\s*\{\s*\n\s*opacity: 0;\s*\n\s*transform: translate\(-50%, -20px\);/
    );
  });

  it('collapses the light-theme shell overrides into one shared rule', () => {
    const body = ruleBody(
      APP_CSS,
      SHELL_LIGHT_RULE_PATTERN,
      'shared light-theme shell rule in css/app.css'
    );

    expectDeclaration(body, 'background', 'rgba(255, 255, 255, 0.95)');
    expectDeclaration(body, 'color', '#1f2937');
    expectDeclaration(body, 'border-color', 'rgba(0, 0, 0, 0.1)');
    expectDeclaration(body, 'box-shadow', '0 4px 16px rgba(0, 0, 0, 0.1)');

    expect(FEATURES_CSS).not.toMatch(/body\.light-theme \.update-notification\s*\{/);
    expect(FEATURES_CSS).not.toMatch(/body\.light-theme \.manual-check-notification\s*\{/);
    expect(FEATURES_CSS).not.toMatch(/body\.light-theme \.eye-care-reminder\s*\{/);

    // Per-type toast colors still win over the shared light shell.
    ['toast-error', 'toast-success', 'toast-info', 'toast-warning'].forEach((variant) => {
      expect(APP_CSS).toMatch(
        new RegExp('body\\.light-theme \\.toast-notification\\.' + variant + '\\s*\\{[^}]*background:')
      );
    });
  });

  it('preserves the eye-care push-down on the shared anchor', () => {
    expect(FEATURES_CSS).toMatch(
      /body:has\(\.eye-care-reminder:not\(\[hidden\]\)\)[^{}]*\{[^}]*top: 160px;/
    );
    expect(FEATURES_CSS).toMatch(
      /body:has\(\.eye-care-reminder:not\(\[hidden\]\)\)[^{}]*\{[^}]*top: 220px;/
    );
    expect(FEATURES_CSS).toContain('body:has(.eye-care-reminder:not([hidden])) .toast-notification');
  });

  it('disables the shared shell motion under prefers-reduced-motion', () => {
    const reducedBlocks = [...APP_CSS.matchAll(
      /@media \(prefers-reduced-motion: reduce\) \{(?:[^{}]|\{[^{}]*\})*\}/g
    )].map((match) => match[0]);
    const shellBlock = reducedBlocks.find((block) => block.includes('.eye-care-reminder {'));

    expect(shellBlock, 'reduced-motion rule for the shared shell').toBeTruthy();
    SHELL_SELECTORS.forEach((selector) => expect(shellBlock).toContain(selector));
    expect(shellBlock).toMatch(/animation:\s*none/);
    expect(shellBlock).toMatch(/transition:\s*none/);

    const shellIndex = APP_CSS.indexOf('/* Shared shell for every top-middle pop-up');
    expect(APP_CSS.indexOf(shellBlock)).toBeGreaterThan(shellIndex);
  });

  it('keeps the content layouts that legitimately differ', () => {
    expect(FEATURES_CSS).toMatch(/\.eye-care-reminder-content\s*\{[^}]*padding:\s*12px 24px/);
    expect(FEATURES_CSS).toMatch(/\.eye-care-ring\s*\{/);
    expect(FEATURES_CSS).toMatch(/\.eye-care-reminder-btn\s*\{[^}]*border-radius:\s*12px/);
    expect(FEATURES_CSS).not.toMatch(/\.eye-care-reminder-btn\s*\{[^}]*border-radius:\s*999px/);

    ['toast-error', 'toast-success', 'toast-info', 'toast-warning'].forEach((variant) => {
      expect(APP_CSS).toMatch(
        new RegExp('\\.toast-notification\\.' + variant + '\\s*\\{[^}]*background:')
      );
    });
  });

  it('paints the eye-care reminder with the info variant at an AA-passing blue (#890)', () => {
    expect(FEATURES_CSS).toMatch(
      /\.eye-care-reminder\.eye-care-reminder-info\s*\{[^}]*background:\s*rgba\(21, 101, 192, 0\.95\)/
    );
    expect(FEATURES_CSS).toMatch(
      /body\.light-theme \.eye-care-reminder\.eye-care-reminder-info\s*\{[^}]*background:\s*rgba\(21, 101, 192, 0\.95\)/
    );
    expect(FEATURES_CSS).toMatch(
      /\.eye-care-reminder-text\s*\{[^}]*color:\s*rgba\(255, 255, 255, 0\.95\)/
    );
  });

  it('leaves the manual-check shell colors to CSS instead of inline styles', () => {
    const source = readFileSync(UPDATE_CHECKER_PATH, 'utf-8');
    expect(source).not.toMatch(/notification\.style\.(background|borderColor)/);
  });

  it('builds update-checker UI with DOM APIs instead of innerHTML (#890)', () => {
    const source = readFileSync(UPDATE_CHECKER_PATH, 'utf-8');
    expect(source).not.toMatch(/innerHTML/);
  });
});

describe('Manual check notification via the toast provider (#890)', () => {
  beforeAll(() => {
    injectScript('src/core/dom-ready.js');
    injectScript('src/core/utils.js');
    injectScript('src/core/toast.js');
    injectScript('src/core/update-checker.js');
  });

  beforeEach(() => {
    document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
    window.updateChecker.hideManualCheckNotification();
    window.updateChecker.hideUpdateNotification();
  });

  afterEach(() => {
    window.updateChecker.hideManualCheckNotification();
    window.updateChecker.hideUpdateNotification();
  });

  it('renders as a semantic toast without an emoji icon or Dismiss button', () => {
    window.updateChecker.showManualCheckNotification('Up to date', 'success');

    const toast = document.querySelector('.toast-notification');
    expect(toast).not.toBeNull();
    expect(toast.classList.contains('toast-success')).toBe(true);
    expect(toast.textContent).toBe('Up to date');
    expect(toast.querySelector('.toast-action')).toBeNull();
  });

  it('maps every manual-check result type onto a toast variant', () => {
    const cases = [
      ['success', 'toast-success'],
      ['warning', 'toast-warning'],
      ['error', 'toast-error'],
      ['info', 'toast-info'],
    ];

    cases.forEach(([type, variant]) => {
      window.updateChecker.showManualCheckNotification('result', type);
      expect(
        document.querySelector('.toast-notification.' + variant),
        variant
      ).not.toBeNull();
      window.updateChecker.hideManualCheckNotification();
      document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
    });
  });

  it('gives the update notification a View Release action that opens the release URL', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      window.updateChecker.showUpdateNotification({
        version: '2.0.0',
        url: 'https://example.com/release'
      });

      const toast = document.querySelector('.toast-notification.toast-info');
      expect(toast).not.toBeNull();
      expect(toast.textContent).toContain('New-Tab v2.0.0 is now available.');

      const action = toast.querySelector('.toast-action');
      expect(action).not.toBeNull();
      expect(action.textContent).toBe('View Release');

      action.click();
      expect(openSpy).toHaveBeenCalledWith('https://example.com/release', '_blank');
      // The action dismisses its own toast.
      expect(document.querySelector('.toast-notification')).toBeNull();
    } finally {
      openSpy.mockRestore();
      window.updateChecker.hideUpdateNotification();
    }
  });

  it('hideUpdateNotification dismisses only its own toast, not an unrelated one', () => {
    window.updateChecker.showUpdateNotification({
      version: '2.0.0',
      url: 'https://example.com'
    });
    const updateToast = document.querySelector('.toast-notification');
    expect(updateToast).not.toBeNull();

    window.showToast('unrelated toast', 'error');
    const unrelatedToast = document.querySelector('.toast-notification');
    expect(unrelatedToast).not.toBe(updateToast);

    window.updateChecker.hideUpdateNotification();
    expect(document.querySelector('.toast-notification')).toBe(unrelatedToast);

    unrelatedToast.remove();
  });
});
