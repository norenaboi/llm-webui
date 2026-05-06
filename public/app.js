/*  ═══════════════════════════════════════════════════════════════════════════
    State
    ═══════════════════════════════════════════════════════════════════════════ */
const state = {
  conversations: [],
  activeConversationId: null,
  settings: {},
  isLoading: false,
  editingConvId: null,
  models: [],
  contextMenuConvId: null, // which conv the 3-dot menu is open for
};

/*  ═══════════════════════════════════════════════════════════════════════════
    DOM References
    ═══════════════════════════════════════════════════════════════════════════ */
const dom = {
  // Layout
  sidebar: document.getElementById("sidebar"),
  // Conversation list
  convList: document.getElementById("conversation-list"),
  // Messages
  messages: document.getElementById("messages"),
  // Topbar
  topbarTitle: document.getElementById("topbar-title"),
  // Topbar model selector (custom dropdown)
  topbarModel: document.getElementById("topbar-model"),
  modelSelectorTrigger: document.getElementById("model-selector-trigger"),
  modelSelectorDropdown: document.getElementById("model-selector-dropdown"),
  modelSelectorLabel: document.getElementById("model-selector-label"),
  modelSelectorSearch: document.getElementById("model-selector-search"),
  modelSelectorList: document.getElementById("model-selector-list"),
  // Input bar
  messageInput: document.getElementById("message-input"),
  btnSend: document.getElementById("btn-send"),
  // Edit Conversation modal
  modalConv: document.getElementById("modal-conversation"),
  modalConvTitle: document.getElementById("modal-conv-title"),
  convEndpoint: document.getElementById("conv-endpoint"),
  convApiKey: document.getElementById("conv-api-key"),
  convModel: document.getElementById("conv-model"),
  convTitle: document.getElementById("conv-title"),
  convSystemPrompt: document.getElementById("conv-system-prompt"),
  convStream: document.getElementById("conv-stream"),
  btnConvSave: document.getElementById("btn-conv-save"),
  btnConvCancel: document.getElementById("btn-conv-cancel"),
  // Settings modal (no model select here anymore)
  modalSettings: document.getElementById("modal-settings"),
  settingsEndpoint: document.getElementById("settings-endpoint"),
  settingsApiKey: document.getElementById("settings-api-key"),
  settingsSystemPrompt: document.getElementById("settings-system-prompt"),
  settingsStream: document.getElementById("settings-stream"),
  // Context menu (3-dot)
  convContextMenu: document.getElementById("conv-context-menu"),
  ctxRename: document.getElementById("ctx-rename"),
  ctxDuplicate: document.getElementById("ctx-duplicate"),
  ctxDelete: document.getElementById("ctx-delete"),
  // Theme toggle
  btnThemeToggle: document.getElementById("btn-theme-toggle"),
  // Toast
  toast: document.getElementById("toast"),
};

/*  ═══════════════════════════════════════════════════════════════════════════
    localStorage Storage Layer
    ═══════════════════════════════════════════════════════════════════════════ */
const STORAGE_KEYS = {
  conversations: "llm_webui_conversations",
  messages: "llm_webui_messages",
  settings: "llm_webui_settings",
};

function lsGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function lsSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const storage = {
  // ── Conversations ──────────────────────────────────────────────────────────

  getConversations() {
    const convs = lsGet(STORAGE_KEYS.conversations) || [];
    return [...convs].sort(
      (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
    );
  },

  getConversation(id) {
    const convs = lsGet(STORAGE_KEYS.conversations) || [];
    const conv = convs.find((c) => c.id === id);
    if (!conv) return null;
    const messages = storage.getMessages(id);
    return { ...conv, messages };
  },

  createConversation({
    title = "New Conversation",
    model = "",
    system_prompt = "",
    endpoint = "",
    api_key = "",
    stream = "false",
  }) {
    const convs = lsGet(STORAGE_KEYS.conversations) || [];
    const now = new Date().toISOString();
    const id = Date.now();
    const conv = {
      id,
      title,
      model,
      system_prompt,
      endpoint,
      api_key,
      stream,
      created_at: now,
      updated_at: now,
    };
    convs.push(conv);
    lsSet(STORAGE_KEYS.conversations, convs);
    return conv;
  },

  updateConversation(id, fields) {
    const convs = lsGet(STORAGE_KEYS.conversations) || [];
    const idx = convs.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    convs[idx] = {
      ...convs[idx],
      ...fields,
      updated_at: new Date().toISOString(),
    };
    lsSet(STORAGE_KEYS.conversations, convs);
    return convs[idx];
  },

  deleteConversation(id) {
    const convs = lsGet(STORAGE_KEYS.conversations) || [];
    const next = convs.filter((c) => c.id !== id);
    lsSet(STORAGE_KEYS.conversations, next);
    const msgs = lsGet(STORAGE_KEYS.messages) || {};
    delete msgs[id];
    lsSet(STORAGE_KEYS.messages, msgs);
    return true;
  },

  // ── Messages ───────────────────────────────────────────────────────────────

  getMessages(conversationId) {
    const msgs = lsGet(STORAGE_KEYS.messages) || {};
    return msgs[conversationId] || [];
  },

  addMessage(conversationId, { role, content }) {
    const msgs = lsGet(STORAGE_KEYS.messages) || {};
    if (!msgs[conversationId]) msgs[conversationId] = [];
    const now = new Date().toISOString();
    const msg = {
      id: Date.now(),
      conversation_id: conversationId,
      role,
      content,
      created_at: now,
    };
    msgs[conversationId].push(msg);
    lsSet(STORAGE_KEYS.messages, msgs);
    storage.updateConversation(conversationId, {});
    return msg;
  },

  // ── Settings ───────────────────────────────────────────────────────────────

  getSettings() {
    return lsGet(STORAGE_KEYS.settings) || {};
  },

  saveSettings(obj) {
    const current = lsGet(STORAGE_KEYS.settings) || {};
    const updated = { ...current, ...obj };
    lsSet(STORAGE_KEYS.settings, updated);
    return updated;
  },
};

/*  ═══════════════════════════════════════════════════════════════════════════
    Theme
    ═══════════════════════════════════════════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.add("theme-loaded");
    });
  });
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  if (dom.btnThemeToggle) {
    dom.btnThemeToggle.textContent = theme === "dark" ? "☾" : "☀";
    dom.btnThemeToggle.title =
      theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Toast
    ═══════════════════════════════════════════════════════════════════════════ */
let toastTimer = null;

function showToast(message, type = "info") {
  dom.toast.textContent = message;
  dom.toast.className = `toast show${type !== "info" ? ` toast--${type}` : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove("show");
  }, 3000);
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Modal Helpers
    ═══════════════════════════════════════════════════════════════════════════ */
function openModal(modalEl) {
  modalEl.setAttribute("aria-hidden", "false");
  modalEl.classList.add("open");
}

function closeModal(modalEl) {
  modalEl.setAttribute("aria-hidden", "true");
  modalEl.classList.remove("open");
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Model List  (persisted to localStorage)
    ═══════════════════════════════════════════════════════════════════════════ */
const MODELS_KEY = "llm_webui_models";

const DEFAULT_MODELS = ["gpt-4o", "gpt-4o-mini", "claude-opus-4-5"];

function loadModels() {
  try {
    const raw = localStorage.getItem(MODELS_KEY);
    state.models = raw ? JSON.parse(raw) : [...DEFAULT_MODELS];
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
  if (state.models.includes(name)) return false;
  state.models.push(name);
  saveModels();
  return true;
}

function removeModel(name) {
  state.models = state.models.filter((m) => m !== name);
  saveModels();
}

/**
 * Fetch the available models from an OpenAI-compatible /v1/models endpoint.
 */
async function fetchModels(endpoint, apiKey) {
  if (!endpoint) return null;

  const base = endpoint.replace(/\/+$/, "");
  const url = `${base}/models`;

  try {
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) return null;

    const data = await res.json();
    const list = Array.isArray(data?.data)
      ? data.data.map((m) => m.id).filter(Boolean)
      : [];

    return list.length ? list.sort() : null;
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
    opt.value = m;
    opt.textContent = m;
    if (m === selectedValue) opt.selected = true;
    selectEl.appendChild(opt);
  }

  if (selectedValue && !state.models.includes(selectedValue)) {
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
    Custom Model Dropdown
    ═══════════════════════════════════════════════════════════════════════════ */
function renderCustomDropdown(selectedValue, filter = "") {
  const list = dom.modelSelectorList;
  list.innerHTML = "";

  const models = filter
    ? state.models.filter((m) => m.toLowerCase().includes(filter.toLowerCase()))
    : state.models;

  if (models.length === 0) {
    list.innerHTML = `<div class="model-selector__empty">No models found</div>`;
    return;
  }

  for (const m of models) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "model-selector__option" + (m === selectedValue ? " selected" : "");
    btn.dataset.value = m;
    btn.innerHTML = `
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m)}</span>
      <svg class="model-selector__check" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 7l3 3 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    btn.addEventListener("click", () => {
      selectTopbarModel(m);
      closeCustomDropdown();
    });
    list.appendChild(btn);
  }
}

