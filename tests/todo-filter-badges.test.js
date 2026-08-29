import { describe, it, expect, beforeAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/languages.js');
});

function filterPillsHtml() {
  return `
      <div class="filter-pills">
        <button type="button" class="filter-pill active" data-filter="all"><span class="filter-label" data-i18n="filterAll">All</span> <span class="filter-badge" id="badge-all">0</span></button>
        <button type="button" class="filter-pill" data-filter="pending"><span class="filter-label" data-i18n="filterPending">Pending</span> <span class="filter-badge" id="badge-pending">0</span></button>
        <button type="button" class="filter-pill" data-filter="completed"><span class="filter-label" data-i18n="filterCompleted">Completed</span> <span class="filter-badge" id="badge-completed">0</span></button>
        <button type="button" class="filter-pill" data-filter="overdue"><span class="filter-label" data-i18n="filterOverdue">Overdue</span> <span class="filter-badge" id="badge-overdue">0</span></button>
        <button type="button" class="filter-pill" data-filter="high" data-filter-type="priority"><span class="filter-label" data-i18n="priorityHigh">High</span> <span class="filter-badge" id="badge-high">0</span></button>
        <button type="button" class="filter-pill" data-filter="low" data-filter-type="priority"><span class="filter-label" data-i18n="priorityLow">Low</span> <span class="filter-badge" id="badge-low">0</span></button>
      </div>
    `;
}

describe('todo filter badge preservation', () => {
  it('preserves badges with legacy markup (button[data-i18n] with nested badge)', () => {
    document.body.innerHTML = `
      <div class="filter-pills">
        <button type="button" class="filter-pill active" data-filter="all" data-i18n="filterAll">All <span class="filter-badge" id="badge-all">0</span></button>
        <button type="button" class="filter-pill" data-filter="pending" data-i18n="filterPending">Pending <span class="filter-badge" id="badge-pending">0</span></button>
        <button type="button" class="filter-pill" data-filter="completed" data-i18n="filterCompleted">Completed <span class="filter-badge" id="badge-completed">0</span></button>
        <button type="button" class="filter-pill" data-filter="overdue" data-i18n="filterOverdue">Overdue <span class="filter-badge" id="badge-overdue">0</span></button>
        <button type="button" class="filter-pill" data-filter="high" data-filter-type="priority" data-i18n="priorityHigh">High <span class="filter-badge" id="badge-high">0</span></button>
        <button type="button" class="filter-pill" data-filter="low" data-filter-type="priority" data-i18n="priorityLow">Low <span class="filter-badge" id="badge-low">0</span></button>
      </div>
    `;

    expect(document.getElementById('badge-all')).not.toBeNull();
    document.getElementById('badge-all').textContent = '5';
    document.getElementById('badge-pending').textContent = '3';

    window.i18n.applyLanguage('zh');
    const missingAfterZh = ['badge-all', 'badge-pending', 'badge-completed', 'badge-overdue', 'badge-high', 'badge-low'].filter(id => !document.getElementById(id));
    expect(missingAfterZh, 'badges should survive zh').toEqual([]);

    expect(document.getElementById('badge-all').textContent).toBe('5');
    expect(document.getElementById('badge-pending').textContent).toBe('3');
    expect(document.querySelector('[data-filter="all"]').textContent).toContain('全部');
    expect(document.querySelector('[data-filter="high"]').textContent).toContain('高');
    expect(document.querySelector('[data-filter="low"]').textContent).toContain('低');

    window.i18n.applyLanguage('en');
    expect(document.getElementById('badge-all')).not.toBeNull();
    expect(document.getElementById('badge-all').textContent).toBe('5');
    expect(document.querySelector('[data-filter="high"]').textContent).toContain('High');
  });

  it('preserves badges with new markup (inner span[data-i18n])', () => {
    document.body.innerHTML = filterPillsHtml();

    document.getElementById('badge-all').textContent = '7';
    window.i18n.applyLanguage('zh');
    const missing = ['badge-all', 'badge-pending', 'badge-completed', 'badge-overdue', 'badge-high', 'badge-low'].filter(id => !document.getElementById(id));
    expect(missing, 'badges should survive with new markup').toEqual([]);
    expect(document.getElementById('badge-all').textContent).toBe('7');
    expect(document.querySelector('.filter-pill[data-filter="all"] .filter-label').textContent).toBe('全部');
    expect(document.querySelector('.filter-pill[data-filter="high"] .filter-label').textContent).toBe('高');
    expect(document.querySelector('.filter-pill[data-filter="low"] .filter-label').textContent).toBe('低');

    window.i18n.applyLanguage('de');
    expect(document.getElementById('badge-all').textContent).toBe('7');
    expect(document.querySelector('.filter-pill[data-filter="high"] .filter-label').textContent).toBe('Hoch');
    expect(document.querySelector('.filter-pill[data-filter="low"] .filter-label').textContent).toBe('Niedrig');
  });

  it('keeps badge counts updating after multiple language changes', () => {
    document.body.innerHTML = filterPillsHtml();
    window.i18n.applyLanguage('en');
    document.getElementById('badge-all').textContent = '10';
    document.getElementById('badge-high').textContent = '3';
    window.i18n.applyLanguage('zh');
    expect(document.getElementById('badge-all').textContent, 'count survives zh').toBe('10');
    expect(document.getElementById('badge-high').textContent, 'high survives zh').toBe('3');
    window.i18n.applyLanguage('en');
    expect(document.getElementById('badge-all').textContent, 'count survives en').toBe('10');
    expect(document.getElementById('badge-high').textContent, 'high survives en').toBe('3');
    window.i18n.applyLanguage('de');
    expect(document.getElementById('badge-all').textContent, 'count survives de').toBe('10');
  });

  it('survives startup sequence (applyLanguage before todo init)', () => {
    document.body.innerHTML = filterPillsHtml();
    // Simulate startup: language is applied before any badge counts are set
    window.i18n.applyLanguage('en');
    expect(document.getElementById('badge-all')).not.toBeNull();
    // Simulate todo init setting counts
    document.getElementById('badge-all').textContent = '4';
    document.getElementById('badge-pending').textContent = '2';
    // Simulate user changing language after startup
    window.i18n.applyLanguage('ja');
    expect(document.getElementById('badge-all').textContent).toBe('4');
    expect(document.getElementById('badge-pending').textContent).toBe('2');
    // All badges still exist
    ['badge-all','badge-pending','badge-completed','badge-overdue','badge-high','badge-low'].forEach(id => {
      expect(document.getElementById(id), `${id} should exist after startup + language change`).not.toBeNull();
    });
  });
});
