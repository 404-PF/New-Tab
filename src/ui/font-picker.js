// src/ui/font-picker.js - Modern Font Picker Component

class ModernFontPicker {
  constructor(options = {}) {
    // Define available fonts with display names
    this.fonts = [
      { value: '-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif', name: 'System Default', category: 'system' },
      { value: '\'Arial\', sans-serif', name: 'Arial', category: 'sans-serif' },
      { value: '\'Helvetica Neue\', Helvetica, Arial, sans-serif', name: 'Helvetica', category: 'sans-serif' },
      { value: '\'Verdana\', Geneva, sans-serif', name: 'Verdana', category: 'sans-serif' },
      { value: '\'Trebuchet MS\', \'Lucida Grande\', sans-serif', name: 'Trebuchet MS', category: 'sans-serif' },
      { value: '\'Gill Sans\', \'Gill Sans MT\', Calibri, sans-serif', name: 'Gill Sans', category: 'sans-serif' },
      { value: '\'Palatino Linotype\', \'Book Antiqua\', Palatino, serif', name: 'Palatino', category: 'serif' },
      { value: '\'Times New Roman\', Times, serif', name: 'Times New Roman', category: 'serif' },
      { value: 'Georgia, \'Times New Roman\', Times, serif', name: 'Georgia', category: 'serif' },
      { value: '\'Courier New\', Courier, monospace', name: 'Courier New', category: 'monospace' },
      { value: '\'Comic Sans MS\', \'Chalkboard SE\', sans-serif', name: 'Comic Sans', category: 'display' },
      { value: 'Impact, \'Arial Black\', sans-serif', name: 'Impact', category: 'display' },
      { value: '\'Roboto\', sans-serif', name: 'Roboto', category: 'sans-serif' },
      { value: '\'Open Sans\', \'Segoe UI\', sans-serif', name: 'Open Sans', category: 'sans-serif' },
      { value: '\'Lato\', \'Segoe UI\', sans-serif', name: 'Lato', category: 'sans-serif' },
      { value: '\'Montserrat\', \'Segoe UI\', sans-serif', name: 'Montserrat', category: 'sans-serif' },
      { value: '\'Nunito\', \'Segoe UI\', sans-serif', name: 'Nunito', category: 'sans-serif' },
      { value: '\'Poppins\', \'Segoe UI\', sans-serif', name: 'Poppins', category: 'sans-serif' },
      { value: '\'Raleway\', \'Segoe UI\', sans-serif', name: 'Raleway', category: 'sans-serif' },
      { value: '\'Source Sans Pro\', \'Segoe UI\', sans-serif', name: 'Source Sans Pro', category: 'sans-serif' }
    ];

    this.options = {
      element: null,
      defaultFont: '-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif',
      onFontSelect: null,
      previewText: 'Aa Bb Cc 123',
      ...options
    };

    this.isOpen = false;
    this.selectedFont = this.options.defaultFont;
    this.pickerElement = null;

    this.init();
  }

  init() {
    this.createFontSwatch();
    this.createPickerPopup();
    this.bindEvents();
  }

  // Find font object by value
  getFontByValue(value) {
    return this.fonts.find(f => f.value === value) || this.fonts[0];
  }

  createFontSwatch() {
    const { element } = this.options;

    if (!element) return;

    // Get current selected font name
    const currentFont = this.getFontByValue(element.value || this.options.defaultFont);

    // Create the font swatch button
    this.swatch = document.createElement('div');
    this.swatch.className = 'font-swatch';
    this.swatch.innerHTML = `
      <div class="font-swatch-preview" style="font-family: ${currentFont.value}">${currentFont.name}</div>
      <svg class="font-swatch-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6,9 12,15 18,9"></polyline>
      </svg>
      <input type="hidden" value="${currentFont.value}">
    `;

    // Replace the original select with the swatch
    element.parentNode.insertBefore(this.swatch, element);
    element.style.display = 'none';

    // Store reference to original input for compatibility
    this.swatch._originalInput = element;
    this.updateSwatch(this.selectedFont);
  }

