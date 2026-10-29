// src/features/todo-app.js - Todo app modal (standalone app, issue #1066)
// Hosts the todo list plus the todo feature settings that used to live in the
// Settings dialog. While the modal is open the on-page .todo-section node is
// relocated into the modal, so the list keeps a single set of element ids,
// listeners, and render paths (window.renderTodos etc. from todo.js) instead
// of duplicating any todo logic here.

(function () {
  'use strict';

  // ===================== Storage helpers =====================

  function loadTodoEnabled() {
    return localStorage.getItem('todoEnabled') !== 'false';
  }

  function loadTodoReminderEnabled() {
    return localStorage.getItem('todoReminderEnabled') === 'true';
  }

  function loadTodoReminderLeadTime() {
    const val = localStorage.getItem('todoReminderLeadTime');
    if (val === null) return 30;
    const num = parseInt(val, 10);
    return isNaN(num) ? 30 : num;
  }

  function loadTodoStatsEnabled() {
    return localStorage.getItem('todoStatsEnabled') === 'true';
  }

  // ===================== Apply helpers =====================

  function applyTodoEnabled() {
    const enabled = loadTodoEnabled();
    const todoSection = document.querySelector('.todo-section');
    // While the section is embedded in the open modal it must stay visible
    // even when the on-page widget toggle is off; close() recomputes display
    // after moving the section back to the page.
    if (todoSection && !todoSection.closest('#todo-app-modal')) {
      todoSection.style.display = enabled ? '' : 'none';
    }
    const checkbox = document.getElementById('todo-enabled-setting');
    if (checkbox) checkbox.checked = enabled;
  }

  function applyTodoReminderEnabled() {
    const enabled = loadTodoReminderEnabled();
    const setting = document.getElementById('todo-reminder-enabled-setting');
    if (setting) setting.checked = enabled;
    const leadTimeOption = document.getElementById('todo-reminder-lead-time-option');
    if (leadTimeOption) {
      leadTimeOption.style.display = enabled ? '' : 'none';
    }
  }

  function applyTodoReminderLeadTime() {
    const leadTime = loadTodoReminderLeadTime();
    const select = document.getElementById('todo-reminder-lead-time');
    if (select) select.value = String(leadTime);
  }

  function applyTodoStatsEnabled() {
    const enabled = loadTodoStatsEnabled();
    const setting = document.getElementById('todo-stats-enabled-setting');
    if (setting) setting.checked = enabled;
    if (window.applyTodoStatsVisibility) window.applyTodoStatsVisibility();
  }

  // Re-applies every migrated todo setting; used at init and after a settings
  // import so the modal controls and the on-page widget react without reload.
  function applyTodoAppSettings() {
    applyTodoEnabled();
    applyTodoReminderEnabled();
    applyTodoReminderLeadTime();
    applyTodoStatsEnabled();
  }

  // ===================== Modal control =====================

  let widgetHome = null;

  function getModalElement() {
    return document.getElementById('todo-app-modal');
  }

  function getWidgetSection() {
    return document.querySelector('.todo-section');
  }

  function getWidgetHost() {
    return document.getElementById('todo-app-widget-host');
  }

  function embedWidget() {
    const section = getWidgetSection();
    const host = getWidgetHost();
    if (!section || !host || section.parentNode === host) return;
    widgetHome = { parent: section.parentNode, nextSibling: section.nextSibling };
    section.style.display = '';
    host.appendChild(section);
  }

  function restoreWidget() {
    if (!widgetHome) return;
    const section = getWidgetSection();
    if (section && widgetHome.parent) {
      widgetHome.parent.insertBefore(section, widgetHome.nextSibling);
      // Recompute display now that the section is back on the page (it was
      // force-shown inside the modal regardless of the todoEnabled state).
      applyTodoEnabled();
    }
    widgetHome = null;
  }

  function open() {
    const modal = getModalElement();
    if (!modal) return;
    embedWidget();
    applyTodoAppSettings();
    modal.classList.add('modal-open');
  }

  function close() {
    const modal = getModalElement();
    if (modal) {
      modal.classList.remove('modal-open');
    }
    restoreWidget();
  }

  // ===================== Settings persistence =====================

  // Guard the shared helper: toast.js may fail to load, and persistFeatureToggle
  // checks the bridge's result: setItem returns false for a rejected write
  // instead of throwing (#969).
  function persistToggle(key, value) {
    let persisted;
    try {
      persisted = typeof window.persistFeatureToggle === 'function'
        ? window.persistFeatureToggle(key, value)
        : localStorage.setItem(key, value) !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
    } catch (e) {
      console.warn('Failed to save ' + key + ':', e);
      persisted = false;
    }
    return persisted;
  }

  function reportToggleSaveError() {
    if (typeof window.showFeatureToggleSaveError === 'function') {
      window.showFeatureToggleSaveError();
    }
  }

  // ===================== Event listeners =====================

  function setupSettingsListeners() {
    const todoEnabledSetting = document.getElementById('todo-enabled-setting');
    if (todoEnabledSetting) {
      todoEnabledSetting.addEventListener('change', function () {
        const persisted = persistToggle('todoEnabled', this.checked);
        applyTodoEnabled();
        if (!persisted) reportToggleSaveError();
      });
    }

    const todoStatsEnabledSetting = document.getElementById('todo-stats-enabled-setting');
    if (todoStatsEnabledSetting) {
      todoStatsEnabledSetting.addEventListener('change', function () {
        localStorage.setItem('todoStatsEnabled', this.checked);
        applyTodoStatsEnabled();
      });
    }

    const todoReminderEnabledSetting = document.getElementById('todo-reminder-enabled-setting');
    if (todoReminderEnabledSetting) {
      todoReminderEnabledSetting.addEventListener('change', function () {
        const wasEnabled = localStorage.getItem('todoReminderEnabled') === 'true';
        localStorage.setItem('todoReminderEnabled', this.checked);
        applyTodoReminderEnabled();
        if (typeof window.scheduleTodoReminderCheck === 'function') {
          const reEnabled = this.checked && !wasEnabled;
          window.scheduleTodoReminderCheck(null, reEnabled);
        }
      });
    }

    const todoReminderLeadTime = document.getElementById('todo-reminder-lead-time');
    if (todoReminderLeadTime) {
      todoReminderLeadTime.addEventListener('change', function () {
        localStorage.setItem('todoReminderLeadTime', this.value);
        if (typeof window.scheduleTodoReminderCheck === 'function') {
          window.scheduleTodoReminderCheck();
        }
      });
    }
  }

  function setupModalListeners() {
    const modal = getModalElement();
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) {
          close();
        }
      });
    }

    // Escape key (shortcuts.js closeModal covers the shared shortcut path too)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('modal-open')) {
        close();
      }
    });
  }

  // ===================== Initialization =====================

  let initialized = false;
  function init() {
    if (initialized) return;
    initialized = true;
    applyTodoAppSettings();
    setupSettingsListeners();
    setupModalListeners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export. loadTodoStatsEnabled stays owned by todo-stats.js; only the
  // applier moves here out of settings.js (#1066).
  window.TodoApp = {
    init: init,
    open: open,
    close: close
  };
  window.loadTodoEnabled = loadTodoEnabled;
  window.applyTodoEnabled = applyTodoEnabled;
  window.applyTodoStatsEnabled = applyTodoStatsEnabled;
  window.applyTodoAppSettings = applyTodoAppSettings;

})();
