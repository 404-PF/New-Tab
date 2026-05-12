// src/ai/network-detector.js - Network availability detection module
// Detects online/offline status and checks API health

const NetworkDetector = (function() {
  // State
  let isOnline = navigator.onLine;
  const listeners = [];

  /**
   * Initialize network detection
   */
  function init() {
    // Set initial state
    isOnline = navigator.onLine;
    
    // Listen for browser online/offline events
    window.addEventListener('online', () => handleOnlineStatusChange(true));
    window.addEventListener('offline', () => handleOnlineStatusChange(false));
    
    // Notify listeners of initial status
    notifyListeners();
  }

  /**
   * Handle browser online/offline status change
   * @param {boolean} online - Whether browser is online
   */
  function handleOnlineStatusChange(online) {
    isOnline = online;
    notifyListeners();
  }

  /**
   * Get current network status
   * @returns {Object} Status object with isOnline and apiAvailable
   */
  function getStatus() {
    // Always return online - actual API availability is determined by request responses
    // We don't pre-check API health to avoid blocking or false negatives
    return {
      isOnline: isOnline,
      apiAvailable: true,
      isOffline: !isOnline
    };
  }

  /**
   * Notify all listeners of status change
   */
  function notifyListeners() {
    const status = getStatus();
    listeners.forEach(callback => {
      try {
        callback(status);
      } catch (e) {
        console.error('Error in network status listener:', e);
      }
    });
  }

  /**
   * Add a listener for network status changes
   * @param {Function} callback - Called with status object when changes occur
   */
  function addListener(callback) {
    if (typeof callback === 'function') {
      listeners.push(callback);
    }
  }

  /**
   * Remove a listener
   * @param {Function} callback - The callback to remove
   */
  function removeListener(callback) {
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  // Public API
  return {
    init,
    addListener,
    removeListener,
    getStatus
  };

})();

// Export to global scope
window.NetworkDetector = NetworkDetector;
