// src/ui/settings.js - Background, clock/date style settings

(function () {
  'use strict';

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

// Video playback settings keys
const VIDEO_AUTOPLAY_KEY = 'videoAutoplay';
const VIDEO_MUTED_KEY = 'videoMuted';
const VIDEO_PAUSE_HIDDEN_KEY = 'videoPauseHidden';

function loadVideoAutoplay() {
  return localStorage.getItem(VIDEO_AUTOPLAY_KEY) !== 'false';
}

function loadVideoMuted() {
  return localStorage.getItem(VIDEO_MUTED_KEY) !== 'false';
}

function loadVideoPauseHidden() {
  return localStorage.getItem(VIDEO_PAUSE_HIDDEN_KEY) !== 'false';
}

function applyVideoPlaybackSettings() {
  const autoplayCheckbox = document.getElementById('video-autoplay-setting');
  const mutedCheckbox = document.getElementById('video-muted-setting');
  const pauseHiddenCheckbox = document.getElementById('video-pause-hidden-setting');

  if (autoplayCheckbox) autoplayCheckbox.checked = loadVideoAutoplay();
  if (mutedCheckbox) mutedCheckbox.checked = loadVideoMuted();
  if (pauseHiddenCheckbox) pauseHiddenCheckbox.checked = loadVideoPauseHidden();
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
const BACKGROUND_TRANSITION_DURATION_MS = 400;

let backgroundTransitionTimeout = null;
let overlayClearTimeout = null;
let backgroundLoadVersion = 0;

function clearBackgroundTransitionTimeout() {
  if (backgroundTransitionTimeout) {
    clearTimeout(backgroundTransitionTimeout);
    backgroundTransitionTimeout = null;
  }
  if (overlayClearTimeout) {
    clearTimeout(overlayClearTimeout);
    overlayClearTimeout = null;
  }
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

// Safe wrappers for video operations (jsdom may not implement some methods)
function safePause(videoEl) {
  if (!videoEl) return;
  try {
    videoEl.pause();
  } catch { void 0; }
}

function safeLoad(videoEl) {
  if (!videoEl) return;
  try {
    videoEl.load();
  } catch { void 0; }
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
  safePause(videoEl);

  delete videoEl.dataset.currentBg;
  delete videoEl.dataset.wasPlaying;
  delete videoEl.dataset.simpleModePaused;
  delete videoEl.dataset.reducedMotionPaused;
  delete videoEl.dataset.crossfadeTriggered;
  delete videoEl.dataset.lastPauseTime;

  videoEl.autoplay = false;
  videoEl.muted = true;

  if (!unloadSource) return;

  const sourceEl = videoEl.querySelector('source');
  if (!sourceEl) return;

  sourceEl.removeAttribute('src');
  sourceEl.type = 'video/mp4';
  safeLoad(videoEl);
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

  // Handle resize when video metadata loads (triggers on source changes)
  videoEl.addEventListener('loadedmetadata', handleResize);
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
      // Page is hidden - pause video if setting allows
      if (!videoEl.paused && loadVideoPauseHidden()) {
        videoEl.dataset.wasPlaying = 'true';
        safePause(videoEl);
      }
    } else {
      // Page is visible again - resume video if it was playing and autoplay is enabled
      if (
        videoEl.dataset.wasPlaying === 'true' &&
        videoEl.paused &&
        loadVideoAutoplay() &&
        videoEl.dataset.simpleModePaused !== 'true' &&
        videoEl.dataset.reducedMotionPaused !== 'true'
      ) {
        videoEl.play().catch(() => {});
        videoEl.dataset.wasPlaying = 'false';
      } else {
        delete videoEl.dataset.wasPlaying;
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

function captureBackgroundSnapshot() {
  const overlayEl = document.getElementById('bg-transition-overlay');
  if (!overlayEl) return;

  const fullEl = document.getElementById('bg-full');
  const videoEl = document.getElementById('bg-video');
  const thumbnailEl = document.getElementById('bg-thumbnail');
  const canvasEl = document.getElementById('bg-interactive');

  let src = null;

  if (canvasEl && !canvasEl.hidden && window._interactiveBackground &&
      typeof window._interactiveBackground.currentBackgroundId === 'function' &&
      window._interactiveBackground.currentBackgroundId()) {
    try {
      src = canvasEl.toDataURL('image/jpeg', 0.6);
    } catch {
      // Canvas capture failed, fall through to full image check below
    }
  }

  if (!src && fullEl && fullEl.classList.contains('loaded') && fullEl.src && fullEl.naturalWidth > 0) {
    src = fullEl.src;
  }

  if (!src && videoEl && videoEl.classList.contains('active') && videoEl.currentSrc && videoEl.readyState >= 2) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 1920;
      canvas.height = videoEl.videoHeight || 1080;
      if (canvas.width > 0 && canvas.height > 0) {
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoEl, 0, 0);
        src = canvas.toDataURL('image/jpeg', 0.6);
      }
    } catch {
      // Canvas capture failed, fall through to thumbnail check below
    }
  }

  if (!src && thumbnailEl && thumbnailEl.src && !thumbnailEl.classList.contains('hidden') && thumbnailEl.naturalWidth > 0) {
    src = thumbnailEl.src;
  }

  if (src) {
    overlayEl.src = src;
    overlayEl.style.transition = 'none';
    overlayEl.classList.add('active');
    void overlayEl.offsetHeight;
    overlayEl.style.transition = '';
  }
}

function hideBackgroundOverlay() {
  const overlayEl = document.getElementById('bg-transition-overlay');
  if (!overlayEl || !overlayEl.classList.contains('active')) return;

  if (overlayClearTimeout) {
    clearTimeout(overlayClearTimeout);
    overlayClearTimeout = null;
  }
  overlayEl.classList.remove('active');
  overlayClearTimeout = setTimeout(function () {
    if (!overlayEl.classList.contains('active')) {
      overlayEl.src = '';
    }
    overlayClearTimeout = null;
  }, crossfadeDelayMs(BACKGROUND_TRANSITION_DURATION_MS));
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
    captureBackgroundSnapshot();
    backgroundLoadVersion += 1;
    stopBackground();
    window._customBackgrounds.apply(bg);
    return;
  }

  // Get background data from the map
  const bgData = window._backgrounds ? window._backgrounds.find(b => b.id === bg) : null;
  if (!bgData) {
    captureBackgroundSnapshot();
    backgroundLoadVersion += 1;
    stopBackground();
    hideBackgroundOverlay();
    return;
  }

  // If the same video background is already active, skip teardown and setup
  if (bgData.type === 'video' && canReuseCurrentVideo(videoEl, bgData.id)) {
    return;
  }

  // Capture current background before clearing for smooth crossfade
  captureBackgroundSnapshot();

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
      hideBackgroundOverlay();
      thumbnailEl.classList.add('clearing');

      backgroundTransitionTimeout = setTimeout(() => {
        if (loadVersion !== backgroundLoadVersion) {
          return;
        }

        thumbnailEl.classList.add('hidden');
        thumbnailEl.classList.remove('clearing');
        backgroundTransitionTimeout = null;
        // Belt-and-suspenders: the reduced-motion early return above
        // normally prevents this timer from being created, but the
        // wrapper still collapses the duration if the preference
        // flips between scheduling and firing.
      }, crossfadeDelayMs(IMAGE_THUMBNAIL_HIDE_DELAY_MS));

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
          hideBackgroundOverlay();
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
      
      // Apply user playback settings
      const videoMuted = loadVideoMuted();
      videoEl.muted = videoMuted;
      videoEl.autoplay = loadVideoAutoplay();

      // Set video source
      const sourceEl = videoEl.querySelector('source');
      sourceEl.src = bgData.url;
      sourceEl.type = 'video/mp4';
      safeLoad(videoEl);
      
      // Set initial state - video starts hidden (opacity: 0)
      videoEl.classList.add('loading');
      videoEl.classList.remove('active');
      
      // Start playing immediately while fading in - mimics image loading behavior
      // This ensures the video starts playback right away without waiting for full buffer
      const startVideoPlayback = function() {
        if (loadVersion !== backgroundLoadVersion || videoEl.dataset.currentBg !== bgData.id) {
          return;
        }

        if (!loadVideoAutoplay()) {
          hideBackgroundOverlay();
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
      const triggerCrossfade = function() {
        if (videoEl.dataset.crossfadeTriggered === 'true' || loadVersion !== backgroundLoadVersion || videoEl.dataset.currentBg !== bgData.id) {
          return;
        }

        videoEl.dataset.crossfadeTriggered = 'true';

        // Remove loading class - video is now ready to show
        videoEl.classList.remove('loading');

        // When autoplay is disabled, keep thumbnail visible and video hidden
        if (!loadVideoAutoplay()) {
          hideBackgroundOverlay();
          return;
        }

        // When simple mode is active, mark paused and keep video hidden
        if (window.loadSimpleMode && window.loadSimpleMode()) {
          videoEl.dataset.simpleModePaused = 'true';
          hideBackgroundOverlay();
          return;
        }

        // When reduced motion is preferred, treat the looping video as
        // non-essential motion: keep the static thumbnail visible and skip
        // the crossfade + autoplay. The user still gets the same end state
        // (a full-bleed background) without any movement.
        if (window.prefersReducedMotion && window.prefersReducedMotion()) {
          videoEl.dataset.reducedMotionPaused = 'true';
          videoEl.classList.add('active', 'ready');
          hideBackgroundOverlay();
          return;
        }

        // Start video playback immediately
        startVideoPlayback();

        // Add active class to trigger video fade-in (2s ease-in-out)
        videoEl.classList.add('active');
        videoEl.classList.add('ready');
        hideBackgroundOverlay();

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
          // Belt-and-suspenders: the reduced-motion early return above
          // normally prevents this timer from being created, but the
          // wrapper still collapses the duration if the preference
          // flips between scheduling and firing.
        }, crossfadeDelayMs(VIDEO_THUMBNAIL_HIDE_DELAY_MS)); // Match CSS opacity transition duration
      };
      
      // Video can play through - trigger crossfade
      videoEl.oncanplaythrough = triggerCrossfade;
      
      // Fallback: if canplaythrough takes too long, trigger on loadeddata
      videoEl.onloadeddata = function() {
        videoEl.onloadeddata = null;
        if (videoEl.dataset.crossfadeTriggered !== 'true') {
          triggerCrossfade();
        }
      };
      
      // Additional fallback: ensure crossfade happens after video starts playing
      videoEl.onplaying = function() {
        videoEl.onplaying = null;
        if (videoEl.dataset.crossfadeTriggered !== 'true') {
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
            hideBackgroundOverlay();
          });
        };
        fullImg.onerror = function() {
          if (loadVersion !== backgroundLoadVersion) {
            return;
          }

          hideBackgroundOverlay();
        };
        fullImg.src = bgData.thumb;
      };
      
      // Handle visibility change to pause/resume video for better performance
      videoEl.onpause = function() {
        if (loadVersion !== backgroundLoadVersion || videoEl.dataset.currentBg !== bgData.id) {
          return;
        }

        // Debounce: prevent tight pause/resume loops from buffering or rapid system pauses
        const now = Date.now();
        const lastPause = parseInt(videoEl.dataset.lastPauseTime || '0', 10);
        if (now - lastPause < 2000) return;
        videoEl.dataset.lastPauseTime = now;

        if (!document.hidden && videoEl.classList.contains('active') && loadVideoAutoplay() && videoEl.dataset.simpleModePaused !== 'true' && videoEl.dataset.reducedMotionPaused !== 'true' && videoEl.readyState >= 3) {
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
      hideBackgroundOverlay();
      
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
        // Belt-and-suspenders: the reduced-motion early return above
        // normally prevents this timer from being created, but the
        // wrapper still collapses the duration if the preference
        // flips between scheduling and firing.
      }, crossfadeDelayMs(IMAGE_THUMBNAIL_HIDE_DELAY_MS)); // Match CSS clearing transition duration
    });
  };
  fullImg.onerror = function() {
    if (loadVersion !== backgroundLoadVersion) {
      return;
    }

    console.warn('Background image failed to load:', bgData.url);
    clearBackgroundTransitionTimeout();
    hideBackgroundOverlay();
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
  const normalizedSize = Number.isFinite(size) ? getClosestSettingSize(size, CLOCK_SIZE_OPTIONS) : 80;
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

function getClosestSettingSize(size, options) {
  return options.reduce((closest, option) => {
    return Math.abs(option - size) < Math.abs(closest - size) ? option : closest;
  }, options[0]);
}

function syncSettingSizeButtons(groupName, size, options) {
  const activeSize = getClosestSettingSize(size, options);
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
  syncSettingSizeButtons('clock', parseInt(style.size, 10), CLOCK_SIZE_OPTIONS);
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
  const normalizedSize = Number.isFinite(size) ? getClosestSettingSize(size, DATE_SIZE_OPTIONS) : 24;
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
  syncSettingSizeButtons('date', parseInt(style.size, 10), DATE_SIZE_OPTIONS);
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

// Event listener for video playback settings
document.addEventListener('change', function (e) {
  if (e.target.id !== 'video-autoplay-setting' && e.target.id !== 'video-muted-setting' && e.target.id !== 'video-pause-hidden-setting') {
    return;
  }

  const videoAutoplaySetting = document.getElementById('video-autoplay-setting');
  const videoMutedSetting = document.getElementById('video-muted-setting');
  const videoPauseHiddenSetting = document.getElementById('video-pause-hidden-setting');

  if (e.target === videoAutoplaySetting) {
    localStorage.setItem(VIDEO_AUTOPLAY_KEY, videoAutoplaySetting.checked);
    const videoEl = document.getElementById('bg-video');
    const thumbnailEl = document.getElementById('bg-thumbnail');
    if (videoEl && videoEl.currentSrc) {
      if (videoAutoplaySetting.checked) {
        if (videoEl.readyState >= 2) {
          // Video already loaded — show it immediately
          videoEl.dataset.crossfadeTriggered = 'true';
          videoEl.classList.add('active', 'ready');
          if (thumbnailEl && !thumbnailEl.classList.contains('hidden')) {
            thumbnailEl.classList.add('clearing');
            setTimeout(function () {
              thumbnailEl.classList.add('hidden');
              thumbnailEl.classList.remove('clearing');
            }, crossfadeDelayMs(VIDEO_THUMBNAIL_HIDE_DELAY_MS));
          }
          if (window.prefersReducedMotion && window.prefersReducedMotion()) {
            videoEl.dataset.reducedMotionPaused = 'true';
          } else {
            delete videoEl.dataset.reducedMotionPaused;
            if (!window.loadSimpleMode || !window.loadSimpleMode()) {
              videoEl.play().catch(function () {});
            }
          }
        } else {
          // Video not ready yet — reset crossfade guard and let the
          // oncanplaythrough handler from applyBg() fire naturally
          delete videoEl.dataset.crossfadeTriggered;
          videoEl.classList.remove('hidden');
          videoEl.classList.add('loading');
        }
      } else {
        // Don't null oncanplaythrough — triggerCrossfade already checks
        // loadVideoAutoplay() and returns early when autoplay is disabled.
        // Keeping the handler allows it to fire naturally if autoplay is re-enabled.
        safePause(videoEl);
      }
    }
  } else if (e.target === videoMutedSetting) {
    localStorage.setItem(VIDEO_MUTED_KEY, videoMutedSetting.checked);
    // Apply mute state immediately to active video
    const videoEl = document.getElementById('bg-video');
    if (videoEl && videoEl.currentSrc) {
      videoEl.muted = videoMutedSetting.checked;
    }
  } else if (e.target === videoPauseHiddenSetting) {
    localStorage.setItem(VIDEO_PAUSE_HIDDEN_KEY, videoPauseHiddenSetting.checked);
    // No immediate action needed — takes effect on next visibility change
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
      // Apply weather settings when weather tab is shown
      if (section === 'weather') {
        if (window.WeatherWidget && window.WeatherWidget.applySettings) {
          window.WeatherWidget.applySettings();
        }
      }
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

// Module-level handle for the motion-preference subscriber. Captured so a
// second initSettings() call (test harness, HMR) can detach the previous
// handler before registering a new one, avoiding duplicate play/pause cycles
// per change.
let unsubscribeVideoMotion = null;

// When the OS-level motion preference changes while a video background is
// active, pause or resume the video accordingly. This is what makes the
// `prefers-reduced-motion` setting respond to the live system toggle instead
// of only being read at page load. Custom video backgrounds are handled by
// their own subscriber in custom-backgrounds.js to avoid double play() calls.
function syncVideoToMotionPreference(reduced) {
  const videoEl = document.getElementById('bg-video');
  if (!videoEl || !videoEl.currentSrc || !videoEl.classList.contains('active')) return;
  if (window._customBackgrounds && typeof window._customBackgrounds.isCustom === 'function' && window._customBackgrounds.isCustom(loadBg())) return;
  if (reduced) {
    if (!videoEl.paused) safePause(videoEl);
    videoEl.dataset.reducedMotionPaused = 'true';
  } else {
    const wasReducedPaused = videoEl.dataset.reducedMotionPaused === 'true';
    delete videoEl.dataset.reducedMotionPaused;
    if (wasReducedPaused && loadVideoAutoplay() && !document.hidden && (!window.loadSimpleMode || !window.loadSimpleMode()) && videoEl.readyState >= 3) {
      videoEl.play().catch(() => {});
    }
  }
}

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
  applyVideoPlaybackSettings();
  if (window.WeatherWidget && window.WeatherWidget.applySettings) {
    window.WeatherWidget.applySettings();
  }
  initAboutSection();

  // Initialize modern color pickers
  if (window.initModernColorPickers) {
    window.initModernColorPickers();
  }

  // Subscribe to OS-level motion-preference changes so an active background
  // video pauses/resumes without needing a page reload. The unsubscribe
  // handle is captured so a second initSettings() call (test harness, HMR)
  // replaces the previous handler instead of registering a duplicate that
  // would fire play/pause cycles twice per change.
  if (unsubscribeVideoMotion) unsubscribeVideoMotion();
  if (window.onReducedMotionChange) {
    unsubscribeVideoMotion = window.onReducedMotionChange(syncVideoToMotionPreference);
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

window.loadBg = loadBg;
window.loadVideoAutoplay = loadVideoAutoplay;
window.loadVideoMuted = loadVideoMuted;
window.loadVideoPauseHidden = loadVideoPauseHidden;
window.applyVideoPlaybackSettings = applyVideoPlaybackSettings;
window.clearBackgroundTransitionTimeout = clearBackgroundTransitionTimeout;
window.safePause = safePause;
window.safeLoad = safeLoad;
window.captureBackgroundSnapshot = captureBackgroundSnapshot;
window.hideBackgroundOverlay = hideBackgroundOverlay;
window.stopBackground = stopBackground;
window.applyBg = applyBg;
window.loadClockStyle = loadClockStyle;
window.getClosestSettingSize = getClosestSettingSize;
window.loadClockFormatSetting = loadClockFormatSetting;
window.loadDateStyle = loadDateStyle;
window.loadDateFormatSetting = loadDateFormatSetting;
window.loadTheme = loadTheme;
window.applyTheme = applyTheme;
window.loadLanguageSetting = loadLanguageSetting;
window.renderLanguageOptions = renderLanguageOptions;
window.loadTodoEnabled = loadTodoEnabled;
window.initSettings = initSettings;

})();
