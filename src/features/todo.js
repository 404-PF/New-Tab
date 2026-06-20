// src/features/todo.js - Modern Todo List Functionality

(function () {
  'use strict';

  // State management
  let todos = [];
  let filteredTodos = [];
  const currentFilters = {
    status: 'all',
    priority: 'all'
  };

  // Animation config
  const STAGGER_DELAY = 0.05; // seconds between each item
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // DOM elements
  let elements = {};

  // Edit modal state
  const editModalState = {
    currentTodoId: null,
    isOpen: false
  };
  const runTodoOnDomReady = window.onDomReady;

  // Attempt to parse a JSON string; returns the original value on failure.
  function parseCandidate(value) {
    if (typeof value !== 'string') {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // Load todos from localStorage
  function loadTodos() {
    try {
      const raw = localStorage.getItem('todos');
      if (!raw) return [];

      let parsed = JSON.parse(raw);

      // Handle possible double-encoded / serialised payloads
      parsed = parseCandidate(parsed);
      // Unwrap legacy {count, todos} format where the real list lives under .todos
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.todos)) {
        parsed = parsed.todos;
      }

      // Final normalisation pass to ensure we hold a plain array
      parsed = parseCandidate(parsed);
      if (!Array.isArray(parsed)) {
        console.warn('Invalid todos data in localStorage: expected array, resetting to empty list');
        return [];
      }
      return parsed;
    } catch (e) {
      console.warn('Failed to parse todos from localStorage, resetting to empty list:', e);
      return [];
    }
  }

  // Save todos to localStorage
  function saveTodos(todos) {
    try {
      localStorage.setItem('todos', JSON.stringify(todos));
      return true;
    } catch (error) {
      console.warn('Failed to save todos to localStorage:', error);
      return false;
    }
  }

  function scheduleTodoReminderCheck(todoId, resetNotified) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        // Sends in-memory todos as JSON string to the service worker.
        // The service worker uses this payload over stale chrome.storage.local data.
        // If the payload is ever malformed/absent, the fallback reads from storage.
        chrome.runtime.sendMessage({
          type: 'syncTodos',
          todoId: todoId || undefined,
          todos: JSON.stringify(todos),
          resetNotified: resetNotified || undefined
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Failed to send reminder sync message:', e);
    }
  }

  function cloneTodos(sourceTodos) {
    return sourceTodos.map(todo => ({
      ...todo,
      subtasks: todo.subtasks ? todo.subtasks.map(st => ({ ...st })) : undefined
    }));
  }

  function showTodoSaveError() {
    showToast('Failed to save todo changes. Your last action was not saved.', 'error');
  }

  // Format date as local ISO string (YYYY-MM-DD)
  function formatDateISO(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  // Parse a YYYY-MM-DD date string as a local-time Date (avoids UTC shift).
  function parseLocalDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  // Generate unique ID for todos
  function generateTodoId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Date utilities
  function formatDate(dateString) {
    if (!dateString) return '';
    const date = parseLocalDate(dateString);
    const currentLang = window.i18n ? window.i18n.currentLanguage() : 'en';
    const locale = currentLang === 'zh' ? 'zh-CN' : 'en-US';
    return date.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  }

  function isOverdue(dateString) {
    if (!dateString) return false;
    const dueDate = parseLocalDate(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  }

  function createSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tagName);
    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, value);
    });
    return element;
  }

  function createTodoIconButton(className, title, todoId, iconChildren) {
    const button = document.createElement('button');
    button.className = className;
    button.dataset.id = todoId;
    button.title = title;

    const svg = createSvgElement('svg', {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    });

    iconChildren.forEach(child => {
      svg.appendChild(createSvgElement(child.tagName, child.attributes));
    });

    button.appendChild(svg);
    return button;
  }

  function createTodoBullet(completed) {
    const svg = createSvgElement('svg', {
      viewBox: '0 0 24 24',
      fill: 'none',
      class: completed ? 'bullet-checked' : 'bullet-unchecked'
    });

    if (completed) {
      svg.appendChild(createSvgElement('circle', {
        cx: '12',
        cy: '12',
        r: '10',
        fill: 'currentColor'
      }));
      svg.appendChild(createSvgElement('path', {
        d: 'M9 12l2 2 4-4',
        stroke: 'white',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        fill: 'none'
      }));
      return svg;
    }

    svg.appendChild(createSvgElement('circle', {
      cx: '12',
      cy: '12',
      r: '9',
      stroke: 'currentColor',
      'stroke-width': '2',
      fill: 'none'
    }));
    return svg;
  }

  // Filtering and sorting
  function filterTodos() {
    let filtered = [...todos];

    // Status filter
    if (currentFilters.status !== 'all') {
      filtered = filtered.filter(todo => {
        switch (currentFilters.status) {
          case 'pending':
            return !todo.completed;
          case 'completed':
            return todo.completed;
          case 'overdue':
            return !todo.completed && todo.dueDate && isOverdue(todo.dueDate);
          default:
            return true;
        }
      });
    }

    // Priority filter
    if (currentFilters.priority !== 'all') {
      filtered = filtered.filter(todo => {
        const todoPriority = todo.priority || 'medium';
        return todoPriority === currentFilters.priority;
      });
    }

    // Sort: incomplete items first (by order), then completed items (by completion time)
    filtered.sort((a, b) => {
      // If both are incomplete, sort by order (original position)
      if (!a.completed && !b.completed) {
        const orderA = a.order !== undefined ? a.order : new Date(a.createdAt).getTime();
        const orderB = b.order !== undefined ? b.order : new Date(b.createdAt).getTime();
        return orderA - orderB;
      }
      
      // If both are completed, sort by completion time (chronological)
      if (a.completed && b.completed) {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return timeA - timeB;
      }
      
      // Incomplete items come first
      if (!a.completed && b.completed) return -1;
      if (a.completed && !b.completed) return 1;
      
      return 0;
    });

    filteredTodos = filtered;
    return filtered;
  }

  // Render the todo list with FLIP animation for smooth reordering
  function renderTodos() {
    const todoList = elements.todoList;
    const emptyState = elements.emptyState;

    if (!todoList || !emptyState) return;

    // Get existing element positions (First step of FLIP)
    const existingItems = {};
    todoList.querySelectorAll('.todo-item').forEach(item => {
      const rect = item.getBoundingClientRect();
      existingItems[item.dataset.id] = {
        top: rect.top,
        left: rect.left
      };
    });

    // Clear existing list
    todoList.innerHTML = '';

    // Show/hide empty state
    if (filteredTodos.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    // Render each todo with staggered animation
    filteredTodos.forEach((todo, index) => {
      const li = document.createElement('li');
      li.className = `todo-item ${todo.completed ? 'completed' : ''} ${todo.dueDate && isOverdue(todo.dueDate) ? 'overdue' : ''}`;
      li.dataset.id = todo.id;
      li.draggable = true;

      const todoItemRow = document.createElement('div');
      todoItemRow.className = 'todo-item-row';

      const bullet = document.createElement('div');
      bullet.className = 'todo-bullet';
      bullet.dataset.id = todo.id;
      bullet.appendChild(createTodoBullet(todo.completed));
      const todoContent = document.createElement('div');
      todoContent.className = 'todo-content';
      const todoText = document.createElement('p');
      todoText.className = 'todo-text';
      todoText.textContent = todo.text ?? '';
      todoContent.appendChild(todoText);

      // Priority badge
      const todoPriority = todo.priority || 'medium';
      if (todoPriority !== 'medium') {
        const priorityBadge = document.createElement('span');
        priorityBadge.className = `todo-priority-badge priority-${todoPriority}`;
        priorityBadge.textContent = todoPriority.charAt(0).toUpperCase() + todoPriority.slice(1);
        todoContent.appendChild(priorityBadge);
      }

      const dueDate = document.createElement('div');
      dueDate.className = `todo-due-date clickable ${todo.dueDate ? (isOverdue(todo.dueDate) ? 'overdue' : '') : 'empty'}`;
      dueDate.dataset.todoId = todo.id;

      const dueDateSvg = createSvgElement('svg', {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      });
      dueDateSvg.appendChild(createSvgElement('rect', {
        x: '3',
        y: '4',
        width: '18',
        height: '18',
        rx: '2',
        ry: '2'
      }));
      dueDateSvg.appendChild(createSvgElement('line', {
        x1: '16',
        y1: '2',
        x2: '16',
        y2: '6'
      }));
      dueDateSvg.appendChild(createSvgElement('line', {
        x1: '8',
        y1: '2',
        x2: '8',
        y2: '6'
      }));
      dueDateSvg.appendChild(createSvgElement('line', {
        x1: '3',
        y1: '10',
        x2: '21',
        y2: '10'
      }));
      dueDate.appendChild(dueDateSvg);

      const dueDateText = document.createElement('span');
      dueDateText.className = 'due-date-text';
      dueDateText.textContent = todo.dueDate ? formatDate(todo.dueDate) : (window.i18n ? window.i18n.t('todoSetDate') : 'Set date');
      dueDate.appendChild(dueDateText);

      const todoActions = document.createElement('div');
      todoActions.className = 'todo-actions';
      todoActions.appendChild(createTodoIconButton('todo-edit-btn', window.i18n ? window.i18n.t('todoEditTooltip') : 'Edit Todo', todo.id, [
        { tagName: 'path', attributes: { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' } },
        { tagName: 'path', attributes: { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' } }
      ]));
      todoActions.appendChild(createTodoIconButton('todo-delete-btn', window.i18n ? window.i18n.t('todoDeleteTooltip') : 'Delete Todo', todo.id, [
        { tagName: 'polyline', attributes: { points: '3,6 5,6 21,6' } },
        { tagName: 'path', attributes: { d: 'M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2' } },
        { tagName: 'line', attributes: { x1: '10', y1: '11', x2: '10', y2: '17' } },
        { tagName: 'line', attributes: { x1: '14', y1: '11', x2: '14', y2: '17' } }
      ]));

      todoItemRow.appendChild(bullet);
      todoItemRow.appendChild(todoContent);
      todoItemRow.appendChild(dueDate);
      todoItemRow.appendChild(todoActions);

      li.appendChild(todoItemRow);

      // Subtasks
      if (todo.subtasks && todo.subtasks.length > 0) {
        const subtasksContainer = document.createElement('div');
        subtasksContainer.className = 'todo-subtasks';

        todo.subtasks.forEach(subtask => {
          const stItem = document.createElement('div');
          stItem.className = `todo-subtask-item ${subtask.checked ? 'checked' : ''}`;
          stItem.dataset.subtaskId = subtask.id;
          stItem.dataset.todoId = todo.id;

          const stCheckbox = document.createElement('div');
          stCheckbox.className = 'todo-subtask-checkbox';
          stCheckbox.dataset.todoId = todo.id;
          stCheckbox.dataset.subtaskId = subtask.id;

          const stSvg = createSvgElement('svg', {
            viewBox: '0 0 24 24',
            fill: 'none',
            class: subtask.checked ? 'subtask-checked' : 'subtask-unchecked'
          });
          if (subtask.checked) {
            stSvg.appendChild(createSvgElement('rect', {
              x: '3', y: '3', width: '18', height: '18', rx: '3',
              fill: 'currentColor'
            }));
            stSvg.appendChild(createSvgElement('path', {
              d: 'M9 12l2 2 4-4',
              stroke: 'white', 'stroke-width': '2',
              'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none'
            }));
          } else {
            stSvg.appendChild(createSvgElement('rect', {
              x: '3', y: '3', width: '18', height: '18', rx: '3',
              stroke: 'currentColor', 'stroke-width': '2', fill: 'none'
            }));
          }
          stCheckbox.appendChild(stSvg);

          const stText = document.createElement('span');
          stText.className = 'todo-subtask-text';
          stText.textContent = subtask.text;

          const stDelete = document.createElement('button');
          stDelete.className = 'todo-subtask-delete';
          stDelete.dataset.todoId = todo.id;
          stDelete.dataset.subtaskId = subtask.id;
          stDelete.title = window.i18n ? window.i18n.t('todoSubtaskDelete') : 'Delete subtask';
          const delSvg = createSvgElement('svg', {
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
            'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
          });
          delSvg.appendChild(createSvgElement('line', { x1: '18', y1: '6', x2: '6', y2: '18' }));
          delSvg.appendChild(createSvgElement('line', { x1: '6', y1: '6', x2: '18', y2: '18' }));
          stDelete.appendChild(delSvg);

          stItem.appendChild(stCheckbox);
          stItem.appendChild(stText);
          stItem.appendChild(stDelete);
          subtasksContainer.appendChild(stItem);
        });

        // Progress badge
        const progress = getSubtaskProgress(todo);
        if (progress) {
          const badge = document.createElement('span');
          badge.className = 'todo-subtask-progress';
          badge.textContent = `${progress.done}/${progress.total}`;
          todoContent.appendChild(badge);
        }

        li.appendChild(subtasksContainer);
      }

      // Add staggered animation delay
      li.style.animationDelay = `${index * STAGGER_DELAY}s`;
      li.setAttribute('data-animation', 'enter');

      todoList.appendChild(li);
    });

    // Apply FLIP animation for reordering
    requestAnimationFrame(() => {
      const reducedMotion = window.prefersReducedMotion && window.prefersReducedMotion();
      todoList.querySelectorAll('.todo-item').forEach(item => {
        const id = item.dataset.id;
        if (existingItems[id]) {
          const newRect = item.getBoundingClientRect();
          const oldPos = existingItems[id];
          const deltaY = oldPos.top - newRect.top;
          const deltaX = oldPos.left - newRect.left;

          // If position changed, apply flip animation
          if (deltaY !== 0 || deltaX !== 0) {
            if (reducedMotion) {
              item.style.transition = 'none';
              item.style.transform = '';
            } else {
              // Invert: move item back to original position
              item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
              item.style.transition = 'none';

              // Play: animate to new position
              requestAnimationFrame(() => {
                item.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                item.style.transform = '';
              });
            }
          }
        }
      });
    });
  }

  function getInlineMonthLabel(monthIndex) {
    const monthKeys = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthLabels = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthKey = monthKeys[monthIndex];
    return window.i18n ? window.i18n.t(monthKey) : monthLabels[monthIndex];
  }

  // Add a new todo
  function addTodo(text, dueDate = null, priority = 'medium') {
    if (!text.trim()) return;

    // Find the maximum order value among existing todos
    const maxOrder = todos.reduce((max, todo) => {
      return todo.order !== undefined ? Math.max(max, todo.order) : max;
    }, -1);

    const newTodo = {
      id: generateTodoId(),
      text: text.trim(),
      completed: false,
      completedAt: null, // Track when todo was completed
      dueDate: dueDate,
      priority: priority || 'medium',
      createdAt: new Date().toISOString(),
      order: maxOrder + 1 // Add order property to track position (always at the end)
    };

    todos.push(newTodo);
    if (!saveTodos(todos)) {
      todos = todos.filter(todo => todo.id !== newTodo.id);
      applyFilters();
      showTodoSaveError();
      return;
    }

    applyFilters();
    clearInputs();
    (window.scheduleTodoReminderCheck || scheduleTodoReminderCheck)(newTodo.id);
  }

  // Migrate existing todos to have completedAt property
  function migrateTodos() {
    const previousTodos = cloneTodos(todos);
    let needsMigration = false;
    
    todos.forEach(todo => {
      if (todo.completedAt === undefined) {
        // For existing completed todos without completedAt,
        // use createdAt as a fallback (they were completed before this feature)
        todo.completedAt = todo.completed ? todo.createdAt : null;
        needsMigration = true;
      }
    });
    
    if (needsMigration) {
      if (!saveTodos(todos)) {
        todos = previousTodos;
        applyFilters();
        showTodoSaveError();
        return false;
      }
    }

    return true;
  }

  // Edit a todo
  function editTodo(id, newText, newPriority, newDueDate) {
    const todo = todos.find(t => t.id === id);
    if (!todo) {
      return false;
    }

    const previousTodo = { ...todo };
    todo.text = newText.trim();
    if (newPriority !== null && newPriority !== undefined) {
      todo.priority = newPriority;
    }
    if (newDueDate !== null && newDueDate !== undefined) {
      todo.dueDate = newDueDate;
    }
    if (!saveTodos(todos)) {
      Object.assign(todo, previousTodo);
      applyFilters();
      showTodoSaveError();
      return false;
    }

    applyFilters();
    (window.scheduleTodoReminderCheck || scheduleTodoReminderCheck)(id);
    return true;
  }

  // Toggle todo completion
  function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
      const previousTodo = { ...todo };
      todo.completed = !todo.completed;
      
      // Track completion time for sorting
      if (todo.completed) {
        todo.completedAt = new Date().toISOString();
      } else {
        todo.completedAt = null;
      }
      
      if (!saveTodos(todos)) {
        Object.assign(todo, previousTodo);
        applyFilters();
        showTodoSaveError();
        return;
      }

      applyFilters();
      (window.scheduleTodoReminderCheck || scheduleTodoReminderCheck)(id);
    }
  }


// Delete a todo
function deleteTodo(id) {
  const previousTodos = cloneTodos(todos);
  todos = todos.filter(t => t.id !== id);
  if (!saveTodos(todos)) {
    todos = previousTodos;
    applyFilters();
    showTodoSaveError();
    return;
  }

  applyFilters();
  (window.scheduleTodoReminderCheck || scheduleTodoReminderCheck)(id);
}

// Subtask management
function addSubtask(todoId, text) {
  if (!text || !text.trim()) return false;
  const todo = todos.find(t => t.id === todoId);
  if (!todo) return false;

  const previousTodo = { ...todo, subtasks: todo.subtasks ? [...todo.subtasks.map(st => ({ ...st }))] : undefined };
  if (!todo.subtasks) todo.subtasks = [];

  todo.subtasks.push({
    id: generateTodoId(),
    text: text.trim(),
    checked: false
  });

  if (!saveTodos(todos)) {
    Object.assign(todo, previousTodo);
    applyFilters();
    showTodoSaveError();
    return false;
  }

  applyFilters();
  return true;
}

function deleteSubtask(todoId, subtaskId) {
  const todo = todos.find(t => t.id === todoId);
  if (!todo || !todo.subtasks) return false;

  const previousTodo = { ...todo, subtasks: todo.subtasks.map(st => ({ ...st })) };
  const originalLength = todo.subtasks.length;
  todo.subtasks = todo.subtasks.filter(st => st.id !== subtaskId);

  // If no subtask was removed, return false
  if (todo.subtasks.length === originalLength) {
    return false;
  }

  if (!saveTodos(todos)) {
    Object.assign(todo, previousTodo);
    applyFilters();
    showTodoSaveError();
    return false;
  }

  applyFilters();
  return true;
}

function toggleSubtask(todoId, subtaskId) {
  const todo = todos.find(t => t.id === todoId);
  if (!todo || !todo.subtasks) return false;

  const previousTodo = { ...todo, subtasks: todo.subtasks.map(st => ({ ...st })) };
  const subtask = todo.subtasks.find(st => st.id === subtaskId);
  if (!subtask) return false;

  subtask.checked = !subtask.checked;

  if (!saveTodos(todos)) {
    Object.assign(todo, previousTodo);
    applyFilters();
    showTodoSaveError();
    return false;
  }

  applyFilters();
  return true;
}

function updateSubtaskText(todoId, subtaskId, newText) {
  const todo = todos.find(t => t.id === todoId);
  if (!todo || !todo.subtasks) return false;
  if (!newText || !newText.trim()) return false;

  const previousTodo = { ...todo, subtasks: todo.subtasks.map(st => ({ ...st })) };
  const subtask = todo.subtasks.find(st => st.id === subtaskId);
  if (!subtask) return false;

  subtask.text = newText.trim();

  if (!saveTodos(todos)) {
    Object.assign(todo, previousTodo);
    applyFilters();
    showTodoSaveError();
    return false;
  }

  applyFilters();
  return true;
}

function getSubtaskProgress(todo) {
  if (!todo.subtasks || todo.subtasks.length === 0) return null;
  const done = todo.subtasks.filter(st => st.checked).length;
  return { done, total: todo.subtasks.length };
}

// Filter management
function applyFilters() {
  filterTodos();
  (window.renderTodos || renderTodos)();
  updateFilterUI();
  updateProgressRing();
  updateFilterCounts();
}

function updateFilters() {
  currentFilters.status = elements.filterStatus?.value || 'all';
  applyFilters();
}

// Update filter pill UI
function updateFilterUI() {
  const pills = document.querySelectorAll('.filter-pill');
  pills.forEach(pill => {
    const filter = pill.dataset.filter;
    const filterType = pill.dataset.filterType || 'status';
    const currentFilter = filterType === 'priority' ? currentFilters.priority : currentFilters.status;
    pill.classList.toggle('active', filter === currentFilter);
  });
}

// Update progress ring
function updateProgressRing() {
  const total = todos.length;
  const completed = todos.filter(t => t.completed).length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  
  const fill = document.getElementById('progress-ring-fill');
  const text = document.getElementById('progress-text');
  
  if (fill) {
    fill.setAttribute('stroke-dasharray', `${percentage}, 100`);
  }
  if (text) {
    text.textContent = `${percentage}%`;
  }
}

// Update filter badge counts
function updateFilterCounts() {
  const all = todos.length;
  const pending = todos.filter(t => !t.completed).length;
  const completed = todos.filter(t => t.completed).length;
  const overdue = todos.filter(t => !t.completed && t.dueDate && isOverdue(t.dueDate)).length;
  const high = todos.filter(t => (t.priority || 'medium') === 'high').length;
  const low = todos.filter(t => (t.priority || 'medium') === 'low').length;
  
  const badgeAll = document.getElementById('badge-all');
  const badgePending = document.getElementById('badge-pending');
  const badgeCompleted = document.getElementById('badge-completed');
  const badgeOverdue = document.getElementById('badge-overdue');
  const badgeHigh = document.getElementById('badge-high');
  const badgeLow = document.getElementById('badge-low');
  const todoCount = document.getElementById('todo-count');
  
  if (badgeAll) badgeAll.textContent = all;
  if (badgePending) badgePending.textContent = pending;
  if (badgeCompleted) badgeCompleted.textContent = completed;
  if (badgeOverdue) badgeOverdue.textContent = overdue;
  if (badgeHigh) badgeHigh.textContent = high;
  if (badgeLow) badgeLow.textContent = low;
  if (todoCount) todoCount.textContent = `${completed}/${all}`;
}

// Quick actions
function clearCompleted() {
  const completedTodos = todos.filter(t => t.completed);
  if (completedTodos.length === 0) return;
  
  // Show confirmation dialog
  showClearCompletedDialog();
}

// Show clear completed confirmation dialog
function showClearCompletedDialog() {
  const dialog = document.getElementById('clear-completed-dialog');
  const confirmBtn = document.getElementById('clear-completed-confirm');
  const cancelBtn = dialog?.querySelector('.ai-confirm-cancel');
  const overlay = dialog?.querySelector('.ai-confirm-overlay');
  
  if (!dialog) return;
  
  // Show the dialog
  dialog.classList.add('ai-confirm-open');
  
  const messageEl = dialog.querySelector('.ai-confirm-message');
  if (messageEl && window.i18n) {
    const message = window.i18n.t('clearCompletedConfirmMessage');
    messageEl.textContent = message;
  }
  
  // Handle confirm button click
  const handleConfirm = () => {
    const previousTodos = cloneTodos(todos);
    // Actually clear the completed todos
    todos = todos.filter(t => !t.completed);
    if (!saveTodos(todos)) {
      todos = previousTodos;
      applyFilters();
      showTodoSaveError();
    } else {
      applyFilters();
      (window.scheduleTodoReminderCheck || scheduleTodoReminderCheck)();
    }

    hideClearCompletedDialog();

    // Remove event listeners
    confirmBtn?.removeEventListener('click', handleConfirm);
    cancelBtn?.removeEventListener('click', handleCancel);
    overlay?.removeEventListener('click', handleCancel);
  };
  
  // Handle cancel button click
  const handleCancel = () => {
    hideClearCompletedDialog();
    
    // Remove event listeners
    confirmBtn?.removeEventListener('click', handleConfirm);
    cancelBtn?.removeEventListener('click', handleCancel);
    overlay?.removeEventListener('click', handleCancel);
  };
  
  // Add event listeners
  confirmBtn?.addEventListener('click', handleConfirm);
  cancelBtn?.addEventListener('click', handleCancel);
  overlay?.addEventListener('click', handleCancel);
}

// Hide clear completed confirmation dialog
function hideClearCompletedDialog() {
  const dialog = document.getElementById('clear-completed-dialog');
  if (dialog) {
    dialog.classList.remove('ai-confirm-open');
  }
}

// Handle filter pill clicks
function handleFilterPillClick(event) {
  const pill = event.target.closest('.filter-pill');
  if (!pill) return;
  
  const filterType = pill.dataset.filterType || 'status';
  if (filterType === 'priority') {
    currentFilters.priority = pill.dataset.filter;
  } else {
    currentFilters.status = pill.dataset.filter;
  }
  applyFilters();
}

// Clear input fields
function clearInputs() {
  if (elements.todoInput) elements.todoInput.value = '';
  if (elements.todoDueDate) elements.todoDueDate.value = '';
  // Clear custom date picker
  if (customDatePicker) {
    customDatePicker.clearDate();
  }
  // Reset priority selector to medium
  const priorityBtns = document.querySelectorAll('.priority-selector-btn');
  priorityBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.priority === 'medium');
  });
}

