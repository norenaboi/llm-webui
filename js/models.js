/*  ═══════════════════════════════════════════════════════════════════════════
    Model List  (persisted to localStorage)
    ═══════════════════════════════════════════════════════════════════════════ */
const MODELS_KEY = "llm_webui_models";

const DEFAULT_MODELS = [];

function loadModels() {
  try {
    const raw = localStorage.getItem(MODELS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Backward compat: old format stored plain strings
      state.models = parsed.map((m) =>
        typeof m === "string"
          ? { id: m, outputTypes: ["text"], inputTypes: ["text"] }
          : { inputTypes: ["text"], ...m },
      );
    } else {
      state.models = [...DEFAULT_MODELS];
    }
  } catch {
    state.models = [...DEFAULT_MODELS];
  }
}

function saveModels() {
  localStorage.setItem(MODELS_KEY, JSON.stringify(state.models));
}

function addModel(name) {
  name = name.trim();
  if (!name) return false;
  if (state.models.some((m) => m.id === name)) return false;
  state.models.push({ id: name, outputTypes: ["text"], inputTypes: ["text"] });
  saveModels();
  return true;
}

function removeModel(name) {
  state.models = state.models.filter((m) => m.id !== name);
  saveModels();
}

/**
 * Fetch the available models from an OpenAI-compatible /v1/models endpoint.
 */
async function fetchModels(endpoint, apiKey) {
  if (!endpoint) return null;

  // Always fetch from {base}/v1/models.
  // Strip any suffix that was appended by the mode toggle so the models
  // URL is correct regardless of the selected text/image mode.
  let base = endpoint.replace(/\/+$/, "");
  base = base.replace(/\/v1\/chat\/completions$/, "").replace(/\/image$/, "");
  const url = `${base}/v1/models`;

  try {
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) return null;

    const data = await res.json();
    const list = Array.isArray(data?.data)
      ? data.data
          .map((m) => {
            if (!m.id) return null;
            // Detect output modalities from all three known API formats:
            // 1. Pollinations: top-level output_modalities array
            // 2. OpenRouter:   architecture.output_modalities array
            // 3. noreproxy / generic: type field ("chat" → text, "image" → image)
            let outputTypes;
            if (
              Array.isArray(m.output_modalities) &&
              m.output_modalities.length
            ) {
              outputTypes = m.output_modalities;
            } else if (
              Array.isArray(m.architecture?.output_modalities) &&
              m.architecture.output_modalities.length
            ) {
              outputTypes = m.architecture.output_modalities;
            } else if (m.type === "image") {
              outputTypes = ["image"];
            } else {
              outputTypes = ["text"]; // default (covers type:"chat" and unknowns)
            }

            // Detect input modalities (vision / image-input support)
            let inputTypes;
            if (
              Array.isArray(m.input_modalities) &&
              m.input_modalities.length
            ) {
              // Pollinations: top-level input_modalities
              inputTypes = m.input_modalities;
            } else if (
              Array.isArray(m.architecture?.input_modalities) &&
              m.architecture.input_modalities.length
            ) {
              // OpenRouter: architecture.input_modalities
              inputTypes = m.architecture.input_modalities;
            } else if (typeof m.architecture?.modality === "string") {
              // OpenRouter alt: e.g. "text+image->text" — parse left of "->"
              const modalityStr = m.architecture.modality;
              const inputSide = modalityStr.includes("->")
                ? modalityStr.slice(0, modalityStr.indexOf("->"))
                : modalityStr;
              inputTypes = inputSide.includes("image")
                ? ["text", "image"]
                : ["text"];
            } else {
              inputTypes = ["text"];
            }

            return { id: m.id, outputTypes, inputTypes };
          })
          .filter(Boolean)
      : [];

    // Exclude models that only output audio or video — keep text and/or image models.
    const filtered = list.filter((m) =>
      m.outputTypes.some((t) => t === "text" || t === "image"),
    );

    return filtered.length
      ? filtered.sort((a, b) => a.id.localeCompare(b.id))
      : null;
  } catch {
    return null;
  }
}

/**
 * Fetch models for the given endpoint/key and repopulate a <select>.
 */
