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

// Background readability overlay. Stored integers are the slider units
// (dim 0-80, blur 0-12px, tint strength 0-50). CSS vars are the computed
// visual values: opacity 0-0.8, blur in px, and an rgba tint.
const BG_OVERLAY_OPACITY_KEY = 'bgOverlayOpacity';
const BG_OVERLAY_BLUR_KEY = 'bgOverlayBlur';
const BG_TINT_KEY = 'bgTint';
const BG_TINT_STRENGTH_KEY = 'bgTintStrength';
const BG_TINT_HEX_RE = /^#[0-9a-f]{6}$/;

const BG_OVERLAY_DEFAULTS = {
  opacity: 0,
  blur: 0,
  tint: '#000000',
  tintStrength: 0,
};

function readClampedOverlayInt(key, fallback, min, max) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const parsed = /^-?\d+$/.test(raw) ? Number(raw) : NaN;
  const normalized = Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : fallback;
  if (String(normalized) !== raw) {
    localStorage.setItem(key, String(normalized));
  }
  return normalized;
}

function readOverlayTint() {
  const raw = localStorage.getItem(BG_TINT_KEY);
  if (raw === null) return BG_OVERLAY_DEFAULTS.tint;
  const trimmed = raw.trim().toLowerCase();
  const normalized = BG_TINT_HEX_RE.test(trimmed) ? trimmed : BG_OVERLAY_DEFAULTS.tint;
  if (normalized !== raw) {
    localStorage.setItem(BG_TINT_KEY, normalized);
  }
  return normalized;
}

function loadBgOverlaySettings() {
  return {
    opacity: readClampedOverlayInt(BG_OVERLAY_OPACITY_KEY, BG_OVERLAY_DEFAULTS.opacity, 0, 80),
    blur: readClampedOverlayInt(BG_OVERLAY_BLUR_KEY, BG_OVERLAY_DEFAULTS.blur, 0, 12),
    tint: readOverlayTint(),
    tintStrength: readClampedOverlayInt(BG_TINT_STRENGTH_KEY, BG_OVERLAY_DEFAULTS.tintStrength, 0, 50),
  };
}

function overlayTintToRgba(hex, strength) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + (strength / 100) + ')';
}

function applyBgOverlaySettings() {
  const settings = loadBgOverlaySettings();
  const container = document.getElementById('background-container');
  const overlay = document.getElementById('bg-overlay');
  const inactive = settings.opacity === 0 && settings.blur === 0 && settings.tintStrength === 0;

  if (container) {
    container.style.setProperty('--bg-overlay-opacity', String(settings.opacity / 100));
    container.style.setProperty('--bg-overlay-blur', settings.blur + 'px');
    container.style.setProperty('--bg-tint', overlayTintToRgba(settings.tint, settings.tintStrength));
    container.classList.toggle('bg-overlay-blur-media', settings.blur > 0);
  }

  if (overlay) {
    overlay.classList.toggle('inactive', inactive);
  }

  const dimInput = document.getElementById('bg-overlay-dim');
  const blurInput = document.getElementById('bg-overlay-blur');
  const strengthInput = document.getElementById('bg-tint-strength');
  const colorInput = document.getElementById('bg-tint-color');
  const dimOutput = document.getElementById('bg-overlay-dim-value');
  const blurOutput = document.getElementById('bg-overlay-blur-value');
  const strengthOutput = document.getElementById('bg-tint-strength-value');

  if (dimInput) dimInput.value = String(settings.opacity);
  if (blurInput) blurInput.value = String(settings.blur);
  if (strengthInput) strengthInput.value = String(settings.tintStrength);
  if (colorInput && colorInput.value !== settings.tint) colorInput.value = settings.tint;
  if (dimOutput) dimOutput.textContent = settings.opacity + '%';
  if (blurOutput) blurOutput.textContent = settings.blur + 'px';
  if (strengthOutput) strengthOutput.textContent = settings.tintStrength + '%';
}

function bindBgOverlayInput(input, key) {
  if (!input || input.dataset.overlayBound === 'true') return;
  input.dataset.overlayBound = 'true';
  input.addEventListener('input', function () {
    localStorage.setItem(key, input.value);
    applyBgOverlaySettings();
  });
}

