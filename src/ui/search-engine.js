// src/ui/search-engine.js - Search engine configuration and handling

const searchEngines = {
  bing: {
    nameKey: "bing",
    fallbackName: "Bing",
    url: "https://www.bing.com/search?q=",
    icon: "https://www.bing.com/favicon.ico",
  },
  google: {
    nameKey: "google",
    fallbackName: "Google",
    url: "https://www.google.com/search?q=",
    icon: "https://www.google.com/favicon.ico",
  },
};

let isSearchHandlerBound = false;
let outsideClickHandler = null;

function getSavedEngine() {
  try {
    const savedEngine = localStorage.getItem("defaultEngine") || "bing";
    return searchEngines[savedEngine] ? savedEngine : "bing";
  } catch (error) {
    console.warn("Failed to read saved search engine:", error);
    return "bing";
  }
}

function saveEngine(engineKey) {
  if (!searchEngines[engineKey]) {
    return;
  }

  try {
    localStorage.setItem("defaultEngine", engineKey);
  } catch (error) {
    console.warn("Failed to save search engine:", error);
  }
}

function getEngineLabel(engineKey) {
  const engine = searchEngines[engineKey];
  if (!engine) {
    return "";
  }

  if (!window.i18n || typeof window.i18n.t !== "function") {
    return engine.fallbackName;
  }

  const translatedName = window.i18n.t(engine.nameKey);
  return translatedName === engine.nameKey ? engine.fallbackName : translatedName;
}

function runSelectedEngineSearch(query) {
  const selectedEngine = searchEngines[getSavedEngine()] || searchEngines.bing;
  window.location.href = `${selectedEngine.url}${encodeURIComponent(query)}`;
}

function renderSearchEngineSelector() {
  const enginesEl = document.querySelector(".search-engines");
  if (!enginesEl) {
    if (outsideClickHandler) {
      document.removeEventListener("click", outsideClickHandler);
      outsideClickHandler = null;
    }
    return;
  }

  const savedEngine = getSavedEngine();
  const savedEngineLabel = getEngineLabel(savedEngine);

  if (outsideClickHandler) {
    document.removeEventListener("click", outsideClickHandler);
    outsideClickHandler = null;
  }

  enginesEl.innerHTML = `
    <div class="selected-engine" role="button" tabindex="0" aria-haspopup="listbox" aria-expanded="false" title="${savedEngineLabel}">
      <img src="${searchEngines[savedEngine].icon}" alt="${savedEngineLabel}" />
      <span class="dropdown-arrow">▼</span>
    </div>
    <div class="engine-dropdown" role="listbox">
      ${Object.keys(searchEngines)
        .map((engineKey) => {
          const engineLabel = getEngineLabel(engineKey);
          return `
        <div class="engine-option${engineKey === savedEngine ? " is-selected" : ""}" data-key="${engineKey}" role="option" aria-selected="${engineKey === savedEngine}">
          <img src="${searchEngines[engineKey].icon}" alt="${engineLabel}" />
          <span>${engineLabel}</span>
        </div>
      `;
        })
        .join("")}
    </div>
  `;

  const selectedEngineEl = enginesEl.querySelector(".selected-engine");
  const dropdownEl = enginesEl.querySelector(".engine-dropdown");
  if (!selectedEngineEl || !dropdownEl) {
    return;
  }

  const toggleDropdown = (event) => {
    event.stopPropagation();
    const isOpen = dropdownEl.classList.toggle("dropdown-open");
    selectedEngineEl.classList.toggle("dropdown-active", isOpen);
    selectedEngineEl.setAttribute("aria-expanded", String(isOpen));
  };

  selectedEngineEl.addEventListener("click", toggleDropdown);
  selectedEngineEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    toggleDropdown(event);
  });

  dropdownEl.querySelectorAll(".engine-option").forEach((option) => {
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      const engineKey = option.getAttribute("data-key");
      if (!engineKey) {
        return;
      }

      saveEngine(engineKey);
      renderSearchEngineSelector();
    });
  });

  outsideClickHandler = (event) => {
    if (!enginesEl.contains(event.target)) {
      dropdownEl.classList.remove("dropdown-open");
      selectedEngineEl.classList.remove("dropdown-active");
      selectedEngineEl.setAttribute("aria-expanded", "false");
    }
  };
  document.addEventListener("click", outsideClickHandler);
}

function runSearch(query) {
  const validation = validateUrl(query);

  if (validation.status === "valid") {
    window.location.href = validation.url.href;
    return;
  }

  if (validation.status === "malformed") {
    showSearchValidationFeedback(validation.message);
  }

  runSelectedEngineSearch(query);
}

// Initialize search handling
function initSearchEngine() {
  renderSearchEngineSelector();

  if (isSearchHandlerBound) {
    return;
  }

  const searchInput = document.querySelector(".search-bar input");
  if (!searchInput) {
    return;
  }

  searchInput.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    const query = this.value.trim();
    if (!query) return;

    runSearch(query);
  });

  searchInput.addEventListener("input", clearSearchValidationFeedback);
  isSearchHandlerBound = true;
}

// Show validation feedback in search bar
function showSearchValidationFeedback(message) {
  let feedbackEl = document.querySelector('.search-validation-feedback');
  if (!feedbackEl) {
    feedbackEl = document.createElement('div');
    feedbackEl.className = 'search-validation-feedback';
    const searchBar = document.querySelector('.search-bar');
    if (searchBar) {
      searchBar.appendChild(feedbackEl);
    }
  }
  feedbackEl.textContent = message;
  feedbackEl.classList.add('show');
}

// Clear validation feedback
function clearSearchValidationFeedback() {
  const feedbackEl = document.querySelector('.search-validation-feedback');
  if (feedbackEl) {
    feedbackEl.classList.remove('show');
  }
}

// Initialize on page load
initSearchEngine();

// Re-initialize selector when language changes
window.addEventListener('languageChanged', initSearchEngine);
