/*
  backgrounds.js
  Exports a `backgrounds` array and an `initBackgrounds()` helper that
  generates thumbnail elements inside #bg-thumbnails and exposes a lookup
  used by the page script to apply backgrounds.
*/
function createInteractiveBackgroundDataUri() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#07111f" />
          <stop offset="54%" stop-color="#102947" />
          <stop offset="100%" stop-color="#08111b" />
        </linearGradient>
        <radialGradient id="glowA" cx="30%" cy="24%" r="55%">
          <stop offset="0%" stop-color="#5fd9ff" stop-opacity="0.55" />
          <stop offset="58%" stop-color="#5fd9ff" stop-opacity="0.1" />
          <stop offset="100%" stop-color="#5fd9ff" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="glowB" cx="76%" cy="72%" r="48%">
          <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.38" />
          <stop offset="58%" stop-color="#a78bfa" stop-opacity="0.08" />
          <stop offset="100%" stop-color="#a78bfa" stop-opacity="0" />
        </radialGradient>
        <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="24" />
        </filter>
      </defs>
      <rect width="1600" height="900" fill="url(#bg)" />
      <circle cx="420" cy="240" r="270" fill="url(#glowA)" filter="url(#blur)" />
      <circle cx="1170" cy="680" r="320" fill="url(#glowB)" filter="url(#blur)" />
      <circle cx="860" cy="200" r="160" fill="#7dd3fc" opacity="0.08" filter="url(#blur)" />
      <g opacity="0.22" fill="#ffffff">
        <circle cx="250" cy="150" r="5" />
        <circle cx="360" cy="245" r="3" />
        <circle cx="530" cy="128" r="4" />
        <circle cx="710" cy="210" r="2.5" />
        <circle cx="980" cy="145" r="4" />
        <circle cx="1210" cy="214" r="3" />
        <circle cx="1360" cy="120" r="5" />
        <circle cx="210" cy="710" r="4" />
        <circle cx="470" cy="760" r="2.5" />
        <circle cx="760" cy="690" r="3.5" />
        <circle cx="1040" cy="760" r="4" />
        <circle cx="1410" cy="640" r="3" />
      </g>
    </svg>
  `;

  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.replace(/\s{2,}/g, ' ').trim());
}

// Convert to object map for faster lookup
const interactiveBackgroundArt = createInteractiveBackgroundDataUri();
const backgroundsMap = {
  'Beach - Australia': {
    title: 'Beach - Australia',
    thumb: 'background/thumbs/Beach_-_Australia.jpeg',
    url: 'background/Beach_-_Australia.jpeg',
  },
  'Canion Mountains on Night Sky': {
    title: 'Canion Mountains on Night Sky',
    thumb: 'background/thumbs/Canion_Mountains_on_Night_Sky.jpeg',
    url: 'background/Canion_Mountains_on_Night_Sky.jpeg',
  },
  'City - Shanghai': {
    title: 'City - Shanghai',
    thumb: 'background/thumbs/City_-_Shanghai.jpeg',
    url: 'background/City_-_Shanghai.jpeg',
  },
  'Close-up Photo of Glowing Blue Butterflies': {
    title: 'Close-up Photo of Glowing Blue Butterflies',
    thumb: 'background/thumbs/Close-up_Photo_of_Glowing_Blue_Butterflies.jpeg',
    url: 'background/Close-up_Photo_of_Glowing_Blue_Butterflies.jpeg',
  },
  'Desert during Nighttime': {
    title: 'Desert during Nighttime',
    thumb: 'background/thumbs/Desert_during_Nighttime.jpeg',
    url: 'background/Desert_during_Nighttime.jpeg',
  },
  'Dubai - United Arab Emirates': {
    title: 'Dubai - United Arab Emirates',
    thumb: 'background/thumbs/Dubai_-_United_Arab_Emirates.jpeg',
    url: 'background/Dubai_-_United_Arab_Emirates.jpeg',
  },
  'Flower Field Under Pink Sky': {
    title: 'Flower Field Under Pink Sky',
    thumb: 'background/thumbs/Flower_Field_Under_Pink_Sky.jpeg',
    url: 'background/Flower_Field_Under_Pink_Sky.jpeg',
  },
  'Full Moon': {
    title: 'Full Moon',
    thumb: 'background/thumbs/Full_Moon.jpeg',
    url: 'background/Full_Moon.jpeg',
  },
  'High-rise Buildings During Nighttime': {
    title: 'High-rise Buildings During Nighttime',
    thumb: 'background/thumbs/High-rise_Buildings_During_Nighttime.jpeg',
    url: 'background/High-rise_Buildings_During_Nighttime.jpeg',
  },
  'Huangshan - Anhui': {
    title: 'Huangshan - Anhui',
    thumb: 'background/thumbs/Huangshan_-_Anhui.jpeg',
    url: 'background/Huangshan_-_Anhui.jpeg',
  },
  'Mountain Covered Snow Under Star': {
    title: 'Mountain Covered Snow Under Star',
    thumb: 'background/thumbs/Mountain_Covered_Snow_Under_Star.jpeg',
    url: 'background/Mountain_Covered_Snow_Under_Star.jpeg',
  },
  'Mountain Covered With Snow during Nighttime': {
    title: 'Mountain Covered With Snow during Nighttime',
    thumb: 'background/thumbs/Mountain_Covered_With_Snow_during_Nighttime.jpeg',
    url: 'background/Mountain_Covered_With_Snow_during_Nighttime.jpeg',
  },
  'Night Sky - Mountain Peak': {
    title: 'Night Sky - Mountain Peak',
    thumb: 'background/thumbs/Night_Sky_-_Mountain_Peak.jpeg',
    url: 'background/Night_Sky_-_Mountain_Peak.jpeg',
  },
  'Night Sky - Tree': {
    title: 'Night Sky - Tree',
    thumb: 'background/thumbs/Night_Sky_-_Tree.jpeg',
    url: 'background/Night_Sky_-_Tree.jpeg',
  },
  'Photo of Starry Night': {
    title: 'Photo of Starry Night',
    thumb: 'background/thumbs/Photo_of_Starry_Night.jpeg',
    url: 'background/Photo_of_Starry_Night.jpeg',
  },
  'Skyline At Night - Hong Kong': {
    title: 'Skyline At Night - Hong Kong',
    thumb: 'background/thumbs/Skyline_At_Night_-_Hong_Kong.jpeg',
    url: 'background/Skyline_At_Night_-_Hong_Kong.jpeg',
  },
  'Slovenia': {
    title: 'Slovenia',
    thumb: 'background/thumbs/Slovenia.jpeg',
    url: 'background/Slovenia.jpeg',
  },
  'Water Beside Forest': {
    title: 'Water Beside Forest',
    thumb: 'background/thumbs/Water_Beside_Forest.jpeg',
    url: 'background/Water_Beside_Forest.jpeg',
  },
  'Interactive Drift': {
    title: 'Interactive Drift',
    thumb: interactiveBackgroundArt,
    url: interactiveBackgroundArt,
    type: 'interactive'
  },
  // Live Video Background
  'Animated Wallpaper - Kitten': {
    title: 'Animated Wallpaper - Kitten',
    thumb: 'background/thumbs/Animated-Wallpaper-Kitten.jpeg',
    url: 'background/live_background/Animated-Wallpaper-Kitten.mp4',
    type: 'video'
  },
  'Anime Cartoon - Cottage': {
    title: 'Anime Cartoon - Cottage',
    thumb: 'background/thumbs/Anime-Cartoon-Cottage.jpeg',
    url: 'background/live_background/Anime-Cartoon-Cottage.mp4',
    type: 'video'
  },
  'Boy Running - Green Hillside': {
    title: 'Boy Running - Green Hillside',
    thumb: 'background/thumbs/Boy-Running-Green-Hillside.jpeg',
    url: 'background/live_background/Boy-Running-Green-Hillside.mp4',
    type: 'video'
  },
  'Tyndall - Morning Light': {
    title: 'Tyndall - Morning Light',
    thumb: 'background/thumbs/Tyndall-Morning_Light.jpeg', // Actual video thumbnail
    url: 'background/live_background/Tyndall-Morning Light.mp4',
    type: 'video'
  },
};

// Convert map to array when needed
const backgrounds = Object.keys(backgroundsMap).map(id => ({ id, ...backgroundsMap[id] }));

// Separate backgrounds by type
const staticBackgrounds = backgrounds.filter(bg => bg.type !== 'video' && bg.type !== 'interactive');
const videoBackgrounds = backgrounds.filter(bg => bg.type === 'video');
const interactiveBackgrounds = backgrounds.filter(bg => bg.type === 'interactive');

// Helper functions
function isVideoBackground(id) {
  const bg = backgroundsMap[id];
  return bg && bg.type === 'video';
}

function getStaticBackgrounds() {
  return staticBackgrounds;
}

function getVideoBackgrounds() {
  return videoBackgrounds;
}

function getInteractiveBackgrounds() {
  return interactiveBackgrounds;
}

function initBackgrounds() {
  const container = document.getElementById('bg-thumbnails');
  if (!container) return;
  container.innerHTML = '';
  backgrounds.forEach((bg) => {
    const img = document.createElement('img');
    img.className = 'bg-thumb' + (bg.type === 'video' ? ' bg-thumb-video' : '');
    img.setAttribute('data-bg', bg.id);
    img.src = bg.thumb;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.title = bg.title;
    img.alt = bg.title;
    container.appendChild(img);
  });
}

// Initialize static backgrounds section
function initStaticBackgrounds() {
  const container = document.getElementById('bg-thumbnails-static');
  if (!container) return;
  // Remove existing thumbnails but preserve upload button
  container.querySelectorAll('.bg-thumb').forEach(el => el.remove());
  staticBackgrounds.forEach((bg) => {
    const img = document.createElement('img');
    img.className = 'bg-thumb';
    img.setAttribute('data-bg', bg.id);
    img.src = bg.thumb;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.title = bg.title;
    img.alt = bg.title;
    // Insert before upload button if it exists
    const uploadBtn = container.querySelector('.upload-bg-btn');
    if (uploadBtn) {
      container.insertBefore(img, uploadBtn);
    } else {
      container.appendChild(img);
    }
  });
}

// Initialize live backgrounds section
function initLiveBackgrounds() {
  const container = document.getElementById('bg-thumbnails-live');
  if (!container) return;
  // Remove existing thumbnails but preserve upload button
  container.querySelectorAll('.bg-thumb').forEach(el => el.remove());
  videoBackgrounds.forEach((bg) => {
    const img = document.createElement('img');
    img.className = 'bg-thumb bg-thumb-video';
    img.setAttribute('data-bg', bg.id);
    img.src = bg.thumb;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.title = bg.title;
    img.alt = bg.title;
    // Insert before upload button if it exists
    const uploadBtn = container.querySelector('.upload-bg-btn');
    if (uploadBtn) {
      container.insertBefore(img, uploadBtn);
    } else {
      container.appendChild(img);
    }
  });
}

function initInteractiveBackgrounds() {
  const container = document.getElementById('bg-thumbnails-interactive');
  if (!container) return;
  container.querySelectorAll('.bg-thumb').forEach(el => el.remove());
  interactiveBackgrounds.forEach((bg) => {
    const img = document.createElement('img');
    img.className = 'bg-thumb bg-thumb-interactive';
    img.setAttribute('data-bg', bg.id);
    img.src = bg.thumb;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.title = bg.title;
    img.alt = bg.title;
    const uploadBtn = container.querySelector('.upload-bg-btn');
    if (uploadBtn) {
      container.insertBefore(img, uploadBtn);
    } else {
      container.appendChild(img);
    }
  });
}

function findBackgroundUrlById(id) {
  return backgroundsMap[id] ? backgroundsMap[id].url : null;
}



// Expose for other scripts (non-module global)
window._backgrounds = backgrounds;
window._initBackgrounds = initBackgrounds;
window._initStaticBackgrounds = initStaticBackgrounds;
window._initLiveBackgrounds = initLiveBackgrounds;
window._initInteractiveBackgrounds = initInteractiveBackgrounds;
window._findBackgroundUrlById = findBackgroundUrlById;
window._isVideoBackground = isVideoBackground;
window._getStaticBackgrounds = getStaticBackgrounds;
window._getVideoBackgrounds = getVideoBackgrounds;
window._getInteractiveBackgrounds = getInteractiveBackgrounds;
