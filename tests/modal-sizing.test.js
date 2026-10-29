// tests/modal-sizing.test.js
// #1073: the ten modal dialogs share one width scale (--modal-width-sm/md/lg/xl
// in css/core.css :root) instead of hand-rolled px pairs. Each dialog pairs its
// step with a viewport-safe cap, min(var(--modal-width-*), calc(100vw - 32px)).
// Heights are deliberately NOT unified: AI chat and games keep 80vh, release
// notes keeps 85vh, and the rest stay content-driven via --overlay-max-height.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CORE_CSS_PATH = resolve(process.cwd(), 'css/core.css');
const FEATURES_CSS_PATH = resolve(process.cwd(), 'css/features.css');
const APP_CSS_PATH = resolve(process.cwd(), 'css/app.css');
const SHELL_CSS_PATH = resolve(process.cwd(), 'css/shell.css');

const CORE_CSS = readFileSync(CORE_CSS_PATH, 'utf-8');
const FEATURES_CSS = readFileSync(FEATURES_CSS_PATH, 'utf-8');
const APP_CSS = readFileSync(APP_CSS_PATH, 'utf-8');
const SHELL_CSS = readFileSync(SHELL_CSS_PATH, 'utf-8');

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

describe('Shared modal width scale (#1073)', () => {
  it('defines the token scale once in the core.css :root and drops the orphaned tokens', () => {
    const root = ruleBody(CORE_CSS, /:root\s*\{([^}]*)\}/, ':root block in css/core.css');

    // toMatch (not the declaration helper): the scale sits behind a block
    // comment, which the helper's (?:^|;) anchor cannot cross.
    expect(root).toMatch(/--modal-width-sm:\s*440px/);
    expect(root).toMatch(/--modal-width-md:\s*560px/);
    expect(root).toMatch(/--modal-width-lg:\s*720px/);
    expect(root).toMatch(/--modal-width-xl:\s*900px/);
    expectDeclaration(root, '--overlay-max-height', 'calc(100vh - 225px)');

    // The pre-scale tokens had zero var() consumers; they must not linger
    // next to the new --modal-width-* names.
    expect(CORE_CSS).not.toMatch(/--modal-width:\s/);
    expect(CORE_CSS).not.toMatch(/--modal-min-height/);
  });

  it('sizes settings from the lg step', () => {
    const body = ruleBody(
      CORE_CSS,
      /#settings-modal > div\s*\{([^}]*)\}/,
      '#settings-modal > div rule in css/core.css'
    );

    expectDeclaration(body, 'width', 'min(var(--modal-width-lg), calc(100vw - 32px))');
    expectDeclaration(body, 'min-width', '280px');
    expectDeclaration(body, 'max-width', 'var(--modal-width-lg)');
    expectDeclaration(body, 'max-height', 'var(--overlay-max-height)');
  });

  it('caps Add App at the md step and stays viewport-safe on narrow windows', () => {
    const body = ruleBody(
      CORE_CSS,
      /#add-app-modal > div\s*\{([^}]*)\}/,
      '#add-app-modal > div rule in css/core.css'
    );

    // Add App used to ship min-width: 500px with no max-width at all, so it
    // overflowed viewports narrower than ~500px.
    expectDeclaration(body, 'max-width', 'min(var(--modal-width-md), calc(100vw - 32px))');
    // The 500px floor is viewport-aware so the cap keeps its 16px gutters on
    // viewports from 501px to 531px, where the floor would otherwise win.
    expectDeclaration(body, 'min-width', 'min(500px, calc(100vw - 32px))');
    expectDeclaration(body, 'max-height', 'var(--overlay-max-height)');

    const mq = FEATURES_CSS.match(
      /@media screen and \(max-width: 500px\) \{(?:[^{}]*\{[^{}]*\}[^{}]*)*\}/
    );
    expect(mq, 'Add App <=500px media block').toBeTruthy();
    expect(mq[0]).toMatch(/#add-app-modal > div\s*\{[^}]*min-width:\s*auto/);
  });

  it('removes the cascade-dead Add App block from shell.css', () => {
    // style.css imports shell.css before core.css, so this same-specificity
    // block was silently overridden and only added confusion.
    expect(SHELL_CSS).not.toMatch(/#add-app-modal/);
  });

  it('keeps todo-edit shrink-to-fit and maps it to the md step', () => {
    const body = ruleBody(
      APP_CSS,
      /#todo-edit-modal > \.todo-edit-modal-content\s*\{([^}]*)\}/,
      '#todo-edit-modal content rule in css/app.css'
    );

    expectDeclaration(body, 'min-width', 'min(400px, calc(100vw - 32px))');
    expectDeclaration(body, 'max-width', 'min(var(--modal-width-md), calc(100vw - 32px))');
    expectDeclaration(body, 'max-height', 'var(--overlay-max-height)');
  });

  it('maps AI chat to the xl step while keeping its deliberate 80vh height', () => {
    const body = ruleBody(
      APP_CSS,
      /\.ai-chat-modal-content\s*\{([^}]*)\}/,
      '.ai-chat-modal-content rule in css/app.css'
    );

    expectDeclaration(body, 'max-width', 'min(var(--modal-width-xl), calc(100vw - 32px))');
    // Heights are intentionally not unified onto --overlay-max-height (#1073).
    expectDeclaration(body, 'height', '80vh');
    expectDeclaration(body, 'max-height', '700px');
  });

  it('maps weather to the md step and keeps its narrow floor', () => {
    const body = ruleBody(
      FEATURES_CSS,
      /\.weather-app-modal-content\s*\{([^}]*)\}/,
      '.weather-app-modal-content rule in css/features.css'
    );

    expectDeclaration(body, 'min-width', 'min(320px, calc(100vw - 32px))');
    expectDeclaration(body, 'max-width', 'min(var(--modal-width-md), calc(100vw - 32px))');
    expectDeclaration(body, 'max-height', 'var(--overlay-max-height)');
  });

  it('maps rename and delete to the sm step and thumbnail to md', () => {
    const rename = ruleBody(
      FEATURES_CSS,
      /#rename-app-modal > div\s*\{([^}]*)\}/,
      '#rename-app-modal > div rule in css/features.css'
    );
    expectDeclaration(rename, 'min-width', '400px');
    expectDeclaration(rename, 'max-width', 'min(var(--modal-width-sm), calc(100vw - 32px))');

    const del = ruleBody(
      FEATURES_CSS,
      /#delete-app-modal > div\s*\{([^}]*)\}/,
      '#delete-app-modal > div rule in css/features.css'
    );
    expectDeclaration(del, 'min-width', '400px');
    expectDeclaration(del, 'max-width', 'min(var(--modal-width-sm), calc(100vw - 32px))');

    const thumbnail = ruleBody(
      FEATURES_CSS,
      /#thumbnail-app-modal > div\s*\{([^}]*)\}/,
      '#thumbnail-app-modal > div rule in css/features.css'
    );
    expectDeclaration(thumbnail, 'min-width', '450px');
    expectDeclaration(thumbnail, 'max-width', 'min(var(--modal-width-md), calc(100vw - 32px))');
  });

  it('maps release notes and games to md while keeping their 85vh/80vh heights', () => {
    const releaseNotes = ruleBody(
      FEATURES_CSS,
      /\.release-notes-dialog\s*\{([^}]*)\}/,
      '.release-notes-dialog rule in css/features.css'
    );
    expectDeclaration(releaseNotes, 'max-width', 'min(var(--modal-width-md), calc(100vw - 32px))');
    expectDeclaration(releaseNotes, 'max-height', '85vh');

    const games = ruleBody(
      FEATURES_CSS,
      /\.games-app-modal-content\s*\{([^}]*)\}/,
      '.games-app-modal-content rule in css/features.css'
    );
    expectDeclaration(games, 'max-width', 'min(var(--modal-width-md), calc(100vw - 32px))');
    expectDeclaration(games, 'max-height', '80vh');
  });

  it('leaves no hand-rolled modal width literals behind', () => {
    // The arbitrary px pairs the scale replaced. Anything still matching here
    // is a modal that forgot to opt into a --modal-width-* step. (600px is
    // absent on purpose: .folder-popup-content is not one of the ten modals
    // and keeps its own literal.) The width: entries guard responsive
    // overrides like the weather modal's retired width: 520px desktop block,
    // which the max-width forms cannot see; min-/max-width floors are
    // excluded from the width: match by the leading [^-\w].
    const stalePairs = [
      /max-width:\s*450px;/,
      /max-width:\s*480px;/,
      /max-width:\s*500px;/,
      /max-width:\s*520px;/,
      /max-width:\s*720px;/,
      /max-width:\s*900px;/,
      /(?:^|[^-\w])width:\s*(?:450|480|500|520|720|900)px;/,
      /width:\s*min\(720px, calc\(100vw - 32px\)\)/,
    ];
    const combined = CORE_CSS + FEATURES_CSS + APP_CSS;
    stalePairs.forEach((pattern) => {
      expect(combined, String(pattern)).not.toMatch(pattern);
    });
  });
});
