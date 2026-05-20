import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/features/todo.js');
});

beforeEach(() => {
  // Reset the internal todos state to match the empty localStorage
  if (typeof initTodo === 'function') {
    initTodo();
  }
});

describe('Todo persistence', () => {
  it('loadTodos returns empty array when localStorage is empty', () => {
    expect(loadTodos()).toEqual([]);
  });

  it('saveTodos persists to localStorage', () => {
    const data = [{ id: '1', text: 'Test', completed: false }];
    saveTodos(data);
    expect(loadTodos()).toEqual(data);
  });

  it('saveTodos failures roll back todo mutations', () => {
    addTodo('Keep me');

    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const todoId = loadTodos()[0].id;

      expect(() => editTodo(todoId, 'Updated', null, null)).not.toThrow();
      expect(loadTodos()[0].text).toBe('Keep me');

      expect(() => toggleTodo(todoId)).not.toThrow();
      expect(loadTodos()[0].completed).toBe(false);

      expect(() => deleteTodo(todoId)).not.toThrow();
      expect(loadTodos()).toHaveLength(1);

      const todoItem = document.querySelector('.todo-item');
      expect(todoItem).not.toBeNull();
      expect(todoItem.querySelector('.todo-text')?.textContent).toBe('Keep me');
      expect(warnSpy).toHaveBeenCalled();
      expect(document.querySelector('.toast-notification')?.textContent).toContain('Failed to save todo changes');
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('loadTodos handles corrupted localStorage gracefully', () => {
    localStorage.setItem('todos', 'not-json');
    expect(loadTodos()).toEqual([]);
  });

  it('loadTodos resets non-array data', () => {
    localStorage.setItem('todos', '{"foo":"bar"}');
    expect(loadTodos()).toEqual([]);
  });
});

describe('Todo CRUD', () => {
  it('addTodo creates a new todo', () => {
    addTodo('Buy milk');
    const list = loadTodos();
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('Buy milk');
    expect(list[0].completed).toBe(false);
    expect(list[0].dueDate).toBeNull();
  });

  it('addTodo ignores empty text', () => {
    addTodo('  ');
    expect(loadTodos()).toHaveLength(0);
  });

  it('addTodo rolls back when saving fails', () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      addTodo('Rollback me');

      expect(loadTodos()).toHaveLength(0);
      expect(document.querySelectorAll('.todo-item')).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
      expect(document.querySelector('.toast-notification')?.textContent).toContain('Failed to save todo changes');
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('addTodo renders a todo item in the list', () => {
    addTodo('Render me');
    const items = document.querySelectorAll('.todo-item');
    expect(items).toHaveLength(1);
    expect(items[0].querySelector('.todo-text')?.textContent).toBe('Render me');
  });

  it('renderTodos displays todo text literally', () => {
    addTodo('<b>test</b>');
    const todoText = document.querySelector('.todo-text');
    expect(todoText).not.toBeNull();
    expect(todoText.textContent).toBe('<b>test</b>');
    expect(todoText.querySelector('b')).toBeNull();
  });

  it('addTodo triggers renderTodos after adding a todo', () => {
    const originalRenderTodos = globalThis.renderTodos;
    const renderSpy = vi.fn((...args) => originalRenderTodos(...args));
    globalThis.renderTodos = renderSpy;

    try {
      addTodo('Render me');
      expect(renderSpy).toHaveBeenCalled();
    } finally {
      globalThis.renderTodos = originalRenderTodos;
    }
  });

  it('renderTodos falls back to empty text for missing todo text', () => {
    saveTodos([
      {
        id: '1',
        completed: false,
        dueDate: null,
        createdAt: new Date().toISOString(),
        order: 0
      }
    ]);

    initTodo();

    const todoText = document.querySelector('.todo-text');
    expect(todoText).not.toBeNull();
    expect(todoText.textContent).toBe('');
  });

  it('addTodo assigns incremental order', () => {
    addTodo('First');
    addTodo('Second');
    const list = loadTodos();
    expect(list[0].order).toBe(0);
    expect(list[1].order).toBe(1);
  });

  it('toggleTodo marks a todo completed', () => {
    addTodo('Toggle me');
    const todo = loadTodos()[0];
    toggleTodo(todo.id);
    const updated = loadTodos()[0];
    expect(updated.completed).toBe(true);
    expect(updated.completedAt).toBeTruthy();
  });

  it('toggleTodo un-marks a completed todo', () => {
    addTodo('Toggle me');
    const todo = loadTodos()[0];
    toggleTodo(todo.id);
    toggleTodo(todo.id);
    const updated = loadTodos()[0];
    expect(updated.completed).toBe(false);
    expect(updated.completedAt).toBeNull();
  });

  it('editTodo updates text', () => {
    addTodo('Old text');
    const todo = loadTodos()[0];
    editTodo(todo.id, 'New text', null, null);
    expect(loadTodos()[0].text).toBe('New text');
  });

  it('editTodo updates dueDate and allows null priority', () => {
    addTodo('Text');
    const todo = loadTodos()[0];
    editTodo(todo.id, 'Updated', null, '2025-01-01');
    expect(loadTodos()[0].dueDate).toBe('2025-01-01');
  });

  it('migrateTodos handles save failures without throwing', () => {
    localStorage.setItem('todos', JSON.stringify([
      {
        id: 'legacy',
        text: 'Legacy todo',
        completed: true,
        createdAt: '2025-01-01T00:00:00.000Z',
        order: 0
      }
    ]));
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      expect(() => initTodo()).not.toThrow();
      expect(migrateTodos()).toBe(false);
      expect(loadTodos()[0].completedAt).toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('deleteTodo removes a todo', () => {
    addTodo('Delete me');
    const todo = loadTodos()[0];
    deleteTodo(todo.id);
    expect(loadTodos()).toHaveLength(0);
  });

  it('deleteTodo is idempotent', () => {
    addTodo('A');
    const todo = loadTodos()[0];
    deleteTodo(todo.id);
    deleteTodo(todo.id);
    expect(loadTodos()).toHaveLength(0);
  });
});

describe('Todo filtering', () => {
  function setFilter(status) {
    const pill = document.createElement('button');
    pill.className = 'filter-pill';
    pill.dataset.filter = status;
    handleFilterPillClick({ target: pill });
  }

  it('returns all todos by default', () => {
    addTodo('A');
    addTodo('B');
    setFilter('all');
    const filtered = filterTodos();
    expect(filtered).toHaveLength(2);
  });

  it('filters pending todos', () => {
    addTodo('Pending');
    addTodo('Completed');
    const completed = loadTodos()[1];
    toggleTodo(completed.id);
    setFilter('pending');
    const filtered = filterTodos();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].text).toBe('Pending');
  });

  it('filters completed todos', () => {
    addTodo('Pending');
    addTodo('Completed');
    const completed = loadTodos()[1];
    toggleTodo(completed.id);
    setFilter('completed');
    const filtered = filterTodos();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].text).toBe('Completed');
  });

  it('filters overdue todos', () => {
    addTodo('On time');
    addTodo('Overdue');
    const list = loadTodos();
    editTodo(list[1].id, 'Overdue', null, '2000-01-01');
    setFilter('overdue');
    const filtered = filterTodos();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].text).toBe('Overdue');
  });

  it('sorts incomplete before completed', () => {
    addTodo('Later');
    addTodo('Sooner');
    const list = loadTodos();
    toggleTodo(list[0].id);
    setFilter('all');
    const filtered = filterTodos();
    expect(filtered[0].text).toBe('Sooner');
    expect(filtered[1].text).toBe('Later');
  });
});

