// src/ui/settings.js - Background, clock/date style settings

// Background selection
function loadBg() {
  return localStorage.getItem('homepageBg') || 'Water Beside Forest';
}

let initialBackgroundApplied = false;

function syncBackgroundSelection() {
  const bg = loadBg();
  document.body.setAttribute('data-bg', bg);

  const thumbs = document.querySelectorAll('.bg-thumb');
  for (let i = 0; i < thumbs.length; i++) {
    thumbs[i].classList.toggle('selected', thumbs[i].getAttribute('data-bg') === bg);
  }

  return bg;
}

function setBackgroundSectionLoadingState(isLoading) {
  const loadingEl = document.getElementById('bg-loading-state');
  if (loadingEl) {
    loadingEl.hidden = !isLoading;
  }
}

function scheduleBackgroundSectionInitialization(callback) {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.setTimeout(callback, 0);
    });
    return;
  }

  window.setTimeout(callback, 0);
}

// Check if browser supports video
function supportsVideo() {
  const video = document.createElement('video');
  return !!(video.canPlayType && video.canPlayType('video/mp4').replace('no', ''));
}

// Check if browser supports HTML5 video element
function supportsVideoElement() {
  return !!(document.createElement('video').play);
}

const VIDEO_THUMBNAIL_HIDE_DELAY_MS = 3000;
const IMAGE_THUMBNAIL_HIDE_DELAY_MS = 2500;

let backgroundTransitionTimeout = null;
let backgroundLoadVersion = 0;

function clearBackgroundTransitionTimeout() {
  if (!backgroundTransitionTimeout) return;

  clearTimeout(backgroundTransitionTimeout);
  backgroundTransitionTimeout = null;
}

function canReuseCurrentVideo(videoEl, backgroundId) {
  if (!videoEl) return false;

  return (
    videoEl.dataset.currentBg === backgroundId &&
    !videoEl.classList.contains('hidden') &&
    videoEl.classList.contains('active') &&
    !videoEl.paused &&
    !videoEl.ended &&
    !videoEl.error &&
    !!videoEl.currentSrc &&
    videoEl.readyState >= 2
  );
}

function resetBackgroundVideo(videoEl, unloadSource) {
  if (!videoEl) return;

  clearBackgroundTransitionTimeout();

  videoEl.oncanplaythrough = null;
  videoEl.onloadeddata = null;
  videoEl.onplaying = null;
  videoEl.onloadedmetadata = null;
  videoEl.onerror = null;
  videoEl.onpause = null;

  videoEl.classList.remove('active', 'ready', 'loading');
  videoEl.classList.add('hidden');
  videoEl.pause();

  delete videoEl.dataset.currentBg;
  delete videoEl.dataset.wasPlaying;

  if (!unloadSource) return;

  const sourceEl = videoEl.querySelector('source');
  if (!sourceEl) return;

  sourceEl.removeAttribute('src');
  sourceEl.type = 'video/mp4';
  videoEl.load();
}

// Video background resize handler - ensures video scales properly on window resize
function initVideoResizeHandler() {
  const videoEl = document.getElementById('bg-video');
  if (!videoEl) return;

  let resizeTimeout;
  
  // Debounced resize handler
  function handleResize() {
    // Video element automatically scales with object-fit: cover
    // This handler can be used for any custom adjustments if needed
    const container = document.getElementById('background-container');
    if (container && videoEl) {
      // Force video to maintain proper scaling
      videoEl.style.width = '100%';
      videoEl.style.height = '100%';
    }
  }

  // Listen for window resize events
  window.addEventListener('resize', function() {
    // Debounce resize events
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleResize, 100);
  });

  // Listen for orientation change on mobile devices
  window.addEventListener('orientationchange', function() {
    // Short delay to allow orientation to complete
    setTimeout(handleResize, 200);
  });

  // Also handle resize when video is loaded (for better mobile support)
  videoEl.addEventListener('loadedmetadata', handleResize);
  videoEl.addEventListener('resize', handleResize);
}

// Initialize video resize handler when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVideoResizeHandler);
} else {
  initVideoResizeHandler();
}

// Video visibility handler - pause video when page is hidden to save resources
function initVideoVisibilityHandler() {
  const videoEl = document.getElementById('bg-video');
  if (!videoEl) return;

  // Pause video when page is hidden
  document.addEventListener('visibilitychange', function() {
    // Only act when a video background is active (has a source set)
    if (!videoEl.currentSrc) return;

    if (document.hidden) {
      // Page is hidden - pause video
      if (!videoEl.paused) {
        videoEl.dataset.wasPlaying = 'true';
        videoEl.pause();
      }
    } else {
      // Page is visible again - resume video if it was playing
      if (videoEl.dataset.wasPlaying === 'true' && videoEl.paused) {
        videoEl.play();
        videoEl.dataset.wasPlaying = 'false';
      }
    }
  });
}

