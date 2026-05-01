/*  ═══════════════════════════════════════════════════════════════════════════
    State
    ═══════════════════════════════════════════════════════════════════════════ */
const state = {
  conversations: [],
  activeConversationId: null,
  settings: {},
  isLoading: false,
  editingConvId: null, // null = n/a, number = editing existing conv
  models: [], // persisted model list
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
  topbarMeta: document.getElementById("topbar-meta"),
  btnDeleteChat: document.getElementById("btn-delete-chat"),
  // Input bar
  messageInput: document.getElementById("message-input"),
  btnSend: document.getElementById("btn-send"),
  // Edit Conversation modal (only used for editing existing convs now)
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
  // Settings modal
  modalSettings: document.getElementById("modal-settings"),
  settingsEndpoint: document.getElementById("settings-endpoint"),
  settingsApiKey: document.getElementById("settings-api-key"),
  settingsModel: document.getElementById("settings-model"),
  settingsSystemPrompt: document.getElementById("settings-system-prompt"),
  settingsStream: document.getElementById("settings-stream"),
  // Model management inside settings
  btnAddModel: document.getElementById("btn-add-model"),
  addModelRow: document.getElementById("add-model-row"),
  newModelName: document.getElementById("new-model-name"),
  btnConfirmAddModel: document.getElementById("btn-confirm-add-model"),
  btnCancelAddModel: document.getElementById("btn-cancel-add-model"),
  // Theme toggle
  btnThemeToggle: document.getElementById("btn-theme-toggle"),
  // Toast
  toast: document.getElementById("toast"),
};

/*  ═══════════════════════════════════════════════════════════════════════════
    API Helpers
    ═══════════════════════════════════════════════════════════════════════════ */
const api = {
  async request(method, path, body = null) {
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`/api${path}`, opts);
    if (res.status === 204) return null;

    const data = await res.json();
    if (!res.ok)
      throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
  },

  getConversations: () => api.request("GET", "/conversations"),
  getConversation: (id) => api.request("GET", `/conversations/${id}`),
  createConversation: (body) => api.request("POST", "/conversations", body),
  updateConversation: (id, body) =>
    api.request("PATCH", `/conversations/${id}`, body),
  deleteConversation: (id) => api.request("DELETE", `/conversations/${id}`),
  sendMessage: (id, content) =>
    api.request("POST", `/conversations/${id}/messages`, { content }),
  getSettings: () => api.request("GET", "/settings"),
  saveSettings: (body) => api.request("POST", "/settings", body),
};

/*  ═══════════════════════════════════════════════════════════════════════════
    Theme
    ═══════════════════════════════════════════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);

  // Unlock smooth transitions after initial paint (avoids flash)
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

// Built-in fallback models
const DEFAULT_MODELS = [
  "claude-sonnet-4.6",
  "claude-opus-4.6",
  "claude-opus-4.7",
];

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
  if (state.models.includes(name)) return false; // already exists
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
 * Returns an array of model id strings, sorted alphabetically.
 * Returns null if the fetch fails or the endpoint is empty.
 */
async function fetchModels(endpoint, apiKey) {
  if (!endpoint) return null;

  // Normalise: strip trailing slash, then append /models
  const base = endpoint.replace(/\/+$/, "");
  const url = `${base}/models`;

  try {
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) return null;

    const data = await res.json();
    // Standard OpenAI shape: { data: [ { id, ... }, ... ] }
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
 * Shows a loading indicator while fetching and toasts an error if it fails.
 * `selectEl`       – the <select> element to populate
 * `currentModel`   – the model id that should be pre-selected after loading
 * `onDone`         – optional callback(models) called after a successful fetch
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

  // Show a temporary loading option
  selectEl.innerHTML = "";
  const loading = document.createElement("option");
  loading.textContent = "Loading models…";
  loading.disabled = true;
  loading.selected = true;
  selectEl.appendChild(loading);

  const models = await fetchModels(endpoint, (apiKey || "").trim());

  if (models && models.length) {
    // Replace the shared in-memory list so both modals stay in sync
    state.models = models;
    saveModels();
    populateModelSelect(selectEl, currentModel);
    if (onDone) onDone(models);
  } else {
    // Restore whatever was in the list before
    populateModelSelect(selectEl, currentModel);
    showToast("Could not fetch models from endpoint", "error");
  }
}

/**
 * Populate a <select> element with the current model list.
 * If `selectedValue` is provided, that option is pre-selected;
 * otherwise the first option is selected.
 * A placeholder "— select model —" option is prepended.
 */
