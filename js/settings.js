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
 * whether a key is already stored for the endpoint currently in the form —
 * either on a saved profile pointing at it, or on the per-preset map.
 */
function updateSettingsApiKeyPlaceholder() {
  const preset = dom.settingsEndpointPreset.value;
  const endpoint = currentSettingsEndpoint();
  const fromProfile = getProfiles().find(
    (p) => p && p.endpoint === endpoint && p.api_key,
  );
  const stored =
    (fromProfile && fromProfile.api_key) || getStoredApiKeyForPreset(preset);
  dom.settingsApiKey.placeholder = stored
    ? "Stored ✓ — paste to replace"
    : "sk-… (leave empty for local models)";
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Connection Profiles  (up to 4 saved endpoint + API key pairs)
    ═══════════════════════════════════════════════════════════════════════════ */

const MAX_PROFILES = 4;

// Which slot the "Save Profile" button writes to. Set when a slot is clicked.
let selectedProfileSlot = 0;

/**
 * Return the stored profiles as a fixed-length array of MAX_PROFILES,
 * with empty slots represented by null.
 */
function getProfiles() {
  const raw = state.settings.connection_profiles;
  const list = Array.isArray(raw) ? raw.slice(0, MAX_PROFILES) : [];
  while (list.length < MAX_PROFILES) list.push(null);
  return list.map((p) =>
    p && p.endpoint
      ? { name: p.name || "", endpoint: p.endpoint, api_key: p.api_key || "" }
      : null,
  );
}

/** Short label for a slot — the endpoint host, or the raw URL if unparseable. */
function profileHostLabel(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint || "";
  }
}

/** The endpoint URL the settings form currently describes. */
function currentSettingsEndpoint() {
  return buildEndpointUrl(
    dom.settingsEndpointPreset.value,
    "text",
    dom.settingsEndpoint.value,
  );
}

/**
 * Index of the profile matching a given endpoint + key, or null.
 * Prefers an exact endpoint+key match so two profiles on the same endpoint
 * (e.g. two accounts) stay distinguishable.
 */
function findProfileIndex(endpoint, apiKey) {
  if (!endpoint) return null;
  const profiles = getProfiles();
  let idx = profiles.findIndex(
    (p) => p && p.endpoint === endpoint && p.api_key === apiKey,
  );
  if (idx === -1) idx = profiles.findIndex((p) => p && p.endpoint === endpoint);
  return idx === -1 ? null : idx;
}

function renderProfileSlots() {
  const container = dom.settingsProfileSlots;
  if (!container) return;
  const profiles = getProfiles();
  const active = state.settings.active_profile;
  container.innerHTML = "";

  profiles.forEach((profile, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "profile-slot";
    btn.dataset.slot = String(i);
    btn.classList.toggle("profile-slot--empty", !profile);
    btn.classList.toggle("profile-slot--selected", i === selectedProfileSlot);
    btn.classList.toggle("profile-slot--active", !!profile && i === active);
    btn.title = profile
      ? `${profile.name || "Profile " + (i + 1)} — ${profile.endpoint}`
      : `Empty slot ${i + 1} — click to select, then Save Profile`;

    const name = document.createElement("span");
    name.className = "profile-slot__name";
    name.textContent = profile
      ? profile.name || `Profile ${i + 1}`
      : `Slot ${i + 1}`;

    const host = document.createElement("span");
    host.className = "profile-slot__host";
    host.textContent = profile ? profileHostLabel(profile.endpoint) : "empty";

    btn.append(name, host);

    if (profile) {
      const clear = document.createElement("span");
      clear.className = "profile-slot__clear";
      clear.textContent = "×";
      clear.title = "Delete this profile";
      clear.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteProfile(i);
      });
      btn.appendChild(clear);
    }

    btn.addEventListener("click", () => selectProfileSlot(i));
    container.appendChild(btn);
  });
}

