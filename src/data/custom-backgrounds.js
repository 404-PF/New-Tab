// src/data/custom-backgrounds.js - Custom background upload and management via IndexedDB

(function () {
  const DB_NAME = 'NewTabCustomBackgrounds';
  const DB_VERSION = 1;
  const STORE_NAME = 'customBackgrounds';

  let db = null;
  let blobUrlCache = {};
  let customBackgroundLoadVersion = 0;
  let customBackgroundTransitionTimeout = null;

  // --- IndexedDB helpers ---

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (db) { resolve(db); return; }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function (e) {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = function (e) {
        db = e.target.result;
        resolve(db);
      };
      request.onerror = function (e) {
        reject(e.target.error);
      };
    });
  }

  function getAllCustomBackgrounds() {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        const tx = database.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function getCustomBackground(id) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        const tx = database.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function saveCustomBackground(bg) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        const tx = database.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(bg);
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function deleteCustomBackground(id) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        const tx = database.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  // --- Thumbnail generation ---

  function generateImageThumbnail(file) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const srcAspect = img.width / img.height;
        let sx, sy, sw, sh;
        if (srcAspect > 1) {
          sh = img.height;
          sw = sh;
          sx = (img.width - sw) / 2;
          sy = 0;
        } else {
          sw = img.width;
          sh = sw;
          sx = 0;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
        URL.revokeObjectURL(img.src);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = function () {
        URL.revokeObjectURL(img.src);
        reject(new Error('Failed to load image for thumbnail'));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  function generateVideoThumbnail(file) {
    return new Promise(function (resolve, reject) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      let resolved = false;

      function captureFrame() {
        if (resolved) return;
        resolved = true;
        try {
          const canvas = document.createElement('canvas');
          const size = 128;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const srcAspect = video.videoWidth / video.videoHeight;
          let sx, sy, sw, sh;
          if (srcAspect > 1) {
            sh = video.videoHeight;
            sw = sh;
            sx = (video.videoWidth - sw) / 2;
            sy = 0;
          } else {
            sw = video.videoWidth;
            sh = sw;
            sx = 0;
            sy = (video.videoHeight - sh) / 2;
          }
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, size, size);
          URL.revokeObjectURL(video.src);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (e) {
          URL.revokeObjectURL(video.src);
          reject(e);
        }
      }

      video.onloadeddata = function () {
        video.currentTime = Math.min(1, video.duration * 0.1);
      };
      video.onseeked = captureFrame;
      video.onerror = function () {
        if (!resolved) {
          resolved = true;
          URL.revokeObjectURL(video.src);
          reject(new Error('Failed to load video for thumbnail'));
        }
      };

      // Fallback: if seeking doesn't fire within 5s, try capturing whatever we have
      setTimeout(function () {
        if (!resolved && video.readyState >= 2) {
          captureFrame();
        }
      }, 5000);

      video.src = URL.createObjectURL(file);
    });
  }

  // --- Blob URL management ---

  function getBlobUrl(id) {
    if (blobUrlCache[id]) return Promise.resolve(blobUrlCache[id]);
    return getCustomBackground(id).then(function (bg) {
      if (!bg) return null;
      const url = URL.createObjectURL(bg.data);
      blobUrlCache[id] = url;
      return url;
    });
  }

  function revokeBlobUrl(id) {
    if (blobUrlCache[id]) {
      URL.revokeObjectURL(blobUrlCache[id]);
      delete blobUrlCache[id];
    }
  }

  function revokeAllBlobUrls() {
    Object.keys(blobUrlCache).forEach(function (id) {
      URL.revokeObjectURL(blobUrlCache[id]);
    });
    blobUrlCache = {};
  }

  function clearCustomBackgroundTransitionTimeout() {
    if (!customBackgroundTransitionTimeout) return;

    clearTimeout(customBackgroundTransitionTimeout);
    customBackgroundTransitionTimeout = null;
  }

  function isActiveCustomBackgroundRequest(id, loadVersion) {
    return loadVersion === customBackgroundLoadVersion && localStorage.getItem('homepageBg') === id;
  }

  function resetCustomBackgroundVideo(videoEl, unloadSource) {
    if (!videoEl) return;

    clearCustomBackgroundTransitionTimeout();

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
    delete videoEl.dataset.simpleModePaused;
    delete videoEl.dataset.crossfadeTriggered;
    delete videoEl.dataset.lastPauseTime;

    videoEl.autoplay = false;
    videoEl.muted = true;

    if (!unloadSource) return;

    const sourceEl = videoEl.querySelector('source');
    if (!sourceEl) return;

    sourceEl.removeAttribute('src');
    sourceEl.type = 'video/mp4';
    videoEl.load();
  }

  // --- Upload handling ---

  function handleUpload(type) {
    return new Promise(function (resolve) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = type === 'video'
        ? 'video/mp4,video/webm,video/ogg'
        : 'image/jpeg,image/png,image/webp,image/gif,image/bmp';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', function () {
        const file = input.files && input.files[0];
        document.body.removeChild(input);
        if (!file) { resolve(null); return; }

        const isVideo = file.type.startsWith('video/');
        const isImage = file.type.startsWith('image/');

        if (type === 'video' && !isVideo) {
          alert('Please select a video file.');
          resolve(null);
          return;
        }
        if (type === 'image' && !isImage) {
          alert('Please select an image file.');
          resolve(null);
          return;
        }

        const id = 'custom_' + type + '_' + Date.now();
        const title = file.name.replace(/\.[^/.]+$/, '');

        const thumbPromise = isVideo ? generateVideoThumbnail(file) : generateImageThumbnail(file);

        thumbPromise.then(function (thumbDataUrl) {
          const bg = {
            id: id,
            title: title,
            type: isVideo ? 'video' : 'image',
            data: file,
            thumb: thumbDataUrl,
            timestamp: Date.now()
          };
          return saveCustomBackground(bg).then(function () {
            resolve(bg);
          });
        }).catch(function (err) {
          console.error('Failed to process uploaded file:', err);
          alert('Failed to process the file. Please try a different file.');
          resolve(null);
        });
      });

      input.click();
    });
  }

  // --- Rendering custom backgrounds in settings ---

  function renderCustomBackgrounds() {
    return getAllCustomBackgrounds().then(function (customBgs) {
      const staticContainer = document.getElementById('bg-thumbnails-static');
      const liveContainer = document.getElementById('bg-thumbnails-live');

      if (!staticContainer || !liveContainer) return;

      // Remove existing custom thumbnails
      staticContainer.querySelectorAll('.custom-bg-thumb-wrapper').forEach(function (el) { el.remove(); });
      liveContainer.querySelectorAll('.custom-bg-thumb-wrapper').forEach(function (el) { el.remove(); });

      const staticBgs = customBgs.filter(function (bg) { return bg.type !== 'video'; });
      const liveBgs = customBgs.filter(function (bg) { return bg.type === 'video'; });

      // Insert custom static backgrounds before the upload button
      const staticUploadBtn = staticContainer.querySelector('.upload-bg-btn');
      staticBgs.forEach(function (bg) {
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-bg-thumb-wrapper';

        const img = document.createElement('img');
        img.className = 'bg-thumb';
        img.setAttribute('data-bg', bg.id);
        img.setAttribute('data-custom', 'true');
        img.src = bg.thumb;
        img.title = bg.title;
        img.alt = bg.title;

        const delBtn = document.createElement('button');
        delBtn.className = 'custom-bg-delete-btn';
        delBtn.setAttribute('data-bg-id', bg.id);
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        delBtn.title = 'Delete';

        wrapper.appendChild(img);
        wrapper.appendChild(delBtn);

        if (staticUploadBtn) {
          staticContainer.insertBefore(wrapper, staticUploadBtn);
        } else {
          staticContainer.appendChild(wrapper);
        }
      });

      // Insert custom live backgrounds before the upload button
      const liveUploadBtn = liveContainer.querySelector('.upload-bg-btn');
      liveBgs.forEach(function (bg) {
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-bg-thumb-wrapper';

        const img = document.createElement('img');
        img.className = 'bg-thumb bg-thumb-video';
        img.setAttribute('data-bg', bg.id);
        img.setAttribute('data-custom', 'true');
        img.src = bg.thumb;
        img.title = bg.title;
        img.alt = bg.title;

        const delBtn = document.createElement('button');
        delBtn.className = 'custom-bg-delete-btn';
        delBtn.setAttribute('data-bg-id', bg.id);
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        delBtn.title = 'Delete';

        wrapper.appendChild(img);
        wrapper.appendChild(delBtn);

        if (liveUploadBtn) {
          liveContainer.insertBefore(wrapper, liveUploadBtn);
        } else {
          liveContainer.appendChild(wrapper);
        }
      });

      // Update selected state
      const currentBg = localStorage.getItem('homepageBg');
      const allThumbs = document.querySelectorAll('.bg-thumb[data-custom]');
      for (let i = 0; i < allThumbs.length; i++) {
        allThumbs[i].classList.toggle('selected', allThumbs[i].getAttribute('data-bg') === currentBg);
      }
    });
  }

  // --- Apply custom background ---

  function applyCustomBackground(id) {
    const loadVersion = ++customBackgroundLoadVersion;

    return getCustomBackground(id).then(function (bg) {
      if (!bg || !isActiveCustomBackgroundRequest(id, loadVersion)) return false;

      const thumbnailEl = document.getElementById('bg-thumbnail');
      const fullEl = document.getElementById('bg-full');
      const videoEl = document.getElementById('bg-video');
      const containerEl = document.getElementById('background-container');

      if (!thumbnailEl || !fullEl) return false;

      clearCustomBackgroundTransitionTimeout();

      // Revoke old blob URLs to free memory
      revokeAllBlobUrls();

      if (!isActiveCustomBackgroundRequest(id, loadVersion)) return false;

      const blobUrl = URL.createObjectURL(bg.data);

      if (!isActiveCustomBackgroundRequest(id, loadVersion)) {
        URL.revokeObjectURL(blobUrl);
        return false;
      }

      blobUrlCache[id] = blobUrl;

      if (bg.type === 'video') {
        // Reset image states
        fullEl.classList.remove('loaded');
        fullEl.src = '';
        thumbnailEl.classList.remove('hidden', 'clearing');
        thumbnailEl.src = bg.thumb;

        if (videoEl) {
          resetCustomBackgroundVideo(videoEl, false);

          videoEl.classList.remove('hidden');
          videoEl.classList.add('loading');
          videoEl.dataset.currentBg = id;

          if (containerEl) {
            containerEl.classList.remove('video-fallback', 'video-error');
          }

          // Apply user playback settings
          videoEl.muted = loadVideoMuted();
          videoEl.autoplay = loadVideoAutoplay();

          const sourceEl = videoEl.querySelector('source');
          if (!sourceEl) {
            URL.revokeObjectURL(blobUrl);
            delete blobUrlCache[id];
            return false;
          }

          sourceEl.src = blobUrl;
          sourceEl.type = bg.data.type || 'video/mp4';
          videoEl.load();

          function triggerCrossfade() {
            if (videoEl.dataset.crossfadeTriggered === 'true' || !isActiveCustomBackgroundRequest(id, loadVersion) || videoEl.dataset.currentBg !== id) {
              return;
            }

            videoEl.dataset.crossfadeTriggered = 'true';
            videoEl.classList.remove('loading');

            // When autoplay is disabled, keep thumbnail visible and video hidden
            if (!loadVideoAutoplay()) return;

            // When simple mode is active, mark paused and keep video hidden
            if (window.loadSimpleMode && window.loadSimpleMode()) {
              videoEl.dataset.simpleModePaused = 'true';
              return;
            }

            videoEl.play().catch(function () {});
            videoEl.classList.add('active', 'ready');
            if (typeof hideBackgroundOverlay === 'function') hideBackgroundOverlay();
            thumbnailEl.classList.add('clearing');

            customBackgroundTransitionTimeout = setTimeout(function () {
              if (!isActiveCustomBackgroundRequest(id, loadVersion) || videoEl.dataset.currentBg !== id) {
                return;
              }

              thumbnailEl.classList.add('hidden');
              thumbnailEl.classList.remove('clearing');
              customBackgroundTransitionTimeout = null;
            }, 3000);
          }

          videoEl.oncanplaythrough = triggerCrossfade;
          videoEl.onloadeddata = function () {
            videoEl.onloadeddata = null;
            if (!videoEl.classList.contains('active')) triggerCrossfade();
          };
          videoEl.onplaying = function () {
            videoEl.onplaying = null;
            if (!videoEl.classList.contains('active')) triggerCrossfade();
          };
          videoEl.onloadedmetadata = function () {
            videoEl.onloadedmetadata = null;

            if (!isActiveCustomBackgroundRequest(id, loadVersion) || videoEl.dataset.currentBg !== id) {
              return;
            }

            videoEl.style.width = '100%';
            videoEl.style.height = '100%';
          };
          videoEl.onerror = function () {
            if (!isActiveCustomBackgroundRequest(id, loadVersion) || videoEl.dataset.currentBg !== id) {
              return;
            }

            containerEl && containerEl.classList.add('video-error');
            resetCustomBackgroundVideo(videoEl, true);
            thumbnailEl.classList.remove('hidden');
            thumbnailEl.classList.remove('clearing');
            fullEl.src = bg.thumb;

            requestAnimationFrame(function () {
              if (!isActiveCustomBackgroundRequest(id, loadVersion)) {
                return;
              }

              fullEl.classList.add('loaded');
              if (typeof hideBackgroundOverlay === 'function') hideBackgroundOverlay();
            });
          };
          videoEl.onpause = function () {
            if (!isActiveCustomBackgroundRequest(id, loadVersion) || videoEl.dataset.currentBg !== id) {
              return;
            }

            // Debounce: prevent tight pause/resume loops from buffering or rapid system pauses
            const now = Date.now();
            const lastPause = parseInt(videoEl.dataset.lastPauseTime || '0', 10);
            if (now - lastPause < 2000) return;
            videoEl.dataset.lastPauseTime = now;

            if (!document.hidden && videoEl.classList.contains('active') && loadVideoAutoplay() && videoEl.dataset.simpleModePaused !== 'true' && videoEl.readyState >= 3) {
              videoEl.play().catch(function () {});
            }
          };

        }
      } else {
        // Image background
        resetCustomBackgroundVideo(videoEl, true);
        containerEl && containerEl.classList.remove('video-fallback', 'video-error');

        fullEl.classList.remove('loaded');
        thumbnailEl.classList.remove('hidden', 'clearing');
        thumbnailEl.src = bg.thumb;

        const fullImg = new Image();
        fullImg.onload = function () {
          if (!isActiveCustomBackgroundRequest(id, loadVersion)) {
            return;
          }

          fullEl.src = blobUrl;

          requestAnimationFrame(function () {
            if (!isActiveCustomBackgroundRequest(id, loadVersion)) {
              return;
            }

            fullEl.classList.add('loaded');
            if (typeof hideBackgroundOverlay === 'function') hideBackgroundOverlay();
            thumbnailEl.classList.add('clearing');

            customBackgroundTransitionTimeout = setTimeout(function () {
              if (!isActiveCustomBackgroundRequest(id, loadVersion)) {
                return;
              }

              thumbnailEl.classList.add('hidden');
              thumbnailEl.classList.remove('clearing');
              customBackgroundTransitionTimeout = null;
            }, 2500);
          });
        };
        fullImg.onerror = function () {
          if (!isActiveCustomBackgroundRequest(id, loadVersion)) {
            return;
          }

          if (typeof hideBackgroundOverlay === 'function') hideBackgroundOverlay();
        };
        fullImg.src = blobUrl;
      }

      return true;
    });
  }

  // --- Check if ID is a custom background ---

  function isCustomBackground(id) {
    return id && id.startsWith('custom_');
  }

  // --- Custom confirm dialog ---

  function showConfirmDialog(title, message) {
    return new Promise(function (resolve) {
      const dialog = document.createElement('div');
      dialog.className = 'bg-confirm-dialog screen-overlay';
      dialog.innerHTML =
        '<div class="bg-confirm-overlay"></div>' +
        '<div class="bg-confirm-content">' +
          '<div class="bg-confirm-icon">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
              '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6h12z"></path>' +
              '<line x1="10" y1="11" x2="10" y2="17"></line>' +
              '<line x1="14" y1="11" x2="14" y2="17"></line>' +
            '</svg>' +
          '</div>' +
          '<h3 class="bg-confirm-title">' + title + '</h3>' +
          '<p class="bg-confirm-message">' + message + '</p>' +
          '<div class="bg-confirm-actions">' +
            '<button class="bg-confirm-cancel">Cancel</button>' +
            '<button class="bg-confirm-delete">Delete</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(dialog);
      requestAnimationFrame(function () { dialog.classList.add('bg-confirm-open'); });

      function close(result) {
        dialog.classList.remove('bg-confirm-open');
        setTimeout(function () { dialog.remove(); }, 200);
        resolve(result);
      }

      dialog.querySelector('.bg-confirm-overlay').addEventListener('click', function () { close(false); });
      dialog.querySelector('.bg-confirm-cancel').addEventListener('click', function () { close(false); });
      dialog.querySelector('.bg-confirm-delete').addEventListener('click', function () { close(true); });
    });
  }

  // --- Delete handler ---

  document.addEventListener('click', function (e) {
    const delBtn = e.target.closest && e.target.closest('.custom-bg-delete-btn');
    if (!delBtn) return;

    e.stopPropagation();
    const bgId = delBtn.getAttribute('data-bg-id');
    if (!bgId) return;

    showConfirmDialog('Delete Background', 'This custom background will be permanently removed.').then(function (confirmed) {
      if (!confirmed) return;

      const currentBg = localStorage.getItem('homepageBg');

      deleteCustomBackground(bgId).then(function () {
        revokeBlobUrl(bgId);

        // If the deleted background was active, reset to a random built-in background
        if (currentBg === bgId) {
          const builtInBackgrounds = window._backgrounds || [];
          if (builtInBackgrounds.length > 0) {
            const randomBg = builtInBackgrounds[Math.floor(Math.random() * builtInBackgrounds.length)];
            localStorage.setItem('homepageBg', randomBg.id);
          } else {
            localStorage.setItem('homepageBg', 'Water Beside Forest');
          }
          applyBg();
        }

        renderCustomBackgrounds();
      });
    });
  });

  // --- Upload button handlers ---

  document.addEventListener('click', function (e) {
    const uploadBtn = e.target.closest && e.target.closest('.upload-bg-btn');
    if (!uploadBtn) return;

    const type = uploadBtn.getAttribute('data-upload-type');
    if (!type) return;

    handleUpload(type).then(function (bg) {
      if (bg) {
        renderCustomBackgrounds();
        // Auto-select the newly uploaded background
        localStorage.setItem('homepageBg', bg.id);
        applyBg();
      }
    });
  });

  // --- Public API ---

  window._customBackgrounds = {
    isCustom: isCustomBackground,
    apply: applyCustomBackground,
    getAll: getAllCustomBackgrounds,
    get: getCustomBackground,
    render: renderCustomBackgrounds,
    getBlobUrl: getBlobUrl,
    revokeAll: revokeAllBlobUrls
  };
})();
