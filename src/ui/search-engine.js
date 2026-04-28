// js/search-engine.js - Search engine configuration and handling

const searchEngines = {
  bing: {
    nameKey: "bing",
    fallbackName: "Bing",
    url: "https://www.bing.com/search?q=",
    icon: "https://www.bing.com/favicon.ico",
    isBuiltIn: true,
  },
  google: {
    nameKey: "google",
    fallbackName: "Google",
    url: "https://www.google.com/search?q=",
    icon: "https://www.google.com/favicon.ico",
    isBuiltIn: true,
  },
};

function getAllEngines() {
  const customEngines = getCustomEngines();
  return { ...customEngines, ...searchEngines };
}

function getCustomEngines() {
  try {
    const stored = localStorage.getItem("customSearchEngines");
    if (!stored) return {};
    const engines = JSON.parse(stored);
    if (!Array.isArray(engines)) return {};
    const result = {};
    engines.forEach((engine) => {
      if (engine.id && engine.name && engine.url) {
        result[engine.id] = {
          nameKey: "",
          fallbackName: engine.name,
          url: engine.url,
          icon: engine.icon || "",
          isBuiltIn: false,
          isCustom: true,
          id: engine.id,
        };
      }
    });
    return result;
  } catch (error) {
    console.warn("Failed to load custom search engines:", error);
    return {};
  }
}

function saveCustomEngines(engines) {
  try {
    localStorage.setItem("customSearchEngines", JSON.stringify(engines));
  } catch (error) {
    console.warn("Failed to save custom search engines:", error);
  }
}

function addCustomEngine(name, url, icon) {
  const engines = getCustomEnginesList();
  const id = "custom_" + Date.now();
  engines.push({ id, name, url, icon });
  saveCustomEngines(engines);
  return id;
}

function updateCustomEngine(id, name, url, icon) {
  const engines = getCustomEnginesList();
  const index = engines.findIndex((e) => e.id === id);
  if (index === -1) return false;
  engines[index] = { id, name, url, icon };
  saveCustomEngines(engines);
  return true;
}

function removeCustomEngine(id) {
  const engines = getCustomEnginesList();
  const filtered = engines.filter((e) => e.id !== id);
  saveCustomEngines(filtered);
  if (getSavedEngine() === id) {
    saveEngine("bing");
  }
}

function getCustomEnginesList() {
  try {
    const stored = localStorage.getItem("customSearchEngines");
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    return [];
  }
}

function validateSearchEngineUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const hasQueryPlaceholder = url.includes("{query}");
    const hasQuerySlot = url.endsWith("?") || url.endsWith("&");
    return hasQueryPlaceholder || hasQuerySlot;
  } catch {
    return false;
  }
}

function escapeHtml(str) {
  if (!str || typeof str !== "string") return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

let isSearchHandlerBound = false;
let outsideClickHandler = null;

function getSavedEngine() {
  try {
    const savedEngine = localStorage.getItem("defaultEngine") || "bing";
    const allEngines = getAllEngines();
    return allEngines[savedEngine] ? savedEngine : "bing";
  } catch (error) {
    console.warn("Failed to read saved search engine:", error);
    return "bing";
  }
}

function saveEngine(engineKey) {
  const allEngines = getAllEngines();
  if (!allEngines[engineKey]) {
    return;
  }

  try {
    localStorage.setItem("defaultEngine", engineKey);
  } catch (error) {
    console.warn("Failed to save search engine:", error);
  }
}

function getEngineLabel(engineKey) {
  const allEngines = getAllEngines();
  const engine = allEngines[engineKey];
  if (!engine) {
    return "";
  }

  if (!engine.isCustom && window.i18n && typeof window.i18n.t === "function") {
    const translatedName = window.i18n.t(engine.nameKey);
    return translatedName === engine.nameKey ? engine.fallbackName : translatedName;
  }

  return engine.fallbackName;
}

function runSelectedEngineSearch(query) {
  const selectedEngine = getAllEngines()[getSavedEngine()] || searchEngines.bing;
  const encodedQuery = encodeURIComponent(query);
  let url;
  if (selectedEngine.url.includes('{query}')) {
    url = selectedEngine.url.replace('{query}', encodedQuery);
  } else {
    url = selectedEngine.url + encodedQuery;
  }
  window.location.href = url;
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
  const allEngines = getAllEngines();
  const savedEngineData = allEngines[savedEngine];

  if (outsideClickHandler) {
    document.removeEventListener("click", outsideClickHandler);
    outsideClickHandler = null;
  }

  enginesEl.innerHTML = `
    <div class="selected-engine" role="button" tabindex="0" aria-haspopup="listbox" aria-expanded="false" title="${escapeHtml(savedEngineLabel)}">
      <img src="${escapeHtml(savedEngineData.icon)}" alt="${escapeHtml(savedEngineLabel)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23999%22 stroke-width=%222%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22/><path d=%22M12 8v4m0 4h.01%22/></svg>'" />
      <span class="dropdown-arrow">▼</span>
    </div>
    <div class="engine-dropdown" role="listbox">
      ${Object.keys(allEngines)
        .map((engineKey) => {
          const engineLabel = getEngineLabel(engineKey);
          return `
        <div class="engine-option${engineKey === savedEngine ? " is-selected" : ""}" data-key="${escapeHtml(engineKey)}" role="option" aria-selected="${engineKey === savedEngine}">
          <img src="${escapeHtml(allEngines[engineKey].icon)}" alt="${escapeHtml(engineLabel)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23999%22 stroke-width=%222%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22/><path d=%22M12 8v4m0 4h.01%22/></svg>'" />
          <span>${escapeHtml(engineLabel)}</span>
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

// Expose for global access (used by language switching and settings)
window.initSearchEngine = initSearchEngine;
window.getAllEngines = getAllEngines;
window.getCustomEngines = getCustomEngines;
window.getCustomEnginesList = getCustomEnginesList;
window.addCustomEngine = addCustomEngine;
window.updateCustomEngine = updateCustomEngine;
window.removeCustomEngine = removeCustomEngine;
window.validateSearchEngineUrl = validateSearchEngineUrl;
window.getSavedEngine = getSavedEngine;
window.saveEngine = saveEngine;
window.getEngineLabel = getEngineLabel;
window.renderSearchEngineSelector = renderSearchEngineSelector;
window.escapeHtml = escapeHtml;
