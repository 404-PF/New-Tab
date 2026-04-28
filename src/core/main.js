// main.js - Main initialization, time, date, motto

function updateTime() {
  const now = new Date();
  const timeElement = document.getElementById("clock-time") || document.getElementById("clock");
  const dateElement = document.getElementById("date");

  // Update time
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  timeElement.textContent = `${hours}:${minutes}`;

  // Update date - use current language for locale
  const currentLang = window.i18n ? window.i18n.currentLanguage() : 'en';
  const locale = currentLang === 'zh' ? 'zh-CN' : 'en-US';
  
  // For Chinese locale, manually format to add space between weekday and date
  if (currentLang === 'zh') {
    const weekday = now.toLocaleDateString('zh-CN', { weekday: "long" });
    const month = now.toLocaleDateString('zh-CN', { month: "long" });
    const day = now.toLocaleDateString('zh-CN', { day: "numeric" });
    dateElement.textContent = `${month}${day} ${weekday}`;
  } else {
    const options = { weekday: "long", month: "long", day: "numeric" };
    dateElement.textContent = now.toLocaleDateString(locale, options);
  }
}

// Update time immediately and then every minute using visibility-aware interval
updateTime();
let clockInterval = null;

function initClock() {
  // Use VisibilityInterval if available, fallback to regular setInterval
  if (window.VisibilityInterval) {
    clockInterval = new VisibilityInterval(updateTime, 1000);
  } else {
    clockInterval = setInterval(updateTime, 1000);
  }
}

// Initialize clock when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initClock);
} else {
  initClock();
}

// Listen for language changes to update time and date display
window.addEventListener('languageChanged', updateTime);

// Display a motto that stays the same for each day
function displayDailyMotto() {
  try {
    const now = new Date();
    // Use year, month, and day to get a unique number for the day
    const daySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    // Get current language
    const currentLang = window.i18n ? window.i18n.currentLanguage() : 'en';
    // Get mottos for current language, fallback to English
    const currentMottos = mottos[currentLang] || mottos.en;
    // Deterministically pick a motto for the day
    const index = daySeed % currentMottos.length;
    const mottoText = document.getElementById("motto-text");
    if (mottoText) {
      mottoText.textContent = currentMottos[index];
      // Add fade-in effect
      mottoText.style.opacity = "0";
      setTimeout(() => {
        mottoText.style.transition = "opacity 0.5s";
        mottoText.style.opacity = "1";
      }, 50);
    }
  } catch (e) {
    console.error("Error displaying motto:", e);
  }
}

// Handle refresh motto functionality
function setupRefreshMotto() {
  const refreshBtn = document.getElementById("refresh-motto-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      const mottoText = document.getElementById("motto-text");
      if (mottoText) {
        // Get current language
        const currentLang = window.i18n ? window.i18n.currentLanguage() : 'en';
        // Get mottos for current language, fallback to English
        const currentMottos = mottos[currentLang] || mottos.en;
        // Pick a random motto
        const randomIndex = Math.floor(Math.random() * currentMottos.length);
        mottoText.textContent = currentMottos[randomIndex];
        // Add refresh animation
        mottoText.style.opacity = "0";
        setTimeout(() => {
          mottoText.style.transition = "opacity 0.3s ease";
          mottoText.style.opacity = "1";
          checkFooterOverlap();
        }, 50);
      }
    });
  }
}

// Handle copy motto functionality
function setupCopyMotto() {
  const copyBtn = document.getElementById("copy-motto-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const mottoText = document.getElementById("motto-text");
      if (mottoText && mottoText.textContent) {
        // Show copy notification
        let notification = document.querySelector('.copy-notification');
        if (!notification) {
          notification = document.createElement('div');
          notification.className = 'copy-notification';
          notification.textContent = 'Copied';
          document.body.appendChild(notification);
        }

        notification.classList.add('show');
        setTimeout(() => {
          notification.classList.remove('show');
        }, 3000);

        try {
          await navigator.clipboard.writeText(mottoText.textContent);
        } catch (err) {
          console.error("Failed to copy motto:", err);
          // Fallback for older browsers
          const textArea = document.createElement("textarea");
          textArea.value = mottoText.textContent;
          document.body.appendChild(textArea);
          textArea.select();
          try {
            document.execCommand('copy');
          } catch (fallbackErr) {
            console.error("Fallback copy failed:", fallbackErr);
          }
          document.body.removeChild(textArea);
        }
      }
    });
  }
}

// Listen for language changes to update daily motto
window.addEventListener('languageChanged', displayDailyMotto);

// Hide footer-left / footer-right when they overlap with the motto container
function checkFooterOverlap() {
  const motto = document.getElementById("motto-container");
  const footerLeft = document.querySelector(".footer-left");
  const footerRight = document.querySelector(".footer-right");

  if (!motto || (!footerLeft && !footerRight)) return;

  const mottoRect = motto.getBoundingClientRect();

  if (footerLeft) {
    const leftRect = footerLeft.getBoundingClientRect();
    // Check if the right edge of footer-left is past the left edge of motto (with 5px buffer)
    const overlaps = leftRect.right + 5 >= mottoRect.left;
    footerLeft.style.opacity = overlaps ? "0" : "";
  }

  if (footerRight) {
    const rightRect = footerRight.getBoundingClientRect();
    // Check if the left edge of footer-right is before the right edge of motto (with 5px buffer)
    const overlaps = rightRect.left - 5 <= mottoRect.right;
    footerRight.style.opacity = overlaps ? "0" : "";
  }
}

// Make checkFooterOverlap globally accessible
window.checkFooterOverlap = checkFooterOverlap;

// Set the motto and button functionality after the page has finished loading
document.addEventListener("DOMContentLoaded", () => {
  displayDailyMotto();
  setupRefreshMotto();
  setupCopyMotto();
  checkFooterOverlap();
  window.addEventListener("resize", checkFooterOverlap);
});
