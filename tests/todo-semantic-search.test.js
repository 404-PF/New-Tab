import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

const TODOS = [
  { id: '1', text: 'Buy milk', completed: false, createdAt: '2026-01-01' },
  { id: '2', text: 'Call mom', completed: false, createdAt: '2026-01-02' },
  { id: '3', text: 'Water plants', completed: false, createdAt: '2026-01-03' }
];

function setTodos(data) {
  localStorage.setItem('todos', JSON.stringify(data));
}

// Deterministic stand-in for the Harrier model: anything about milk embeds
// near the 'groceries' query, everything else points elsewhere.
function installSemanticMock({ ready = true } = {}) {
  window.EmbeddingService = {
    isReady: () => ready,
    getStatus: () => ({ status: ready ? 'ready' : 'idle', progress: ready ? 1 : 0, error: '', modelId: 'test-model' }),
    embedQuery: (q) => Promise.resolve(String(q).includes('groceries') ? [1, 0] : [0, 1]),
    embedTexts: (texts) => Promise.resolve(texts.map(t => (String(t).includes('milk') ? [1, 0] : [0, 1])))
  };
}

function visibleTexts() {
  return [...document.querySelectorAll('.todo-item')].map(item => item.querySelector('.todo-text')?.textContent);
}

let realTodoVectorCache;

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/core/utils.js');
  injectScript('src/core/toast.js');
  injectScript('src/ai/embeddings/notes-semantic-search.js');
  injectScript('src/ai/embeddings/notes-vector-cache.js');
  realTodoVectorCache = window.TodoVectorCache;
  injectScript('src/features/todo.js');
});

beforeEach(() => {
  localStorage.removeItem('notesSemanticDownload');
  localStorage.setItem('notesSemanticEnabled', 'true');
  setTodos(TODOS);
  installSemanticMock();
  window.initTodo();
  setTodoSearchQuery('');
});

afterEach(() => {
  delete window.EmbeddingService;
  window.TodoVectorCache = realTodoVectorCache;
  localStorage.removeItem('notesSemanticEnabled');
  localStorage.removeItem('notesSemanticDownload');
});

describe('Semantic todo search (issue #1330)', () => {
  it('falls back to the keyword results when the model is not ready', async () => {
    installSemanticMock({ ready: false });
    setTodoSearchQuery('milk');
    const keyword = filterTodos().map(todo => todo.id);
    const ranked = (await window.getFilteredTodosRanked()).map(todo => todo.id);
    expect(ranked).toEqual(keyword);
    expect(ranked).toEqual(['1']);
  });

  it('re-ranks by meaning when the model is ready and keywords do not match', async () => {
    setTodoSearchQuery('groceries');
    const ranked = await window.getFilteredTodosRanked();
    expect(ranked.map(todo => todo.text)).toEqual(['Buy milk']);
  });

  it('applies the debounced semantic order to the rendered list', async () => {
    const input = document.getElementById('todo-search');
    input.value = 'groceries';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(visibleTexts()).toEqual(['Buy milk']);
  });

  it('invalidates the cached vector when a todo is deleted', () => {
    const invalidated = [];
    localStorage.setItem('notesSemanticDownload', 'ready');
    window.TodoVectorCache = {
      deleteCachedVectorsForItem: (id) => { invalidated.push(id); return Promise.resolve(true); }
    };
    window.deleteTodo('2');
    expect(invalidated).toEqual(['2']);
  });

  it('invalidates the cached vector when a todo is edited', () => {
    const invalidated = [];
    localStorage.setItem('notesSemanticDownload', 'ready');
    window.TodoVectorCache = {
      deleteCachedVectorsForItem: (id) => { invalidated.push(id); return Promise.resolve(true); }
    };
    window.editTodo('1', 'Buy oat milk', 'medium', null, null, null, null, null);
    expect(invalidated).toEqual(['1']);
  });
});
