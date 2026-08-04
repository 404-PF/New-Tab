(function () {
  'use strict';

  // Shared helpers for games to reduce duplicated code across modules.
  window.gamesHelpers = window.gamesHelpers || {};

  if (!window.gamesHelpers.t) {
    window.gamesHelpers.t = function (key) {
      return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key;
    };
  }

})();
