import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/core/utils.js');
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

describe('Todo drag-and-drop with filter', () => {
  function simulateDrop(draggedId, dropTargetId) {
    const draggedEl = document.createElement('li');
    draggedEl.className = 'todo-item';
    draggedEl.dataset.id = draggedId;

    const dropTarget = document.createElement('li');
    dropTarget.className = 'todo-item';
    dropTarget.dataset.id = dropTargetId;

    // Simulate the dragstart handler behavior
    handleDragStart({ target: draggedEl, preventDefault: () => {} });

    handleDrop({
      preventDefault: () => {},
      target: dropTarget
    });

    handleDragEnd({ target: draggedEl, preventDefault: () => {} });
  }

  it('preserves hidden todo order when reordering under a filter', () => {
    // Create 5 todos: A, B, C, D, E
    addTodo('A');
    addTodo('B');
    addTodo('C');
    addTodo('D');
    addTodo('E');

    // Mark C and E as completed (they will be hidden under 'pending' filter)
    const list = loadTodos();
    const c = list.find(t => t.text === 'C');
    const e = list.find(t => t.text === 'E');
    toggleTodo(c.id);
    toggleTodo(e.id);

    // Switch to pending filter (shows A, B, D)
    const pill = document.createElement('button');
    pill.className = 'filter-pill';
    pill.dataset.filter = 'pending';
    handleFilterPillClick({ target: pill });

    // Drag D before B in the filtered view
    const pending = filterTodos();
    const d = pending.find(t => t.text === 'D');
    const b = pending.find(t => t.text === 'B');
    simulateDrop(d.id, b.id);

    // Clear filter and check order
    const allPill = document.createElement('button');
    allPill.className = 'filter-pill';
    allPill.dataset.filter = 'all';
    handleFilterPillClick({ target: allPill });

    const all = filterTodos();
    // Expected order: A, D, B, C, E (C and E maintain their relative positions)
    expect(all).toHaveLength(5);
    expect(all[0].text).toBe('A');
    expect(all[1].text).toBe('D');
    expect(all[2].text).toBe('B');
    expect(all[3].text).toBe('C');
    expect(all[4].text).toBe('E');
  });

  it('maintains unique order values after filtered drag-and-drop', () => {
    addTodo('A');
    addTodo('B');
    addTodo('C');

    const list = loadTodos();
    const b = list.find(t => t.text === 'B');
    toggleTodo(b.id);

    // Filter to pending (shows A, C)
    const pill = document.createElement('button');
    pill.className = 'filter-pill';
    pill.dataset.filter = 'pending';
    handleFilterPillClick({ target: pill });

    // Drag C before A
    const pending = filterTodos();
    const c = pending.find(t => t.text === 'C');
    const a = pending.find(t => t.text === 'A');
    simulateDrop(c.id, a.id);

    // All order values should be unique
    const allTodos = loadTodos();
    const orders = allTodos.map(t => t.order);
    const uniqueOrders = new Set(orders);
    expect(uniqueOrders.size).toBe(orders.length);
  });
});