  createPickerPopup() {
    // Create popup structure with font preview grid
    this.pickerElement = document.createElement('div');
    this.pickerElement.className = 'font-picker-popup';
    
    // Group fonts by category
    const categories = {};
    this.fonts.forEach(font => {
      if (!categories[font.category]) {
        categories[font.category] = [];
      }
      categories[font.category].push(font);
    });

    // Build popup HTML
    let popupHTML = '<div class="font-picker-header"><span class="font-picker-title">Select Font</span></div>';
    popupHTML += '<div class="font-list">';
    
    this.fonts.forEach(font => {
      const isSelected = font.value === this.selectedFont;
      popupHTML += `
        <button class="font-option ${isSelected ? 'selected' : ''}" data-font="${font.value}" style="font-family: ${font.value}">
          <span class="font-option-name">${font.name}</span>
        </button>
      `;
    });
    
    popupHTML += '</div>';

    this.pickerElement.innerHTML = popupHTML;
    document.body.appendChild(this.pickerElement);

    // Bind popup events
    this.bindPopupEvents();
  }

  bindEvents() {
    // Swatch click event to toggle popup
    this.swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Close picker when clicking outside
    this.handleDocumentClick = (e) => {
      if (this.isOpen && !this.pickerElement.contains(e.target) && !this.swatch.contains(e.target)) {
        this.hide();
      }
    };
    document.addEventListener('click', this.handleDocumentClick);

    // ESC key to close
    this.handleDocumentKeydown = (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.hide();
      }
    };
    document.addEventListener('keydown', this.handleDocumentKeydown);
  }

  bindPopupEvents() {
    const fontOptions = this.pickerElement.querySelectorAll('.font-option');

    // Font option selection - immediately select and close
    fontOptions.forEach(option => {
      option.addEventListener('click', () => {
        const font = option.dataset.font;
        this.selectFont(font);
        this.hide();
      });
    });
  }

  toggle() {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    if (!this.pickerElement) return;

    // Position the popup near the swatch
    const swatchRect = this.swatch.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const popupHeight = 280; // approximate height

    // Calculate position - prefer below the swatch if there's more space
    let top = swatchRect.bottom + 10;
    if (top + popupHeight > viewportHeight - 20 && swatchRect.top > popupHeight) {
      top = swatchRect.top - popupHeight - 10;
    }

    // Ensure it stays within viewport
    top = Math.max(10, Math.min(top, viewportHeight - popupHeight - 20));

    this.pickerElement.style.left = `${Math.max(10, Math.min(swatchRect.left, window.innerWidth - 290))}px`;
    this.pickerElement.style.top = `${top}px`;

    this.pickerElement.classList.add('visible');
    this.isOpen = true;
  }

  hide() {
    this.pickerElement.classList.remove('visible');
    this.isOpen = false;
  }

  selectFont(font) {
    this.selectedFont = font;

    // Update swatch
    this.updateSwatch(font);

    // Update popup
    this.updatePopup(font);

    // Update original input for compatibility
    if (this.swatch._originalInput) {
      this.swatch._originalInput.value = font;
      // Trigger change event
      const event = new Event('change', { bubbles: true });
      this.swatch._originalInput.dispatchEvent(event);
    }

    // Call callback
    if (this.options.onFontSelect) {
      this.options.onFontSelect(font);
    }
  }

  updateSwatch(font) {
    const fontObj = this.getFontByValue(font);
    const preview = this.swatch.querySelector('.font-swatch-preview');
    if (preview) {
      preview.style.fontFamily = fontObj.value;
      preview.textContent = fontObj.name;
    }
  }

  updatePopup(font) {
    // Update selected option
    const options = this.pickerElement.querySelectorAll('.font-option');
    options.forEach(option => {
      if (option.dataset.font === font) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
    });
  }

  setFont(font) {
    this.selectedFont = font;
    this.updateSwatch(font);
    this.updatePopup(font);
  }

  destroy() {
    document.removeEventListener('click', this.handleDocumentClick);
    document.removeEventListener('keydown', this.handleDocumentKeydown);

    if (this.pickerElement && this.pickerElement.parentNode) {
      this.pickerElement.parentNode.removeChild(this.pickerElement);
    }
    if (this.swatch && this.swatch.parentNode) {
      this.swatch.parentNode.removeChild(this.swatch);
      // Restore original input
      if (this.swatch._originalInput) {
        this.swatch._originalInput.style.display = '';
      }
    }
  }
}

// Initialize modern font pickers for all select elements with font-picker id
let fontPickers = [];

function initModernFontPickers() {
  // Remove existing pickers
  fontPickers.forEach(picker => picker.destroy());
  fontPickers = [];

  const fontSelects = document.querySelectorAll('select[id*="font-picker"]');
  
  fontSelects.forEach(select => {
    const picker = new ModernFontPicker({
      element: select,
      defaultFont: select.value || '-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif',
    });
    fontPickers.push(picker);
  });
}

// Export for use in other modules
window.initModernFontPickers = initModernFontPickers;
window.ModernFontPicker = ModernFontPicker;