describe('Todo utilities', () => {
  it('formatDateISO returns YYYY-MM-DD', () => {
    const d = new Date(2025, 5, 15); // June 15
    expect(formatDateISO(d)).toBe('2025-06-15');
  });

  it('formatDateISO pads single-digit month and day', () => {
    const d = new Date(2025, 0, 5); // Jan 5
    expect(formatDateISO(d)).toBe('2025-01-05');
  });

  it('isOverdue returns false for today', () => {
    const today = formatDateISO(new Date());
    expect(isOverdue(today)).toBe(false);
  });

  it('isOverdue returns true for past date', () => {
    expect(isOverdue('2000-01-01')).toBe(true);
  });

  it('isOverdue returns false for null', () => {
    expect(isOverdue(null)).toBe(false);
  });

  it('migrateTodos does not throw', () => {
    addTodo('Migrate me');
    expect(() => migrateTodos()).not.toThrow();
    expect(loadTodos()).toHaveLength(1);
  });

});

describe('Todo clear completed', () => {
  it('clearCompleted removes completed todos', () => {
    addTodo('Keep');
    addTodo('Remove');
    const list = loadTodos();
    toggleTodo(list[1].id);
    clearCompleted();
    const confirmBtn = document.getElementById('clear-completed-confirm');
    confirmBtn.click();
    const remaining = loadTodos();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].text).toBe('Keep');
  });
});