describe('Todo reminders', () => {
  beforeEach(() => {
    localStorage.removeItem('todoReminderEnabled');
    localStorage.removeItem('todoReminderLeadTime');
    if (typeof initTodo === 'function') initTodo();
  });

  it('scheduleTodoReminderCheck does not throw when chrome.runtime is available', () => {
    addTodo('Test task', '2026-12-31');
    expect(() => scheduleTodoReminderCheck()).not.toThrow();
  });

  it('scheduleTodoReminderCheck sends syncTodos message', () => {
    const sendMessageSpy = vi.spyOn(chrome.runtime, 'sendMessage');
    addTodo('Remind me', '2026-12-25');
    expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'syncTodos', todoId: expect.any(String), todos: expect.any(String) });
    sendMessageSpy.mockRestore();
  });

  it('scheduleTodoReminderCheck sends resetNotified when re-enabling reminders', () => {
    const sendMessageSpy = vi.spyOn(chrome.runtime, 'sendMessage');
    addTodo('Remind me', '2026-12-25');
    sendMessageSpy.mockClear();
    scheduleTodoReminderCheck(null, true);
    expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'syncTodos', todoId: undefined, todos: expect.any(String), resetNotified: true });
    sendMessageSpy.mockRestore();
  });

  it('addTodo triggers scheduleTodoReminderCheck', () => {
    const spy = vi.spyOn(window, 'scheduleTodoReminderCheck');
    addTodo('Test', '2026-12-31');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('editTodo triggers scheduleTodoReminderCheck', () => {
    addTodo('Original', '2026-12-31');
    const todos = loadTodos();
    const spy = vi.spyOn(window, 'scheduleTodoReminderCheck');
    editTodo(todos[0].id, 'Updated', null, '2026-12-30');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('toggleTodo triggers scheduleTodoReminderCheck', () => {
    addTodo('Test', '2026-12-31');
    const todos = loadTodos();
    const spy = vi.spyOn(window, 'scheduleTodoReminderCheck');
    toggleTodo(todos[0].id);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('deleteTodo triggers scheduleTodoReminderCheck', () => {
    addTodo('Test', '2026-12-31');
    const todos = loadTodos();
    const spy = vi.spyOn(window, 'scheduleTodoReminderCheck');
    deleteTodo(todos[0].id);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('scheduleTodoReminderCheck tolerates missing chrome.runtime', () => {
    const origRuntime = chrome.runtime;
    chrome.runtime = undefined;
    expect(() => scheduleTodoReminderCheck()).not.toThrow();
    chrome.runtime = origRuntime;
  });
});

describe('Service worker checkReminders', () => {
  beforeAll(() => {
    injectScript('background/service-worker.js');
  });

  beforeEach(() => {
    chrome.notifications._notifications = {};
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates notification for todo within reminder window', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    const todos = [{ id: 't1', text: 'Buy groceries', completed: false, dueDate: '2026-05-20' }];
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify(todos),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30'
    }, resolve));

    await checkReminders();

    const notifKeys = Object.keys(chrome.notifications._notifications);
    expect(notifKeys).toHaveLength(1);
    const notif = chrome.notifications._notifications[notifKeys[0]];
    expect(notif.message).toContain('Buy groceries');
  });

  it('does not re-notify already notified todo', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    const todos = [{ id: 't1', text: 'Buy groceries', completed: false, dueDate: '2026-05-20' }];
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify(todos),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: { 't1_2026-05-20': Date.now() }
    }, resolve));

    await checkReminders();

    expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);
  });

  it('re-notifies after completing and reopening a todo', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    const todos = [{ id: 't1', text: 'Buy groceries', completed: true, dueDate: '2026-05-20' }];
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify(todos),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: { 't1_2026-05-20': Date.now() }
    }, resolve));

    await checkReminders();
    expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);

    todos[0].completed = false;
    await new Promise(resolve => chrome.storage.local.set({ todos: JSON.stringify(todos) }, resolve));

    await checkReminders();
    expect(Object.keys(chrome.notifications._notifications)).toHaveLength(1);
  });

  it('removes stale notified entry when todo is deleted', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    const initialNotified = { 't1_2026-05-20': Date.now() };
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify([]),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: initialNotified
    }, resolve));

    await checkReminders();

    const data = await new Promise(resolve => chrome.storage.local.get('todoReminderNotified', resolve));
    expect(data.todoReminderNotified).toEqual({});
  });

  it('fires notification after due date changes', async () => {
    vi.setSystemTime(new Date('2026-05-21T23:30:00'));
    const todos = [{ id: 't1', text: 'Buy groceries', completed: false, dueDate: '2026-05-21' }];
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify(todos),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: { 't1_2026-05-20': Date.now() }
    }, resolve));

    await checkReminders();

    const notifKeys = Object.keys(chrome.notifications._notifications);
    expect(notifKeys).toHaveLength(1);
    const notif = chrome.notifications._notifications[notifKeys[0]];
    expect(notif.message).toContain('Buy groceries');
  });

  it('does not notify past-due todo', async () => {
    vi.setSystemTime(new Date('2026-05-22T00:00:00'));
    const todos = [{ id: 't1', text: 'Buy groceries', completed: false, dueDate: '2026-05-20' }];
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify(todos),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30'
    }, resolve));

    await checkReminders();

    expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);
  });

  it('skips check when reminders are disabled', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    const todos = [{ id: 't1', text: 'Buy groceries', completed: false, dueDate: '2026-05-20' }];
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify(todos),
      todoReminderEnabled: 'false',
      todoReminderLeadTime: '30'
    }, resolve));

    await checkReminders();

    expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);
  });

  it('handles empty todos array gracefully', async () => {
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify([]),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30'
    }, resolve));

    await expect(checkReminders()).resolves.toBeUndefined();
    expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);
  });

  it('handles invalid todo JSON gracefully', async () => {
    await new Promise(resolve => chrome.storage.local.set({
      todos: 'not-json',
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30'
    }, resolve));

    await expect(checkReminders()).resolves.toBeUndefined();
    expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);
  });

  it('creates separate notifications for multiple due todos at the same time', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    const todos = [
      { id: 't1', text: 'Buy groceries', completed: false, dueDate: '2026-05-20' },
      { id: 't2', text: 'Pay bills', completed: false, dueDate: '2026-05-20' }
    ];
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify(todos),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30'
    }, resolve));

    await checkReminders();

    const notifKeys = Object.keys(chrome.notifications._notifications);
    expect(notifKeys).toHaveLength(2);
    // Each notification should have a unique ID (derived from todo.id)
    expect(notifKeys[0]).not.toBe(notifKeys[1]);
    expect(chrome.notifications._notifications[notifKeys[0]].message).toContain('Buy groceries');
    expect(chrome.notifications._notifications[notifKeys[1]].message).toContain('Pay bills');
  });

  it('clearing notified entry from storage enables re-notification', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    const todos = [{ id: 't1', text: 'Buy groceries', completed: false, dueDate: '2026-05-20' }];
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify(todos),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: { 't1_2026-05-20': Date.now() }
    }, resolve));

    // Should be suppressed (already notified)
    await checkReminders();
    expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);

    // Clear the notified entry (simulates what the message handler does on mutation)
    await new Promise(resolve => chrome.storage.local.set({ todoReminderNotified: {} }, resolve));

    // Now re-check should fire
    await checkReminders();
    expect(Object.keys(chrome.notifications._notifications)).toHaveLength(1);
    const notif = Object.values(chrome.notifications._notifications)[0];
    expect(notif.message).toContain('Buy groceries');
  });

  it('clearing a single todo notified entry does not affect other todos', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    const todos = [
      { id: 't1', text: 'Buy groceries', completed: false, dueDate: '2026-05-20' },
      { id: 't2', text: 'Pay bills', completed: false, dueDate: '2026-05-20' }
    ];
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify(todos),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: { 't1_2026-05-20': Date.now(), 't2_2026-05-20': Date.now() }
    }, resolve));

    // Clear only t1's notified entry
    const data = await new Promise(resolve => chrome.storage.local.get('todoReminderNotified', resolve));
    delete data.todoReminderNotified['t1_2026-05-20'];
    await new Promise(resolve => chrome.storage.local.set({ todoReminderNotified: data.todoReminderNotified }, resolve));

    // Only t1 should re-notify; t2 remains suppressed
    await checkReminders();
    const notifKeys = Object.keys(chrome.notifications._notifications);
    expect(notifKeys).toHaveLength(1);
    expect(notifKeys[0]).toBe('todo_reminder_t1');
  });

  it('pending check flag queues follow-up check for mutations during in-flight processing', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));

    // Set up initial state with no due todos
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify([]),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {}
    }, resolve));

    // Stub chrome.storage.local.get to delay on the first call
    let resolveFirstGet;
    const originalGet = chrome.storage.local.get.bind(chrome.storage.local);
    const getSpy = vi.spyOn(chrome.storage.local, 'get').mockImplementationOnce((keys, callback) => {
      return new Promise(resolve => {
        resolveFirstGet = () => {
          originalGet(keys, callback).then(resolve);
        };
      });
    });

    // Start first checkReminders — it will hang at getFromStorage
    const firstPromise = checkReminders();

    // Update storage while first check is in flight (simulate a todo mutation)
    const todos = [{ id: 't1', text: 'Buy groceries', completed: false, dueDate: '2026-05-20' }];
    await new Promise(resolve => chrome.storage.local.set({ todos: JSON.stringify(todos) }, resolve));

    // Second call should see in-progress guard and set pending flag, then return
    await checkReminders();

    // Resolve the first call's storage hang
    resolveFirstGet();

    // Wait for the first check + follow-up to complete
    await firstPromise;

    // The follow-up should have processed the mutated todo and fired a notification
    const notifKeys = Object.keys(chrome.notifications._notifications);
    expect(notifKeys).toHaveLength(1);
    expect(chrome.notifications._notifications[notifKeys[0]].message).toContain('Buy groceries');

    getSpy.mockRestore();
  });

  it('clears desktop notification when stale notified entry is removed', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    const clearSpy = vi.spyOn(chrome.notifications, 'clear');
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify([]),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: { 't1_2026-05-20': Date.now() }
    }, resolve));

    await checkReminders();

    expect(clearSpy).toHaveBeenCalledWith('todo_reminder_t1');
    clearSpy.mockRestore();
  });

  it('does not clear notification for valid notified entry', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    const clearSpy = vi.spyOn(chrome.notifications, 'clear');
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify([{ id: 't1', text: 'Buy groceries', completed: false, dueDate: '2026-05-20' }]),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: { 't1_2026-05-20': Date.now() }
    }, resolve));

    await checkReminders();

    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('uses passed todos instead of stale storage data', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    // Set stale todos in storage (empty list)
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify([]),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {}
    }, resolve));

    // Pass fresh todos with a due todo that would trigger notification
    const freshTodos = JSON.stringify([{ id: 't1', text: 'Buy groceries', completed: false, dueDate: '2026-05-20' }]);
    await checkReminders(freshTodos);

    const notifKeys = Object.keys(chrome.notifications._notifications);
    expect(notifKeys).toHaveLength(1);
    expect(chrome.notifications._notifications[notifKeys[0]].message).toContain('Buy groceries');
  });

  it('falls back to storage when no todos passed', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify([{ id: 't1', text: 'From storage', completed: false, dueDate: '2026-05-20' }]),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {}
    }, resolve));

    await checkReminders();

    const notifKeys = Object.keys(chrome.notifications._notifications);
    expect(notifKeys).toHaveLength(1);
    expect(chrome.notifications._notifications[notifKeys[0]].message).toContain('From storage');
  });

  it('handleStartup creates alarm when none exists', () => {
    chrome.alarms._alarms = {};
    handleStartup();
    expect(chrome.alarms._alarms).toHaveProperty('todoReminderCheck');
    expect(chrome.alarms._alarms['todoReminderCheck']).toEqual({ periodInMinutes: 1 });
  });

  it('handleStartup does not overwrite existing alarm', () => {
    chrome.alarms._alarms = { todoReminderCheck: { periodInMinutes: 5 } };
    handleStartup();
    expect(chrome.alarms._alarms['todoReminderCheck']).toEqual({ periodInMinutes: 5 });
  });

  it('uses latest data from pending re-entrant call', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify([]),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {}
    }, resolve));

    let resolveFirstGet;
    const originalGet = chrome.storage.local.get.bind(chrome.storage.local);
    const getSpy = vi.spyOn(chrome.storage.local, 'get').mockImplementationOnce((keys, callback) => {
      return new Promise(resolve => {
        resolveFirstGet = () => {
          originalGet(keys, callback).then(resolve);
        };
      });
    });

    const firstPromise = checkReminders(JSON.stringify([{ id: 't1', text: 'First data', completed: false, dueDate: '2026-05-20' }]));

    await checkReminders(JSON.stringify([{ id: 't2', text: 'Second data', completed: false, dueDate: '2026-05-20' }]));

    resolveFirstGet();
    await firstPromise;

    const notifKeys = Object.keys(chrome.notifications._notifications);
    expect(notifKeys).toHaveLength(1);
    expect(chrome.notifications._notifications[notifKeys[0]].message).toContain('Second data');
    expect(chrome.notifications._notifications[notifKeys[0]].message).not.toContain('First data');

    getSpy.mockRestore();
  });

  it('handles chrome.notifications.create rejection gracefully', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    const createSpy = vi.spyOn(chrome.notifications, 'create').mockRejectedValue(new Error('Permission denied'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify([{ id: 't1', text: 'Fail notif', completed: false, dueDate: '2026-05-20' }]),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {}
    }, resolve));

    await expect(checkReminders()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('Failed to create todo reminder notification:', expect.any(Error));

    // No notification was created (rejected), but still marked as notified to prevent retry-spam
    expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);
    const data = await new Promise(resolve => chrome.storage.local.get('todoReminderNotified', resolve));
    expect(data.todoReminderNotified).toHaveProperty('t1_2026-05-20');

    createSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('fires notification at due date when leadTime is 0 (at due time)', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:59:59'));
    const todos = [{ id: 't1', text: 'Last minute task', completed: false, dueDate: '2026-05-20' }];
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify(todos),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '0',
      todoReminderNotified: {}
    }, resolve));

    await checkReminders();

    const notifKeys = Object.keys(chrome.notifications._notifications);
    expect(notifKeys).toHaveLength(1);
    expect(chrome.notifications._notifications[notifKeys[0]].message).toContain('Last minute task');
  });

  it('does not fire 30 minutes before due date when leadTime is 0', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:29:59'));
    const todos = [{ id: 't1', text: 'Too early', completed: false, dueDate: '2026-05-20' }];
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify(todos),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '0',
      todoReminderNotified: {}
    }, resolve));

    await checkReminders();

    expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);
  });

  it('notifications.onClicked opens New-Tab.html and clears notification', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    const todos = [{ id: 't1', text: 'Click test', completed: false, dueDate: '2026-05-20' }];
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify(todos),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {}
    }, resolve));

    await checkReminders();

    const notifKeys = Object.keys(chrome.notifications._notifications);
    expect(notifKeys).toHaveLength(1);
    const notifId = notifKeys[0];
    expect(notifId).toMatch(/^todo_reminder_/);

    const tabsSpy = vi.spyOn(chrome.tabs, 'create');
    const clearSpy = vi.spyOn(chrome.notifications, 'clear');

    const listener = chrome.notifications.onClicked._listeners[0];
    expect(listener).toBeDefined();
    listener(notifId);

    expect(tabsSpy).toHaveBeenCalledWith({ url: 'New-Tab.html' });
    expect(clearSpy).toHaveBeenCalledWith(notifId);

    tabsSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it('clearing notified entries re-enables suppressed notifications', async () => {
    vi.setSystemTime(new Date('2026-05-20T23:30:00'));
    const todos = [{ id: 't1', text: 'Suppressed task', completed: false, dueDate: '2026-05-20' }];
    await new Promise(resolve => chrome.storage.local.set({
      todos: JSON.stringify(todos),
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: { 't1_2026-05-20': Date.now() }
    }, resolve));

    // Should be suppressed
    await checkReminders();
    expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);

    // Clear the notified suppression
    await new Promise(resolve => chrome.storage.local.set({ todoReminderNotified: {} }, resolve));

    // Now the notification should fire
    await checkReminders();
    const notifKeys = Object.keys(chrome.notifications._notifications);
    expect(notifKeys).toHaveLength(1);
    expect(chrome.notifications._notifications[notifKeys[0]].message).toContain('Suppressed task');
  });

});
