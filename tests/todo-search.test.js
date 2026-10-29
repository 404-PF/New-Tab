import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

function setTodos(data) {
  localStorage.setItem('todos', JSON.stringify(data));
}

function typeQuery(value) {
  const input = document.getElementById('todo-search');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function visibleItems() {
  return [...document.querySelectorAll('.todo-item')];
}

function visibleTexts() {
  return visibleItems().map(item => item.querySelector('.todo-text')?.textContent);
}

function emptyStateParagraph() {
  return document.querySelector('#empty-state p');
}

function setStatusPill(status) {
  const pill = document.createElement('button');
  pill.className = 'filter-pill';
  pill.dataset.filter = status;
  handleFilterPillClick({ target: pill });
}

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/core/utils.js');
  // toast.js provides window.showToast for todo save-error notifications.
  injectScript('src/core/toast.js');
  injectScript('src/features/todo.js');
});

beforeEach(() => {
  if (typeof setTodoSearchQuery === 'function') {
    setTodoSearchQuery('');
  }
  const input = document.getElementById('todo-search');
  if (input) {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  currentFilters.status = 'all';
  currentFilters.priority = 'all';
  selectedIds.clear();
  setTodoSort('due');
});

describe('Todo search', () => {
  it('filters todos by text content case-insensitively', () => {
    setTodos([
      { id: '1', text: 'Buy milk', completed: false, createdAt: '2026-01-01' },
      { id: '2', text: 'Read book', completed: false, createdAt: '2026-01-02' },
      { id: '3', text: 'Milkshake recipe', completed: false, createdAt: '2026-01-03' }
    ]);
    initTodo();
    typeQuery('milk');
    expect(getTodoSearchQuery()).toBe('milk');
    const texts = visibleTexts();
    expect(texts).toHaveLength(2);
    expect(texts).toEqual(expect.arrayContaining(['Buy milk', 'Milkshake recipe']));
    expect(texts).not.toEqual(expect.arrayContaining(['Read book']));
  });

  it('trims the query', () => {
    setTodos([
      { id: '1', text: 'Hello world', completed: false, createdAt: '2026-01-01' }
    ]);
    initTodo();
    typeQuery('  hello  ');
    expect(getTodoSearchQuery()).toBe('hello');
    expect(visibleItems()).toHaveLength(1);
  });

  it('matches subtask text', () => {
    setTodos([
      {
        id: '1',
        text: 'Plan trip',
        completed: false,
        createdAt: '2026-01-01',
        subtasks: [{ id: 's1', text: 'Pack bags', checked: false }]
      },
      { id: '2', text: 'Plan budget', completed: false, createdAt: '2026-01-02', subtasks: [] }
    ]);
    initTodo();
    typeQuery('bags');
    expect(visibleItems()).toHaveLength(1);
    expect(visibleItems()[0].dataset.id).toBe('1');
  });

  it('combines with a status pill using AND semantics', () => {
    setTodos([
      { id: '1', text: 'Buy milk', completed: false, createdAt: '2026-01-01' },
      { id: '2', text: 'Milk invoices', completed: true, createdAt: '2026-01-02' },
      { id: '3', text: 'Read book', completed: false, createdAt: '2026-01-03' }
    ]);
    initTodo();
    setStatusPill('pending');
    typeQuery('milk');
    expect(currentFilters.status).toBe('pending');
    expect(visibleTexts()).toEqual(['Buy milk']);
  });

  it('combines with a priority pill using AND semantics', () => {
    setTodos([
      { id: '1', text: 'Buy milk', completed: false, createdAt: '2026-01-01', priority: 'high' },
      { id: '2', text: 'Order milk', completed: false, createdAt: '2026-01-02', priority: 'low' }
    ]);
    initTodo();
    const pill = document.createElement('button');
    pill.className = 'filter-pill';
    pill.dataset.filter = 'high';
    pill.dataset.filterType = 'priority';
    handleFilterPillClick({ target: pill });
    typeQuery('milk');
    expect(currentFilters.priority).toBe('high');
    expect(visibleTexts()).toEqual(['Buy milk']);
  });

  it('restores the pill-filtered view when the input is cleared', () => {
    setTodos([
      { id: '1', text: 'Buy milk', completed: false, createdAt: '2026-01-01' },
      { id: '2', text: 'Walk dog', completed: false, createdAt: '2026-01-02' },
      { id: '3', text: 'Milk invoices', completed: true, createdAt: '2026-01-03' }
    ]);
    initTodo();
    setStatusPill('pending');
    typeQuery('milk');
    expect(visibleTexts()).toEqual(['Buy milk']);
    typeQuery('');
    expect(getTodoSearchQuery()).toBe('');
    const texts = visibleTexts();
    expect(texts).toHaveLength(2);
    expect(texts).toEqual(expect.arrayContaining(['Buy milk', 'Walk dog']));
  });

  it('works under a sort mode', () => {
    setTodos([
      { id: '1', text: 'Beta milk', completed: false, createdAt: '2026-01-02' },
      { id: '2', text: 'Alpha milk', completed: false, createdAt: '2026-01-01' }
    ]);
    initTodo();
    setTodoSort('az');
    typeQuery('milk');
    expect(getTodoSort()).toBe('az');
    expect(visibleTexts()).toEqual(['Alpha milk', 'Beta milk']);
  });

  it('prunes the selection to the visible set while a query is active', () => {
    setTodos([
      { id: '1', text: 'Buy milk', completed: false, createdAt: '2026-01-01' },
      { id: '2', text: 'Walk dog', completed: false, createdAt: '2026-01-02' }
    ]);
    initTodo();
    selectedIds.add('1');
    selectedIds.add('2');
    typeQuery('dog');
    expect(selectedIds.size).toBe(1);
    expect(selectedIds.has('1')).toBe(false);
    expect(selectedIds.has('2')).toBe(true);
    typeQuery('nonexistent');
    expect(selectedIds.size).toBe(0);
    expect(document.getElementById('bulk-actions').classList.contains('active')).toBe(false);
  });

  it('shows a no-results message when nothing matches', () => {
    setTodos([
      { id: '1', text: 'Hello world', completed: false, createdAt: '2026-01-01' }
    ]);
    initTodo();
    typeQuery('nonexistent');
    const emptyState = document.getElementById('empty-state');
    expect(emptyState.style.display).toBe('flex');
    const paragraph = emptyStateParagraph();
    expect(paragraph.getAttribute('data-i18n')).toBe('todoNoResults');
    expect(paragraph.textContent).toBe(window.i18n.t('todoNoResults'));
    expect(emptyState.querySelector('small').style.display).toBe('none');
    expect(visibleItems()).toHaveLength(0);
  });

  it('keeps the "no todos yet" copy when the list itself is empty', () => {
    setTodos([]);
    initTodo();
    typeQuery('anything');
    const paragraph = emptyStateParagraph();
    expect(paragraph.getAttribute('data-i18n')).toBe('emptyStateTitle');
    expect(paragraph.textContent).toBe(window.i18n.t('emptyStateTitle'));
    expect(document.getElementById('empty-state').querySelector('small').style.display).toBe('');
  });

  it('restores rows when the input is cleared after a no-results state', () => {
    setTodos([
      { id: '1', text: 'Hello world', completed: false, createdAt: '2026-01-01' }
    ]);
    initTodo();
    typeQuery('zzz');
    expect(visibleItems()).toHaveLength(0);
    typeQuery('');
    expect(visibleItems()).toHaveLength(1);
    expect(document.getElementById('empty-state').style.display).toBe('none');
  });

  it('leaves the progress ring and badge counts as full-list stats', () => {
    setTodos([
      { id: '1', text: 'Buy milk', completed: false, createdAt: '2026-01-01' },
      { id: '2', text: 'Walk dog', completed: true, createdAt: '2026-01-02' }
    ]);
    initTodo();
    typeQuery('milk');
    expect(visibleItems()).toHaveLength(1);
    expect(document.getElementById('badge-all').textContent).toBe('2');
    expect(document.getElementById('badge-completed').textContent).toBe('1');
    expect(document.getElementById('todo-count').textContent).toBe('1/2');
    expect(document.getElementById('progress-text').textContent).toBe('50%');
  });

  it('search input has the localized placeholder and i18n keys', () => {
    setTodos([]);
    initTodo();
    const input = document.getElementById('todo-search');
    expect(input).toBeTruthy();
    expect(input.placeholder).toBe(window.i18n.t('todoSearchPlaceholder'));
    expect(input.getAttribute('data-i18n')).toBe('todoSearchPlaceholder');
    expect(input.getAttribute('data-i18n-aria-label')).toBe('todoSearchPlaceholder');
  });
});