function openCustomDropdown() {
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
  // Trigger the existing handler
  onTopbarModelChange();
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Render: Conversation List
    ═══════════════════════════════════════════════════════════════════════════ */
function renderConversationList() {
  dom.convList.innerHTML = "";

  if (state.conversations.length === 0) {
    dom.convList.innerHTML = `<p style="padding:16px 12px;font-size:0.78rem;color:var(--clr-text-muted);text-align:center;line-height:1.5;">
        No conversations yet.<br>Click ✏ to start one.
      </p>`;
    return;
  }

  for (const conv of state.conversations) {
    const item = document.createElement("div");
    item.className =
      "conv-item" + (conv.id === state.activeConversationId ? " active" : "");
    item.dataset.id = conv.id;

    const date = new Date(conv.updated_at);
    const dateStr = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

    item.innerHTML = `
      <div class="conv-item__info">
        <div class="conv-item__title">${escapeHtml(conv.title)}</div>
        <div class="conv-item__meta">${escapeHtml(conv.model || "No model")} · ${dateStr}</div>
      </div>
      <button class="conv-item__menu-btn" data-id="${conv.id}" title="More options" tabindex="-1">⋮</button>
    `;

    item.addEventListener("click", (e) => {
      if (e.target.closest(".conv-item__menu-btn")) return;
      selectConversation(conv.id);
    });

    item
      .querySelector(".conv-item__menu-btn")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        openConvContextMenu(conv.id, e.currentTarget);
      });

    dom.convList.appendChild(item);
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Context Menu  (3-dot)
    ═══════════════════════════════════════════════════════════════════════════ */
function openConvContextMenu(convId, anchorEl) {
  state.contextMenuConvId = convId;

  // Position the menu near the anchor button
  const rect = anchorEl.getBoundingClientRect();
  const menu = dom.convContextMenu;

  // Reset position so we can measure
  menu.style.top = "0px";
  menu.style.left = "0px";
  menu.classList.add("open");
  menu.setAttribute("aria-hidden", "false");

  const menuRect = menu.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;

  let top = rect.bottom + 4;
  let left = rect.left;

  // Flip up if menu would overflow below
  if (top + menuRect.height > viewportH - 8) {
    top = rect.top - menuRect.height - 4;
  }

  // Keep within right edge
  if (left + menuRect.width > viewportW - 8) {
    left = viewportW - menuRect.width - 8;
  }

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

function closeConvContextMenu() {
  dom.convContextMenu.classList.remove("open");
  dom.convContextMenu.setAttribute("aria-hidden", "true");
  state.contextMenuConvId = null;
}

function renameConversation(convId) {
  closeConvContextMenu();
  const conv = state.conversations.find((c) => c.id === convId);
  if (!conv) return;

  // Find the conv-item element in the list
  const item = dom.convList.querySelector(`.conv-item[data-id="${convId}"]`);
  if (!item) return;

  const titleEl = item.querySelector(".conv-item__title");
  if (!titleEl) return;

  // Swap title div for an input
  const input = document.createElement("input");
  input.type = "text";
  input.className = "conv-item__rename-input";
  input.value = conv.title;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  // Stop clicks inside input from triggering selectConversation
  input.addEventListener("click", (e) => e.stopPropagation());

  function commit() {
    const trimmed = input.value.trim();
    if (!trimmed) {
      cancel();
      return;
    }
    storage.updateConversation(convId, { title: trimmed });
    state.conversations = storage.getConversations();
    // Restore the title element with new text
    const newTitle = document.createElement("div");
    newTitle.className = "conv-item__title";
    newTitle.textContent = trimmed;
    input.replaceWith(newTitle);
    // Update topbar if active
    if (convId === state.activeConversationId) {
      dom.topbarTitle.textContent = trimmed;
    }
  }

  function cancel() {
    const restored = document.createElement("div");
    restored.className = "conv-item__title";
    restored.textContent = conv.title;
    input.replaceWith(restored);
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener("blur", commit);
}

async function duplicateConversation(convId) {
  closeConvContextMenu();
  const conv = storage.getConversation(convId);
  if (!conv) return;

  try {
    // Create new conversation record with "(copy)" appended
    const newConv = storage.createConversation({
      title: conv.title + " (copy)",
      model: conv.model || "",
      system_prompt: conv.system_prompt || "",
      endpoint: conv.endpoint || "",
      api_key: conv.api_key || "",
      stream: conv.stream || "false",
    });

    // Copy all messages to the new conversation id
    const msgs = lsGet(STORAGE_KEYS.messages) || {};
    const originalMsgs = msgs[convId] || [];
    const copiedMsgs = originalMsgs.map((m) => ({
      ...m,
      id: Date.now() + Math.random(),
      conversation_id: newConv.id,
    }));
    msgs[newConv.id] = copiedMsgs;
    lsSet(STORAGE_KEYS.messages, msgs);

    await loadConversations();
    showToast("Conversation duplicated", "success");
  } catch (err) {
    showToast("Failed to duplicate: " + err.message, "error");
  }
}

async function deleteConversation(convId) {
  closeConvContextMenu();

  try {
    storage.deleteConversation(convId);

    // If we deleted the active conversation, clear the view
    if (convId === state.activeConversationId) {
      state.activeConversationId = null;
      renderTopbar(null);
      disableInput();
      dom.messages.innerHTML = "";
      showEmptyState();
    }

    showToast("Conversation deleted", "success");
    await loadConversations();
  } catch (err) {
    showToast("Failed to delete: " + err.message, "error");
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Render: Messages
    ═══════════════════════════════════════════════════════════════════════════ */
function renderMessages(messages) {
  dom.messages.innerHTML = "";

  if (!messages || messages.length === 0) {
    dom.messages.innerHTML = `
      <div class="empty-state" style="flex:1;">
        <div class="empty-state__icon">
          <svg width="36" height="36" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="8" width="40" height="30" rx="6" stroke="currentColor" stroke-width="2.5"/>
            <path d="M15 40l3-6h12l3 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="16" cy="23" r="2.5" fill="currentColor"/>
            <circle cx="24" cy="23" r="2.5" fill="currentColor"/>
            <circle cx="32" cy="23" r="2.5" fill="currentColor"/>
          </svg>
        </div>
        <p>No messages yet. Say hello!</p>
      </div>`;
    return;
  }

  for (const msg of messages) {
    appendMessageBubble(msg.role, msg.content, msg.created_at);
  }

  scrollToBottom();
}

function appendMessageBubble(role, content, timestamp = null) {
  const empty = dom.messages.querySelector(".empty-state");
  if (empty) empty.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `message message--${role}`;

  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });

  const bubbleContent =
    role === "user"
      ? `<span style="white-space: pre-wrap">${escapeHtml(content)}</span>`
      : formatMessageContent(content);

  const roleLabel = role === "user" ? "You" : "Assistant";

  wrapper.innerHTML = `
    <span class="message__role">${roleLabel}</span>
    <div class="message__bubble">${bubbleContent}</div>
    <span class="message__time">${time}</span>
  `;

  dom.messages.appendChild(wrapper);
  return wrapper;
}

function appendThinkingBubble() {
  const wrapper = document.createElement("div");
  wrapper.className = "message message--assistant message--thinking";
  wrapper.id = "thinking-bubble";
  wrapper.innerHTML = `
    <div class="message__bubble">
      <div class="dot-flashing">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  dom.messages.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function removeThinkingBubble() {
  const el = document.getElementById("thinking-bubble");
  if (el) el.remove();
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Render: Topbar
    ═══════════════════════════════════════════════════════════════════════════ */
function renderTopbar(conv) {
  if (!conv) {
    dom.topbarTitle.textContent = "";
    // Restore topbar model selector to settings default
    populateTopbarModelSelect(state.settings.model || "");
    _syncDropdownLabel(state.settings.model || "");
    return;
  }

  dom.topbarTitle.textContent = conv.title || "";
  // Set the topbar model selector to this conversation's model
  populateTopbarModelSelect(conv.model || "");
  _syncDropdownLabel(conv.model || "");
}

function _syncDropdownLabel(value) {
  dom.modelSelectorLabel.textContent = value || "Select model";
  dom.modelSelectorLabel.classList.toggle("placeholder", !value);
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Topbar Model Selector — change handler
    ═══════════════════════════════════════════════════════════════════════════ */
function onTopbarModelChange() {
  const newVal = dom.topbarModel.value;
  if (!newVal) return;

  if (state.activeConversationId) {
    // Update the active conversation's model immediately
    storage.updateConversation(state.activeConversationId, { model: newVal });
    // Refresh state
    state.conversations = storage.getConversations();
    renderConversationList();
  } else {
    // No active conversation — update settings default
    state.settings = storage.saveSettings({ model: newVal });
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Select Conversation
    ═══════════════════════════════════════════════════════════════════════════ */
async function selectConversation(id) {
  if (state.isLoading) return;

  state.activeConversationId = id;
  renderConversationList();
  closeConvContextMenu();

  try {
    const conv = storage.getConversation(id);
    if (!conv) throw new Error("Conversation not found");
    renderTopbar(conv);

    // Refresh topbar model select with this conversation's endpoint/key
    // so the list is up-to-date
    const ep = (conv.endpoint || "").trim();
    if (ep) {
      fetchAndPopulateModels(
        ep,
        conv.api_key || "",
        dom.topbarModel,
        conv.model || "",
      );
    } else {
      populateTopbarModelSelect(conv.model || "");
    }

    renderMessages(conv.messages);
    enableInput();
  } catch (err) {
    showToast("Failed to load conversation: " + err.message, "error");
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Create New Conversation
    ═══════════════════════════════════════════════════════════════════════════ */
async function createNewConversation() {
  const s = state.settings;

  if (!s.endpoint) {
    showToast("Set an API endpoint in Settings first", "error");
    openSettingsModal();
    return;
  }

  // Read model from the topbar selector (always visible)
  const model = dom.topbarModel.value || s.model || "";

  try {
    const newConv = storage.createConversation({
      title: "New Conversation",
      model,
      system_prompt: s.system_prompt || "",
      endpoint: s.endpoint,
      api_key: s.api_key || "",
      stream: s.stream || "false",
    });

    await loadConversations();
    await selectConversation(newConv.id);
    showToast("Conversation created", "success");
  } catch (err) {
    showToast("Failed to create conversation: " + err.message, "error");
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Edit Conversation Modal
    ═══════════════════════════════════════════════════════════════════════════ */
async function openEditConversationModal(id) {
  state.editingConvId = id;

  try {
    const conv = storage.getConversation(id);
    if (!conv) throw new Error("Conversation not found");

    dom.convEndpoint.value = conv.endpoint || "";
    dom.convApiKey.value = conv.api_key || "";
    dom.convTitle.value = conv.title || "";
    dom.convSystemPrompt.value = conv.system_prompt || "";
    dom.convStream.checked = conv.stream === "true" || conv.stream === true;

    const ep = conv.endpoint || "";
    if (ep) {
      fetchAndPopulateModels(
        ep,
        conv.api_key || "",
        dom.convModel,
        conv.model || "",
      );
    } else {
      populateModelSelect(dom.convModel, conv.model || "");
    }

    dom.modalConvTitle.textContent = "Edit Conversation";
    dom.btnConvSave.textContent = "Save Changes";
    dom.btnConvCancel.textContent = "Cancel";

    openModal(dom.modalConv);
    dom.convTitle.focus();
  } catch (err) {
    showToast("Failed to load conversation: " + err.message, "error");
  }
}

async function saveConversationModal() {
  const endpoint = dom.convEndpoint.value.trim();
  const model = dom.convModel.value.trim();
  const api_key = dom.convApiKey.value.trim();
  const title = dom.convTitle.value.trim() || "New Conversation";
  const system_prompt = dom.convSystemPrompt.value.trim();
  const stream = String(dom.convStream.checked);

  if (!endpoint) {
    showToast("API Endpoint is required", "error");
    dom.convEndpoint.focus();
    return;
  }
  if (!model) {
    showToast("Please select or add a model", "error");
    dom.convModel.focus();
    return;
  }

  try {
    dom.btnConvSave.disabled = true;

    storage.updateConversation(state.editingConvId, {
      title,
      model,
      system_prompt,
      endpoint,
      api_key,
      stream,
    });

    showToast("Conversation updated", "success");
    closeModal(dom.modalConv);
    await loadConversations();

    // If we edited the active conv, refresh topbar
    if (state.editingConvId === state.activeConversationId) {
      const refreshed = storage.getConversation(state.editingConvId);
      renderTopbar(refreshed);
    }
  } catch (err) {
    showToast("Error: " + err.message, "error");
  } finally {
    dom.btnConvSave.disabled = false;
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Send Message
    ═══════════════════════════════════════════════════════════════════════════ */
async function sendMessage() {
  const content = dom.messageInput.value.trim();
  if (!content || state.isLoading || !state.activeConversationId) return;

  const activeConv = state.conversations.find(
    (c) => c.id === state.activeConversationId,
  );
  const useStreaming =
    activeConv?.stream === "true" || activeConv?.stream === true;

  state.isLoading = true;
  disableInput();
  dom.messageInput.value = "";
  resetTextareaHeight();

  appendMessageBubble("user", content);
  appendThinkingBubble();
  scrollToBottom();

  try {
    if (useStreaming) {
      await sendMessageStreaming(content);
    } else {
      await sendMessageBlocking(content);
    }
    loadConversations();
  } catch (err) {
    removeThinkingBubble();
    const bubbles = dom.messages.querySelectorAll(".message--user");
    if (bubbles.length) bubbles[bubbles.length - 1].remove();
    showToast("Failed to send message: " + err.message, "error");
  } finally {
    state.isLoading = false;
    enableInput();
    dom.messageInput.focus();
  }
}

async function sendMessageBlocking(content) {
  const conv = storage.getConversation(state.activeConversationId);
  if (!conv) throw new Error("Conversation not found");

  storage.addMessage(state.activeConversationId, { role: "user", content });

  const history = storage.getMessages(state.activeConversationId);
  const llmMessages = [];
  if (conv.system_prompt && conv.system_prompt.trim()) {
    llmMessages.push({ role: "system", content: conv.system_prompt.trim() });
  }
  for (const msg of history) {
    llmMessages.push({ role: msg.role, content: msg.content });
  }

  const baseUrl = conv.endpoint.replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (conv.api_key && conv.api_key.trim()) {
    headers["Authorization"] = `Bearer ${conv.api_key.trim()}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: conv.model,
      messages: llmMessages,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Unexpected response format from LLM API");

  const assistantMessage = storage.addMessage(state.activeConversationId, {
    role: "assistant",
    content: reply,
  });

  removeThinkingBubble();
  appendMessageBubble(
    "assistant",
    assistantMessage.content,
    assistantMessage.created_at,
  );
  scrollToBottom();
}

async function sendMessageStreaming(content) {
  const conv = storage.getConversation(state.activeConversationId);
  if (!conv) throw new Error("Conversation not found");

  storage.addMessage(state.activeConversationId, { role: "user", content });

  const history = storage.getMessages(state.activeConversationId);
  const llmMessages = [];
  if (conv.system_prompt && conv.system_prompt.trim()) {
    llmMessages.push({ role: "system", content: conv.system_prompt.trim() });
  }
  for (const msg of history) {
    llmMessages.push({ role: msg.role, content: msg.content });
  }

  const headers = { "Content-Type": "application/json" };
  if (conv.api_key && conv.api_key.trim()) {
    headers["Authorization"] = `Bearer ${conv.api_key.trim()}`;
  }

  const baseUrl = conv.endpoint.replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;

  return new Promise((resolve, reject) => {
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: conv.model,
        messages: llmMessages,
        stream: true,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data?.error || `Request failed (${res.status})`);
        }

        removeThinkingBubble();
        const wrapper = appendMessageBubble("assistant", "");
        const bubble = wrapper.querySelector(".message__bubble");
        let fullContent = "";

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const raw = trimmed.slice(5).trim();
            if (raw === "[DONE]") break;

            let parsed;
            try {
              parsed = JSON.parse(raw);
            } catch {
              continue;
            }

            const token = parsed?.choices?.[0]?.delta?.content;
            if (token) {
              fullContent += token;
              bubble.innerHTML = formatMessageContent(fullContent);
              scrollToBottom();
            }
          }
        }

        if (fullContent.trim()) {
          storage.addMessage(state.activeConversationId, {
            role: "assistant",
            content: fullContent,
          });
        }

        scrollToBottom();
        resolve();
      })
      .catch(reject);
  });
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Load Data
    ═══════════════════════════════════════════════════════════════════════════ */