// Drag and drop functionality
let draggedElement = null;

function handleDragStart(event) {
  draggedElement = event.target;
  event.target.style.opacity = '0.5';
}

function handleDragEnd(event) {
  event.target.style.opacity = '1';
  draggedElement = null;
}

function handleDragOver(event) {
  event.preventDefault();
}

function handleDrop(event) {
  event.preventDefault();
  if (!draggedElement) return;

  const draggedId = draggedElement.dataset.id;
  const dropTarget = event.target.closest('.todo-item');

  if (!dropTarget || draggedElement === dropTarget) return;

  const draggedIndex = filteredTodos.findIndex(todo => todo.id === draggedId);
  const dropIndex = filteredTodos.findIndex(todo => todo.id === dropTarget.dataset.id);

  if (draggedIndex === -1 || dropIndex === -1) return;

  // Save state for rollback before any mutation
  const previousTodos = cloneTodos(todos);

  // Reorder the filtered todos array
  const [removed] = filteredTodos.splice(draggedIndex, 1);
  filteredTodos.splice(dropIndex, 0, removed);

  // Rebuild the full todos array: filtered items keep their new
  // order, hidden (non-filtered) items are appended in their
  // original relative order so they are never shuffled.
  const filteredIds = new Set(filteredTodos.map(t => t.id));
  const reorderedTodos = [...filteredTodos];

  for (const todo of todos) {
    if (!filteredIds.has(todo.id)) {
      reorderedTodos.push(todo);
    }
  }

  // Assign sequential order to ALL todos, not just the filtered subset
  reorderedTodos.forEach((todo, index) => {
    todo.order = index;
  });

  todos = reorderedTodos;
  if (!saveTodos(todos)) {
    todos = previousTodos;
    applyFilters();
    showTodoSaveError();
    return;
  }

  (window.renderTodos || renderTodos)();
}