function populateModelSelect(selectEl, selectedValue = "") {
  selectEl.innerHTML = "";

  // Placeholder
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

  // If selectedValue isn't in the list (e.g. an old conversation has an
  // unlisted model), add it as a one-off option so it isn't lost.
  if (selectedValue && !state.models.includes(selectedValue)) {
    const opt = document.createElement("option");
    opt.value = selectedValue;
    opt.textContent = selectedValue + " (custom)";
    opt.selected = true;
    selectEl.insertBefore(opt, selectEl.children[1]); // after placeholder
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Render: Conversation List
    ═══════════════════════════════════════════════════════════════════════════ */
function renderConversationList() {
  dom.convList.innerHTML = "";

  if (state.conversations.length === 0) {
    dom.convList.innerHTML = `<p style="padding:16px;font-size:0.8rem;color:var(--clr-text-muted);text-align:center;">
        No conversations yet
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
      <button class="btn btn--icon conv-item__edit" data-id="${conv.id}" title="Edit conversation">
        ✏
      </button>
    `;

    item.addEventListener("click", (e) => {
      if (e.target.closest(".conv-item__edit")) return;
      selectConversation(conv.id);
    });

    item.querySelector(".conv-item__edit").addEventListener("click", (e) => {
      e.stopPropagation();
      openEditConversationModal(conv.id);
    });

    dom.convList.appendChild(item);
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
        <div class="empty-state__icon">💬</div>
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

  wrapper.innerHTML = `
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
    dom.topbarMeta.innerHTML = "";
    dom.btnDeleteChat.style.display = "none";
    return;
  }

  dom.topbarMeta.innerHTML = `
    <div class="topbar__title">${escapeHtml(conv.title)}</div>
    <div class="topbar__model">${escapeHtml(conv.model || "No model set")}</div>
  `;
  dom.btnDeleteChat.style.display = "flex";
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Select Conversation
    ═══════════════════════════════════════════════════════════════════════════ */
async function selectConversation(id) {
  if (state.isLoading) return;

  state.activeConversationId = id;
  renderConversationList();

  try {
    const conv = await api.getConversation(id);
    renderTopbar(conv);
    renderMessages(conv.messages);
    enableInput();
  } catch (err) {
    showToast("Failed to load conversation: " + err.message, "error");
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Instant New Conversation  (no modal — uses global settings)
    ═══════════════════════════════════════════════════════════════════════════ */
async function createNewConversation() {
  const s = state.settings;

  // Guard: need at least an endpoint configured
  if (!s.endpoint) {
    showToast("Set an API endpoint in Settings first", "error");
    openSettingsModal();
    return;
  }

  try {
    const newConv = await api.createConversation({
      title: "New Conversation",
      model: s.model || "",
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
    const conv = await api.getConversation(id);

    dom.convEndpoint.value = conv.endpoint || "";
    dom.convApiKey.value = conv.api_key || "";
    dom.convTitle.value = conv.title || "";
    dom.convSystemPrompt.value = conv.system_prompt || "";
    dom.convStream.checked = conv.stream === "true" || conv.stream === true;

    // Try to fetch live models; fall back to cached list
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

    await api.updateConversation(state.editingConvId, {
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

    if (state.editingConvId === state.activeConversationId) {
      const refreshed = await api.getConversation(state.editingConvId);
      renderTopbar(refreshed);
    }
  } catch (err) {
    showToast("Error: " + err.message, "error");
  } finally {
    dom.btnConvSave.disabled = false;
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Delete Conversation
    ═══════════════════════════════════════════════════════════════════════════ */
async function deleteActiveConversation() {
  if (!state.activeConversationId) return;

  const conv = state.conversations.find(
    (c) => c.id === state.activeConversationId,
  );
  const name = conv ? `"${conv.title}"` : "this conversation";

  if (!confirm(`Delete ${name}? This cannot be undone.`)) return;

  try {
    await api.deleteConversation(state.activeConversationId);
    state.activeConversationId = null;
    renderTopbar(null);
    disableInput();
    dom.messages.innerHTML = "";
    showEmptyState();
    showToast("Conversation deleted", "success");
    await loadConversations();
  } catch (err) {
    showToast("Failed to delete: " + err.message, "error");
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
    await loadConversations();
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
  const result = await api.sendMessage(state.activeConversationId, content);
  removeThinkingBubble();
  appendMessageBubble(
    "assistant",
    result.assistant_message.content,
    result.assistant_message.created_at,
  );
  scrollToBottom();
}

async function sendMessageStreaming(content) {
  return new Promise((resolve, reject) => {
    const url = `/api/conversations/${state.activeConversationId}/messages?stream=true`;

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
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
            if (trimmed.startsWith("event:")) continue;

            if (trimmed.startsWith("data:")) {
              const raw = trimmed.slice(5).trim();
              let parsed;
              try {
                parsed = JSON.parse(raw);
              } catch {
                continue;
              }

              if (parsed.token) {
                fullContent += parsed.token;
                bubble.innerHTML = formatMessageContent(fullContent);
                scrollToBottom();
              }
              if (parsed.error) throw new Error(parsed.error);
            }
          }
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
    state.conversations = await api.getConversations();
    renderConversationList();
  } catch (err) {
    showToast("Failed to load conversations: " + err.message, "error");
  }
}

async function loadSettings() {
  try {
    state.settings = await api.getSettings();
  } catch {
    state.settings = {};
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Settings Modal
    ═══════════════════════════════════════════════════════════════════════════ */
function openSettingsModal() {
  dom.settingsEndpoint.value = state.settings.endpoint || "";
  dom.settingsApiKey.value = state.settings.api_key || "";
  dom.settingsSystemPrompt.value = state.settings.system_prompt || "";
  dom.settingsStream.checked = state.settings.stream === "true";

  // If there is a saved endpoint, try to fetch live models; otherwise fall
  // back to whatever is already in state.models.
  const ep = state.settings.endpoint || "";
  if (ep) {
    fetchAndPopulateModels(
      ep,
      state.settings.api_key || "",
      dom.settingsModel,
      state.settings.model || "",
    );
  } else {
    populateModelSelect(dom.settingsModel, state.settings.model || "");
  }

  // Hide the add-model row if it was left open
  dom.addModelRow.style.display = "none";
  dom.newModelName.value = "";

  openModal(dom.modalSettings);
}

async function saveSettingsModal() {
  const endpoint = dom.settingsEndpoint.value.trim();
  const api_key = dom.settingsApiKey.value.trim();
  const model = dom.settingsModel.value.trim();
  const system_prompt = dom.settingsSystemPrompt.value.trim();
  const stream = String(dom.settingsStream.checked);

  try {
    document.getElementById("btn-settings-save").disabled = true;
    state.settings = await api.saveSettings({
      endpoint,
      api_key,
      model,
      system_prompt,
      stream,
    });
    showToast("Settings saved", "success");
    closeModal(dom.modalSettings);
  } catch (err) {
    showToast("Failed to save settings: " + err.message, "error");
  } finally {
    document.getElementById("btn-settings-save").disabled = false;
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Custom Model Management (inside Settings modal)
    ═══════════════════════════════════════════════════════════════════════════ */
function showAddModelRow() {
  dom.addModelRow.style.display = "flex";
  dom.newModelName.value = "";
  dom.newModelName.focus();
}

function hideAddModelRow() {
  dom.addModelRow.style.display = "none";
  dom.newModelName.value = "";
}

function confirmAddModel() {
  const name = dom.newModelName.value.trim();
  if (!name) {
    showToast("Model name cannot be empty", "error");
    dom.newModelName.focus();
    return;
  }

  const added = addModel(name);
  if (!added) {
    showToast(`"${name}" is already in the list`, "error");
    return;
  }

  // Refresh both dropdowns and select the new model in settings
  populateModelSelect(dom.settingsModel, name);
  hideAddModelRow();
  showToast(`Model "${name}" added`, "success");
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
      <h2>Welcome to LLM WebUI</h2>
      <p>Start a new conversation or select one from the sidebar.</p>
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
    // Fallback: plain escaping with newlines if marked hasn't loaded yet
    return escapeHtml(content).replace(/\n/g, "<br>");
  }

  return marked.parse(content, {
    breaks: true, // single newline → <br> inside paragraphs
    gfm: true, // GitHub-Flavoured Markdown (tables, strikethrough, etc.)
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

  // New conversation (instant — no modal)
  document
    .getElementById("btn-new-chat")
    .addEventListener("click", createNewConversation);
  // The btn-new-chat-2 inside empty-state is bound dynamically in showEmptyState()
  // but also bind the initial one present in the HTML
  const initialEmptyBtn = document.getElementById("btn-new-chat-2");
  if (initialEmptyBtn) {
    initialEmptyBtn.addEventListener("click", createNewConversation);
  }

  // Delete conversation
  dom.btnDeleteChat.addEventListener("click", deleteActiveConversation);

  // Edit Conversation modal
  dom.btnConvSave.addEventListener("click", saveConversationModal);
  document
    .getElementById("btn-conv-cancel")
    .addEventListener("click", () => closeModal(dom.modalConv));
  document
    .getElementById("btn-close-conv-modal")
    .addEventListener("click", () => closeModal(dom.modalConv));

  // Settings modal
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

  // Re-fetch models when the endpoint or API key changes in the Settings modal
  async function onSettingsEndpointOrKeyChange() {
    const ep = dom.settingsEndpoint.value.trim();
    if (!ep) return;
    const currentModel = dom.settingsModel.value;
    await fetchAndPopulateModels(
      ep,
      dom.settingsApiKey.value.trim(),
      dom.settingsModel,
      currentModel,
    );
  }
  dom.settingsEndpoint.addEventListener(
    "change",
    onSettingsEndpointOrKeyChange,
  );
  dom.settingsApiKey.addEventListener("change", onSettingsEndpointOrKeyChange);

  // Re-fetch models when the endpoint or API key changes in the Conv modal
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

  // Add custom model flow
  dom.btnAddModel.addEventListener("click", showAddModelRow);
  dom.btnConfirmAddModel.addEventListener("click", confirmAddModel);
  dom.btnCancelAddModel.addEventListener("click", hideAddModelRow);
  dom.newModelName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmAddModel();
    }
    if (e.key === "Escape") hideAddModelRow();
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
    }
  });

  // Send message
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
      Math.min(dom.messageInput.scrollHeight, 160) + "px";
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
}
init();
