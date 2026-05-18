// src/ui/add-app.js - Add app modal bootstrap

function bootstrapAddAppModal() {
  if (window.initAddAppModal) {
    window.initAddAppModal();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapAddAppModal);
} else {
  bootstrapAddAppModal();
}