// Event handlers
function handleKeyPress(event) {
  if (event.key === 'Enter') {
    const input = elements.todoInput;
    const dueDate = elements.todoDueDate?.value || null;
    const priority = getSelectedPriority();
    addTodo(input.value, dueDate, priority);
  }
}

function handleAddTodo() {
  const input = elements.todoInput;
  const dueDate = elements.todoDueDate?.value || null;
  const priority = getSelectedPriority();
  addTodo(input.value, dueDate, priority);
}

function getSelectedPriority() {
  const activeBtn = document.querySelector('.priority-selector-btn.active');
  return activeBtn ? activeBtn.dataset.priority : 'medium';
}

function handleTodoListClick(event) {
  const target = event.target;

  // Handle bullet click (new circular bullet)
  const bullet = target.closest('.todo-bullet');
  if (bullet) {
    event.stopPropagation();
    const id = bullet.dataset.id;
    toggleTodo(id);
    return;
  }

  // Handle delete button
  if (target.closest('.todo-delete-btn')) {
    event.stopPropagation();
    const id = target.closest('.todo-delete-btn').dataset.id;
    deleteTodo(id);
    return;
  }

  // Handle edit button
  if (target.closest('.todo-edit-btn')) {
    event.stopPropagation();
    const id = target.closest('.todo-edit-btn').dataset.id;
    openEditModal(id);
    return;
  }

  // Handle subtask checkbox click
  const subtaskCheckbox = target.closest('.todo-subtask-checkbox');
  if (subtaskCheckbox) {
    event.stopPropagation();
    const todoId = subtaskCheckbox.dataset.todoId;
    const subtaskId = subtaskCheckbox.dataset.subtaskId;
    toggleSubtask(todoId, subtaskId);
    return;
  }

  // Handle subtask delete button
  const subtaskDelete = target.closest('.todo-subtask-delete');
  if (subtaskDelete) {
    event.stopPropagation();
    const todoId = subtaskDelete.dataset.todoId;
    const subtaskId = subtaskDelete.dataset.subtaskId;
    deleteSubtask(todoId, subtaskId);
    return;
  }
}

