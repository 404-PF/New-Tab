// src/features/onboarding.js - Interactive onboarding tour for new users

class OnboardingTour {
  constructor() {
    this.currentStep = 0;
    this.steps = this.defineSteps();
    this.overlay = null;
    this.tooltip = null;
    this.isActive = false;
    this.completed = this.isCompleted();
  }

  // Check if an element is visible (not hidden by CSS)
  isElementVisible(element) {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }

  // Check if onboarding has been completed
  isCompleted() {
    return localStorage.getItem('onboardingCompleted') === 'true';
  }

  // Mark onboarding as completed
  markCompleted() {
    localStorage.setItem('onboardingCompleted', 'true');
    this.completed = true;
  }

  // Reset onboarding (for settings restart)
  reset() {
    localStorage.removeItem('onboardingCompleted');
    localStorage.removeItem('onboardingStep');
    this.completed = false;
    this.currentStep = 0;
  }

  // Define all onboarding steps
  defineSteps() {
    return [
      {
        id: 'language',
        title: window.i18n ? window.i18n.t('onboardingLanguageTitle') : 'Choose Your Language 🌐',
        content: window.i18n ? window.i18n.t('onboardingLanguageContent') : 'Select your preferred language for the interface. You can change this later in Settings.',
        target: null,
        position: 'center',
        action: 'select-language',
        waitForAction: true
      },
      {
        id: 'theme',
        title: window.i18n ? window.i18n.t('onboardingThemeTitle') : 'Choose Your Theme 🌙',
        content: window.i18n ? window.i18n.t('onboardingThemeContent') : 'Select your preferred interface theme. You can switch between dark and light modes anytime in Settings.',
        target: null,
        position: 'center',
        action: 'select-theme',
        waitForAction: true
      },
      {
        id: 'welcome',
        title: window.i18n ? window.i18n.t('onboardingWelcomeTitle') : 'Welcome to New-Tab! 🎉',
        content: window.i18n ? window.i18n.t('onboardingWelcomeContent') : 'Let\'s take a quick tour of the features to help you get started with personalizing your new tab page.',
        target: null,
        position: 'center',
        action: null,
        waitForAction: false
      },
      {
        id: 'clock',
        title: window.i18n ? window.i18n.t('onboardingClockTitle') : 'Clock & Date Display',
        content: window.i18n ? window.i18n.t('onboardingClockContent') : 'Your current time and date are displayed here. You can customize the appearance in Settings.',
        target: '#clock',
        position: 'bottom',
        action: null,
        waitForAction: false
      },
      {
        id: 'search',
        title: window.i18n ? window.i18n.t('onboardingSearchTitle') : 'Smart Search',
        content: window.i18n ? window.i18n.t('onboardingSearchContent') : "Search the web directly from your new tab. Results use your browser's default search provider.",
        target: '.search-bar',
        position: 'bottom',
        action: null,
        waitForAction: false
      },
      {
        id: 'apps',
        title: window.i18n ? window.i18n.t('onboardingAppsTitle') : 'App Shortcuts',
        content: window.i18n ? window.i18n.t('onboardingAppsContent') : 'Add your favorite websites as quick-launch icons. Drag and drop to reorder them.',
        target: '#app-grid',
        position: 'top',
        action: 'add-app',
        waitForAction: false
      },
      {
        id: 'background',
        title: window.i18n ? window.i18n.t('onboardingBackgroundTitle') : 'Beautiful Backgrounds',
        content: window.i18n ? window.i18n.t('onboardingBackgroundContent') : 'Choose from stunning built-in backgrounds or upload your own. Access this in Settings > Background.',
        target: 'body',
        position: 'center',
        action: null,
        waitForAction: false
      },
      {
        id: 'motto',
        title: window.i18n ? window.i18n.t('onboardingMottoTitle') : 'Daily Inspiration',
        content: window.i18n ? window.i18n.t('onboardingMottoContent') : 'Enjoy a new motivational quote each day. Click the refresh button to get a random quote or the copy button to copy it.',
        target: '#motto-container',
        position: 'top',
        action: null,
        waitForAction: false
      },
      {
        id: 'settings',
        title: window.i18n ? window.i18n.t('onboardingSettingsTitle') : 'Customization Center',
        content: window.i18n ? window.i18n.t('onboardingSettingsContent') : 'Click the gear icon to access extensive customization options for themes, styling, and more.',
        target: '#settings-modal',
        position: 'left',
        action: 'open-settings',
        waitForAction: false
      },
      {
        id: 'complete',
        title: window.i18n ? window.i18n.t('onboardingCompleteTitle') : 'You\'re All Set! ✨',
        content: window.i18n ? window.i18n.t('onboardingCompleteContent') : 'You now know the basics of New-Tab. Explore the settings to make it truly yours. You can always restart this tour from Settings > About.',
        target: null,
        position: 'center',
        action: null,
        waitForAction: false
      }
    ];
  }