function initBgOverlaySettings() {
  bindBgOverlayInput(document.getElementById('bg-overlay-dim'), BG_OVERLAY_OPACITY_KEY);
  bindBgOverlayInput(document.getElementById('bg-overlay-blur'), BG_OVERLAY_BLUR_KEY);
  bindBgOverlayInput(document.getElementById('bg-tint-strength'), BG_TINT_STRENGTH_KEY);
  bindBgOverlayInput(document.getElementById('bg-tint-color'), BG_TINT_KEY);

  const resetBtn = document.getElementById('bg-overlay-reset');
  if (resetBtn && resetBtn.dataset.overlayBound !== 'true') {
    resetBtn.dataset.overlayBound = 'true';
    resetBtn.addEventListener('click', function () {
      localStorage.removeItem(BG_OVERLAY_OPACITY_KEY);
      localStorage.removeItem(BG_OVERLAY_BLUR_KEY);
      localStorage.removeItem(BG_TINT_KEY);
      localStorage.removeItem(BG_TINT_STRENGTH_KEY);
      applyBgOverlaySettings();
      if (window.initModernColorPickers) window.initModernColorPickers();
    });
  }
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
  delete videoEl.dataset.reducedMotionPaused;
  delete videoEl.dataset.crossfadeTriggered;
  delete videoEl.dataset.lastPauseTime;
  delete videoEl.dataset.resumeAttempts;

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
    // Leave readability classes alone: .inactive lives on #bg-overlay, and
    // .bg-overlay-blur-media tracks the blur slider rather than the media.
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

function notifyMissingCustomBackground(bg) {
  const msg = window.i18n && typeof window.i18n.t === 'function'
    ? window.i18n.t('customBackgroundLoadError')
    : 'Failed to load the custom background. Please try again.';
  setTimeout(function () {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, 'error');
    } else {
      window.alert(msg);
    }
    console.error(msg, new Error('Background not found: ' + bg));
  }, 0);
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
    // Dangling custom id from an import (older backups and oversized
    // uploads carry no media, and the media lives in IndexedDB) or any
    // other unknown id: fall back to a built-in background
    // and surface an error instead of leaving a blank viewport.
    const looksCustom = bg && bg.indexOf('custom_') === 0;
    const fallbackId = typeof window._getFallbackBackgroundId === 'function'
      ? window._getFallbackBackgroundId()
      : null;
    const fallbackBgData = fallbackId && window._backgrounds
      ? window._backgrounds.find(function (b) { return b.id === fallbackId; })
      : null;
    if (!fallbackBgData) {
      if (looksCustom) {
        notifyMissingCustomBackground(bg);
      }
      hideBackgroundOverlay();
      return;
    }
    if (bg !== fallbackId) {
      localStorage.setItem('homepageBg', fallbackId);
      if (looksCustom) {
        notifyMissingCustomBackground(bg);
      }
      hideBackgroundOverlay();
      // Re-enter with the fallback id (now guaranteed to resolve to bgData).
      applyBg();
      return;
    }
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
      if (containerEl) {
        containerEl.classList.add('video-fallback');
      }
      thumbnailEl.src = bgData.thumb;
      // Still load the full image as fallback
      const fullImg = new Image();
      fullImg.onload = function() {
        if (loadVersion !== backgroundLoadVersion) {
          return;
        }

        fullEl.src = bgData.thumb;
        requestAnimationFrame(() => {
          if (loadVersion !== backgroundLoadVersion) {
            return;
          }

          fullEl.classList.add('loaded');
          hideBackgroundOverlay();
          setTimeout(() => {
            if (loadVersion !== backgroundLoadVersion) {
              return;
            }

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

        // Fade the still-blurred thumbnail out as the video fades in.
        // The blur stays static: filter is not compositor-animatable, so
        // animating it re-blurs the viewport every frame (#978).
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
        // Reset resume attempt counter when video is actively playing
        if (videoEl.dataset.currentBg === bgData.id) {
          videoEl.dataset.resumeAttempts = '0';
        }
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
        if (containerEl) {
          containerEl.classList.add('video-error');
        }
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
            if (loadVersion !== backgroundLoadVersion) {
              return;
            }

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

        // Track consecutive auto-resume attempts to prevent infinite play/pause cycles
        // that cause high CPU usage when the video cannot sustain playback
        const resumeAttempts = parseInt(videoEl.dataset.resumeAttempts || '0', 10);

        if (!document.hidden && videoEl.classList.contains('active') && loadVideoAutoplay() && videoEl.dataset.reducedMotionPaused !== 'true' && videoEl.readyState >= 3) {
          if (resumeAttempts >= 3) return;
          videoEl.dataset.resumeAttempts = String(resumeAttempts + 1);
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
      
      // Fade the still-blurred thumbnail out while the full image fades in.
      // The blur stays static: filter is not compositor-animatable, so
      // animating it re-blurs the viewport every frame (#978).
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

const FONT_DEFAULT = '\'Times New Roman\', Times, serif';
const FONT_ALIASES = {
  '\'Times New Roman\', serif': FONT_DEFAULT,
};

function resolveFontAlias(value) {
  return FONT_ALIASES[value] || value;
}

// Clock style
function loadClockStyle() {
  const size = parseInt(localStorage.getItem('clockSize') || '80', 10);
  const normalizedSize = Number.isFinite(size) ? getClosestSettingSize(size, CLOCK_SIZE_OPTIONS) : 80;
  if (normalizedSize !== size) {
    localStorage.setItem('clockSize', normalizedSize);
  }
  const storedFont = localStorage.getItem('clockFont');
  const resolvedFont = storedFont ? resolveFontAlias(storedFont) : FONT_DEFAULT;
  if (storedFont && resolvedFont !== storedFont) {
    localStorage.setItem('clockFont', resolvedFont);
  }
  return {
    color: localStorage.getItem('clockColor') || '#ffffff',
    font: resolvedFont,
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
    if (window.initModernColorPickers) window.initModernColorPickers();
    if (window.initModernFontPickers) window.initModernFontPickers();
    if (window.refreshClockSettings) window.refreshClockSettings();
    if (window.updateTime) updateTime();
  });
}

const clockFormatPicker = document.getElementById('clock-format-picker');
if (clockFormatPicker) {
  clockFormatPicker.addEventListener('change', function () {
    localStorage.setItem('clockFormat', this.value);
    if (window.refreshClockSettings) window.refreshClockSettings();
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
  const storedFont = localStorage.getItem('dateFont');
  const resolvedFont = storedFont ? resolveFontAlias(storedFont) : FONT_DEFAULT;
  if (storedFont && resolvedFont !== storedFont) {
    localStorage.setItem('dateFont', resolvedFont);
  }
  return {
    color: localStorage.getItem('dateColor') || '#ffffff',
    font: resolvedFont,
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
    if (window.initModernColorPickers) window.initModernColorPickers();
    if (window.initModernFontPickers) window.initModernFontPickers();
    if (window.refreshClockSettings) window.refreshClockSettings();
    if (window.updateTime) updateTime();
  });
}

const dateFormatPicker = document.getElementById('date-format-picker');
if (dateFormatPicker) {
  dateFormatPicker.addEventListener('change', function () {
    localStorage.setItem('dateFormat', this.value);
    if (window.refreshClockSettings) window.refreshClockSettings();
    if (window.updateTime) updateTime();
  });
}

// Timezone settings
function initTimezoneSettings() {
  const picker = document.getElementById('timezone-picker');
  const optionsList = document.getElementById('timezone-options');
  const addBtn = document.getElementById('add-timezone-btn');
  const currentList = document.getElementById('timezone-current-list');
  if (!picker || !optionsList || !addBtn || !currentList) return;

  const zones = window.POPULAR_ZONES || [];
  let selectedZoneId = '';

  function getCurrentOffset(zone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone.id,
        timeZoneName: 'shortOffset'
      }).formatToParts(new Date());
      const timeZoneName = parts.find(function (part) { return part.type === 'timeZoneName'; });
      const match = timeZoneName && timeZoneName.value.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
      if (!match) return 0;
      const offset = Number(match[2]) + (match[3] ? Number(match[3]) / 60 : 0);
      return match[1] === '-' ? -offset : offset;
    } catch {
      return zone.offset;
    }
  }

  function getZoneLabel(zone) {
    const offset = getCurrentOffset(zone);
    return zone.city + ' (UTC' + (offset >= 0 ? '+' : '') + offset + ')';
  }

  function updateAddButton() {
    const saved = window.loadTimeZones ? window.loadTimeZones() : [];
    const atCapacity = saved.length >= (window.MAX_TIMEZONES || 5);
    addBtn.disabled = atCapacity || !selectedZoneId || saved.indexOf(selectedZoneId) !== -1;
  }

  function renderOptions(filter) {
    const query = filter.trim().toLocaleLowerCase();
    optionsList.innerHTML = '';
    const matches = zones.filter(function (zone) {
      return !query || (zone.city + ' ' + zone.id).toLocaleLowerCase().indexOf(query) !== -1;
    });
    matches.forEach(function (zone) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'timezone-option';
      option.setAttribute('role', 'option');
      option.dataset.zone = zone.id;
      option.textContent = getZoneLabel(zone);
      optionsList.appendChild(option);
    });
    optionsList.hidden = matches.length === 0;
    picker.setAttribute('aria-expanded', String(matches.length > 0));
  }

  function renderCurrentTimezones() {
    const saved = window.loadTimeZones ? window.loadTimeZones() : [];
    currentList.innerHTML = '';
    saved.forEach(function (zoneId) {
      const info = zones.find(function (z) { return z.id === zoneId; });
      const city = info ? info.city : zoneId.split('/').pop().replace(/_/g, ' ');
      const chip = document.createElement('span');
      chip.className = 'timezone-current-chip';

      const cityEl = document.createElement('span');
      cityEl.className = 'timezone-current-city';
      cityEl.textContent = city;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.dataset.zone = zoneId;
      const i18n = window.i18n;
      removeBtn.title = i18n && typeof i18n.t === 'function' ? i18n.t('removeTimezone') : 'Remove';
      removeBtn.setAttribute('aria-label', i18n && typeof i18n.t === 'function' ? i18n.t('removeTimezoneLabel', { city: city }) : 'Remove ' + city);

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('width', '10');
      svg.setAttribute('height', '10');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M4 4l8 8M12 4l-8 8');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linecap', 'round');
      svg.appendChild(path);
      removeBtn.appendChild(svg);
      chip.appendChild(cityEl);
      chip.appendChild(removeBtn);
      currentList.appendChild(chip);
    });
    selectedZoneId = '';
    picker.value = '';
    optionsList.hidden = true;
    picker.setAttribute('aria-expanded', 'false');
    updateAddButton();
  }

  picker.addEventListener('focus', function () {
    renderOptions(this.value);
  });

  picker.addEventListener('input', function () {
    selectedZoneId = '';
    renderOptions(this.value);
    updateAddButton();
  });

  optionsList.addEventListener('click', function (e) {
    const option = e.target.closest('button[data-zone]');
    if (!option) return;
    const zone = zones.find(function (item) { return item.id === option.dataset.zone; });
    if (!zone) return;
    selectedZoneId = zone.id;
    picker.value = getZoneLabel(zone);
    optionsList.hidden = true;
    picker.setAttribute('aria-expanded', 'false');
    updateAddButton();
  });

  addBtn.addEventListener('click', function () {
    if (!selectedZoneId) return;
    if (window.addTimeZone) window.addTimeZone(selectedZoneId);
    renderCurrentTimezones();
  });

  currentList.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-zone]');
    if (btn) {
      if (window.removeTimeZone) window.removeTimeZone(btn.dataset.zone);
      renderCurrentTimezones();
    }
  });

  window.renderTimezoneCurrentList = renderCurrentTimezones;
  renderCurrentTimezones();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTimezoneSettings);
} else {
  initTimezoneSettings();
}