// Handle due date click for inline editing
function handleDueDateClick(event) {
  const dueDateElement = event.target.closest('.todo-due-date.clickable');
  if (!dueDateElement) return;
  
  event.stopPropagation();
  const todoId = dueDateElement.dataset.todoId;
  if (!todoId) return;
  
  // Show inline date picker for this todo
  showInlineDatePicker(todoId, dueDateElement);
}

// Show inline date picker for a specific todo
function showInlineDatePicker(todoId, dueDateElement) {
  // Close any existing inline date pickers
  closeAllInlineDatePickers();

  const todo = todos.find(t => t.id === todoId);
  if (!todo) return;

  // Create inline date picker container
  const pickerContainer = document.createElement('div');
  pickerContainer.className = 'inline-date-picker';
  pickerContainer.dataset.todoId = todoId;

  // Create calendar HTML
  const currentDate = todo.dueDate ? parseLocalDate(todo.dueDate) : new Date();
  pickerContainer._currentDate = currentDate;
  const calendarHtml = createCalendarHtml(currentDate, todo.dueDate);

  pickerContainer.innerHTML = calendarHtml;

  // Append to body to avoid overflow clipping from parent containers
  document.body.appendChild(pickerContainer);

  // Position the picker relative to the due date element
  positionPickerRelativeToElement(pickerContainer, dueDateElement);

  // Store references for cleanup
  pickerContainer._dueDateElement = dueDateElement;

  // Bind calendar DOM handlers (rebound on month change)
  setupInlineCalendarHandlers(pickerContainer, todoId, dueDateElement);

  // Bind global listeners ONCE (outside-click, resize, scroll)
  bindGlobalPickerListeners(pickerContainer, dueDateElement);

  // Show the picker with animation
  requestAnimationFrame(() => {
    pickerContainer.classList.add('visible');
  });
}

// Position picker relative to a target element
function positionPickerRelativeToElement(picker, targetElement) {
  const rect = targetElement.getBoundingClientRect();
  const pickerWidth = picker.offsetWidth || 280;
  const pickerHeight = picker.offsetHeight || 320;
  
  // Position below the target element
  let top = rect.bottom + 8;
  let left = rect.left;
  
  // Adjust if picker would go off-screen right
  if (left + pickerWidth > window.innerWidth - 16) {
    left = window.innerWidth - pickerWidth - 16;
  }
  
  // Adjust if picker would go off-screen bottom
  if (top + pickerHeight > window.innerHeight - 16) {
    top = rect.top - pickerHeight - 8;
  }
  
  picker.style.position = 'fixed';
  picker.style.top = `${top}px`;
  picker.style.left = `${left}px`;
}

// Create calendar HTML for inline picker
function createCalendarHtml(currentDate, selectedDateString) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const selectedDate = selectedDateString ? parseLocalDate(selectedDateString) : null;
  
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());
  
  let daysHtml = '';
  const today = new Date();
  
  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    
    const isCurrentMonth = date.getMonth() === month;
    const isToday = date.toDateString() === today.toDateString();
    const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
    
    let classes = 'calendar-day';
    if (!isCurrentMonth) classes += ' other-month';
    if (isToday) classes += ' today';
    if (isSelected) classes += ' selected';
    
    const localDate = formatDateISO(date);
    daysHtml += `<div class="${classes}" data-date="${localDate}">${date.getDate()}</div>`;
  }
  
  return `
    <div class="inline-calendar-header">
      <button type="button" class="inline-prev-month" aria-label="${window.i18n ? window.i18n.t('todoInlinePrevMonth') : 'Previous month'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15,18 9,12 15,6"></polyline>
        </svg>
      </button>
      <div class="inline-calendar-title">
        <span class="inline-calendar-month">${getInlineMonthLabel(month)}</span>
        <span class="inline-calendar-year">${year}</span>
      </div>
      <button type="button" class="inline-next-month" aria-label="${window.i18n ? window.i18n.t('todoInlineNextMonth') : 'Next month'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9,18 15,12 9,6"></polyline>
        </svg>
      </button>
    </div>
    <div class="inline-calendar-weekdays">
      <span>${window.i18n ? window.i18n.t('sunday') : 'Su'}</span>
      <span>${window.i18n ? window.i18n.t('monday') : 'Mo'}</span>
      <span>${window.i18n ? window.i18n.t('tuesday') : 'Tu'}</span>
      <span>${window.i18n ? window.i18n.t('wednesday') : 'We'}</span>
      <span>${window.i18n ? window.i18n.t('thursday') : 'Th'}</span>
      <span>${window.i18n ? window.i18n.t('friday') : 'Fr'}</span>
      <span>${window.i18n ? window.i18n.t('saturday') : 'Sa'}</span>
    </div>
    <div class="inline-calendar-days">
      ${daysHtml}
    </div>
    <div class="inline-calendar-footer">
      <button type="button" class="inline-clear-date">${window.i18n ? window.i18n.t('clearDate') : 'Clear'}</button>
      <button type="button" class="inline-today-date">${window.i18n ? window.i18n.t('todayDate') : 'Today'}</button>
    </div>
  `;
}