  // Initialize and start the tour
  async start() {
    if (this.isActive || this.completed) {
      console.log('⚠️ Onboarding tour already active or completed');
      return;
    }

    console.log('🚀 Starting onboarding tour...');
    this.isActive = true;
    this.currentStep = 0;
    this.createOverlay();
    this.showStep();
  }

  // Create overlay elements
  createOverlay() {
    console.log('🎯 Creating onboarding overlay...');

    // Main overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'onboarding-overlay';
    this.overlay.innerHTML = `
      <div class="onboarding-background"></div>
      <div class="onboarding-spotlight"></div>
      <div class="onboarding-tooltip">
        <div class="onboarding-tooltip-header">
          <div class="onboarding-step-counter">
            <span class="current-step">1</span>
            <span class="total-steps">/ ${this.steps.length}</span>
          </div>
          <button class="onboarding-close-btn" title="Skip tour">×</button>
        </div>
        <div class="onboarding-tooltip-content">
          <h3 class="onboarding-tooltip-title"></h3>
          <p class="onboarding-tooltip-text"></p>
        </div>
        <div class="onboarding-tooltip-actions">
          <button class="onboarding-btn onboarding-btn-secondary" id="onboarding-prev">Previous</button>
          <div class="onboarding-progress">
            ${this.steps.map((_, i) => `<div class="progress-dot ${i === 0 ? 'active' : ''}" data-step="${i}"></div>`).join('')}
          </div>
          <button class="onboarding-btn onboarding-btn-primary" id="onboarding-next">Next</button>
        </div>
      </div>
    `;

    // Force overlay to be visible
    this.overlay.style.display = 'flex';
    this.overlay.style.opacity = '1';

    document.body.appendChild(this.overlay);
    console.log('✅ Overlay created and appended to body');

    // Add event listeners
    this.overlay.querySelector('.onboarding-close-btn').addEventListener('click', () => this.end());
    this.overlay.querySelector('#onboarding-next').addEventListener('click', () => this.nextStep());
    this.overlay.querySelector('#onboarding-prev').addEventListener('click', () => this.prevStep());

    // Progress dots
    this.overlay.querySelectorAll('.progress-dot').forEach((dot, index) => {
      dot.addEventListener('click', () => this.goToStep(index));
    });

    // Click outside to advance (for non-action steps)
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay && !this.steps[this.currentStep].waitForAction) {
        this.nextStep();
      }
    });
  }

  // Show current step
  showStep() {
    console.log('🎯 Showing onboarding step:', this.currentStep + 1, 'of', this.steps.length);

    const step = this.steps[this.currentStep];
    const tooltip = this.overlay.querySelector('.onboarding-tooltip');
    const spotlight = this.overlay.querySelector('.onboarding-spotlight');
    const title = this.overlay.querySelector('.onboarding-tooltip-title');
    const text = this.overlay.querySelector('.onboarding-tooltip-text');
    const stepCounter = this.overlay.querySelector('.current-step');
    const prevBtn = this.overlay.querySelector('#onboarding-prev');
    const nextBtn = this.overlay.querySelector('#onboarding-next');

    // Update content
    let translatedTitle = step.title;
    let translatedContent = step.content;
    
    // Use translations if available
    if (window.i18n) {
      switch (step.id) {
        case 'language':
          translatedTitle = window.i18n.t('onboardingLanguageTitle');
          translatedContent = window.i18n.t('onboardingLanguageContent');
          break;
        case 'theme':
          translatedTitle = window.i18n.t('onboardingThemeTitle');
          translatedContent = window.i18n.t('onboardingThemeContent');
          break;
        case 'welcome':
          translatedTitle = window.i18n.t('onboardingWelcomeTitle');
          translatedContent = window.i18n.t('onboardingWelcomeContent');
          break;
        case 'clock':
          translatedTitle = window.i18n.t('onboardingClockTitle');
          translatedContent = window.i18n.t('onboardingClockContent');
          break;
        case 'search':
          translatedTitle = window.i18n.t('onboardingSearchTitle');
          translatedContent = window.i18n.t('onboardingSearchContent');
          break;
        case 'apps':
          translatedTitle = window.i18n.t('onboardingAppsTitle');
          translatedContent = window.i18n.t('onboardingAppsContent');
          break;
        case 'background':
          translatedTitle = window.i18n.t('onboardingBackgroundTitle');
          translatedContent = window.i18n.t('onboardingBackgroundContent');
          break;
        case 'motto':
          translatedTitle = window.i18n.t('onboardingMottoTitle');
          translatedContent = window.i18n.t('onboardingMottoContent');
          break;
        case 'settings':
          translatedTitle = window.i18n.t('onboardingSettingsTitle');
          translatedContent = window.i18n.t('onboardingSettingsContent');
          break;
        case 'complete':
          translatedTitle = window.i18n.t('onboardingCompleteTitle');
          translatedContent = window.i18n.t('onboardingCompleteContent');
          break;
      }
    }
    
    title.textContent = translatedTitle;
    
    if (step.id === 'language') {
      text.innerHTML = `
        <p>${translatedContent}</p>
        <div class="language-options">
          <label class="language-option modern">
            <div class="language-preview">
              <span class="language-flag">🇺🇸</span>
              <span class="language-code">EN</span>
            </div>
            <input type="radio" name="onboarding-language" value="en" ${localStorage.getItem('language') === 'en' || !localStorage.getItem('language') ? 'checked' : ''} />
          </label>
          <label class="language-option modern">
            <div class="language-preview">
              <span class="language-flag">🇨🇳</span>
              <span class="language-code">中文</span>
            </div>
            <input type="radio" name="onboarding-language" value="zh" ${localStorage.getItem('language') === 'zh' ? 'checked' : ''} />
          </label>
        </div>
      `;
    } else if (step.id === 'theme') {
      text.innerHTML = `
        <p>${translatedContent}</p>
        <div class="theme-options">
          <label class="theme-option modern">
            <div class="preview-icon dark"></div>
            <input type="radio" name="onboarding-theme" value="dark" ${localStorage.getItem('theme') === 'dark' || !localStorage.getItem('theme') ? 'checked' : ''} />
            <span class="label">${window.i18n ? window.i18n.t('dark') : 'Dark'}</span>
          </label>
          <label class="theme-option modern">
            <div class="preview-icon light"></div>
            <input type="radio" name="onboarding-theme" value="light" ${localStorage.getItem('theme') === 'light' ? 'checked' : ''} />
            <span class="label">${window.i18n ? window.i18n.t('light') : 'Light'}</span>
          </label>
        </div>
      `;
    } else {
      text.textContent = translatedContent;
    }
    stepCounter.textContent = this.currentStep + 1;

    // Update progress dots
    this.overlay.querySelectorAll('.progress-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === this.currentStep);
    });

    // Handle special actions BEFORE positioning
    if (step.action) {
      this.handleAction(step.action, step);
    }

    // Handle positioning
    if (step.target && step.target !== 'body') {
      const targetElement = document.querySelector(step.target);
      if (targetElement) {
        console.log('🎯 Positioning tooltip for target:', step.target);
        
        // Check if target element is visible before positioning
        const isVisible = this.isElementVisible(targetElement);
        
        if (isVisible) {
          this.positionTooltip(tooltip, targetElement, step.position);
          this.createSpotlight(spotlight, targetElement);
          tooltip.style.opacity = '1';
          spotlight.style.opacity = '1';
        } else {
          console.log('⚠️ Target element not visible, using center positioning');
          // Fallback to center positioning when target is not visible
          tooltip.style.position = 'fixed';
          tooltip.style.top = '50%';
          tooltip.style.left = '50%';
          tooltip.style.transform = 'translate(-50%, -50%)';
          spotlight.style.opacity = '0';
        }
      } else {
        console.warn('⚠️ Target element not found:', step.target);
      }
    } else {
      // Center positioned tooltips (including body targets)
      console.log('🎯 Centering tooltip (no target or body target)');
      tooltip.style.position = 'fixed';
      tooltip.style.top = '50%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translate(-50%, -50%)';
      spotlight.style.opacity = '0';
    }

    // Force tooltip to be visible
    tooltip.style.display = 'block';
    tooltip.style.visibility = 'visible';
    tooltip.style.opacity = '1';

    // Handle navigation buttons
    prevBtn.style.display = this.currentStep === 0 ? 'none' : 'block';
    
    // Update button labels with translated text
    const prevText = window.i18n ? window.i18n.t('previous') : 'Previous';
    const nextText = window.i18n ? window.i18n.t('next') : 'Next';
    const finishText = window.i18n ? window.i18n.t('finish') : 'Finish';
    nextBtn.textContent = this.currentStep === this.steps.length - 1 ? finishText : nextText;
    prevBtn.textContent = prevText;

    console.log('✅ Step display completed');
  }

  // Position tooltip relative to target element
  positionTooltip(tooltip, target, position) {
    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    tooltip.style.position = 'fixed';

    switch (position) {
      case 'top':
        tooltip.style.top = `${rect.top - tooltipRect.height - 10}px`;
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.transform = 'translateX(-50%)';
        break;
      case 'bottom':
        tooltip.style.top = `${rect.bottom + 10}px`;
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.transform = 'translateX(-50%)';
        break;
      case 'left':
        tooltip.style.top = `${rect.top + rect.height / 2}px`;
        tooltip.style.left = `${rect.left - tooltipRect.width - 10}px`;
        tooltip.style.transform = 'translateY(-50%)';
        break;
      case 'right':
        tooltip.style.top = `${rect.top + rect.height / 2}px`;
        tooltip.style.left = `${rect.right + 10}px`;
        tooltip.style.transform = 'translateY(-50%)';
        break;
      default:
        tooltip.style.top = `${rect.top + rect.height / 2}px`;
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.transform = 'translate(-50%, -50%)';
    }

    // Ensure tooltip stays within viewport
    this.adjustTooltipPosition(tooltip);
  }

  // Adjust tooltip position to stay within viewport
  adjustTooltipPosition(tooltip) {
    const rect = tooltip.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    if (rect.right > viewport.width) {
      tooltip.style.left = `${viewport.width - rect.width - 10}px`;
    }
    if (rect.left < 0) {
      tooltip.style.left = '10px';
    }
    if (rect.bottom > viewport.height) {
      tooltip.style.top = `${viewport.height - rect.height - 10}px`;
    }
    if (rect.top < 0) {
      tooltip.style.top = '10px';
    }
  }

  // Create spotlight effect around target element
  createSpotlight(spotlight, target) {
    const rect = target.getBoundingClientRect();

    spotlight.style.position = 'fixed';
    spotlight.style.top = `${rect.top - 5}px`;
    spotlight.style.left = `${rect.left - 5}px`;
    spotlight.style.width = `${rect.width + 10}px`;
    spotlight.style.height = `${rect.height + 10}px`;
    spotlight.style.borderRadius = `${parseFloat(getComputedStyle(target).borderRadius) + 5}px`;
  }

  // Handle special actions for certain steps
  handleAction(action, step) {
    switch (action) {
      case 'open-settings':
        // Ensure settings modal is visible before positioning
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) {
          settingsModal.style.display = 'flex';
          
          // Wait for next animation frame to ensure the modal is rendered
          requestAnimationFrame(() => {
            // Check if element is now visible and re-render if needed
            const tooltip = this.overlay.querySelector('.onboarding-tooltip');
            const spotlight = this.overlay.querySelector('.onboarding-spotlight');
            const targetElement = document.querySelector(step.target);
            
            if (targetElement && this.isElementVisible(targetElement)) {
              // Re-position the tooltip now that modal is visible
              this.positionTooltip(tooltip, targetElement, step.position);
              this.createSpotlight(spotlight, targetElement);
              tooltip.style.opacity = '1';
              spotlight.style.opacity = '1';
            }
          });
        }
        break;
      case 'add-app':
        // This step doesn't require specific action
        break;
      case 'select-language':
        // Add event listeners to language radio buttons
        const languageRadios = this.overlay.querySelectorAll('input[name="onboarding-language"]');
        languageRadios.forEach(radio => {
          radio.addEventListener('change', (e) => {
            const selectedLanguage = e.target.value;
            localStorage.setItem('language', selectedLanguage);
            if (window.i18n && window.i18n.applyLanguage) {
              window.i18n.applyLanguage(selectedLanguage);
            }
            // Proceed to next step after a short delay
            setTimeout(() => this.nextStep(), 500);
          });
        });
        break;
      case 'select-theme':
        // Add event listeners to theme radio buttons
        const themeRadios = this.overlay.querySelectorAll('input[name="onboarding-theme"]');
        themeRadios.forEach(radio => {
          radio.addEventListener('change', (e) => {
            const selectedTheme = e.target.value;
            localStorage.setItem('theme', selectedTheme);
            // Apply theme immediately
            if (window.applyTheme) {
              window.applyTheme();
            } else {
              // Fallback: directly apply theme
              document.body.classList.toggle('light-theme', selectedTheme === 'light');
            }
            // Proceed to next step after a short delay
            setTimeout(() => this.nextStep(), 500);
          });
        });
        break;
    }
  }

  // Navigate to next step
  nextStep() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.showStep();
    } else {
      this.end();
    }
  }

  // Navigate to previous step
  prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.showStep();
    }
  }

  // Go to specific step
  goToStep(stepIndex) {
    if (stepIndex >= 0 && stepIndex < this.steps.length) {
      this.currentStep = stepIndex;
      this.showStep();
    }
  }

  // End the tour
  end() {
    // Always mark as completed once the user has seen the tour (even partially)
    this.markCompleted();

    this.isActive = false;

    if (this.overlay) {
      this.overlay.style.opacity = '0';
      setTimeout(() => {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
      }, 300);
    }
  }
}

