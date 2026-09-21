import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installFlappyBirdTestEnvironment } from './helpers/flappy-bird-test-env.js';

const FEATURES_CSS_PATH = resolve(process.cwd(), 'css/features.css');

beforeAll(() => {
  installFlappyBirdTestEnvironment(vi);
});

afterEach(() => {
  window.GameRegistry?.destroyCurrent?.();
  document.body.innerHTML = '';
  document.head.querySelectorAll('style[data-flappy-layout-test]').forEach((style) => style.remove());
});

afterAll(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function escapeRegex(value) {
  return value.replace(/[.*+?^()|[\]\\]/g, '\\$&');
}

function getRuleBody(css, selector) {
  const match = css.match(new RegExp('(?:^|\\n)' + escapeRegex(selector) + '\\s*\\{([^}]*)\\}', 'm'));
  expect(match, 'Missing CSS rule for ' + selector).toBeTruthy();
  return match[1];
}

function getDeclaration(ruleBody, property) {
  const match = ruleBody.match(
    new RegExp('(?:^|;)\\s*' + escapeRegex(property) + '\\s*:\\s*([^;}]*)\\s*(?:;|$)')
  );
  return match ? match[1].trim() : null;
}

function expectDeclaration(ruleBody, property, expected) {
  expect(getDeclaration(ruleBody, property)).toBe(expected);
}

function installRelevantStyles(css) {
  const selectors = [
    '.games-hub-content',
    '.games-hub-content:has(.games-flappy-stage)',
    '.games-hub-content:has(.games-flappy-stage) #games-game-container',
    '.games-hub-content:has(.games-flappy-stage) .games-flappy-stage',
    '.games-hub-content:has(.games-flappy-stage) .games-flappy-canvas'
  ];

  const style = document.createElement('style');
  style.dataset.flappyLayoutTest = 'true';
  style.textContent = selectors
    .map((selector) => selector + ' { ' + getRuleBody(css, selector) + ' }')
    .join('\n');
  document.head.appendChild(style);
}

function mountFlappyModalView() {
  const hub = document.createElement('div');
  hub.className = 'games-hub-content';

  const header = document.createElement('div');
  header.className = 'games-game-header';

  const gameContainer = document.createElement('div');
  gameContainer.id = 'games-game-container';

  hub.append(header, gameContainer);
  document.body.appendChild(hub);

  expect(window.GameRegistry.launch('flappy-bird')).toBe(true);

  return {
    hub,
    header,
    gameContainer,
    stage: gameContainer.querySelector('.games-flappy-stage'),
    canvas: gameContainer.querySelector('.games-flappy-canvas')
  };
}

describe('Flappy Bird modal layout (#741)', () => {
  // JSDOM resolves CSS selectors and computed declarations but does not perform
  // browser layout, so this suite verifies mounted DOM/style containment rather
  // than pixel-level bounding-box scaling.
  it('applies the scoped viewport rule to the mounted Flappy Bird DOM', () => {
    const css = readFileSync(FEATURES_CSS_PATH, 'utf-8');
    installRelevantStyles(css);

    const { hub, gameContainer, stage, canvas } = mountFlappyModalView();

    expect(stage).not.toBeNull();
    expect(canvas).not.toBeNull();
    expect(stage.parentElement).toBe(gameContainer);
    expect(stage.closest('.games-hub-content')).toBe(hub);
    expect(gameContainer.id).toBe('games-game-container');
    expect(window.GameRegistry.getCurrentGame()).toBe(window.GameRegistry.get('flappy-bird'));

    const hubStyle = window.getComputedStyle(hub);
    expect(hubStyle.display).toBe('flex');
    expect(hubStyle.flexDirection).toBe('column');
    expect(hubStyle.minHeight).toBe('0px');
    expect(hubStyle.overflow).toBe('hidden');

    const containerStyle = window.getComputedStyle(gameContainer);
    expect(containerStyle.display).toBe('flex');
    expect(containerStyle.flex).toBe('1 1 auto');
    expect(containerStyle.minHeight).toBe('0px');
    expect(containerStyle.overflow).toBe('hidden');

    const stageStyle = window.getComputedStyle(stage);
    expect(stageStyle.display).toBe('flex');
    expect(stageStyle.flex).toBe('1 1 auto');
    expect(stageStyle.minHeight).toBe('0px');
    expect(stageStyle.alignItems).toBe('center');
    expect(stageStyle.justifyContent).toBe('center');

    const canvasStyle = window.getComputedStyle(canvas);
    expect(canvasStyle.maxWidth).toBe('100%');
    expect(canvasStyle.maxHeight).toBe('100%');
    expect(canvasStyle.boxSizing).toBe('border-box');
  });

  it('keeps the hub scrolling rule for non-Flappy content', () => {
    const css = readFileSync(FEATURES_CSS_PATH, 'utf-8');
    const hubRule = getRuleBody(css, '.games-hub-content');
    expectDeclaration(hubRule, 'overflow-y', 'auto');

    installRelevantStyles(css);

    const hub = document.createElement('div');
    hub.className = 'games-hub-content';
    document.body.appendChild(hub);

    expect(window.getComputedStyle(hub).overflowY).toBe('auto');
  });

  it('keeps the flex and canvas containment declarations order-independent', () => {
    const css = readFileSync(FEATURES_CSS_PATH, 'utf-8');

    const gameContainerRule = getRuleBody(
      css,
      '.games-hub-content:has(.games-flappy-stage) #games-game-container'
    );
    const stageRule = getRuleBody(
      css,
      '.games-hub-content:has(.games-flappy-stage) .games-flappy-stage'
    );
    const canvasRule = getRuleBody(
      css,
      '.games-hub-content:has(.games-flappy-stage) .games-flappy-canvas'
    );

    expectDeclaration(gameContainerRule, 'display', 'flex');
    expectDeclaration(gameContainerRule, 'flex', '1 1 auto');
    expectDeclaration(gameContainerRule, 'min-height', '0');
    expectDeclaration(gameContainerRule, 'overflow', 'hidden');

    expectDeclaration(stageRule, 'display', 'flex');
    expectDeclaration(stageRule, 'flex', '1 1 auto');
    expectDeclaration(stageRule, 'min-height', '0');

    expectDeclaration(canvasRule, 'width', 'auto');
    expectDeclaration(canvasRule, 'height', 'auto');
    expectDeclaration(canvasRule, 'max-width', '100%');
    expectDeclaration(canvasRule, 'max-height', '100%');
    expectDeclaration(canvasRule, 'box-sizing', 'border-box');
  });
});