// Theme
const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';

function loadTheme() {
  return localStorage.getItem('theme') || 'dark';
}

function getSystemThemeMql() {
  if (typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(SYSTEM_THEME_QUERY);
  } catch {
    return null;
  }
}

// Map a stored theme to the effective theme: 'system' resolves from the OS
// preference, every other stored value passes through unchanged.
function resolveTheme(theme) {
  if (theme !== 'system') return theme;
  const mql = getSystemThemeMql();
  if (!mql) return 'dark';
  return mql.matches ? 'dark' : 'light';
}

function applyTheme() {
  const stored = loadTheme();
  const theme = resolveTheme(stored);
  document.body.classList.toggle('light-theme', theme === 'light');
  // Keep the pre-paint marker set by storage.js in <head> in sync so the
  // html.light-pre rules only ever match before body.light-theme exists.
  document.documentElement.classList.toggle('light-pre', theme === 'light');
  // Radios reflect the stored value so "System" stays selected while the
  // effective theme comes from the OS.
  const darkRadio = document.querySelector('input[name="theme"][value="dark"]');
  const lightRadio = document.querySelector('input[name="theme"][value="light"]');
  const systemRadio = document.querySelector('input[name="theme"][value="system"]');
  if (darkRadio) darkRadio.checked = stored === 'dark';
  if (lightRadio) lightRadio.checked = stored === 'light';
  if (systemRadio) systemRadio.checked = stored === 'system';
}

// Live-update the effective theme when the OS preference flips and the stored
// theme is 'system'. window.__systemThemeDetach detaches the handler from any
// previous injection so re-running this file never stacks listeners.
function onSystemThemeChange() {
  if (loadTheme() !== 'system') return;
  applyTheme();
  window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: resolveTheme('system') } }));
}

function attachSystemThemeListener() {
  if (typeof window.__systemThemeDetach === 'function') {
    window.__systemThemeDetach();
    window.__systemThemeDetach = null;
  }
  const mql = getSystemThemeMql();
  if (!mql) return;
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onSystemThemeChange);
    window.__systemThemeDetach = function () {
      mql.removeEventListener('change', onSystemThemeChange);
    };
  } else if (typeof mql.addListener === 'function') {
    mql.addListener(onSystemThemeChange);
    window.__systemThemeDetach = function () {
      mql.removeListener(onSystemThemeChange);
    };
  }
}