/** Push a profile's endpoint into the settings form controls. */
function applyProfileToForm(profile) {
  const { preset, mode, customUrl } = parseEndpointPreset(
    profile.endpoint || "",
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
  // Never pre-fill the key field — the placeholder shows one is stored.
  dom.settingsApiKey.value = "";
  updateSettingsApiKeyPlaceholder();
}

/**
 * Make a profile the live connection: persist its endpoint + key, repoint the
 * active conversation, and refresh the topbar model list.
 */
function activateProfile(index, profile) {
  const { preset } = parseEndpointPreset(profile.endpoint || "");
  const api_keys = { ...(state.settings.api_keys || {}) };
  if (profile.api_key) api_keys[preset] = profile.api_key;

  state.settings = storage.saveSettings({
    endpoint: profile.endpoint,
    api_key: profile.api_key || "",
    api_keys,
    active_profile: index,
  });

  applyEndpointToRuntime(profile.endpoint, profile.api_key || "");
  const label = profile.name || `Profile ${index + 1}`;
  showToast(`Switched to “${label}”`, "success");
}

function selectProfileSlot(index) {
  selectedProfileSlot = index;
  const profile = getProfiles()[index];
  dom.settingsProfileName.value = profile ? profile.name || "" : "";
  if (profile) {
    applyProfileToForm(profile);
    activateProfile(index, profile);
  }
  renderProfileSlots();
}

/** Write the endpoint + API key currently in the form into the selected slot. */
function saveCurrentAsProfile() {
  const endpoint = currentSettingsEndpoint();
  if (!endpoint) {
    showToast("Set an endpoint URL first", "error");
    return;
  }

  const profiles = getProfiles();
  let slot = selectedProfileSlot;
  if (typeof slot !== "number" || slot < 0 || slot >= MAX_PROFILES) {
    const empty = profiles.findIndex((p) => !p);
    slot = empty === -1 ? 0 : empty;
  }

  const preset = dom.settingsEndpointPreset.value;
  const existing = profiles[slot];
  const typedKey = dom.settingsApiKey.value.trim();
  const api_key =
    typedKey ||
    (existing && existing.endpoint === endpoint ? existing.api_key : "") ||
    getStoredApiKeyForPreset(preset);

  const name = (
    dom.settingsProfileName.value.trim() ||
    profileHostLabel(endpoint) ||
    `Profile ${slot + 1}`
  ).slice(0, 24);

  profiles[slot] = { name, endpoint, api_key };
  selectedProfileSlot = slot;

  const isLive = endpoint === (state.settings.endpoint || "");
  state.settings = storage.saveSettings({
    connection_profiles: profiles,
    ...(isLive ? { active_profile: slot } : {}),
  });

  dom.settingsProfileName.value = name;
  renderProfileSlots();
  updateSettingsApiKeyPlaceholder();
  showToast(`Saved to “${name}”`, "success");
}

function deleteProfile(index) {
  const profiles = getProfiles();
  const removed = profiles[index];
  if (!removed) return;
  profiles[index] = null;

  const active = state.settings.active_profile;
  state.settings = storage.saveSettings({
    connection_profiles: profiles,
    ...(active === index ? { active_profile: null } : {}),
  });

  if (selectedProfileSlot === index) dom.settingsProfileName.value = "";
  renderProfileSlots();
  updateSettingsApiKeyPlaceholder();
  showToast(`Removed “${removed.name || `Profile ${index + 1}`}”`, "success");
}

/**
 * Repoint the live conversation + topbar model list at an endpoint.
 * Shared by profile switching and Save Settings.
 */
function applyEndpointToRuntime(endpoint, apiKey) {
  if (!endpoint) return;
  if (state.activeConversationId) {
    storage.updateConversation(state.activeConversationId, { endpoint });
    state.conversations = storage.getConversations();
  }
  const model = state.settings.model || "";
  const currentModel = state.activeConversationId
    ? (
        state.conversations.find((c) => c.id === state.activeConversationId) ||
        {}
      ).model || model
    : model;
  fetchAndPopulateModels(endpoint, apiKey, dom.topbarModel, currentModel);
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

  // Select the live profile if there is one, otherwise the first free slot.
  const profiles = getProfiles();
  const active = state.settings.active_profile;
  if (typeof active === "number" && profiles[active]) {
    selectedProfileSlot = active;
  } else {
    const empty = profiles.findIndex((p) => !p);
    selectedProfileSlot = empty === -1 ? 0 : empty;
  }
  const selected = profiles[selectedProfileSlot];
  dom.settingsProfileName.value = selected ? selected.name || "" : "";
  renderProfileSlots();

  openModal(dom.modalSettings);
}

function clearLocalStorage() {
  openModal(document.getElementById("modal-confirm-clear-keys"));
}

function _execClearApiKeys() {
  // Only remove API keys — leave conversations, messages, and other settings
  // intact. Profiles keep their name + endpoint but lose their stored key.
  const { api_key, api_keys, ...rest } = state.settings;
  const connection_profiles = getProfiles().map((p) =>
    p ? { ...p, api_key: "" } : null,
  );
  state.settings = storage.saveSettings({
    ...rest,
    api_key: "",
    api_keys: {},
    connection_profiles,
  });

  // Clear the key input in the open modal so it doesn't show stale state
  dom.settingsApiKey.value = "";
  updateSettingsApiKeyPlaceholder();
  renderProfileSlots();

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

  // A profile pointing at this endpoint owns its own key — prefer it over the
  // per-preset map, which several custom endpoints would otherwise share.
  const profiles = getProfiles();
  const matchIdx = findProfileIndex(endpoint, typedKey || undefined);
  const matched = matchIdx === null ? null : profiles[matchIdx];
  const api_key =
    typedKey || (matched && matched.api_key) || api_keys[preset] || "";
  // Push a newly typed key onto the matching profile so the two stay in step.
  if (typedKey && matched)
    profiles[matchIdx] = { ...matched, api_key: typedKey };
  const active_profile = matchIdx;

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
      connection_profiles: profiles,
      active_profile,
      model,
      system_prompt,
      temperature,
      top_p,
      stream,
    });
    showToast("Settings saved", "success");
    closeModal(dom.modalSettings);

    // Repoint the active conversation at the new endpoint (so a model picked
    // from it hits the right host) and refresh the topbar model list.
    applyEndpointToRuntime(endpoint, api_key);
  } catch (err) {
    showToast("Failed to save settings: " + err.message, "error");
  } finally {
    document.getElementById("btn-settings-save").disabled = false;
  }
}
