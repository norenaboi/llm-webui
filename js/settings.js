/*  ═══════════════════════════════════════════════════════════════════════════
    Endpoint Preset / Mode-toggle helpers
    ═══════════════════════════════════════════════════════════════════════════ */

const ENDPOINT_BASES = {
  openrouter: "https://openrouter.ai/api",
  pollinations: "https://gen.pollinations.ai",
  noreproxy: "https://llm.norenaboi.com",
  digitalocean: "https://inference.do-ai.run",
  googleaistudio: "https://generativelanguage.googleapis.com",
  openai: "https://api.openai.com",
};

const MODE_SUFFIXES = {
  text: "/v1/chat/completions",
  image: "/image",
  aistudio: "/v1beta/openai/",
  openai: "/v1/responses",
};

// Presets that always use a fixed suffix regardless of the mode toggle.
const PRESET_SUFFIX_OVERRIDE = {
  googleaistudio: "aistudio",
  openai: "openai",
};

/**
 * Given a raw stored endpoint URL, figure out which preset and mode it
 * corresponds to, and return { preset, mode, customUrl }.
 */
function parseEndpointPreset(url) {
  if (!url) return { preset: "openrouter", mode: "text", customUrl: "" };
  for (const [preset, base] of Object.entries(ENDPOINT_BASES)) {
    for (const [modeKey, suffix] of Object.entries(MODE_SUFFIXES)) {
      if (url === base + suffix) {
        // aistudio / openai are URL-suffix variants of the "text" (chat) mode
        const uiMode =
          modeKey === "aistudio" || modeKey === "openai" ? "text" : modeKey;
        return { preset, mode: uiMode, customUrl: "" };
      }
    }
  }
  // Didn't match any known pattern — treat as custom
  return { preset: "custom", mode: "text", customUrl: url };
}

/**
 * Build the final URL from a preset+mode (or from a custom input value).
 * Some presets (googleaistudio, openai) always use their own dedicated suffix
 * regardless of which mode-toggle button is active.
 */
function buildEndpointUrl(preset, mode, customUrl) {
  if (preset === "custom") return customUrl.trim();
  const modeKey = PRESET_SUFFIX_OVERRIDE[preset] ?? mode;
  return (ENDPOINT_BASES[preset] || "") + (MODE_SUFFIXES[modeKey] || "");
}

/**
 * Apply preset+mode state to the UI controls of one modal.
 * @param {object} els  - { presetEl, customEl, modeBtns: [textBtn, imageBtn] }
 * @param {string} preset
 * @param {string} mode
 * @param {string} customUrl
 */
function applyEndpointUi(els, preset, mode, customUrl) {
  const { presetEl, customEl, modeBtns } = els;
  presetEl.value = preset;

  // Sync the custom select UI if one is associated via data-csel
  const cselId = presetEl.dataset.csel;
  if (cselId) {
    const csel = document.getElementById(cselId);
    if (csel) {
      csel.querySelectorAll(".csel__option").forEach((opt) => {
        const active = opt.dataset.value === preset;
        opt.classList.toggle("csel__option--active", active);
        if (active) {
          const label = csel.querySelector(".csel__label");
          if (label) label.textContent = opt.textContent.trim();
        }
      });
    }
  }

  customEl.style.display = preset === "custom" ? "" : "none";
  if (preset === "custom") customEl.value = customUrl;
  modeBtns.forEach((btn) => {
    btn.classList.toggle("mode-btn--active", btn.dataset.mode === mode);
  });
}

/**
 * Wire up the interactive behaviour for one modal's endpoint controls.
 * @param {object} els  - { presetEl, customEl, modeBtns: [textBtn, imageBtn] }
 * @param {Function} onChangeCallback  - called whenever the effective URL changes
 */
function initEndpointControls(els, onChangeCallback) {
  const { presetEl, customEl, modeBtns } = els;

  function currentMode() {
    const active = modeBtns.find((b) =>
      b.classList.contains("mode-btn--active"),
    );
    return active ? active.dataset.mode : "text";
  }

  presetEl.addEventListener("change", () => {
    const isCustom = presetEl.value === "custom";
    customEl.style.display = isCustom ? "" : "none";
    if (isCustom) {
      customEl.focus();
    } else {
      onChangeCallback();
    }
  });

  customEl.addEventListener("change", () => {
    if (presetEl.value === "custom") onChangeCallback();
  });

  modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeBtns.forEach((b) => b.classList.remove("mode-btn--active"));
      btn.classList.add("mode-btn--active");
      onChangeCallback();
    });
  });
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Per-endpoint API key helpers
    ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Return the full api_keys map stored in settings  { [preset]: key }.
 */
function getStoredApiKeys() {
  return state.settings.api_keys || {};
}

/**
 * Return the stored API key for a given endpoint preset, or "".
 */
function getStoredApiKeyForPreset(preset) {
  return getStoredApiKeys()[preset] || "";
}