attachSystemThemeListener();

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
    // Dispatch custom event for AI chat and other components to respond.
    // 'system' is resolved so listeners always receive a concrete theme.
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: resolveTheme(selectedTheme) } }));
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
          if (window.prefersReducedMotion && window.prefersReducedMotion()) {
            videoEl.dataset.reducedMotionPaused = 'true';
            return;
          }

          delete videoEl.dataset.reducedMotionPaused;
          if (thumbnailEl && !thumbnailEl.classList.contains('hidden')) {
            thumbnailEl.classList.add('clearing');
            const scheduledVersion = backgroundLoadVersion;
            const scheduledBg = videoEl.dataset.currentBg;
            setTimeout(function () {
              if (scheduledVersion !== backgroundLoadVersion || videoEl.dataset.currentBg !== scheduledBg) {
                return;
              }

              thumbnailEl.classList.add('hidden');
              thumbnailEl.classList.remove('clearing');
            }, crossfadeDelayMs(VIDEO_THUMBNAIL_HIDE_DELAY_MS));
          }
          videoEl.play().catch(function () {});
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
    todoSection.style.display = enabled ? '' : 'none';
  }
  const todoEnabledSetting = document.getElementById('todo-enabled-setting');
  if (todoEnabledSetting) todoEnabledSetting.checked = enabled;
}