// Bind global listeners once per picker (no setTimeout)
function bindGlobalPickerListeners(pickerContainer, dueDateElement) {
  const handleOutsideClick = (e) => {
    if (!pickerContainer.contains(e.target) && !dueDateElement.contains(e.target)) {
      closeInlineDatePicker(pickerContainer);
    }
  };

  const handleResize = () => {
    positionPickerRelativeToElement(pickerContainer, dueDateElement);
  };

  const handleScroll = () => {
    positionPickerRelativeToElement(pickerContainer, dueDateElement);
  };

  pickerContainer._handleOutsideClick = handleOutsideClick;
  pickerContainer._handleResize = handleResize;
  pickerContainer._handleScroll = handleScroll;

  document.addEventListener('click', handleOutsideClick);
  window.addEventListener('resize', handleResize);
  window.addEventListener('scroll', handleScroll, true);
}

// Setup calendar DOM handlers only (rebound on month navigation)
function setupInlineCalendarHandlers(pickerContainer, todoId, dueDateElement) {
  const todo = todos.find(t => t.id === todoId);
  if (!todo) return;

  const currentDate = pickerContainer._currentDate ? new Date(pickerContainer._currentDate) : (todo.dueDate ? parseLocalDate(todo.dueDate) : new Date());

  // Navigation buttons
  const prevBtn = pickerContainer.querySelector('.inline-prev-month');
  const nextBtn = pickerContainer.querySelector('.inline-next-month');

  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentDate.setMonth(currentDate.getMonth() - 1);
      pickerContainer._currentDate = currentDate;
      updateInlineCalendar(pickerContainer, currentDate, todo.dueDate);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentDate.setMonth(currentDate.getMonth() + 1);
      pickerContainer._currentDate = currentDate;
      updateInlineCalendar(pickerContainer, currentDate, todo.dueDate);
    });
  }

  // Day click handlers
  const daysContainer = pickerContainer.querySelector('.inline-calendar-days');
  if (daysContainer) {
    daysContainer.addEventListener('click', (e) => {
      const dayElement = e.target.closest('.calendar-day');
      if (!dayElement || dayElement.classList.contains('other-month')) return;

      e.stopPropagation();
      const selectedDate = parseLocalDate(dayElement.dataset.date);
      updateTodoDueDate(todoId, selectedDate, dueDateElement);
      closeInlineDatePicker(pickerContainer);
    });
  }

  // Footer buttons
  const clearBtn = pickerContainer.querySelector('.inline-clear-date');
  const todayBtn = pickerContainer.querySelector('.inline-today-date');

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateTodoDueDate(todoId, null, dueDateElement);
      closeInlineDatePicker(pickerContainer);
    });
  }

  if (todayBtn) {
    todayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateTodoDueDate(todoId, new Date(), dueDateElement);
      closeInlineDatePicker(pickerContainer);
    });
  }
}

// Update inline calendar display
function updateInlineCalendar(pickerContainer, currentDate, selectedDateString) {
  const todoId = pickerContainer.dataset.todoId;
  const dueDateElement = pickerContainer._dueDateElement;

  pickerContainer._currentDate = currentDate;
  const calendarHtml = createCalendarHtml(currentDate, selectedDateString);
  pickerContainer.innerHTML = calendarHtml;

  // Rebind calendar DOM handlers only (globals are already bound once)
  setupInlineCalendarHandlers(pickerContainer, todoId, dueDateElement);
}

function refreshInlineDatePickers() {
  document.querySelectorAll('.inline-date-picker').forEach(pickerContainer => {
    const todoId = pickerContainer.dataset.todoId;
    const todo = todos.find(t => t.id === todoId);

    const dueDateElement = Array.from(document.querySelectorAll('.todo-due-date')).find(el => el.dataset.todoId === todoId);

    if (!todo || !dueDateElement) {
      closeInlineDatePicker(pickerContainer);
      return;
    }

    const currentDate = pickerContainer._currentDate ? new Date(pickerContainer._currentDate) : (todo.dueDate ? parseLocalDate(todo.dueDate) : new Date());
    pickerContainer._currentDate = currentDate;
    pickerContainer._dueDateElement = dueDateElement;
    positionPickerRelativeToElement(pickerContainer, dueDateElement);
    pickerContainer.innerHTML = createCalendarHtml(currentDate, todo.dueDate);
    setupInlineCalendarHandlers(pickerContainer, todoId, dueDateElement);
  });
}

// Update todo due date with visual feedback
function updateTodoDueDate(todoId, newDate, dueDateElement) {
  const todo = todos.find(t => t.id === todoId);
  if (!todo) return;
  
  const oldDate = todo.dueDate;
  const previousTodo = { ...todo };
  todo.dueDate = newDate ? formatDateISO(newDate) : null;
  
  // Save to localStorage
  if (!saveTodos(todos)) {
    Object.assign(todo, previousTodo);
    if (dueDateElement) {
      updateDueDateDisplay(dueDateElement, oldDate);
    }
    showTodoSaveError();
    return;
  }
  
  // Update the display with visual feedback
  updateDueDateDisplay(dueDateElement, todo.dueDate);
  
  // Show visual feedback
  showDateUpdateFeedback(dueDateElement, oldDate, todo.dueDate);
  
  // Re-run filters so overdue view refreshes immediately
  applyFilters();
  (window.scheduleTodoReminderCheck || scheduleTodoReminderCheck)(todoId);
}

// Update due date display
function updateDueDateDisplay(dueDateElement, dueDate) {
  const textElement = dueDateElement.querySelector('.due-date-text');
  if (!textElement) return;
  
  if (dueDate) {
    textElement.textContent = formatDate(dueDate);
    dueDateElement.classList.remove('empty');
    dueDateElement.classList.toggle('overdue', isOverdue(dueDate));
  } else {
    textElement.textContent = window.i18n ? window.i18n.t('todoSetDate') : 'Set date';
    dueDateElement.classList.add('empty');
    dueDateElement.classList.remove('overdue');
  }
}

// Show visual feedback for date update
function showDateUpdateFeedback(dueDateElement, oldDate, newDate) {
  // Under reduced motion we skip the backgroundColor highlight entirely.
  // A 150ms color flash is itself a sudden visual change, which conflicts
  // with the spirit of prefers-reduced-motion (WCAG 2.3.3). The toast
  // notification below already communicates the update, so no extra
  // in-place feedback is needed.
  if (!(window.prefersReducedMotion && window.prefersReducedMotion())) {
    dueDateElement.style.transition = 'background-color 0.3s ease, transform 0.2s ease';
    dueDateElement.style.backgroundColor = 'rgba(33, 150, 243, 0.3)';
    dueDateElement.style.transform = 'scale(1.05)';

    setTimeout(() => {
      dueDateElement.style.backgroundColor = '';
      dueDateElement.style.transform = '';
    }, 300);
  }

  // Show a toast notification
  const message = newDate
    ? `Due date updated to ${formatDate(newDate)}`
    : 'Due date cleared';
  showToast(message);
}

// Show toast notification
function showToast(message, type = '') {
  // Remove existing toast if any
  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  if (type) {
    toast.classList.add('toast-' + type);
  }
  toast.textContent = message;

  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Remove after 2 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2000);
}