/**
 * Update the placeholder text on the settings API key input to indicate
 * whether a key is already stored for the currently selected preset.
 */
function updateSettingsApiKeyPlaceholder() {
  const preset = dom.settingsEndpointPreset.value;
  const stored = getStoredApiKeyForPreset(preset);
  dom.settingsApiKey.placeholder = stored
    ? "Stored ✓ — paste to replace"
    : "sk-… (leave empty for local models)";
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Settings Modal  (no model selector — model is in topbar)
    ═══════════════════════════════════════════════════════════════════════════ */
function openSettingsModal() {
  const { preset, mode, customUrl } = parseEndpointPreset(
    state.settings.endpoint || "",
  );
  applyEndpointUi(
    {
      presetEl: dom.settingsEndpointPreset,
      customEl: dom.settingsEndpoint,
      modeBtns: [],
    },
    preset,
    mode,
    customUrl,
  );
  // Never pre-fill the API key — show a placeholder indicating whether one is stored.
  dom.settingsApiKey.value = "";
  updateSettingsApiKeyPlaceholder();
  dom.settingsSystemPrompt.value = state.settings.system_prompt || "";
  dom.settingsTemperature.value =
    state.settings.temperature !== undefined &&
    state.settings.temperature !== ""
      ? state.settings.temperature
      : "";
  dom.settingsTopP.value =
    state.settings.top_p !== undefined && state.settings.top_p !== ""
      ? state.settings.top_p
      : "";
  dom.settingsStream.checked = state.settings.stream === "true";

  openModal(dom.modalSettings);
}

function clearLocalStorage() {
  openModal(document.getElementById("modal-confirm-clear-keys"));
}

function _execClearApiKeys() {
  // Only remove API keys — leave conversations, messages, and other settings intact
  const { api_key, api_keys, ...rest } = state.settings;
  state.settings = storage.saveSettings({ ...rest, api_key: "", api_keys: {} });

  // Clear the key input in the open modal so it doesn't show stale state
  dom.settingsApiKey.value = "";
  updateSettingsApiKeyPlaceholder();

  closeModal(document.getElementById("modal-confirm-clear-keys"));
  showToast("API keys cleared", "success");
}

function initClearKeysModal() {
  document
    .getElementById("btn-confirm-clear-ok")
    .addEventListener("click", _execClearApiKeys);
  const dismiss = () =>
    closeModal(document.getElementById("modal-confirm-clear-keys"));
  document
    .getElementById("btn-confirm-clear-cancel")
    .addEventListener("click", dismiss);
  document
    .getElementById("btn-confirm-clear-close")
    .addEventListener("click", dismiss);
}

async function saveSettingsModal() {
  const activeMode = "text";
  const endpoint = buildEndpointUrl(
    dom.settingsEndpointPreset.value,
    activeMode,
    dom.settingsEndpoint.value,
  );
  // Merge the typed key into the per-preset map, or fall back to stored key.
  const preset = dom.settingsEndpointPreset.value;
  const typedKey = dom.settingsApiKey.value.trim();
  const api_keys = { ...(state.settings.api_keys || {}) };
  if (typedKey) api_keys[preset] = typedKey;
  const api_key = api_keys[preset] || "";

  const system_prompt = dom.settingsSystemPrompt.value.trim();
  const temperatureRaw = dom.settingsTemperature.value;
  const temperature = temperatureRaw !== "" ? parseFloat(temperatureRaw) : "";
  const topPRaw = dom.settingsTopP.value;
  const top_p = topPRaw !== "" ? parseFloat(topPRaw) : "";
  const stream = String(dom.settingsStream.checked);

  // Preserve the existing model value when saving settings
  const model = state.settings.model || dom.topbarModel.value || "";

  try {
    document.getElementById("btn-settings-save").disabled = true;
    state.settings = storage.saveSettings({
      endpoint,
      api_key,
      api_keys,
      model,
      system_prompt,
      temperature,
      top_p,
      stream,
    });
    showToast("Settings saved", "success");
    closeModal(dom.modalSettings);

    // If there's an active conversation, update its endpoint to match the new settings endpoint
    // so that when the user selects a model from the new endpoint and sends a message,
    // the API call goes to the correct endpoint.
    if (state.activeConversationId && endpoint) {
      storage.updateConversation(state.activeConversationId, { endpoint });
      state.conversations = storage.getConversations();
    }

    // Refresh the topbar model list from the new endpoint
    if (endpoint) {
      const currentModel = state.activeConversationId
        ? (
            state.conversations.find(
              (c) => c.id === state.activeConversationId,
            ) || {}
          ).model || model
        : model;
      fetchAndPopulateModels(endpoint, api_key, dom.topbarModel, currentModel);
    }
  } catch (err) {
    showToast("Failed to save settings: " + err.message, "error");
  } finally {
    document.getElementById("btn-settings-save").disabled = false;
  }
}