// Global instance
const onboardingTour = new OnboardingTour();

// Check if all required elements exist
function checkRequiredElements() {
  const requiredElements = [
    '#clock',
    '#date',
    '.search-bar',
    '#app-grid',
    '#motto-container'
  ];

  return requiredElements.every(selector => {
    const element = document.querySelector(selector);
    return element && element.offsetWidth > 0 && element.offsetHeight > 0;
  });
}

// Auto-start for new users
document.addEventListener('DOMContentLoaded', () => {
  // Wait for all elements to be ready
  let attempts = 0;
  const maxAttempts = 50; // 5 seconds max wait
  let checkTimeout = null;

  const checkAndStart = () => {
    // Skip if tab is not visible
    if (window.visibilityManager && !window.visibilityManager.isVisible) {
      // Wait for visibility to resume checking
      const unsubscribe = window.visibilityManager.onChange((visible) => {
        if (visible) {
          unsubscribe();
          checkAndStart();
        }
      });
      return;
    }

    attempts++;

    if (!onboardingTour.isCompleted() && checkRequiredElements()) {
      console.log('🎯 Starting New-Tab onboarding tour...');
      onboardingTour.start();
    } else if (attempts < maxAttempts) {
      checkTimeout = setTimeout(checkAndStart, 100);
    } else {
      if (onboardingTour.isCompleted()) {
        console.log('ℹ️ Onboarding tour skipped - already completed');
      } else {
        console.log('⚠️ Onboarding tour skipped - required elements not visible after 5 seconds');
      }
    }
  };

  // Clean up timeout on page unload
  window.addEventListener('beforeunload', () => {
    if (checkTimeout) clearTimeout(checkTimeout);
  });

  // Initial delay to let other scripts initialize
  setTimeout(checkAndStart, 500);
});

// Also try on window load as fallback
window.addEventListener('load', () => {
  setTimeout(() => {
    if (!onboardingTour.isCompleted() && !onboardingTour.isActive && checkRequiredElements()) {
      console.log('🎯 Starting New-Tab onboarding tour (fallback)...');
      onboardingTour.start();
    }
  }, 1000);
});

// Expose to window for settings access
window.onboardingTour = onboardingTour;