// Event listeners for todo enabled
const todoEnabledSetting = document.getElementById('todo-enabled-setting');
if (todoEnabledSetting) {
  todoEnabledSetting.addEventListener('change', function () {
    // Guard the shared helper: toast.js may fail to load, and an unguarded
    // call would throw before the write (#969 review thread).
    let persisted;
    try {
      // persistFeatureToggle checks the bridge's result: setItem returns false
      // for a rejected write instead of throwing (#969).
      persisted = typeof window.persistFeatureToggle === 'function'
        ? window.persistFeatureToggle('todoEnabled', this.checked)
        : localStorage.setItem('todoEnabled', this.checked) !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
    } catch (e) {
      console.warn('Failed to save todoEnabled:', e);
      persisted = false;
    }
    applyTodoEnabled();
    if (!persisted && typeof window.showFeatureToggleSaveError === 'function') {
      window.showFeatureToggleSaveError();
    }
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

// Todo stats
function loadTodoStatsEnabled() {
  return localStorage.getItem('todoStatsEnabled') === 'true';
}
function applyTodoStatsEnabled() {
  const enabled = loadTodoStatsEnabled();
  const setting = document.getElementById('todo-stats-enabled-setting');
  if (setting) setting.checked = enabled;
  if (window.applyTodoStatsVisibility) window.applyTodoStatsVisibility();
}

const todoStatsEnabledSetting = document.getElementById('todo-stats-enabled-setting');
if (todoStatsEnabledSetting) {
  todoStatsEnabledSetting.addEventListener('change', function () {
    localStorage.setItem('todoStatsEnabled', this.checked);
    applyTodoStatsEnabled();
  });
}

// Pomodoro stats
function loadPomodoroStatsEnabled() {
  return localStorage.getItem('pomodoroStatsEnabled') === 'true';
}
function applyPomodoroStatsEnabled(enabledOverride) {
  const enabled = typeof enabledOverride === 'boolean' ? enabledOverride : loadPomodoroStatsEnabled();
  const setting = document.getElementById('pomodoro-stats-enabled-setting');
  if (setting) setting.checked = enabled;
  if (window.applyPomodoroStatsVisibility) window.applyPomodoroStatsVisibility(enabled);
}

const pomodoroStatsEnabledSetting = document.getElementById('pomodoro-stats-enabled-setting');
if (pomodoroStatsEnabledSetting) {
  pomodoroStatsEnabledSetting.addEventListener('change', function () {
    const enabled = this.checked;
    try {
      localStorage.setItem('pomodoroStatsEnabled', enabled);
    } catch (_e) {
      // ignore storage errors
    }
    applyPomodoroStatsEnabled(enabled);
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

function loadEyeCareReminderState() {
  const defaults = {
    enabled: false,
    intervalMinutes: 20,
    browserNotification: false,
    lastReminder: null,
    elapsedVisibleMs: 0,
    lastVisibleAt: null,
    activeReminderAt: null,
    activeElapsedVisibleMs: 0,
    activeLastVisibleAt: null,
    visibilityPaused: false
  };

  try {
    const raw = localStorage.getItem('eyeCareReminder');
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;

    const interval = parseInt(parsed.intervalMinutes, 10);
    const validIntervals = [15, 20, 30, 45, 60];
    const activeReminderAt = typeof parsed.activeReminderAt === 'number' ? parsed.activeReminderAt : null;
    const hasActiveElapsed = typeof parsed.activeElapsedVisibleMs === 'number';

    return {
      enabled: parsed.enabled === true,
      intervalMinutes: validIntervals.includes(interval) ? interval : defaults.intervalMinutes,
      browserNotification: parsed.browserNotification === true,
      lastReminder: typeof parsed.lastReminder === 'number' ? parsed.lastReminder : null,
      elapsedVisibleMs: typeof parsed.elapsedVisibleMs === 'number' && parsed.elapsedVisibleMs >= 0
        ? parsed.elapsedVisibleMs
        : defaults.elapsedVisibleMs,
      lastVisibleAt: typeof parsed.lastVisibleAt === 'number' ? parsed.lastVisibleAt : null,
      activeReminderAt,
      activeElapsedVisibleMs: hasActiveElapsed && parsed.activeElapsedVisibleMs >= 0
        ? parsed.activeElapsedVisibleMs
        : activeReminderAt === null ? defaults.activeElapsedVisibleMs : Math.max(0, Date.now() - activeReminderAt),
      activeLastVisibleAt: typeof parsed.activeLastVisibleAt === 'number' ? parsed.activeLastVisibleAt : null,
      visibilityPaused: parsed.visibilityPaused === true
    };
  } catch (error) {
    console.warn('Failed to parse eye-care reminder settings:', error);
    return defaults;
  }
}

// Returns the merged state after a successful save, or false when the storage
// bridge rejected the write (#969). The bridge rolls its cache back and
// returns false instead of throwing, so callers must check the result instead
// of treating every call as persisted. Guarded so a toast.js load failure
// cannot throw before the write.
function saveEyeCareReminderState(updates) {
  const current = loadEyeCareReminderState();
  const next = {
    ...current,
    ...updates
  };
  let persisted;
  try {
    persisted = typeof window.persistFeatureToggle === 'function'
      ? window.persistFeatureToggle('eyeCareReminder', JSON.stringify(next))
      : localStorage.setItem('eyeCareReminder', JSON.stringify(next)) !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
  } catch (e) {
    console.warn('Failed to save eyeCareReminder:', e);
    persisted = false;
  }
  if (!persisted) {
    return false;
  }
  return next;
}

function applyEyeCareReminderSettings() {
  const state = loadEyeCareReminderState();
  const enabledSetting = document.getElementById('eye-care-enabled-setting');
  const intervalSetting = document.getElementById('eye-care-interval-setting');
  const browserNotificationSetting = document.getElementById('eye-care-browser-notification-setting');
  const intervalOption = document.getElementById('eye-care-interval-option');
  const browserNotificationOption = document.getElementById('eye-care-browser-notification-option');

  if (enabledSetting) enabledSetting.checked = state.enabled;
  if (intervalSetting) intervalSetting.value = String(state.intervalMinutes);
  if (browserNotificationSetting) browserNotificationSetting.checked = state.browserNotification;
  if (intervalOption) intervalOption.style.display = state.enabled ? '' : 'none';
  if (browserNotificationOption) browserNotificationOption.style.display = state.enabled ? '' : 'none';
}

// Guarded reporter: toast.js may fail to load, so resolve through window
// instead of assuming the helper exists (#969 review thread).
function reportFeatureToggleSaveError() {
  if (typeof window.showFeatureToggleSaveError === 'function') {
    window.showFeatureToggleSaveError();
  }
}

const eyeCareEnabledSetting = document.getElementById('eye-care-enabled-setting');
if (eyeCareEnabledSetting) {
  eyeCareEnabledSetting.addEventListener('change', function () {
    const updates = {
      enabled: this.checked,
      lastReminder: this.checked ? Date.now() : null,
      elapsedVisibleMs: 0,
      lastVisibleAt: this.checked ? Date.now() : null,
      activeReminderAt: null,
      activeElapsedVisibleMs: 0,
      activeLastVisibleAt: null,
      visibilityPaused: false
    };
    const saved = saveEyeCareReminderState(updates);
    // Re-apply either way: after a rejected write it restores the controls to
    // the rolled-back state instead of leaving them desynced.
    applyEyeCareReminderSettings();
    if (saved === false) {
      reportFeatureToggleSaveError();
      return;
    }
    if (typeof window.refreshEyeCareReminder === 'function') {
      window.refreshEyeCareReminder();
    }
  });
}

const eyeCareIntervalSetting = document.getElementById('eye-care-interval-setting');
if (eyeCareIntervalSetting) {
  eyeCareIntervalSetting.addEventListener('change', function () {
    const saved = saveEyeCareReminderState({
      intervalMinutes: parseInt(this.value, 10) || 20
    });
    if (saved === false) {
      applyEyeCareReminderSettings();
      reportFeatureToggleSaveError();
      return;
    }
    if (typeof window.refreshEyeCareReminder === 'function') {
      window.refreshEyeCareReminder();
    }
  });
}

const eyeCareBrowserNotificationSetting = document.getElementById('eye-care-browser-notification-setting');
if (eyeCareBrowserNotificationSetting) {
  eyeCareBrowserNotificationSetting.addEventListener('change', function () {
    const saved = saveEyeCareReminderState({
      browserNotification: this.checked
    });
    if (saved === false) {
      applyEyeCareReminderSettings();
      reportFeatureToggleSaveError();
      return;
    }
    if (typeof window.refreshEyeCareReminder === 'function') {
      window.refreshEyeCareReminder();
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
    notesSection.style.display = enabled ? '' : 'none';
  }
  const notesEnabledSetting = document.getElementById('notes-enabled-setting');
  if (notesEnabledSetting) notesEnabledSetting.checked = enabled;
}

const notesEnabledSetting = document.getElementById('notes-enabled-setting');
if (notesEnabledSetting) {
  notesEnabledSetting.addEventListener('change', function () {
    // Guard the shared helper: toast.js may fail to load, and an unguarded
    // call would throw before the write (#969 review thread).
    let persisted;
    try {
      persisted = typeof window.persistFeatureToggle === 'function'
        ? window.persistFeatureToggle('notesEnabled', this.checked)
        : localStorage.setItem('notesEnabled', this.checked) !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
    } catch (e) {
      console.warn('Failed to save notesEnabled:', e);
      persisted = false;
    }
    applyNotesEnabled();
    if (!persisted) {
      reportFeatureToggleSaveError();
    }
  });
}

// Pomodoro settings
function updatePomodoroDurationSettingsVisibility(durationSettings, enabled) {
  if (durationSettings) {
    durationSettings.style.display = enabled ? 'block' : 'none';
  }
}

function initPomodoroEnabledSetting(enabledCheckbox, durationSettings) {
  if (!enabledCheckbox || typeof loadPomodoroEnabled !== 'function') return;

  enabledCheckbox.checked = loadPomodoroEnabled();
  updatePomodoroDurationSettingsVisibility(durationSettings, enabledCheckbox.checked);
  enabledCheckbox.addEventListener('change', function () {
    const settings = typeof loadPomodoroDurations === 'function' ? loadPomodoroDurations() : {};
    settings.enabled = this.checked;
    if (typeof savePomodoroDurations === 'function') savePomodoroDurations(settings);
    updatePomodoroDurationSettingsVisibility(durationSettings, this.checked);
    if (typeof window.applyPomodoroEnabled === 'function') window.applyPomodoroEnabled();
    if (typeof window.renderTodos === 'function') window.renderTodos();
  });
}

function initPomodoroDurationInput(input, setting, min, max, defaultValue) {
  if (!input) return;

  input.value = typeof loadPomodoroDurations === 'function'
    ? loadPomodoroDurations()[setting]
    : defaultValue;
  input.addEventListener('change', function () {
    const value = Math.max(min, Math.min(max, Number.parseInt(this.value, 10) || defaultValue));
    this.value = value;
    if (typeof savePomodoroDurations === 'function') savePomodoroDurations({ [setting]: value });
  });
}

function initPomodoroSettings() {
  const enabledCheckbox = document.getElementById('pomodoro-enabled-setting');
  const durationSettings = document.getElementById('pomodoro-duration-settings');
  const workInput = document.getElementById('pomodoro-work-duration');
  const shortBreakInput = document.getElementById('pomodoro-short-break-duration');
  const longBreakInput = document.getElementById('pomodoro-long-break-duration');
  const sessionsInput = document.getElementById('pomodoro-sessions-before-long');

  initPomodoroEnabledSetting(enabledCheckbox, durationSettings);
  initPomodoroDurationInput(workInput, 'workDuration', 1, 120, 25);
  initPomodoroDurationInput(shortBreakInput, 'shortBreakDuration', 1, 30, 5);
  initPomodoroDurationInput(longBreakInput, 'longBreakDuration', 1, 60, 15);
  initPomodoroDurationInput(sessionsInput, 'sessionsBeforeLongBreak', 1, 10, 4);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPomodoroSettings);
} else {
  initPomodoroSettings();
}


// Custom search providers settings
function initCustomSearchProvidersSettings() {
  const nameInput = document.getElementById('custom-search-provider-name');
  const urlInput = document.getElementById('custom-search-provider-url');
  const suggestionsUrlInput = document.getElementById('custom-search-provider-suggestions-url');
  const addBtn = document.getElementById('custom-search-provider-add-btn');
  const listEl = document.getElementById('custom-search-providers-list');
  const emptyEl = document.getElementById('custom-search-providers-empty');
  const feedbackEl = document.getElementById('custom-search-provider-feedback');

  if (!nameInput || !urlInput || !addBtn || !listEl) return;

  function t(key, fallback, replacements) {
    if (window.i18n && typeof window.i18n.t === 'function') {
        const val = window.i18n.t(key, replacements);
      if (val && val !== key) return val;
    }
    return fallback || key;
  }

  function showFeedback(message, type) {
    if (!feedbackEl) return;
    feedbackEl.textContent = message || '';
    feedbackEl.className = 'custom-search-provider-feedback';
    if (type) feedbackEl.classList.add(type);
  }

  function clearFeedback() {
    showFeedback('', '');
  }

  function renderCustomProvidersList() {
      let providers = [];
    try {
      if (typeof window.loadCustomProviders === 'function') {
        providers = window.loadCustomProviders() || [];
      }
    } catch (e) {
      console.warn('Failed to load custom providers:', e);
      providers = [];
    }

    listEl.innerHTML = '';

    if (!providers.length) {
      if (emptyEl) emptyEl.style.display = '';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    providers.forEach(function (provider) {
      const item = document.createElement('div');
      item.className = 'custom-search-provider-item';

      const info = document.createElement('div');
      info.className = 'custom-search-provider-item-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'custom-search-provider-item-name';
      nameEl.textContent = provider.name;

      const urlEl = document.createElement('span');
      urlEl.className = 'custom-search-provider-item-url';
      urlEl.textContent = provider.url;
      urlEl.title = provider.url;

      info.appendChild(nameEl);
      info.appendChild(urlEl);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'custom-search-provider-remove';
      removeBtn.dataset.providerId = provider.id;
      removeBtn.setAttribute('aria-label', t('searchProviderRemoveLabel', 'Remove ' + provider.name, { name: provider.name }));
      removeBtn.title = t('searchProviderRemove', 'Remove');
      removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

      item.appendChild(info);
      item.appendChild(removeBtn);
      listEl.appendChild(item);
    });
  }

  const SEARCH_PROVIDER_SAVE_ERROR_FALLBACK = 'Failed to save search provider changes. Your last action was not saved.';

  // Log an unexpected exception from a provider success/failure handler so
  // it is not silently swallowed by the final re-enable step.
  function logProviderHandlerError(action) {
    return function (error) {
      console.error('Unexpected error while handling custom search provider ' + action + ':', error);
    };
  }

  // Run a provider API call now (so storage writes start synchronously) but
  // turn a synchronous throw into a rejected Promise, so the caller's
  // rejection handler and button re-enable still run.
  function callProviderApi(fn) {
    try {
      return Promise.resolve(fn());
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function handleAdd() {
    // Enter in the inputs bypasses the disabled button; ignore it too.
    if (addBtn.disabled) return;
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const suggestionsUrl = suggestionsUrlInput ? suggestionsUrlInput.value.trim() : '';

    if (!name) {
      showFeedback(t('searchProviderInvalidName', 'Enter a name for the search provider.'), 'error');
      nameInput.focus();
      return;
    }

    if (!url || !url.includes('{query}')) {
      showFeedback(t('searchProviderInvalidUrl', 'Enter a valid URL with {query} and http(s).'), 'error');
      urlInput.focus();
      return;
    }

    if (suggestionsUrl && !suggestionsUrl.includes('{query}')) {
      showFeedback(t('searchProviderInvalidSuggestionsUrl', 'Enter a valid suggestions URL with {query} and http(s).'), 'error');
      if (suggestionsUrlInput) suggestionsUrlInput.focus();
      return;
    }

    if (typeof window.addCustomProvider !== 'function') {
      showFeedback(t('searchProviderUnavailable', 'Provider API unavailable.'), 'error');
      return;
    }

    // Disable the button while the write is in flight so a second click
    // cannot queue a duplicate provider.
    addBtn.disabled = true;
    const reenableAdd = function () {
      addBtn.disabled = false;
    };
    callProviderApi(function () {
      return window.addCustomProvider(name, url, suggestionsUrl);
    }).then(function (savedId) {
      if (savedId === null) {
        // Validation failure; the name was already checked above. Blame the
        // suggestions URL only when the main URL looks valid and the
        // suggestions URL does not (issue #1012).
        if (suggestionsUrl && /^https?:\/\//i.test(url) && !/^https?:\/\//i.test(suggestionsUrl)) {
          showFeedback(t('searchProviderInvalidSuggestionsUrl', 'Enter a valid suggestions URL with {query} and http(s).'), 'error');
          suggestionsUrlInput.focus();
        } else {
          showFeedback(t('searchProviderInvalidUrl', 'Enter a valid URL with {query} and http(s).'), 'error');
          urlInput.focus();
        }
        return;
      }
      if (!savedId) {
        showFeedback(t('searchProviderSaveError', SEARCH_PROVIDER_SAVE_ERROR_FALLBACK), 'error');
        renderCustomProvidersList();
        return;
      }

      nameInput.value = '';
      urlInput.value = '';
      if (suggestionsUrlInput) suggestionsUrlInput.value = '';
      clearFeedback();
      if (typeof window.refreshProviderBar === 'function') {
        window.refreshProviderBar();
      }
      renderCustomProvidersList();
      nameInput.focus();
    }, function (error) {
      console.warn('Failed to add custom search provider:', error);
      showFeedback(t('searchProviderSaveError', SEARCH_PROVIDER_SAVE_ERROR_FALLBACK), 'error');
      renderCustomProvidersList();
    }).catch(logProviderHandlerError('add')).then(reenableAdd, reenableAdd);
  }

  function handleRemove(providerId, removeBtn) {
    if (typeof window.removeCustomProvider !== 'function') return;
    // Disable the button while the save is in flight so repeated clicks
    // cannot queue duplicate removals. The list re-renders afterwards; the
    // reset below covers a button that survives the re-render.
    if (removeBtn) removeBtn.disabled = true;
    const reenableRemove = function () {
      if (removeBtn) removeBtn.disabled = false;
    };
    callProviderApi(function () {
      return window.removeCustomProvider(providerId);
    }).then(function (removed) {
      if (!removed) {
        showFeedback(t('searchProviderSaveError', SEARCH_PROVIDER_SAVE_ERROR_FALLBACK), 'error');
        renderCustomProvidersList();
        return;
      }
      clearFeedback();
      if (typeof window.refreshProviderBar === 'function') {
        window.refreshProviderBar();
      }
      renderCustomProvidersList();
    }, function (error) {
      console.warn('Failed to remove custom search provider:', error);
      showFeedback(t('searchProviderSaveError', SEARCH_PROVIDER_SAVE_ERROR_FALLBACK), 'error');
      renderCustomProvidersList();
    }).catch(logProviderHandlerError('removal')).then(reenableRemove, reenableRemove);
  }

  addBtn.addEventListener('click', handleAdd);

  [nameInput, urlInput, suggestionsUrlInput].filter(Boolean).forEach(function (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });
    input.addEventListener('input', clearFeedback);
  });

  listEl.addEventListener('click', function (e) {
    const removeBtn = e.target.closest('.custom-search-provider-remove');
    const providerId = removeBtn?.dataset.providerId;
    if (!providerId || removeBtn.disabled) return;
    handleRemove(providerId, removeBtn);
  });

  // Expose for import refresh and re-render after language change
  window.renderCustomSearchProvidersList = renderCustomProvidersList;
  window.refreshCustomSearchProvidersSettings = renderCustomProvidersList;

  // Re-render when language changes so i18n-driven empty text stays consistent
  window.addEventListener('languageChanged', renderCustomProvidersList);

  renderCustomProvidersList();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCustomSearchProvidersSettings);
} else {
  initCustomSearchProvidersSettings();
}


// Games enabled
function loadGamesEnabled() {
  if (window.gamesHelpers && typeof window.gamesHelpers.isEnabled === 'function') {
    return window.gamesHelpers.isEnabled();
  }
  try {
    return localStorage.getItem('games_enabled') !== 'false';
  } catch (_e) {
    // When localStorage is unavailable, use the current checkbox state as fallback
    const checkbox = document.getElementById('games-enabled-setting');
    return checkbox ? checkbox.checked : true;
  }
}
// Games visibility has two independent gates: this feature toggle (General
// settings) switches the Games feature itself, while grid-hide
// (hiddenDefaultApps via Settings > Apps or the context menu) removes the
// tile from the grid entirely. renderAllApps re-runs this after every
// rebuild, so a tile restored by showDefaultApp is re-evaluated here
// instead of keeping a stale inline display.
function applyGamesEnabled(enabledOverride) {
  const enabled = typeof enabledOverride === 'boolean' ? enabledOverride : loadGamesEnabled();
  const gamesApp = document.getElementById('games-app');
  if (gamesApp) {
    gamesApp.style.display = enabled ? '' : 'none';
  }
  const checkbox = document.getElementById('games-enabled-setting');
  if (checkbox) checkbox.checked = enabled;
  if (!enabled && window.GamesApp && typeof window.GamesApp.close === 'function') {
    window.GamesApp.close();
  }
}
const gamesEnabledSetting = document.getElementById('games-enabled-setting');
if (gamesEnabledSetting) {
  gamesEnabledSetting.checked = loadGamesEnabled();
  gamesEnabledSetting.addEventListener('change', function () {
    const enabled = this.checked;
    try {
      localStorage.setItem('games_enabled', enabled);
    } catch (_e) {
      // ignore storage errors
    }
    applyGamesEnabled(enabled);
    if (enabled && window.GamesApp && typeof window.GamesApp.preload === 'function') {
      try { window.GamesApp.preload().catch(function () {}); } catch (_e) { /* ignore preload errors */ }
    }
  });
}

// Games steering keymap (#1023). The active map is read from storage the
// time the games scripts load, so the select only needs to persist the
// choice and apply it live when the helpers are already present.
function loadGamesKeymap() {
  try {
    const stored = localStorage.getItem('games_keymap');
    if (stored === 'wasd' || stored === 'ijkl' || stored === 'numpad') return stored;
  } catch (_e) {
    // ignore storage errors
  }
  return 'wasd';
}
function applyGamesKeymap(idOverride) {
  const keymap = typeof idOverride === 'string' ? idOverride : loadGamesKeymap();
  const select = document.getElementById('games-keymap-setting');
  if (select) select.value = keymap;
  if (window.gamesHelpers && typeof window.gamesHelpers.setKeymap === 'function') {
    window.gamesHelpers.setKeymap(keymap);
  }
}
const gamesKeymapSetting = document.getElementById('games-keymap-setting');
if (gamesKeymapSetting) {
  applyGamesKeymap();
  gamesKeymapSetting.addEventListener('change', function () {
    const keymap = this.value;
    // gamesHelpers.setKeymap persists the choice itself when the helpers
    // are loaded; write directly only as the fallback when they are not.
    if (!(window.gamesHelpers && typeof window.gamesHelpers.setKeymap === 'function')) {
      try {
        localStorage.setItem('games_keymap', keymap);
      } catch (_e) {
        // ignore storage errors
      }
    }
    applyGamesKeymap(keymap);
  });
}

// Games FPS readout (#1036). The readout mounts per game launch, so the
// checkbox only persists the preference; the overlay appears (or disappears)
// the next time a game starts.
function loadGamesFps() {
  try {
    return localStorage.getItem('games_fps_enabled') === 'true';
  } catch (_e) {
    return false;
  }
}
function applyGamesFps(enabledOverride) {
  const enabled = typeof enabledOverride === 'boolean' ? enabledOverride : loadGamesFps();
  const checkbox = document.getElementById('games-fps-setting');
  if (checkbox) checkbox.checked = enabled;
}
const gamesFpsSetting = document.getElementById('games-fps-setting');
if (gamesFpsSetting) {
  applyGamesFps();
  gamesFpsSetting.addEventListener('change', function () {
    const enabled = this.checked;
    try {
      localStorage.setItem('games_fps_enabled', enabled);
    } catch (_e) {
      // ignore storage errors
    }
    applyGamesFps(enabled);
  });
}

// Settings menu logic
const settingsMenu = document.querySelector('.settings-menu');
let settingsMenuItems = [];
const settingsSections = document.querySelectorAll('.settings-section'); // This will include the About section if present in HTML
const settingsContent = document.querySelector('.settings-content');
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
      // Keep every section rendered and crossfade via the `.selected`
      // opacity/visibility styles instead of toggling `display`, which
      // relaid out the whole dialog on each tab click (#875).
      let sectionChanged = false;
      settingsSections.forEach((s) => {
        const show = s.getAttribute('data-section') === section;
        if (show !== s.classList.contains('selected')) sectionChanged = true;
        s.classList.toggle('selected', show);
      });
      // The old display toggle clamped the shared scroller back to the top;
      // with all sections stacked in one grid cell the position would
      // otherwise persist across tabs.
      if (sectionChanged && settingsContent) settingsContent.scrollTop = 0;
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
            if (window.BackgroundRotation && window.BackgroundRotation.renderPicker) {
              window.BackgroundRotation.renderPicker();
            }

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

          <div class="setting-card">
            <svg class="setting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3l1.9 5.8L20 10l-5.2 3.2L12 19l-2.8-5.8L4 10l6.1-1.2L12 3z"></path>
              <path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z"></path>
            </svg>
            <div class="setting-content">
              <label data-i18n="whatsNew">${t('whatsNew')}</label>
              <button id="whats-new-btn" class="setting-btn" style="font-size: 13px; padding: 6px 12px;" data-i18n="whatsNew">
                ${t('whatsNew')}
              </button>
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
        try {
          await updateChecker.manualCheck();
        } catch (err) {
          console.error('Manual update check failed:', err);
        } finally {
          this.disabled = false;
          this.textContent = tBtn('checkNow');
        }
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
          window.Shortcuts?.cancel?.();
          const opener = document.getElementById('settings-app');
          if (opener) opener.focus();
        }
        // Reset and start onboarding tour
        window.onboardingTour.reset();
        window.onboardingTour.start();
      });
    }

    // Re-open the release-notes modal on demand (#1046). release-notes.js
    // loads after settings.js in bootstrap.js, so the module is only
    // guaranteed to exist at click time. Manual re-opens show the modal
    // without touching lastSeenVersion so the once-per-upgrade logic in
    // detectAndShow() stays unchanged.
    const whatsNewButton = document.getElementById('whats-new-btn');
    if (whatsNewButton) {
      whatsNewButton.addEventListener('click', function() {
        if (
          window.CURRENT_VERSION &&
          window.releaseNotes &&
          typeof window.releaseNotes.showReleaseNotesModal === 'function'
        ) {
          window.releaseNotes.showReleaseNotesModal(window.CURRENT_VERSION);
        }
      });
    }

    // The innerHTML rebuild above wipes any inline manual-check result; ask the
    // checker to re-append it while its auto-hide window is still valid
    if (window.updateChecker && typeof window.updateChecker.renderManualCheckResult === 'function') {
      window.updateChecker.renderManualCheckResult();
    }
  }
}

// Re-render About section and language options when language changes
window.addEventListener('languageChanged', function() {
  initAboutSection();
  renderLanguageOptions();
  if (typeof window.renderTimezoneCurrentList === 'function') {
    window.renderTimezoneCurrentList();
  }
});

// update-checker.js loads after this module, so its first render of the About
// section runs before window.updateChecker exists. Expose the re-render hook so
// update-checker.js can refresh the section once it has registered itself.
window.initAboutSection = initAboutSection;

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
    if (wasReducedPaused && loadVideoAutoplay() && !document.hidden && videoEl.readyState >= 3) {
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
  applyTodoStatsEnabled();
  applyPomodoroStatsEnabled();
  applyEyeCareReminderSettings();
  applyNotesEnabled();
  applyGamesEnabled();
  applyGamesKeymap();
  applyGamesFps();
  applyLanguageSetting();
  applyVideoPlaybackSettings();
  applyBgOverlaySettings();
  initBgOverlaySettings();
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
  if (window.__unsubscribeVideoMotion) {
    window.__unsubscribeVideoMotion();
    window.__unsubscribeVideoMotion = null;
  }
  if (window.onReducedMotionChange) {
    window.__unsubscribeVideoMotion = window.onReducedMotionChange(syncVideoToMotionPreference);
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
window.loadBgOverlaySettings = loadBgOverlaySettings;
window.applyBgOverlaySettings = applyBgOverlaySettings;
window.initBgOverlaySettings = initBgOverlaySettings;
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
window.resolveTheme = resolveTheme;
window.applyTheme = applyTheme;
window.loadLanguageSetting = loadLanguageSetting;
window.renderLanguageOptions = renderLanguageOptions;
window.loadTodoEnabled = loadTodoEnabled;
window.applyTodoEnabled = applyTodoEnabled;
window.loadTodoStatsEnabled = loadTodoStatsEnabled;
window.applyTodoStatsEnabled = applyTodoStatsEnabled;
window.loadPomodoroStatsEnabled = loadPomodoroStatsEnabled;
window.applyPomodoroStatsEnabled = applyPomodoroStatsEnabled;
window.loadEyeCareReminderState = loadEyeCareReminderState;
window.saveEyeCareReminderState = saveEyeCareReminderState;
window.applyEyeCareReminderSettings = applyEyeCareReminderSettings;
window.applyNotesEnabled = applyNotesEnabled;
window.applyGamesEnabled = applyGamesEnabled;
window.loadGamesEnabled = loadGamesEnabled;
window.applyGamesKeymap = applyGamesKeymap;
window.loadGamesKeymap = loadGamesKeymap;
window.applyGamesFps = applyGamesFps;
window.loadGamesFps = loadGamesFps;
window.initSettings = initSettings;
window.resolveFontAlias = resolveFontAlias;

})();