// Initialize visibility handler when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVideoVisibilityHandler);
} else {
  initVideoVisibilityHandler();
}

function stopBackground() {
  clearBackgroundTransitionTimeout();

  if (window._interactiveBackground) {
    window._interactiveBackground.stop();
  }

  const videoEl = document.getElementById('bg-video');
  const fullEl = document.getElementById('bg-full');
  const thumbnailEl = document.getElementById('bg-thumbnail');
  const containerEl = document.getElementById('background-container');

  resetBackgroundVideo(videoEl, true);

  if (window._customBackgrounds) {
    window._customBackgrounds.revokeAll();
  }

  if (containerEl) {
    containerEl.classList.remove('video-fallback', 'video-error');
  }

  if (fullEl) {
    fullEl.classList.remove('loaded');
    fullEl.src = '';
  }

  if (thumbnailEl) {
    thumbnailEl.classList.add('hidden');
    thumbnailEl.classList.remove('clearing');
  }
}

function applyBg() {
  const bg = syncBackgroundSelection();
  initialBackgroundApplied = true;

  const thumbnailEl = document.getElementById('bg-thumbnail');
  const fullEl = document.getElementById('bg-full');
  const videoEl = document.getElementById('bg-video');
  const containerEl = document.getElementById('background-container');

  // Handle custom backgrounds (stored in IndexedDB)
  if (window._customBackgrounds && window._customBackgrounds.isCustom(bg)) {
    backgroundLoadVersion += 1;
    stopBackground();
    window._customBackgrounds.apply(bg);
    return;
  }

  // Get background data from the map
  const bgData = window._backgrounds ? window._backgrounds.find(b => b.id === bg) : null;
  if (!bgData) {
    backgroundLoadVersion += 1;
    stopBackground();
    return;
  }

  // If the same video background is already active, skip teardown and setup
  if (bgData.type === 'video' && canReuseCurrentVideo(videoEl, bgData.id)) {
    return;
  }

  // Guaranteed shutdown of any previous live/animated background activity
  stopBackground();

  const loadVersion = ++backgroundLoadVersion;

  if (!thumbnailEl || !fullEl) return;

  if (bgData.type === 'interactive') {

    fullEl.classList.remove('loaded');
    thumbnailEl.classList.remove('hidden');
    thumbnailEl.classList.remove('clearing');
    thumbnailEl.src = bgData.thumb;

    fullEl.src = bgData.url || bgData.thumb;
    requestAnimationFrame(() => {
      if (loadVersion !== backgroundLoadVersion) {
        return;
      }

      fullEl.classList.add('loaded');
      thumbnailEl.classList.add('clearing');

      backgroundTransitionTimeout = setTimeout(() => {
        if (loadVersion !== backgroundLoadVersion) {
          return;
        }

        thumbnailEl.classList.add('hidden');
        thumbnailEl.classList.remove('clearing');
        backgroundTransitionTimeout = null;
      }, IMAGE_THUMBNAIL_HIDE_DELAY_MS);

      if (window._interactiveBackground) {
        window._interactiveBackground.apply(bgData.id);
      }
    });
    return;
  }
  
  // Handle video background
  if (bgData.type === 'video') {
    // Reset image states
    fullEl.classList.remove('loaded');
    thumbnailEl.classList.remove('hidden');
    fullEl.src = '';
    
    // Check video support - both canPlayType and HTML5 video element support
    if (!supportsVideo() || !supportsVideoElement()) {
      // Fallback: use thumbnail as background for unsupported browsers
      containerEl.classList.add('video-fallback');
      thumbnailEl.src = bgData.thumb;
      // Still load the full image as fallback
      const fullImg = new Image();
      fullImg.onload = function() {
        fullEl.src = bgData.thumb;
        requestAnimationFrame(() => {
          fullEl.classList.add('loaded');
          setTimeout(() => {
            thumbnailEl.classList.add('hidden');
          }, 1200);
        });
      };
      fullImg.src = bgData.thumb;
      return;
    }
    
    if (videoEl) {
      videoEl.classList.remove('hidden');
      videoEl.dataset.currentBg = bgData.id;
      
      // Keep thumbnail visible while video loads (placeholder)
      // This matches the image background behavior - show blurred thumbnail first
      thumbnailEl.classList.remove('hidden');
      thumbnailEl.classList.remove('clearing');
      
      // Set thumbnail source for placeholder (show blurred version while video loads)
      thumbnailEl.src = bgData.thumb;
      
      fullEl.classList.remove('loaded');
      fullEl.src = '';
      
      // Set video source
      const sourceEl = videoEl.querySelector('source');
      sourceEl.src = bgData.url;
      sourceEl.type = 'video/mp4';
      videoEl.load();
      
      // Set initial state - video starts hidden (opacity: 0)
      videoEl.classList.add('loading');
      videoEl.classList.remove('active');
      
      // Start playing immediately while fading in - mimics image loading behavior
      // This ensures the video starts playback right away without waiting for full buffer
      const startVideoPlayback = function() {
        if (loadVersion !== backgroundLoadVersion || videoEl.dataset.currentBg !== bgData.id) {
          return;
        }

        const playPromise = videoEl.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            // Auto-play was prevented, but that's okay for background video
            console.warn('Video auto-play prevented:', error);
          });
        }
      };
      
      // Helper to trigger crossfade between thumbnail and video
      let crossfadeTriggered = false;
      const triggerCrossfade = function() {
        if (crossfadeTriggered || loadVersion !== backgroundLoadVersion || videoEl.dataset.currentBg !== bgData.id) {
          return;
        }

        crossfadeTriggered = true;
        
        // Start video playback immediately
        startVideoPlayback();
        
        // Remove loading class - video is now ready to show
        videoEl.classList.remove('loading');
        
        // Add active class to trigger video fade-in (2s ease-in-out)
        videoEl.classList.add('active');
        videoEl.classList.add('ready');
        
        // Start thumbnail blur-to-clear animation at the same time as video fade-in
        // This creates a smooth blur-to-clear effect while video fades in
        // The thumbnail will fade out (opacity 0) while clearing blur (blur 0px)
        thumbnailEl.classList.add('clearing');
        
        // After crossfade completes, fully hide the thumbnail
        // Use 3000ms to ensure video is fully visible before hiding thumbnail
        // This matches the 2.5s opacity transition in CSS
        backgroundTransitionTimeout = setTimeout(() => {
          if (loadVersion !== backgroundLoadVersion || videoEl.dataset.currentBg !== bgData.id) {
            return;
          }

          thumbnailEl.classList.add('hidden');
          thumbnailEl.classList.remove('clearing');
          backgroundTransitionTimeout = null;
        }, VIDEO_THUMBNAIL_HIDE_DELAY_MS); // Match CSS opacity transition duration
      };
      
      // Video can play through - trigger crossfade
      videoEl.oncanplaythrough = triggerCrossfade;
      
      // Fallback: if canplaythrough takes too long, trigger on loadeddata
      videoEl.onloadeddata = function() {
        videoEl.onloadeddata = null;
        if (!crossfadeTriggered) {
          triggerCrossfade();
        }
      };
      
      // Additional fallback: ensure crossfade happens after video starts playing
      videoEl.onplaying = function() {
        videoEl.onplaying = null;
        if (!crossfadeTriggered) {
          triggerCrossfade();
        }
      };
      
      // Video loaded metadata - ensure proper sizing
      videoEl.onloadedmetadata = function() {
        videoEl.onloadedmetadata = null;
        if (loadVersion !== backgroundLoadVersion || videoEl.dataset.currentBg !== bgData.id) {
          return;
        }

        // Force video to maintain proper scaling after metadata loads
        videoEl.style.width = '100%';
        videoEl.style.height = '100%';
      };
      
      // Video playback error - fallback to thumbnail
      videoEl.onerror = function() {
        if (loadVersion !== backgroundLoadVersion || videoEl.dataset.currentBg !== bgData.id) {
          return;
        }

        console.warn('Video background failed to load, falling back to image');
        containerEl.classList.add('video-error');
        resetBackgroundVideo(videoEl, true);
        thumbnailEl.classList.remove('hidden');
        thumbnailEl.classList.remove('clearing');
        thumbnailEl.src = bgData.thumb;
        const fullImg = new Image();
        fullImg.onload = function() {
          if (loadVersion !== backgroundLoadVersion) {
            return;
          }

          fullEl.src = bgData.thumb;
          requestAnimationFrame(() => {
            fullEl.classList.add('loaded');
          });
        };
        fullImg.src = bgData.thumb;
      };
      
      // Handle visibility change to pause/resume video for better performance
      videoEl.onpause = function() {
        if (loadVersion !== backgroundLoadVersion || videoEl.dataset.currentBg !== bgData.id) {
          return;
        }

        if (!document.hidden && videoEl.classList.contains('active')) {
          videoEl.play().catch(() => {});
        }
      };
    }
    return;
  }
  
  thumbnailEl.classList.remove('hidden');
  thumbnailEl.classList.remove('clearing');
  
  // Immediately show blurred thumbnail
  thumbnailEl.src = bgData.thumb;
  
  // Start loading full resolution image
  const fullImg = new Image();
  fullImg.onload = function() {
    if (loadVersion !== backgroundLoadVersion) {
      return;
    }

    fullEl.src = bgData.url;
    // Small delay to ensure browser has rendered
    requestAnimationFrame(() => {
      if (loadVersion !== backgroundLoadVersion) {
        return;
      }

      fullEl.classList.add('loaded');
      
      // Add clearing class to animate blur-to-clear while fading out
      // This creates a smooth blur-to-clear effect while full image fades in
      thumbnailEl.classList.add('clearing');
      
      // After crossfade completes, fully hide the thumbnail
      // Use 2500ms to match the CSS clearing transition duration (2.5s opacity)
      backgroundTransitionTimeout = setTimeout(() => {
        if (loadVersion !== backgroundLoadVersion) {
          return;
        }

        thumbnailEl.classList.add('hidden');
        thumbnailEl.classList.remove('clearing');
        backgroundTransitionTimeout = null;
      }, IMAGE_THUMBNAIL_HIDE_DELAY_MS); // Match CSS clearing transition duration
    });
  };
  fullImg.src = bgData.url;
}

