// tests/popup-shell.test.js
// #877: every top-middle pop-up (.toast-notification, .update-notification,
// .manual-check-notification, .eye-care-reminder) shares one shell look in
// css/app.css instead of shipping per-family shell styling.

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
  '.update-notification',
  '.manual-check-notification',
  '.eye-care-reminder',
];

const SHELL_RULE_PATTERN =
  /\.toast-notification,\s*\n\s*\.update-notification,\s*\n\s*\.manual-check-notification,\s*\n\s*\.eye-care-reminder\s*\{([^}]*)\}/;

const SHELL_LIGHT_RULE_PATTERN =
  /body\.light-theme \.toast-notification,\s*\n\s*body\.light-theme \.update-notification,\s*\n\s*body\.light-theme \.manual-check-notification,\s*\n\s*body\.light-theme \.eye-care-reminder\s*\{([^}]*)\}/;

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

describe('Shared top-middle pop-up shell (#877)', () => {
  it('defines one shell rule covering all four pop-up families with the toast look', () => {
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

    // The shared look is written down once: its definition plus the single
    // animation use — never re-declared by a family rule.
    expect(APP_CSS.match(/popupSlideDown/g)).toHaveLength(2);
    expect(FEATURES_CSS).not.toMatch(/popupSlideDown|background:\s*rgba\(0, 0, 0, 0\.9\)/);
  });

  it('keeps only family layout on the per-family rules in css/features.css', () => {
    const update = familyRule('.update-notification');
    familyRuleLacksShell(update, '.update-notification');
    expectDeclaration(update, 'max-width', '400px');
    expectDeclaration(update, 'z-index', '5000');

    const manualCheck = familyRule('.manual-check-notification');
    familyRuleLacksShell(manualCheck, '.manual-check-notification');
    expectDeclaration(manualCheck, 'max-width', '350px');
    expectDeclaration(manualCheck, 'z-index', '4999');

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
    expectDeclaration(toast, 'transform', 'translateX(-50%) translateY(-20px)');
    expect(APP_CSS).toMatch(/\.toast-notification\.show\s*\{\s*\n\s*opacity: 1;/);
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
    SHELL_SELECTORS.slice(0, 3).forEach((selector) => {
      expect(FEATURES_CSS).toContain('body:has(.eye-care-reminder:not([hidden])) ' + selector);
    });
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
    expect(FEATURES_CSS).toMatch(/\.update-notification-content\s*\{[^}]*padding:\s*20px/);
    expect(FEATURES_CSS).toMatch(/\.manual-check-notification-content\s*\{[^}]*padding:\s*16px/);
    expect(FEATURES_CSS).toMatch(/\.eye-care-reminder-content\s*\{/);
    expect(FEATURES_CSS).toMatch(/\.eye-care-ring\s*\{/);
    expect(FEATURES_CSS).toMatch(/\.eye-care-reminder-btn\s*\{[^}]*border-radius:\s*999px/);

    ['toast-error', 'toast-success', 'toast-info', 'toast-warning'].forEach((variant) => {
      expect(APP_CSS).toMatch(
        new RegExp('\\.toast-notification\\.' + variant + '\\s*\\{[^}]*background:')
      );
    });
  });

  it('leaves the manual-check shell colors to CSS instead of inline styles', () => {
    const source = readFileSync(UPDATE_CHECKER_PATH, 'utf-8');
    expect(source).not.toMatch(/notification\.style\.(background|borderColor)/);
    expect(source).not.toMatch(/bgColor/);
  });
});

describe('Manual check notification shell (#877)', () => {
  beforeAll(() => {
    injectScript('src/core/dom-ready.js');
    injectScript('src/core/utils.js');
    injectScript('src/core/update-checker.js');
  });

  beforeEach(() => {
    document.querySelectorAll('.manual-check-notification').forEach((el) => el.remove());
  });

  afterEach(() => {
    window.updateChecker.hideManualCheckNotification();
  });

  it('renders without inline background or border so the shared shell shows through', () => {
    window.updateChecker.showManualCheckNotification('Up to date', 'success');

    const notification = document.querySelector('.manual-check-notification');
    expect(notification).not.toBeNull();
    expect(notification.style.background).toBe('');
    expect(notification.style.borderColor).toBe('');
    expect(notification.querySelector('.manual-check-notification-icon')?.textContent).toBe('✅');
    expect(notification.querySelector('.manual-check-notification-text')?.textContent.trim())
      .toBe('Up to date');
  });
});