async function fetchAndPopulateModels(
  endpoint,
  apiKey,
  selectEl,
  currentModel,
  onDone,
) {
  endpoint = (endpoint || "").trim();
  if (!endpoint) return;

  selectEl.innerHTML = "";
  const loading = document.createElement("option");
  loading.textContent = "Loading models…";
  loading.disabled = true;
  loading.selected = true;
  selectEl.appendChild(loading);

  const models = await fetchModels(endpoint, (apiKey || "").trim());

  if (models && models.length) {
    state.models = models;
    saveModels();
    populateModelSelect(selectEl, currentModel);
    if (selectEl === dom.topbarModel) {
      renderCustomDropdown(currentModel);
      _syncDropdownLabel(currentModel);
    }
    if (onDone) onDone(models);
  } else {
    populateModelSelect(selectEl, currentModel);
    if (selectEl === dom.topbarModel) {
      renderCustomDropdown(currentModel);
      _syncDropdownLabel(currentModel);
    }
    showToast("Could not fetch models from endpoint", "error");
  }
}

/**
 * Populate a <select> element with the current model list.
 */
function populateModelSelect(selectEl, selectedValue = "") {
  selectEl.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— select model —";
  placeholder.disabled = true;
  placeholder.selected = !selectedValue;
  selectEl.appendChild(placeholder);

  for (const m of state.models) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.id;
    if (m.id === selectedValue) opt.selected = true;
    selectEl.appendChild(opt);
  }

  if (selectedValue && !state.models.some((m) => m.id === selectedValue)) {
    const opt = document.createElement("option");
    opt.value = selectedValue;
    opt.textContent = selectedValue + " (custom)";
    opt.selected = true;
    selectEl.insertBefore(opt, selectEl.children[1]);
  }
}

/**
 * Populate the topbar model selector (always visible).
 * If a conversation is active, its model is pre-selected.
 * When no conversation is active, falls back to settings.model.
 */