// Delegate click events for backgrounds
document.addEventListener('click', function (e) {
  const t = e.target.closest && e.target.closest('.bg-thumb');
  if (t && t.getAttribute('data-bg')) {
    localStorage.setItem('homepageBg', t.getAttribute('data-bg'));
    applyBg();
  }
});

// Clock style
function loadClockStyle() {
  const size = parseInt(localStorage.getItem('clockSize') || '80', 10);
  const normalizedSize = Number.isFinite(size) ? getClosestSize(size, CLOCK_SIZE_OPTIONS) : 80;
  if (normalizedSize !== size) {
    localStorage.setItem('clockSize', normalizedSize);
  }
  return {
    color: localStorage.getItem('clockColor') || '#ffffff',
    font: localStorage.getItem('clockFont') || '\'Times New Roman\', serif',
    size: normalizedSize,
  };
}

const CLOCK_SIZE_OPTIONS = [60, 80, 100];
const DATE_SIZE_OPTIONS = [20, 24, 30];

function getClosestSize(size, options) {
  return options.reduce((closest, option) => {
    return Math.abs(option - size) < Math.abs(closest - size) ? option : closest;
  }, options[0]);
}

function syncSizeButtons(groupName, size, options) {
  const activeSize = getClosestSize(size, options);
  const buttons = document.querySelectorAll(`[data-size-group="${groupName}"] .size-choice-button`);
  buttons.forEach((button) => {
    const buttonSize = parseInt(button.dataset.size, 10);
    const isActive = buttonSize === activeSize;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function applyClockStyle() {
  const style = loadClockStyle();
  const clock = document.querySelector('#clock .clock-time') || document.getElementById('clock');
  if (clock) {
    clock.style.color = style.color;
    clock.style.fontFamily = style.font;
    clock.style.fontSize = style.size + 'px';
  }
  const clockColorPicker = document.getElementById('clock-color-picker');
  const clockFontPicker = document.getElementById('clock-font-picker');
  if (clockColorPicker && clockColorPicker.value !== style.color) clockColorPicker.value = style.color;
  if (clockFontPicker && clockFontPicker.value !== style.font) clockFontPicker.value = style.font;
  syncSizeButtons('clock', parseInt(style.size, 10), CLOCK_SIZE_OPTIONS);
}

function loadClockFormatSetting() {
  const format = localStorage.getItem('clockFormat') || 'auto';
  if (format !== 'auto' && format !== '12h' && format !== '24h') {
    localStorage.setItem('clockFormat', 'auto');
    return 'auto';
  }
  return format;
}

function applyClockFormatSetting() {
  const clockFormatPicker = document.getElementById('clock-format-picker');
  const format = loadClockFormatSetting();
  if (clockFormatPicker && clockFormatPicker.value !== format) {
    clockFormatPicker.value = format;
  }
}

// Event listeners for clock
const clockColorPicker = document.getElementById('clock-color-picker');
const clockFontPicker = document.getElementById('clock-font-picker');
const clockStyleReset = document.getElementById('clock-style-reset');

if (clockColorPicker) {
  clockColorPicker.addEventListener('input', function () {
    localStorage.setItem('clockColor', this.value);
    applyClockStyle();
  });
}
if (clockFontPicker) {
  clockFontPicker.addEventListener('change', function () {
    localStorage.setItem('clockFont', this.value);
    applyClockStyle();
  });
}
const clockSizeGroup = document.querySelector('[data-size-group="clock"]');
if (clockSizeGroup) {
  clockSizeGroup.addEventListener('click', function (event) {
    const button = event.target.closest('.size-choice-button');
    if (!button) return;
    const size = parseInt(button.dataset.size, 10);
    if (!Number.isFinite(size)) return;
    localStorage.setItem('clockSize', size);
    applyClockStyle();
  });
}
if (clockStyleReset) {
  clockStyleReset.addEventListener('click', function () {
    localStorage.removeItem('clockColor');
    localStorage.removeItem('clockFont');
    localStorage.removeItem('clockSize');
    localStorage.removeItem('clockFormat');
    applyClockStyle();
    applyClockFormatSetting();
    if (window.updateTime) updateTime();
  });
}

const clockFormatPicker = document.getElementById('clock-format-picker');
if (clockFormatPicker) {
  clockFormatPicker.addEventListener('change', function () {
    localStorage.setItem('clockFormat', this.value);
    if (window.updateTime) updateTime();
  });
}

// Date style
function loadDateStyle() {
  const size = parseInt(localStorage.getItem('dateSize') || '24', 10);
  const normalizedSize = Number.isFinite(size) ? getClosestSize(size, DATE_SIZE_OPTIONS) : 24;
  if (normalizedSize !== size) {
    localStorage.setItem('dateSize', normalizedSize);
  }
  return {
    color: localStorage.getItem('dateColor') || '#ffffff',
    font: localStorage.getItem('dateFont') || '\'Times New Roman\', serif',
    size: normalizedSize,
  };
}
function applyDateStyle() {
  const style = loadDateStyle();
  const date = document.getElementById('date');
  if (date) {
    date.style.color = style.color;
    date.style.fontFamily = style.font;
    date.style.fontSize = style.size + 'px';
  }
  const dateColorPicker = document.getElementById('date-color-picker');
  const dateFontPicker = document.getElementById('date-font-picker');
  if (dateColorPicker && dateColorPicker.value !== style.color) dateColorPicker.value = style.color;
  if (dateFontPicker && dateFontPicker.value !== style.font) dateFontPicker.value = style.font;
  syncSizeButtons('date', parseInt(style.size, 10), DATE_SIZE_OPTIONS);
}

function loadDateFormatSetting() {
  const format = localStorage.getItem('dateFormat') || 'auto';
  if (format !== 'auto' && format !== 'long' && format !== 'compact' && format !== 'numeric') {
    localStorage.setItem('dateFormat', 'auto');
    return 'auto';
  }
  return format;
}

function applyDateFormatSetting() {
  const dateFormatPicker = document.getElementById('date-format-picker');
  const format = loadDateFormatSetting();
  if (dateFormatPicker && dateFormatPicker.value !== format) {
    dateFormatPicker.value = format;
  }
}

// Event listeners for date
const dateColorPicker = document.getElementById('date-color-picker');
const dateFontPicker = document.getElementById('date-font-picker');
const dateStyleReset = document.getElementById('date-style-reset');

if (dateColorPicker) {
  dateColorPicker.addEventListener('input', function () {
    localStorage.setItem('dateColor', this.value);
    applyDateStyle();
  });
}
if (dateFontPicker) {
  dateFontPicker.addEventListener('change', function () {
    localStorage.setItem('dateFont', this.value);
    applyDateStyle();
  });
}
const dateSizeGroup = document.querySelector('[data-size-group="date"]');
if (dateSizeGroup) {
  dateSizeGroup.addEventListener('click', function (event) {
    const button = event.target.closest('.size-choice-button');
    if (!button) return;
    const size = parseInt(button.dataset.size, 10);
    if (!Number.isFinite(size)) return;
    localStorage.setItem('dateSize', size);
    applyDateStyle();
  });
}
if (dateStyleReset) {
  dateStyleReset.addEventListener('click', function () {
    localStorage.removeItem('dateColor');
    localStorage.removeItem('dateFont');
    localStorage.removeItem('dateSize');
    localStorage.removeItem('dateFormat');
    applyDateStyle();
    applyDateFormatSetting();
    if (window.updateTime) updateTime();
  });
}

const dateFormatPicker = document.getElementById('date-format-picker');
if (dateFormatPicker) {
  dateFormatPicker.addEventListener('change', function () {
    localStorage.setItem('dateFormat', this.value);
    if (window.updateTime) updateTime();
  });
}

// Theme
function loadTheme() {
  return localStorage.getItem('theme') || 'dark';
}
function applyTheme() {
  const theme = loadTheme();
  document.body.classList.toggle('light-theme', theme === 'light');
  // Update radio buttons
  const darkRadio = document.querySelector('input[name="theme"][value="dark"]');
  const lightRadio = document.querySelector('input[name="theme"][value="light"]');
  if (darkRadio) darkRadio.checked = theme === 'dark';
  if (lightRadio) lightRadio.checked = theme === 'light';
}

// Language
function loadLanguageSetting() {
  return localStorage.getItem('language') || 'en';
}
function renderLanguageOptions() {
  const container = document.getElementById('language-options-container');
  if (!container) return;
  const languages = window.i18n && window.i18n.getSupportedLanguages ? window.i18n.getSupportedLanguages() : [];
  const currentLang = loadLanguageSetting();
  container.innerHTML = languages.map(lang => `
    <label class="language-option modern">
      <div class="language-preview">
        <span class="language-flag">${lang.flag}</span>
        <span class="language-code">${lang.nativeName}</span>
      </div>
      <input type="radio" name="language" value="${lang.code}" ${currentLang === lang.code ? 'checked' : ''} />
      <span class="label">${window.i18n ? window.i18n.t(lang.nameKey) : lang.nativeName}</span>
    </label>
  `).join('');
}
function applyLanguageSetting() {
  const lang = loadLanguageSetting();

  // Apply language — the languageChanged listener handles re-rendering
  if (window.i18n && window.i18n.applyLanguage) {
    window.i18n.applyLanguage(lang);
  }
}

// Event listeners for theme and language
document.addEventListener('change', function (e) {
  if (e.target.name === 'theme') {
    const selectedTheme = e.target.value;
    localStorage.setItem('theme', selectedTheme);
    applyTheme();
    // Dispatch custom event for AI chat and other components to respond
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: selectedTheme } }));
  } else if (e.target.name === 'language') {
    const selectedLanguage = e.target.value;
    localStorage.setItem('language', selectedLanguage);
    applyLanguageSetting();
  }
});