describe('Todo validateTodoData', () => {
  it('rejects null', () => {
    expect(validateTodoData(null)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(validateTodoData('string')).toBe(false);
  });

  it('rejects missing todos array', () => {
    expect(validateTodoData({})).toBe(false);
  });

  it('rejects non-array todos', () => {
    expect(validateTodoData({ todos: 'not-array' })).toBe(false);
  });

  it('rejects item without id', () => {
    expect(validateTodoData({ todos: [{ text: 'foo', completed: false }] })).toBe(false);
  });

  it('rejects empty id', () => {
    expect(validateTodoData({ todos: [{ id: '', text: 'foo', completed: false }] })).toBe(false);
  });

  it('rejects empty text', () => {
    expect(validateTodoData({ todos: [{ id: '1', text: '  ', completed: false }] })).toBe(false);
  });

  it('rejects non-boolean completed', () => {
    expect(validateTodoData({ todos: [{ id: '1', text: 'foo', completed: 'yes' }] })).toBe(false);
  });

  it('rejects non-string dueDate', () => {
    expect(validateTodoData({ todos: [{ id: '1', text: 'foo', completed: false, dueDate: 123 }] })).toBe(false);
  });

  it('accepts null dueDate', () => {
    expect(validateTodoData({ todos: [{ id: '1', text: 'foo', completed: false, dueDate: null, createdAt: '2025-01-01T00:00:00Z', completedAt: null, order: 0 }] })).toBe(true);
  });

  it('accepts undefined dueDate', () => {
    expect(validateTodoData({ todos: [{ id: '1', text: 'foo', completed: false }] })).toBe(true);
  });

  it('rejects non-number order', () => {
    expect(validateTodoData({ todos: [{ id: '1', text: 'foo', completed: false, order: 'abc' }] })).toBe(false);
  });

  it('rejects Infinity order', () => {
    expect(validateTodoData({ todos: [{ id: '1', text: 'foo', completed: false, order: Infinity }] })).toBe(false);
  });

  it('rejects -Infinity order', () => {
    expect(validateTodoData({ todos: [{ id: '1', text: 'foo', completed: false, order: -Infinity }] })).toBe(false);
  });

  it('rejects NaN order', () => {
    expect(validateTodoData({ todos: [{ id: '1', text: 'foo', completed: false, order: NaN }] })).toBe(false);
  });

  it('rejects negative order', () => {
    expect(validateTodoData({ todos: [{ id: '1', text: 'foo', completed: false, order: -1 }] })).toBe(false);
  });

  it('rejects float order', () => {
    expect(validateTodoData({ todos: [{ id: '1', text: 'foo', completed: false, order: 1.5 }] })).toBe(false);
  });

  it('accepts valid complete data', () => {
    const data = {
      todos: [
        { id: 'abc', text: 'Test', completed: false, dueDate: null, createdAt: '2025-01-01T00:00:00Z', completedAt: null, order: 0 }
      ]
    };
    expect(validateTodoData(data)).toBe(true);
  });

  it('rejects duplicate IDs', () => {
    const data = {
      todos: [
        { id: 'dup', text: 'First', completed: false },
        { id: 'dup', text: 'Second', completed: false }
      ]
    };
    expect(validateTodoData(data)).toBe(false);
  });
});

describe('Todo import', () => {
  beforeEach(() => {
    if (typeof initTodo === 'function') {
      initTodo();
    }
  });

  it('merge imports adds new todos', () => {
    addTodo('Existing');

    const imported = [
      { id: 'new1', text: 'New 1', completed: false, dueDate: null, createdAt: '2025-01-01T00:00:00Z', completedAt: null, order: 0 },
      { id: 'new2', text: 'New 2', completed: true, completedAt: '2025-01-01T00:00:00Z', createdAt: '2025-01-01T00:00:00Z', dueDate: null, order: 1 }
    ];

    showImportDialog(imported);
    document.getElementById('import-merge-btn').click();

    const all = loadTodos();
    expect(all).toHaveLength(3);
    expect(all.find(t => t.id === 'new1').text).toBe('New 1');
    expect(all.find(t => t.id === 'new2').completed).toBe(true);
  });

  it('merge skips duplicate IDs', () => {
    addTodo('Existing');
    const existing = loadTodos()[0];

    const imported = [
      { id: existing.id, text: 'Should be skipped', completed: false }
    ];

    showImportDialog(imported);
    document.getElementById('import-merge-btn').click();

    const all = loadTodos();
    expect(all).toHaveLength(1);
    expect(all[0].text).toBe('Existing');
  });

  it('replace clears all existing todos', () => {
    addTodo('Will be removed');

    const imported = [
      { id: 'replacement', text: 'Replacement', completed: false }
    ];

    showImportDialog(imported);
    document.getElementById('import-replace-btn').click();

    const all = loadTodos();
    expect(all).toHaveLength(1);
    expect(all[0].text).toBe('Replacement');
  });

  it('merge preserves extra fields like priority', () => {
    const imported = [
      { id: 'p1', text: 'Priority todo', completed: false, priority: 'high' }
    ];

    showImportDialog(imported);
    document.getElementById('import-merge-btn').click();

    const all = loadTodos();
    expect(all).toHaveLength(1);
    expect(all[0].priority).toBe('high');
    expect(all[0].text).toBe('Priority todo');
  });

  it('replace preserves extra fields like priority', () => {
    addTodo('Old');

    const imported = [
      { id: 'p1', text: 'Priority todo', completed: false, priority: 'low' }
    ];

    showImportDialog(imported);
    document.getElementById('import-replace-btn').click();

    const all = loadTodos();
    expect(all).toHaveLength(1);
    expect(all[0].priority).toBe('low');
    expect(all[0].text).toBe('Priority todo');
  });

  it('replace with empty array clears all existing todos', () => {
    addTodo('One');
    addTodo('Two');

    const allBefore = loadTodos();
    expect(allBefore).toHaveLength(2);

    showImportDialog([]);
    document.getElementById('import-replace-btn').click();

    const allAfter = loadTodos();
    expect(allAfter).toHaveLength(0);
  });

  it('merge with empty array does nothing', () => {
    addTodo('Existing');

    showImportDialog([]);
    document.getElementById('import-merge-btn').click();

    const all = loadTodos();
    expect(all).toHaveLength(1);
    expect(all[0].text).toBe('Existing');
  });

  it('replace preserves array order with mixed order fields', () => {
    const imported = [
      { id: 'a', text: 'First', completed: false, order: 10 },
      { id: 'b', text: 'Second', completed: false },
      { id: 'c', text: 'Third', completed: false, order: 5 },
      { id: 'd', text: 'Fourth', completed: false }
    ];

    showImportDialog(imported);
    document.getElementById('import-replace-btn').click();

    const all = loadTodos();
    expect(all).toHaveLength(4);
    expect(all[0].id).toBe('a');
    expect(all[1].id).toBe('b');
    expect(all[2].id).toBe('c');
    expect(all[3].id).toBe('d');
  });

  it('replace assigns sequential order to items without order', () => {
    const imported = [
      { id: 'x', text: 'No order 1', completed: false },
      { id: 'y', text: 'No order 2', completed: false },
      { id: 'z', text: 'No order 3', completed: false }
    ];

    showImportDialog(imported);
    document.getElementById('import-replace-btn').click();

    const all = loadTodos();
    expect(all).toHaveLength(3);
    expect(all[0].order).toBe(0);
    expect(all[1].order).toBe(1);
    expect(all[2].order).toBe(2);
  });

  it('imports todos with CSS-special characters in IDs', () => {
    addTodo('Original');

    const imported = [
      { id: 'todo"quoted"', text: 'Has quotes in id', completed: false },
      { id: 'todo]bracket[', text: 'Has brackets in id', completed: false },
      { id: 'todo\\backslash', text: 'Has backslash in id', completed: false }
    ];

    showImportDialog(imported);
    document.getElementById('import-merge-btn').click();

    const all = loadTodos();
    expect(all).toHaveLength(4);
    expect(all.find(t => t.id === 'todo"quoted"').text).toBe('Has quotes in id');
    expect(all.find(t => t.id === 'todo]bracket[').text).toBe('Has brackets in id');
    expect(all.find(t => t.id === 'todo\\backslash').text).toBe('Has backslash in id');
  });

  it('replaces stale imported data when dialog is re-opened with a new file', () => {
    const first = [
      { id: 'a', text: 'First file', completed: false }
    ];
    const second = [
      { id: 'b', text: 'Second file', completed: false }
    ];

    showImportDialog(first);
    showImportDialog(second);
    document.getElementById('import-merge-btn').click();

    const all = loadTodos();
    expect(all).toHaveLength(1);
    expect(all[0].text).toBe('Second file');
  });

  it('replaces stale data with replace action after re-opening dialog', () => {
    addTodo('Existing');

    const first = [
      { id: 'x', text: 'First file', completed: false }
    ];
    const second = [
      { id: 'y', text: 'Second file', completed: false }
    ];

    showImportDialog(first);
    showImportDialog(second);
    document.getElementById('import-replace-btn').click();

    const all = loadTodos();
    expect(all).toHaveLength(1);
    expect(all[0].text).toBe('Second file');
  });

  it('merge appends imported todos after existing legacy items without order', () => {
    // Simulate legacy items that predate the order field
    const legacy = [
      { id: 'old1', text: 'Legacy 1', completed: false, createdAt: '2020-01-01T00:00:00Z' },
      { id: 'old2', text: 'Legacy 2', completed: false, createdAt: '2020-06-01T00:00:00Z' }
    ];
    localStorage.setItem('todos', JSON.stringify(legacy));
    initTodo();

    const imported = [
      { id: 'new1', text: 'Imported 1', completed: false },
      { id: 'new2', text: 'Imported 2', completed: false }
    ];

    showImportDialog(imported);
    document.getElementById('import-merge-btn').click();

    const all = loadTodos();
    expect(all).toHaveLength(4);
    const sorted = filterTodos();
    // Legacy items should come first (in order by createdAt), imported items after
    expect(sorted[0].id).toBe('old1');
    expect(sorted[1].id).toBe('old2');
    expect(sorted[2].id).toBe('new1');
    expect(sorted[3].id).toBe('new2');
  });

  it('replace renders imported items in file array order regardless of order field', () => {
    const imported = [
      { id: 'a', text: 'First', completed: false, order: 10 },
      { id: 'b', text: 'Second', completed: false },
      { id: 'c', text: 'Third', completed: false, order: 5 },
      { id: 'd', text: 'Fourth', completed: false }
    ];

    showImportDialog(imported);
    document.getElementById('import-replace-btn').click();

    const sorted = filterTodos();
    expect(sorted).toHaveLength(4);
    expect(sorted[0].id).toBe('a');
    expect(sorted[1].id).toBe('b');
    expect(sorted[2].id).toBe('c');
    expect(sorted[3].id).toBe('d');
  });
});