function populateTopbarModelSelect(selectedValue) {
  const val =
    selectedValue !== undefined
      ? selectedValue
      : state.activeConversationId
        ? (
            state.conversations.find(
              (c) => c.id === state.activeConversationId,
            ) || {}
          ).model || ""
        : state.settings.model || "";
  populateModelSelect(dom.topbarModel, val);
  renderCustomDropdown(val);
  _syncDropdownLabel(val);
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Provider Config — icons + detection
    ═══════════════════════════════════════════════════════════════════════════ */
const PROVIDER_CONFIG = [
  {
    key: "claude",
    name: "Claude",
    iconUrl: "https://www.google.com/s2/favicons?domain=anthropic.com&sz=32",
    match: (id) =>
      id.includes("claude") || id.includes("sonnet") || id.includes("opus"),
  },
  {
    key: "gemini",
    name: "Gemini",
    iconUrl:
      "https://www.google.com/s2/favicons?domain=gemini.google.com&sz=32",
    match: (id) =>
      id.includes("gemini") ||
      id.includes("google") ||
      id.includes("gemma") ||
      id.includes("veo") ||
      id.includes("nanobanana"),
  },
  {
    key: "gpt",
    name: "GPT",
    iconUrl: "https://www.google.com/s2/favicons?domain=openai.com&sz=32",
    match: (id) => id.includes("gpt") || id.includes("openai"),
  },
  {
    key: "x-ai",
    name: "X-AI",
    iconUrl: "https://www.google.com/s2/favicons?domain=x.ai&sz=32",
    match: (id) => id.includes("x-ai") || id.includes("grok"),
  },
  {
    key: "deepseek",
    name: "DeepSeek",
    iconUrl: "https://www.google.com/s2/favicons?domain=deepseek.com&sz=32",
    match: (id) => id.includes("deepseek"),
  },
  {
    key: "kimi",
    name: "Kimi",
    iconUrl: "https://www.google.com/s2/favicons?domain=kimi.ai&sz=32",
    match: (id) => id.includes("kimi") || id.includes("moonshot"),
  },
  {
    key: "glm",
    name: "GLM",
    iconUrl: "https://www.google.com/s2/favicons?domain=zhipuai.cn&sz=32",
    match: (id) => id.includes("glm"),
  },
  {
    key: "qwen",
    name: "Qwen",
    iconUrl: "https://www.google.com/s2/favicons?domain=chat.qwen.ai&sz=32",
    match: (id) => id.includes("qwen"),
  },
  {
    key: "mistral",
    name: "Mistral",
    iconUrl: "https://www.google.com/s2/favicons?domain=mistral.ai&sz=32",
    match: (id) => id.includes("mistral"),
  },
  {
    key: "amazon",
    name: "Amazon",
    iconUrl: "https://www.google.com/s2/favicons?domain=amazon.com&sz=32",
    match: (id) => id.includes("amazon") || id.includes("nova"),
  },
  {
    key: "llama",
    name: "Llama",
    iconUrl: "https://www.google.com/s2/favicons?domain=meta.com&sz=32",
    match: (id) => id.includes("llama"),
  },
  {
    key: "minimax",
    name: "Minimax",
    iconUrl: "https://www.google.com/s2/favicons?domain=minimax.io&sz=32",
    match: (id) => id.includes("minimax"),
  },
  {
    key: "xiaomi",
    name: "Xiaomi",
    iconUrl: "https://www.google.com/s2/favicons?domain=xiaomi.com&sz=32",
    match: (id) => id.includes("mimo"),
  },
  {
    key: "bytedance",
    name: "Bytedance",
    iconUrl: "https://icons.duckduckgo.com/ip3/bytedance.com.ico",
    match: (id) => id.includes("seed"),
  },
  {
    key: "free",
    name: "Free",
    iconUrl: "https://www.google.com/s2/favicons?domain=openrouter.ai&sz=32",
    match: (id) => id.includes("free"),
  },
];

function detectProvider(modelId) {
  const id = modelId.toLowerCase();
  for (const p of PROVIDER_CONFIG) {
    if (p.match(id)) return p;
  }
  return null;
}

// Tracks which filter pill is active while the dropdown is open
let dropdownActiveFilter = null;
let dropdownActiveTypeFilter = null; // "text" | "image" | null

/*  ═══════════════════════════════════════════════════════════════════════════
    Custom Model Dropdown
    ═══════════════════════════════════════════════════════════════════════════ */
function renderCustomDropdown(selectedValue, filter = "") {
  const list = dom.modelSelectorList;
  const filtersEl = dom.modelSelectorFilters;
  if (!list) return;

  // Apply text search
  const searchedModels = filter
    ? state.models.filter((m) =>
        m.id.toLowerCase().includes(filter.toLowerCase()),
      )
    : state.models;

  // ── Determine which output types exist in the searched list ───────────────
  const hasTextModels = searchedModels.some(
    (m) => !m.outputTypes || m.outputTypes.includes("text"),
  );
  const hasImageModels = searchedModels.some(
    (m) => m.outputTypes && m.outputTypes.includes("image"),
  );
  const hasMixedTypes = hasTextModels && hasImageModels;

  // Apply type filter on top of search
  const typeFilteredModels = dropdownActiveTypeFilter
    ? searchedModels.filter(
        (m) =>
          m.outputTypes && m.outputTypes.includes(dropdownActiveTypeFilter),
      )
    : searchedModels;

  // ── Build filter strip ────────────────────────────────────────────────────
  if (filtersEl) filtersEl.innerHTML = "";

  // Type filter pills — built now, appended after provider icons (so margin-left:auto pins it right)
  let typeWrap = null;
  if (hasMixedTypes && filtersEl) {
    typeWrap = document.createElement("div");
    typeWrap.className = "model-selector__type-filter";

    for (const type of ["text", "image"]) {
      const typePresent = type === "text" ? hasTextModels : hasImageModels;
      if (!typePresent) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "model-selector__type-btn" +
        (dropdownActiveTypeFilter === type ? " active" : "");
      btn.textContent = type.charAt(0).toUpperCase() + type.slice(1);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdownActiveTypeFilter =
          dropdownActiveTypeFilter === type ? null : type;
        renderCustomDropdown(selectedValue, filter);
      });
      typeWrap.appendChild(btn);
    }
  }

  // ── Provider filter — built from type-filtered list ───────────────────────
  const presentKeys = new Set();
  let hasOthers = false;
  for (const m of typeFilteredModels) {
    const p = detectProvider(m.id);
    if (p) presentKeys.add(p.key);
    else hasOthers = true;
  }

  const showStrip = filtersEl && (presentKeys.size > 0 || hasOthers);

  if (showStrip) {
    for (const p of PROVIDER_CONFIG) {
      if (!presentKeys.has(p.key)) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = p.name;
      btn.className =
        "model-selector__filter-btn" +
        (dropdownActiveFilter === p.key ? " active" : "");
      btn.innerHTML = `<img class="model-selector__filter-icon" src="${p.iconUrl}" alt="${p.name}" />`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdownActiveFilter = dropdownActiveFilter === p.key ? null : p.key;
        renderCustomDropdown(selectedValue, filter);
      });
      filtersEl.appendChild(btn);
    }

    if (hasOthers) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = "Other models";
      btn.className =
        "model-selector__filter-btn" +
        (dropdownActiveFilter === "other" ? " active" : "");
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="2.5" cy="8" r="1.5" fill="currentColor"/>
        <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
        <circle cx="13.5" cy="8" r="1.5" fill="currentColor"/>
      </svg>`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdownActiveFilter =
          dropdownActiveFilter === "other" ? null : "other";
        renderCustomDropdown(selectedValue, filter);
      });
      filtersEl.appendChild(btn);
    }
  }

  // Append type filter last so margin-left:auto pushes it to the bottom-right
  if (typeWrap && filtersEl) filtersEl.appendChild(typeWrap);

  // ── Apply active provider filter ──────────────────────────────────────────
  const models =
    dropdownActiveFilter === null
      ? typeFilteredModels
      : dropdownActiveFilter === "other"
        ? typeFilteredModels.filter((m) => !detectProvider(m.id))
        : typeFilteredModels.filter(
            (m) => detectProvider(m.id)?.key === dropdownActiveFilter,
          );

  list.innerHTML = "";

  if (models.length === 0) {
    list.innerHTML = `<div class="model-selector__empty">No models match this filter.</div>`;
    return;
  }

  // ── Render model rows ─────────────────────────────────────────────────────
  for (const m of models) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "model-selector__option" + (m.id === selectedValue ? " selected" : "");
    btn.dataset.value = m.id;

    // Split "provider/model-name" into two visual lines
    const slashIdx = m.id.indexOf("/");
    const providerLabel = slashIdx !== -1 ? m.id.slice(0, slashIdx) : null;
    const modelName = slashIdx !== -1 ? m.id.slice(slashIdx + 1) : m.id;

    const providerConfig = detectProvider(m.id);
    const iconHtml = providerConfig
      ? `<img class="model-selector__option-icon" src="${providerConfig.iconUrl}" alt="${providerConfig.name}" />`
      : `<span class="model-selector__option-icon-placeholder"></span>`;

    // Output type tags — show all types; only render if there's a mix in the list
    const outputTypes = m.outputTypes || ["text"];
    const inputTypes = m.inputTypes || ["text"];
    const hasVisionModels = models.some((model) =>
      model.inputTypes?.includes("image"),
    );
    const tagsHtml = hasMixedTypes
      ? outputTypes
          .map(
            (t) =>
              `<span class="model-selector__tag model-selector__tag--${t}">${t}</span>`,
          )
          .join("")
      : "";
    const visionTagHtml =
      hasVisionModels && inputTypes.includes("image")
        ? `<span class="model-selector__tag model-selector__tag--vision">vision</span>`
        : "";

    btn.innerHTML = `
      ${iconHtml}
      <span class="model-selector__option-text">
        ${providerLabel ? `<span class="model-selector__option-provider">${escapeHtml(providerLabel)}</span>` : ""}
        <span class="model-selector__option-name">${escapeHtml(modelName)}</span>
      </span>
      ${tagsHtml || visionTagHtml ? `<span class="model-selector__tags">${tagsHtml}${visionTagHtml}</span>` : ""}
      <svg class="model-selector__check" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 7l3 3 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    btn.addEventListener("click", () => {
      selectTopbarModel(m.id);
      closeCustomDropdown();
    });
    list.appendChild(btn);
  }
}