// Close inline date picker
function closeInlineDatePicker(pickerContainer) {
  if (!pickerContainer || !pickerContainer.parentNode) return;
  
  pickerContainer.classList.remove('visible');
  
  // Clean up event listeners
  const handleOutsideClick = pickerContainer._handleOutsideClick;
  const handleResize = pickerContainer._handleResize;
  const handleScroll = pickerContainer._handleScroll;
  
  if (handleOutsideClick) {
    document.removeEventListener('click', handleOutsideClick);
  }
  if (handleResize) {
    window.removeEventListener('resize', handleResize);
  }
  if (handleScroll) {
    window.removeEventListener('scroll', handleScroll, true);
  }
  
  setTimeout(() => {
    if (pickerContainer.parentNode) {
      pickerContainer.remove();
    }
  }, 200);
}

// Close all inline date pickers
function closeAllInlineDatePickers() {
  const pickers = document.querySelectorAll('.inline-date-picker');
  pickers.forEach(picker => closeInlineDatePicker(picker));
}

// Render subtasks in the edit modal
function renderEditModalSubtasks(todo) {
  const container = document.getElementById('todo-edit-subtasks-list');
  const section = document.getElementById('todo-edit-subtasks-section');
  if (!container || !section) return;

  const subtasks = todo.subtasks || [];
  if (subtasks.length === 0 && !todo.id) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  container.innerHTML = '';

  subtasks.forEach(subtask => {
    const item = document.createElement('div');
    item.className = 'edit-subtask-item';
    item.dataset.subtaskId = subtask.id;

    const checkbox = document.createElement('div');
    checkbox.className = 'edit-subtask-checkbox';
    checkbox.dataset.todoId = todo.id;
    checkbox.dataset.subtaskId = subtask.id;

    const svg = createSvgElement('svg', {
      viewBox: '0 0 24 24', fill: 'none',
      class: subtask.checked ? 'subtask-checked' : 'subtask-unchecked'
    });
    if (subtask.checked) {
      svg.appendChild(createSvgElement('rect', {
        x: '3', y: '3', width: '18', height: '18', rx: '3',
        fill: 'currentColor'
      }));
      svg.appendChild(createSvgElement('path', {
        d: 'M9 12l2 2 4-4',
        stroke: 'white', 'stroke-width': '2',
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none'
      }));
    } else {
      svg.appendChild(createSvgElement('rect', {
        x: '3', y: '3', width: '18', height: '18', rx: '3',
        stroke: 'currentColor', 'stroke-width': '2', fill: 'none'
      }));
    }
    checkbox.appendChild(svg);

    const text = document.createElement('span');
    text.className = 'edit-subtask-text';
    text.textContent = subtask.text;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'edit-subtask-delete';
    deleteBtn.dataset.todoId = todo.id;
    deleteBtn.dataset.subtaskId = subtask.id;
    deleteBtn.title = window.i18n ? window.i18n.t('todoSubtaskDelete') : 'Delete subtask';
    const delSvg = createSvgElement('svg', {
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    delSvg.appendChild(createSvgElement('line', { x1: '18', y1: '6', x2: '6', y2: '18' }));
    delSvg.appendChild(createSvgElement('line', { x1: '6', y1: '6', x2: '18', y2: '18' }));
    deleteBtn.appendChild(delSvg);

    item.appendChild(checkbox);
    item.appendChild(text);
    item.appendChild(deleteBtn);
    container.appendChild(item);
  });

  // Bind events for subtask interactions in the edit modal
  setupEditModalSubtaskHandlers(todo.id);
}

function handleEditModalSubtaskClick(e) {
  const checkbox = e.target.closest('.edit-subtask-checkbox');
  if (checkbox) {
    e.stopPropagation();
    toggleSubtask(checkbox.dataset.todoId, checkbox.dataset.subtaskId);
    const todo = todos.find(t => t.id === checkbox.dataset.todoId);
    if (todo) renderEditModalSubtasks(todo);
    return;
  }

  const deleteBtn = e.target.closest('.edit-subtask-delete');
  if (deleteBtn) {
    e.stopPropagation();
    deleteSubtask(deleteBtn.dataset.todoId, deleteBtn.dataset.subtaskId);
    const todo = todos.find(t => t.id === deleteBtn.dataset.todoId);
    if (todo) renderEditModalSubtasks(todo);
    return;
  }
}

function setupEditModalSubtaskHandlers(todoId) {
  const container = document.getElementById('todo-edit-subtasks-list');
  if (!container) return;

  container.removeEventListener('click', handleEditModalSubtaskClick);
  container.addEventListener('click', handleEditModalSubtaskClick);
}

// Edit Modal Functions
function openEditModal(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;

  editModalState.currentTodoId = id;
  editModalState.isOpen = true;

  // Populate modal fields
  const textInput = document.getElementById('todo-edit-text');
  const prioritySelect = document.getElementById('todo-edit-priority');
  const modal = document.getElementById('todo-edit-modal');

  if (textInput) textInput.value = todo.text;
  if (prioritySelect) prioritySelect.value = todo.priority || 'medium';

  // Render subtasks in edit modal
  renderEditModalSubtasks(todo);

  // Show modal
  if (modal) {
    modal.classList.add('modal-open');
    // Focus on text input
    setTimeout(() => {
      if (textInput) textInput.focus();
    }, 100);
  }
}

function closeEditModal() {
  editModalState.currentTodoId = null;
  editModalState.isOpen = false;

  const modal = document.getElementById('todo-edit-modal');

  if (modal) modal.classList.remove('modal-open');
}

function saveEdit() {
  if (!editModalState.currentTodoId) return;

  const textInput = document.getElementById('todo-edit-text');
  const prioritySelect = document.getElementById('todo-edit-priority');
  const subtaskInput = document.getElementById('todo-edit-subtask-input');

  const newText = textInput ? textInput.value.trim() : '';
  const newPriority = prioritySelect ? prioritySelect.value : null;

  if (!newText) {
    // Show error or focus on text input
    if (textInput) textInput.focus();
    return;
  }

  // Get the existing todo to preserve its due date
  const existingTodo = todos.find(t => t.id === editModalState.currentTodoId);
  const preservedDueDate = existingTodo ? existingTodo.dueDate : null;

  if (editTodo(editModalState.currentTodoId, newText, newPriority, preservedDueDate)) {
    // Add any pending subtask from the input
    if (subtaskInput && subtaskInput.value.trim()) {
      addSubtask(editModalState.currentTodoId, subtaskInput.value.trim());
    }
    closeEditModal();
  }
}

// Initialize todo functionality
function initTodo() {
  // Get DOM elements
  elements = {
    todoInput: document.getElementById('todo-input'),
    todoDueDate: document.getElementById('todo-due-date'),
    addTodoBtn: document.getElementById('add-todo-btn'),
    todoList: document.getElementById('todo-list'),
    emptyState: document.getElementById('empty-state'),
    filterStatus: document.getElementById('filter-status'),
    todoFilters: document.querySelector('.todo-filters')
  };

  // Check if all elements exist
  const requiredElements = ['todoInput', 'addTodoBtn', 'todoList'];
  if (!requiredElements.every(key => elements[key])) {
    console.warn('Required todo elements not found');
    return false;
  }

  // Load todos
  todos = loadTodos();
  
  // Migrate existing todos to have completedAt property
  migrateTodos();

  // Event listeners
  elements.addTodoBtn.addEventListener('click', handleAddTodo);
  elements.todoInput.addEventListener('keypress', handleKeyPress);

  // Filter listeners - pill style
  const filterPills = document.querySelectorAll('.filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', handleFilterPillClick);
  });

  // Priority selector buttons
  const priorityBtns = document.querySelectorAll('.priority-selector-btn');
  priorityBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      priorityBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  
  // Keep legacy dropdown support
  if (elements.filterStatus) {
    elements.filterStatus.addEventListener('change', updateFilters);
  }
  
  // Quick action buttons
  const clearCompletedBtn = document.getElementById('clear-completed');
  
  if (clearCompletedBtn) {
    clearCompletedBtn.addEventListener('click', clearCompleted);
  }

  // Export and Import buttons
  const exportBtn = document.getElementById('export-todos');
  const importBtn = document.getElementById('import-todos');
  const importFileInput = document.getElementById('todo-import-file');
  
  if (exportBtn) {
    exportBtn.addEventListener('click', exportTodos);
  }
  if (importBtn) {
    importBtn.addEventListener('click', importTodos);
  }
  if (importFileInput) {
    importFileInput.addEventListener('change', handleImportFile);
  }

  // Todo list event delegation
  elements.todoList.addEventListener('click', handleTodoListClick);

  // Due date click handler for inline editing
  elements.todoList.addEventListener('click', handleDueDateClick);

  // Drag and drop
  elements.todoList.addEventListener('dragstart', handleDragStart);
  elements.todoList.addEventListener('dragend', handleDragEnd);
  elements.todoList.addEventListener('dragover', handleDragOver);
  elements.todoList.addEventListener('drop', handleDrop);

  // Edit modal event listeners
  const editModalClose = document.getElementById('todo-edit-close');
  const editModalCancel = document.getElementById('todo-edit-cancel');
  const editModalSave = document.getElementById('todo-edit-save');
  const editModal = document.getElementById('todo-edit-modal');

  if (editModalClose) {
    editModalClose.addEventListener('click', closeEditModal);
  }
  if (editModalCancel) {
    editModalCancel.addEventListener('click', closeEditModal);
  }
  if (editModalSave) {
    editModalSave.addEventListener('click', saveEdit);
  }

  // Keyboard shortcuts for edit modal
  const editTextInput = document.getElementById('todo-edit-text');
  if (editTextInput) {
    editTextInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveEdit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeEditModal();
      }
    });
  }

  // Subtask input handler in edit modal
  const subtaskInput = document.getElementById('todo-edit-subtask-input');
  if (subtaskInput) {
    subtaskInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (editModalState.currentTodoId && subtaskInput.value.trim()) {
          addSubtask(editModalState.currentTodoId, subtaskInput.value.trim());
          subtaskInput.value = '';
          const todo = todos.find(t => t.id === editModalState.currentTodoId);
          if (todo) renderEditModalSubtasks(todo);
        }
      }
    });
  }

  // Close modal when clicking outside
  if (editModal) {
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) {
        closeEditModal();
      }
    });
  }

  // Initial render
  applyFilters();
  
  // Initialize progress ring and counts
  updateProgressRing();
  updateFilterCounts();

  return true;
}