// Todo enabled
function loadTodoEnabled() {
  return localStorage.getItem('todoEnabled') !== 'false';
}
function applyTodoEnabled() {
  const enabled = loadTodoEnabled();
  const todoSection = document.querySelector('.todo-section');
  if (todoSection) {
    todoSection.style.display = enabled ? 'block' : 'none';
  }
  const todoEnabledSetting = document.getElementById('todo-enabled-setting');
  if (todoEnabledSetting) todoEnabledSetting.checked = enabled;
}

// Event listeners for todo enabled
const todoEnabledSetting = document.getElementById('todo-enabled-setting');
if (todoEnabledSetting) {
  todoEnabledSetting.addEventListener('change', function () {
    localStorage.setItem('todoEnabled', this.checked);
    applyTodoEnabled();
  });
}

// Todo reminders
function loadTodoReminderEnabled() {
  return localStorage.getItem('todoReminderEnabled') === 'true';
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

function loadTodoReminderLeadTime() {
  const val = localStorage.getItem('todoReminderLeadTime');
  if (val === null) return 30;
  const num = parseInt(val, 10);
  return isNaN(num) ? 30 : num;
}
function applyTodoReminderLeadTime() {
  const leadTime = loadTodoReminderLeadTime();
  const select = document.getElementById('todo-reminder-lead-time');
  if (select) select.value = String(leadTime);
}

const todoReminderEnabledSetting = document.getElementById('todo-reminder-enabled-setting');
if (todoReminderEnabledSetting) {
  todoReminderEnabledSetting.addEventListener('change', function () {
    const wasEnabled = localStorage.getItem('todoReminderEnabled') === 'true';
    localStorage.setItem('todoReminderEnabled', this.checked);
    applyTodoReminderEnabled();
    if (typeof scheduleTodoReminderCheck === 'function') {
      const reEnabled = this.checked && !wasEnabled;
      scheduleTodoReminderCheck(null, reEnabled);
    }
  });
}

const todoReminderLeadTime = document.getElementById('todo-reminder-lead-time');
if (todoReminderLeadTime) {
  todoReminderLeadTime.addEventListener('change', function () {
    localStorage.setItem('todoReminderLeadTime', this.value);
    if (typeof scheduleTodoReminderCheck === 'function') {
      scheduleTodoReminderCheck();
    }
  });
}

// Notes enabled
function loadNotesEnabled() {
  return localStorage.getItem('notesEnabled') !== 'false';
}
function applyNotesEnabled() {
  const enabled = loadNotesEnabled();
  const notesSection = document.querySelector('.notes-section');
  if (notesSection) {
    notesSection.style.display = enabled ? 'block' : 'none';
  }
  const notesEnabledSetting = document.getElementById('notes-enabled-setting');
  if (notesEnabledSetting) notesEnabledSetting.checked = enabled;
}

const notesEnabledSetting = document.getElementById('notes-enabled-setting');
if (notesEnabledSetting) {
  notesEnabledSetting.addEventListener('change', function () {
    localStorage.setItem('notesEnabled', this.checked);
    applyNotesEnabled();
  });
}

// Settings menu logic
const settingsMenu = document.querySelector('.settings-menu');
let settingsMenuItems = [];
const settingsSections = document.querySelectorAll('.settings-section'); // This will include the About section if present in HTML
let backgroundsInitialized = false;
let backgroundsInitializing = false;

if (settingsMenu) {
  // Collect menu items, sort them alphabetically by their visible label,
  // then re-append to the menu so the DOM order matches alphabetical order.
  settingsMenuItems = Array.from(settingsMenu.querySelectorAll('.settings-menu-item'));
  settingsMenuItems.sort((a, b) =>
    a.textContent.trim().localeCompare(b.textContent.trim(), undefined, { sensitivity: 'base' })
  );
  settingsMenuItems.forEach((item) => settingsMenu.appendChild(item));

  // Attach click handlers to the (now-sorted) items
  settingsMenuItems.forEach((item) => {
    item.addEventListener('click', function () {
      const section = this.getAttribute('data-section');
      settingsMenuItems.forEach((i) => i.classList.remove('selected'));
      this.classList.add('selected');
      settingsSections.forEach((s) => {
        // Show the section that matches the clicked tab, hide others
        if (s.getAttribute('data-section') === section) {
          s.style.display = 'block';
        } else {
          s.style.display = 'none';
        }
      });
      // Lazy load backgrounds
      if (section === 'background' && !backgroundsInitialized && !backgroundsInitializing) {
        backgroundsInitializing = true;
        setBackgroundSectionLoadingState(true);
        scheduleBackgroundSectionInitialization(function () {
          try {
            if (window._initStaticBackgrounds) window._initStaticBackgrounds();
            if (window._initInteractiveBackgrounds) window._initInteractiveBackgrounds();
            if (window._initLiveBackgrounds) window._initLiveBackgrounds();
            if (window._customBackgrounds) window._customBackgrounds.render();

            if (initialBackgroundApplied) {
              syncBackgroundSelection();
            } else {
              applyBg();
            }

            backgroundsInitialized = true;
          } finally {
            backgroundsInitializing = false;
            setBackgroundSectionLoadingState(false);
          }
        });
      }
      // No special logic needed for 'about' tab, just show the section
    });
  });

  // Auto-open the About tab by default. This overrides any `selected` class
  // present in the HTML so the settings modal starts on About.
  (function setDefaultTab() {
    const defaultSection = 'about';
    const defaultItem = settingsMenuItems.find(i => i.getAttribute('data-section') === defaultSection) || settingsMenuItems[0];
    if (defaultItem) {
      // Trigger the same behavior as a user click so lazy init and section
      // switching run consistently.
      defaultItem.click();
    }
  })();
}

// About section initialization
function initAboutSection() {
  const aboutSection = document.querySelector('.settings-section[data-section="about"]');
  if (aboutSection) {
    const t = window.i18n ? window.i18n.t : (key => key);
    const updateStatus = window.updateChecker ? updateChecker.getUpdateStatus() : t('updateCheckerNotLoaded');
    const isEnabled = window.updateChecker ? updateChecker.isEnabled() : true;

    const currentVersion = window.CURRENT_VERSION;
    const versionFallback = window.VERSION_DISPLAY_UNAVAILABLE_TEXT || 'extension only';
    const versionText = currentVersion ? `v${currentVersion}` : versionFallback;
    aboutSection.innerHTML = `
      <div class="about-setting-group">
        <h4 data-i18n="aboutSettings">${t('aboutSettings')}</h4>
        <p data-i18n="aboutSettingsDesc">${t('aboutSettingsDesc')}</p>

        <div class="about-cards">
          <div class="setting-card">
            <svg class="setting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"></path>
              <path d="M8 5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2H8V5Z"></path>
              <path d="M16 14h.01"></path>
              <path d="M8 14h.01"></path>
              <path d="M12 14h.01"></path>
            </svg>
            <div class="setting-content">
              <label data-i18n="project">${t('project')}</label>
              <div style="font-size: 16px; font-weight: 600; color: var(--settings-text-color); margin-bottom: 4px;">New-Tab</div>
              <div style="font-size: 14px; color: rgba(107, 114, 128, 0.8);">${t('versionLabel')} ${versionText}</div>
            </div>
          </div>

          <div class="setting-card">
            <svg class="setting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M22 2l-4.5 4.5"></path>
              <path d="M21 3l-4.5 4.5"></path>
            </svg>
            <div class="setting-content">
              <label data-i18n="createdBy">${t('createdBy')}</label>
              <div style="font-size: 16px; font-weight: 600; color: var(--settings-text-color);">404-PF</div>
              <div style="font-size: 14px; color: rgba(107, 114, 128, 0.8);" data-i18n="openSource">${t('openSource')}</div>
            </div>
          </div>

          <div class="setting-card">
            <svg class="setting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"></path>
              <path d="M8 5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2H8V5Z"></path>
              <path d="M16 14h.01"></path>
              <path d="M8 14h.01"></path>
              <path d="M12 14h.01"></path>
            </svg>
            <div class="setting-content">
              <label data-i18n="onboardingTour">${t('onboardingTour')}</label>
              <div style="font-size: 16px; font-weight: 600; color: var(--settings-text-color);" data-i18n="restartTour">${t('restartTour')}</div>
              <div style="font-size: 14px; color: rgba(107, 114, 128, 0.8); margin-bottom: 12px;" data-i18n="tourDesc">${t('tourDesc')}</div>
              <button id="restart-onboarding-btn" class="setting-btn" style="font-size: 13px; padding: 6px 12px;" data-i18n="startTour">
                ${t('startTour')}
              </button>
            </div>
          </div>

          <div class="setting-card">
            <svg class="setting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
            </svg>
            <div class="setting-content">
              <label data-i18n="repository">${t('repository')}</label>
              <a href="https://github.com/404-PF/New-Tab" target="_blank" style="font-size: 16px; font-weight: 600; color: #2196f3; text-decoration: none; transition: all 0.2s ease;">GitHub Repository</a>
              <div style="font-size: 14px; color: rgba(107, 114, 128, 0.8);" data-i18n="viewSource">${t('viewSource')}</div>
            </div>
          </div>

          <div class="setting-card">
            <svg class="setting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4v16l13.5-8L4 4z"></path>
              <path d="M20 12h-3"></path>
            </svg>
            <div class="setting-content">
              <label data-i18n="updates">${t('updates')}</label>
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <input type="checkbox" id="update-check-enabled" style="cursor: pointer;" ${isEnabled ? 'checked' : ''} />
                <span style="font-size: 14px; color: var(--settings-text-color);" data-i18n="enableUpdates">${t('enableUpdates')}</span>
              </div>
              <div style="font-size: 13px; color: rgba(107, 114, 128, 0.8); margin-bottom: 12px;">
                ${updateStatus}
              </div>
              <button id="manual-update-check" class="setting-btn secondary" style="font-size: 13px; padding: 8px 12px;" data-i18n="checkNow">
                ${t('checkNow')}
              </button>
              <div style="font-size: 12px; color: rgba(107, 114, 128, 0.7); margin-top: 8px;" data-i18n="updateDesc">
                ${t('updateDesc')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add event listeners for update settings
    const updateEnabledCheckbox = document.getElementById('update-check-enabled');
    const manualCheckButton = document.getElementById('manual-update-check');
    const restartOnboardingBtn = document.getElementById('restart-onboarding-btn');

    if (updateEnabledCheckbox && window.updateChecker) {
      updateEnabledCheckbox.addEventListener('change', function() {
        updateChecker.setEnabled(this.checked);
        // Refresh the about section to show updated status
        setTimeout(() => initAboutSection(), 100);
      });
    }

    if (manualCheckButton && window.updateChecker) {
      manualCheckButton.addEventListener('click', async function() {
        const tBtn = window.i18n ? window.i18n.t : (key => key);
        this.disabled = true;
        this.textContent = tBtn('checking');
        await updateChecker.manualCheck();
        this.disabled = false;
        this.textContent = tBtn('checkNow');
        // Refresh the about section after manual check
        setTimeout(() => initAboutSection(), 100);
      });
    }

    if (restartOnboardingBtn && window.onboardingTour) {
      restartOnboardingBtn.addEventListener('click', function() {
        // Close settings modal first
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) {
          settingsModal.classList.remove('modal-open');
        }
        // Reset and start onboarding tour
        window.onboardingTour.reset();
        window.onboardingTour.start();
      });
    }
  }
}

// Re-render About section and language options when language changes
window.addEventListener('languageChanged', function() {
  initAboutSection();
  renderLanguageOptions();
});

function initSettings() {
  // Apply initial settings
  if (!initialBackgroundApplied) {
    applyBg();
  }
  applyClockStyle();
  applyClockFormatSetting();
  applyDateStyle();
  applyDateFormatSetting();
  applyTheme();
  applyTodoEnabled();
  applyTodoReminderEnabled();
  applyTodoReminderLeadTime();
  applyNotesEnabled();
  applyLanguageSetting();
  initAboutSection();

  // Initialize modern color pickers
  if (window.initModernColorPickers) {
    window.initModernColorPickers();
  }
  
  // Initialize modern font pickers
  if (window.initModernFontPickers) {
    window.initModernFontPickers();
  }
}

// Initialize settings when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettings);
} else {
  initSettings();
}
