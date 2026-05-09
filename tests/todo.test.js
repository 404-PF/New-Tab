import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
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