// Export todos to JSON file
function exportTodos() {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    count: todos.length,
    todos: todos
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateStr = formatDateISO(new Date());
  const a = document.createElement('a');
  a.href = url;
  a.download = `new-tab-todos-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Trigger file input for import
function importTodos() {
  const fileInput = document.getElementById('todo-import-file');
  if (!fileInput) return;
  fileInput.value = '';
  fileInput.click();
}

// Validate imported todo data
function validateTodoData(data) {
  if (!data || typeof data !== 'object') return false;
  
  const todos = data.todos;
  if (!Array.isArray(todos)) return false;
  
  const seenIds = new Set();
  for (const item of todos) {
    if (!item || typeof item !== 'object') return false;
    if (typeof item.id !== 'string' || !item.id) return false;
    if (seenIds.has(item.id)) return false;
    seenIds.add(item.id);
    if (typeof item.text !== 'string' || !item.text.trim()) return false;
    if (typeof item.completed !== 'boolean') return false;
    if (item.dueDate !== undefined && item.dueDate !== null && typeof item.dueDate !== 'string') return false;
    if (item.createdAt !== undefined && item.createdAt !== null && typeof item.createdAt !== 'string') return false;
    if (item.completedAt !== undefined && item.completedAt !== null && typeof item.completedAt !== 'string') return false;
    if (item.order !== undefined && (typeof item.order !== 'number' || !Number.isFinite(item.order) || !Number.isInteger(item.order) || item.order < 0)) return false;
    if (item.subtasks !== undefined && item.subtasks !== null) {
      if (!Array.isArray(item.subtasks)) return false;
      const subtaskIds = new Set();
      for (const st of item.subtasks) {
        if (!st || typeof st !== 'object') return false;
        if (typeof st.id !== 'string' || !st.id) return false;
        if (subtaskIds.has(st.id)) return false;
        subtaskIds.add(st.id);
        if (typeof st.text !== 'string' || !st.text.trim()) return false;
        if (typeof st.checked !== 'boolean') return false;
      }
    }
  }
  
  return true;
}

// Handle file selection for import
function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onerror = function() {
    console.error('Failed to read import file');
    showToast(window.i18n ? window.i18n.t('importReadError') : 'Failed to read file.', 'error');
  };
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!validateTodoData(data)) {
        showToast(window.i18n ? window.i18n.t('importInvalidData') : 'Invalid todo data.', 'error');
        return;
      }
      showImportDialog(data.todos);
    } catch (err) {
      console.error('Failed to parse import file:', err);
      showToast(window.i18n ? window.i18n.t('importInvalidData') : 'Invalid todo data.', 'error');
    }
  };
  reader.readAsText(file);
}

// Show import confirmation dialog (merge vs replace)
function showImportDialog(importedTodos) {
  let dialog = document.getElementById('import-todos-dialog');
  let overlay = dialog?.querySelector('.ai-confirm-overlay');
  let cancelBtn = dialog?.querySelector('.ai-confirm-cancel');
  let mergeBtn = document.getElementById('import-merge-btn');
  let replaceBtn = document.getElementById('import-replace-btn');

  if (!dialog) return;

  // If dialog is already open, close and reset before re-opening with new data
  if (dialog.classList.contains('ai-confirm-open')) {
    const newDialog = dialog.cloneNode(true);
    dialog.parentNode?.replaceChild(newDialog, dialog);
    newDialog.classList.remove('ai-confirm-open');
    // Re-query after cloning to get fresh element references
    dialog = document.getElementById('import-todos-dialog');
    overlay = dialog?.querySelector('.ai-confirm-overlay');
    cancelBtn = dialog?.querySelector('.ai-confirm-cancel');
    mergeBtn = document.getElementById('import-merge-btn');
    replaceBtn = document.getElementById('import-replace-btn');
  }

  dialog.classList.add('ai-confirm-open');

  requestAnimationFrame(() => {
    const firstBtn = dialog.querySelector('button');
    if (firstBtn) firstBtn.focus();
  });
  
  const cleanup = () => {
    mergeBtn?.removeEventListener('click', handleMerge);
    replaceBtn?.removeEventListener('click', handleReplace);
    cancelBtn?.removeEventListener('click', handleCancel);
    overlay?.removeEventListener('click', handleCancel);
    dialog?.removeEventListener('keydown', handleKeydown);
  };

  const hideDialog = () => {
    dialog.classList.remove('ai-confirm-open');
    cleanup();
  };

  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };
  
  const handleMerge = () => {
    const existingTodos = cloneTodos(todos);
    const existingIds = new Set(existingTodos.map(t => t.id));
    let addedCount = 0;

    // Ensure all existing items have order for correct sort position
    existingTodos.forEach((t, i) => {
      if (t.order === undefined) t.order = i;
    });
    let maxOrder = existingTodos.reduce((max, t) => Math.max(max, t.order), -1);
    
    for (const item of importedTodos) {
      if (!existingIds.has(item.id)) {
        const todo = { ...item };
        todo.completed = !!item.completed;
        todo.completedAt = item.completed ? (item.completedAt || item.createdAt || new Date().toISOString()) : null;
        todo.dueDate = item.dueDate || null;
        todo.createdAt = item.createdAt || new Date().toISOString();
        todo.order = ++maxOrder;
        existingTodos.push(todo);
        existingIds.add(item.id);
        addedCount++;
      }
    }
    
    closeAllInlineDatePickers();
    if (!saveTodos(existingTodos)) {
      showTodoSaveError();
      hideDialog();
      return;
    }

    todos = existingTodos;
    applyFilters();
    closeEditModal();
    (window.scheduleTodoReminderCheck || scheduleTodoReminderCheck)();
    if (addedCount > 0) {
      const msg = window.i18n ? window.i18n.t('importSuccess', { count: addedCount }) : 'Imported ' + addedCount + ' todos successfully.';
      showToast(msg, 'success');
    } else {
      showToast(window.i18n ? window.i18n.t('importNoNewTodos') : 'No new todos to import.', 'info');
    }
    hideDialog();
  };
  
  const handleReplace = () => {
    const newTodos = importedTodos.map((item, index) => {
      const todo = { ...item };
      todo.completed = !!item.completed;
      todo.completedAt = item.completed ? (item.completedAt || item.createdAt || new Date().toISOString()) : null;
      todo.dueDate = item.dueDate || null;
      todo.createdAt = item.createdAt || new Date().toISOString();
      todo.order = index;
      return todo;
    });
    
    closeAllInlineDatePickers();
    if (!saveTodos(newTodos)) {
      showTodoSaveError();
      hideDialog();
      return;
    }

    todos = newTodos;
    applyFilters();
    closeEditModal();
    (window.scheduleTodoReminderCheck || scheduleTodoReminderCheck)();
    const msg = window.i18n ? window.i18n.t('importSuccess', { count: newTodos.length }) : 'Imported ' + newTodos.length + ' todos successfully.';
    showToast(msg, 'success');
    hideDialog();
  };
  
  const handleCancel = () => {
    hideDialog();
  };
  
  mergeBtn?.addEventListener('click', handleMerge);
  replaceBtn?.addEventListener('click', handleReplace);
  cancelBtn?.addEventListener('click', handleCancel);
  overlay?.addEventListener('click', handleCancel);
  dialog?.addEventListener('keydown', handleKeydown);
}

// Custom Date Picker Functionality
class CustomDatePicker {
  constructor() {
    this.currentDate = new Date();
    this.selectedDate = null;
    this.isOpen = false;

    this.init();
  }

  init() {
    this.bindElements();
    this.setupEventListeners();
    this.updateTriggerDisplay();
  }

  bindElements() {
    this.trigger = document.getElementById('date-picker-trigger');
    this.calendar = document.getElementById('custom-calendar');
    this.hiddenInput = document.getElementById('todo-due-date');
    this.selectedDateText = document.getElementById('selected-date-text');
    this.monthElement = document.getElementById('calendar-month');
    this.yearElement = document.getElementById('calendar-year');
    this.daysContainer = document.getElementById('calendar-days');
    this.prevBtn = document.getElementById('prev-month');
    this.nextBtn = document.getElementById('next-month');
    this.clearBtn = document.getElementById('clear-date');
    this.todayBtn = document.getElementById('today-date');
  }

  setupEventListeners() {
    // Trigger button
    if (this.trigger) {
      this.trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCalendar();
      });
    }

    // Navigation buttons
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => this.navigateMonth(-1));
    }
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => this.navigateMonth(1));
    }

    // Footer buttons
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => this.clearDate());
    }
    if (this.todayBtn) {
      this.todayBtn.addEventListener('click', () => this.selectToday());
    }

    // Click outside to close
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.trigger.contains(e.target) && !this.calendar.contains(e.target)) {
        this.closeCalendar();
      }
    });

    // Prevent calendar clicks from closing
    if (this.calendar) {
      this.calendar.addEventListener('click', (e) => e.stopPropagation());
    }
  }

  toggleCalendar() {
    if (this.isOpen) {
      this.closeCalendar();
    } else {
      this.openCalendar();
    }
  }

  openCalendar() {
    if (this.calendar) {
      this.isOpen = true;
      this.calendar.classList.add('visible');
      this.renderCalendar();
      this.trigger.classList.add('selected');
    }
  }

  closeCalendar() {
    if (this.calendar) {
      this.isOpen = false;
      this.calendar.classList.remove('visible');
      this.trigger.classList.remove('selected');
    }
  }

  navigateMonth(delta) {
    this.currentDate.setMonth(this.currentDate.getMonth() + delta);
    this.renderCalendar();
  }

  selectDate(date) {
    this.selectedDate = new Date(date);
    this.updateHiddenInput();
    this.updateTriggerDisplay();
    this.closeCalendar();
  }

  clearDate() {
    this.selectedDate = null;
    this.updateHiddenInput();
    this.updateTriggerDisplay();
    this.closeCalendar();
  }

  selectToday() {
    this.selectDate(new Date());
  }

  updateHiddenInput() {
    if (this.hiddenInput) {
      this.hiddenInput.value = this.selectedDate ? this.formatDateForInput(this.selectedDate) : '';
    }
  }

  updateTriggerDisplay() {
    if (this.selectedDateText) {
      this.selectedDateText.textContent = this.selectedDate ? this.formatDateForDisplay(this.selectedDate) : (window.i18n ? window.i18n.t('dueDate') : 'Due Date');
    }
    if (this.trigger) {
      this.trigger.classList.toggle('selected', !!this.selectedDate);
    }
  }

  formatDateForInput(date) {
    return formatDateISO(date);
  }

  formatDateForDisplay(date) {
    const currentLang = window.i18n ? window.i18n.currentLanguage() : 'en';
    const locale = currentLang === 'zh' ? 'zh-CN' : 'en-US';
    return date.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  }

  renderCalendar() {
    if (!this.monthElement || !this.yearElement || !this.daysContainer) return;

    // Update month/year display
    const monthIndex = this.currentDate.getMonth();
    const monthKey = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'][monthIndex];
    const monthName = window.i18n ? window.i18n.t(monthKey) : monthKey;
    this.monthElement.textContent = monthName;
    this.yearElement.textContent = this.currentDate.getFullYear();

    // Clear previous days
    this.daysContainer.innerHTML = '';

    // Get calendar data
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    // Generate 6 weeks of days
    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

      const dayElement = document.createElement('div');
      dayElement.className = 'calendar-day';
      dayElement.textContent = date.getDate();

      // Check if this date is in the current month
      const isCurrentMonth = date.getMonth() === month;
      if (!isCurrentMonth) {
        dayElement.classList.add('other-month');
      }

      // Check if this is today
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      if (isToday) {
        dayElement.classList.add('today');
      }

      // Check if this is selected
      const isSelected = this.selectedDate && date.toDateString() === this.selectedDate.toDateString();
      if (isSelected) {
        dayElement.classList.add('selected');
      }

      // Add click handler
      if (isCurrentMonth) {
        dayElement.addEventListener('click', () => this.selectDate(date));
      }

      this.daysContainer.appendChild(dayElement);
    }
  }
}

// Initialize date picker when DOM is ready
let customDatePicker;

function initCustomDatePicker() {
  customDatePicker = new CustomDatePicker();
}

// Re-render todo items and calendar when language changes
window.addEventListener('languageChanged', () => {
  (window.renderTodos || renderTodos)();
  refreshInlineDatePickers();
  if (customDatePicker) customDatePicker.renderCalendar();
});

function initTodoModule() {
  initTodo();
  initCustomDatePicker();
}

// Initialize when DOM is ready
runTodoOnDomReady(initTodoModule);

// Expose public API for tests and other modules (avoid leaking internals like `elements`)
try {
  window.loadTodos = loadTodos;
  window.saveTodos = saveTodos;
  window.addTodo = addTodo;
  window.editTodo = editTodo;
  window.toggleTodo = toggleTodo;
  window.deleteTodo = deleteTodo;
  window.migrateTodos = migrateTodos;
  window.initTodo = initTodo;
  window.initCustomDatePicker = initCustomDatePicker;
  window.renderTodos = renderTodos;
  window.filterTodos = filterTodos;
  window.handleFilterPillClick = handleFilterPillClick;
  window.validateTodoData = validateTodoData;
  window.showImportDialog = showImportDialog;
  window.clearCompleted = clearCompleted;
  window.scheduleTodoReminderCheck = scheduleTodoReminderCheck;
  window.formatDateISO = formatDateISO;
  window.isOverdue = isOverdue;
  window.parseLocalDate = parseLocalDate;
  window.showToast = showToast;
  window.currentFilters = currentFilters;
  window.getSelectedPriority = getSelectedPriority;
  window.addSubtask = addSubtask;
  window.deleteSubtask = deleteSubtask;
  window.toggleSubtask = toggleSubtask;
  window.updateSubtaskText = updateSubtaskText;
  window.getSubtaskProgress = getSubtaskProgress;
  window.cloneTodos = cloneTodos;
  // Test-only handles. The `tests/helpers/inject-script.js` harness loads
  // this file via `globalThis.eval(code)`, which scopes the IIFE's
  // `function` and `var` declarations to the eval scope and hides them
  // from the test. Re-exporting on `window` is the only way the test
  // can reach these helpers. None of them are consumed at runtime by
  // the rest of the app, so the global leak is purely a test affordance.
  window.handleDragStart = handleDragStart;
  window.handleDragEnd = handleDragEnd;
  window.handleDragOver = handleDragOver;
  window.handleDrop = handleDrop;
  window.showDateUpdateFeedback = showDateUpdateFeedback;
} catch {
  // If window isn't writable in some test harnesses, ignore silently
}

})();