async function loadConversations() {
  try {
    state.conversations = storage.getConversations();
    renderConversationList();
  } catch (err) {
    showToast("Failed to load conversations: " + err.message, "error");
  }
}

async function loadSettings() {
  try {
    state.settings = storage.getSettings();
  } catch {
    state.settings = {};
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Settings Modal  (no model selector — model is in topbar)
    ═══════════════════════════════════════════════════════════════════════════ */
function openSettingsModal() {
  dom.settingsEndpoint.value = state.settings.endpoint || "";
  dom.settingsApiKey.value = state.settings.api_key || "";
  dom.settingsSystemPrompt.value = state.settings.system_prompt || "";
  dom.settingsStream.checked = state.settings.stream === "true";

  openModal(dom.modalSettings);
}

async function saveSettingsModal() {
  const endpoint = dom.settingsEndpoint.value.trim();
  const api_key = dom.settingsApiKey.value.trim();
  const system_prompt = dom.settingsSystemPrompt.value.trim();
  const stream = String(dom.settingsStream.checked);

  // Preserve the existing model value when saving settings
  const model = state.settings.model || dom.topbarModel.value || "";

  try {
    document.getElementById("btn-settings-save").disabled = true;
    state.settings = storage.saveSettings({
      endpoint,
      api_key,
      model,
      system_prompt,
      stream,
    });
    showToast("Settings saved", "success");
    closeModal(dom.modalSettings);

    // If topbar has no active conversation, refresh its model list from new endpoint
    if (!state.activeConversationId && endpoint) {
      fetchAndPopulateModels(endpoint, api_key, dom.topbarModel, model);
    }
  } catch (err) {
    showToast("Failed to save settings: " + err.message, "error");
  } finally {
    document.getElementById("btn-settings-save").disabled = false;
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Input Helpers
    ═══════════════════════════════════════════════════════════════════════════ */
function enableInput() {
  dom.messageInput.disabled = false;
  dom.btnSend.disabled = false;
}

function disableInput() {
  dom.messageInput.disabled = true;
  dom.btnSend.disabled = true;
}

function resetTextareaHeight() {
  dom.messageInput.style.height = "auto";
}

function showEmptyState() {
  dom.messages.innerHTML = `
    <div class="empty-state" id="empty-state">
      <div class="empty-state__icon">
        <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="8" width="40" height="30" rx="6" stroke="currentColor" stroke-width="2.5"/>
          <path d="M15 40l3-6h12l3 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="16" cy="23" r="2.5" fill="currentColor"/>
          <circle cx="24" cy="23" r="2.5" fill="currentColor"/>
          <circle cx="32" cy="23" r="2.5" fill="currentColor"/>
        </svg>
      </div>
      <h2>Start a conversation</h2>
      <p>Select a model above, then start chatting — or open an existing conversation from the sidebar.</p>
      <button class="btn btn--primary" id="btn-new-chat-2">New Conversation</button>
    </div>`;

  document
    .getElementById("btn-new-chat-2")
    .addEventListener("click", createNewConversation);
}

function scrollToBottom() {
  dom.messages.scrollTop = dom.messages.scrollHeight;
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Formatting Helpers
    ═══════════════════════════════════════════════════════════════════════════ */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMessageContent(content) {
  if (typeof marked === "undefined") {
    return escapeHtml(content).replace(/\n/g, "<br>");
  }
  return marked.parse(content, {
    breaks: true,
    gfm: true,
  });
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Event Listeners
    ═══════════════════════════════════════════════════════════════════════════ */
function bindEvents() {
  // Sidebar toggle
  document
    .getElementById("btn-toggle-sidebar")
    .addEventListener("click", () => {
      dom.sidebar.classList.toggle("collapsed");
    });

  // Theme toggle
  dom.btnThemeToggle.addEventListener("click", toggleTheme);

  // New conversation
  document
    .getElementById("btn-new-chat")
    .addEventListener("click", createNewConversation);

  const initialEmptyBtn = document.getElementById("btn-new-chat-2");
  if (initialEmptyBtn) {
    initialEmptyBtn.addEventListener("click", createNewConversation);
  }

  // ── Custom model selector dropdown ───────────────────────
  dom.modelSelectorTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dom.modelSelectorDropdown.classList.contains("open")) {
      closeCustomDropdown();
    } else {
      openCustomDropdown();
    }
  });

  dom.modelSelectorSearch.addEventListener("input", () => {
    renderCustomDropdown(dom.topbarModel.value, dom.modelSelectorSearch.value);
  });

  dom.modelSelectorSearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCustomDropdown();
      dom.modelSelectorTrigger.focus();
    }
  });

  // ── Topbar endpoint/key: when settings endpoint changes, refresh topbar models
  dom.settingsEndpoint.addEventListener("change", async () => {
    const ep = dom.settingsEndpoint.value.trim();
    if (!ep || state.activeConversationId) return;
    const currentModel = dom.topbarModel.value;
    await fetchAndPopulateModels(
      ep,
      dom.settingsApiKey.value.trim(),
      dom.topbarModel,
      currentModel,
    );
  });
  dom.settingsApiKey.addEventListener("change", async () => {
    const ep = dom.settingsEndpoint.value.trim();
    if (!ep || state.activeConversationId) return;
    const currentModel = dom.topbarModel.value;
    await fetchAndPopulateModels(
      ep,
      dom.settingsApiKey.value.trim(),
      dom.topbarModel,
      currentModel,
    );
  });

  // ── Edit Conversation modal ────────────────────────────────
  dom.btnConvSave.addEventListener("click", saveConversationModal);
  document
    .getElementById("btn-conv-cancel")
    .addEventListener("click", () => closeModal(dom.modalConv));
  document
    .getElementById("btn-close-conv-modal")
    .addEventListener("click", () => closeModal(dom.modalConv));

  // Re-fetch models when conv modal endpoint/key changes
  async function onConvEndpointOrKeyChange() {
    const ep = dom.convEndpoint.value.trim();
    if (!ep) return;
    const currentModel = dom.convModel.value;
    await fetchAndPopulateModels(
      ep,
      dom.convApiKey.value.trim(),
      dom.convModel,
      currentModel,
    );
  }
  dom.convEndpoint.addEventListener("change", onConvEndpointOrKeyChange);
  dom.convApiKey.addEventListener("change", onConvEndpointOrKeyChange);

  // ── Settings modal ─────────────────────────────────────────
  document
    .getElementById("btn-open-settings")
    .addEventListener("click", openSettingsModal);
  document
    .getElementById("btn-settings-save")
    .addEventListener("click", saveSettingsModal);
  document
    .getElementById("btn-settings-cancel")
    .addEventListener("click", () => closeModal(dom.modalSettings));
  document
    .getElementById("btn-close-settings-modal")
    .addEventListener("click", () => closeModal(dom.modalSettings));

  // ── Context menu actions ───────────────────────────────────
  dom.ctxRename.addEventListener("click", () => {
    if (state.contextMenuConvId) renameConversation(state.contextMenuConvId);
  });
  dom.ctxDuplicate.addEventListener("click", () => {
    if (state.contextMenuConvId) duplicateConversation(state.contextMenuConvId);
  });
  dom.ctxDelete.addEventListener("click", () => {
    if (state.contextMenuConvId) deleteConversation(state.contextMenuConvId);
  });

  // Close context menu when clicking outside
  document.addEventListener("click", (e) => {
    if (
      dom.convContextMenu.classList.contains("open") &&
      !dom.convContextMenu.contains(e.target) &&
      !e.target.closest(".conv-item__menu-btn")
    ) {
      closeConvContextMenu();
    }
    // Close custom model dropdown when clicking outside
    if (
      dom.modelSelectorDropdown.classList.contains("open") &&
      !dom.modelSelectorDropdown.contains(e.target) &&
      !dom.modelSelectorTrigger.contains(e.target)
    ) {
      closeCustomDropdown();
    }
  });

  // Close modals on overlay click
  dom.modalConv.addEventListener("click", (e) => {
    if (e.target === dom.modalConv) closeModal(dom.modalConv);
  });
  dom.modalSettings.addEventListener("click", (e) => {
    if (e.target === dom.modalSettings) closeModal(dom.modalSettings);
  });

  // Close modals on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal(dom.modalConv);
      closeModal(dom.modalSettings);
      closeConvContextMenu();
      closeCustomDropdown();
    }
  });

  // ── Send message ───────────────────────────────────────────
  dom.btnSend.addEventListener("click", sendMessage);
  dom.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  dom.messageInput.addEventListener("input", () => {
    dom.messageInput.style.height = "auto";
    dom.messageInput.style.height =
      Math.min(dom.messageInput.scrollHeight, 180) + "px";
  });
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Init
    ═══════════════════════════════════════════════════════════════════════════ */
async function init() {
  initTheme();
  loadModels();
  bindEvents();
  await loadSettings();
  await loadConversations();

  // Populate the topbar model selector on load
  // If no active conversation, use settings default and try to fetch from endpoint
  const ep = state.settings.endpoint || "";
  if (ep) {
    fetchAndPopulateModels(
      ep,
      state.settings.api_key || "",
      dom.topbarModel,
      state.settings.model || "",
    );
  } else {
    populateTopbarModelSelect(state.settings.model || "");
  }
}

init();