function openCustomDropdown() {
  dropdownActiveFilter = null; // reset filter pill on each open
  dropdownActiveTypeFilter = null; // reset type filter on each open
  dom.modelSelectorDropdown.classList.add("open");
  dom.modelSelectorTrigger.setAttribute("aria-expanded", "true");
  dom.modelSelectorSearch.value = "";
  renderCustomDropdown(dom.topbarModel.value);
  dom.modelSelectorSearch.focus();
}

function closeCustomDropdown() {
  dom.modelSelectorDropdown.classList.remove("open");
  dom.modelSelectorTrigger.setAttribute("aria-expanded", "false");
}

function selectTopbarModel(value) {
  dom.topbarModel.value = value;
  dom.modelSelectorLabel.textContent = value || "Select model";
  dom.modelSelectorLabel.classList.toggle("placeholder", !value);
  // Update trigger icon with the provider's favicon
  if (dom.modelSelectorIcon) {
    const provider = value ? detectProvider(value) : null;
    if (provider) {
      dom.modelSelectorIcon.src = provider.iconUrl;
      dom.modelSelectorIcon.alt = provider.name;
      dom.modelSelectorIcon.style.display = "block";
    } else {
      dom.modelSelectorIcon.src = "";
      dom.modelSelectorIcon.alt = "";
      dom.modelSelectorIcon.style.display = "none";
    }
  }
  // Trigger the existing handler
  onTopbarModelChange();
}
