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
  pendingAttachments: [], // { type: 'image'|'text', name, mimeType, dataUrl } — in-memory only
  abortController: null,
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
  modelSelectorIcon: document.getElementById("model-selector-icon"),
  modelSelectorSearch: document.getElementById("model-selector-search"),
  modelSelectorList: document.getElementById("model-selector-list"),
  modelSelectorFilters: document.getElementById("model-selector-filters"),
  // Input bar
  messageInput: document.getElementById("message-input"),
  btnSend: document.getElementById("btn-send"),
  btnStop: document.getElementById("btn-stop"),
  btnUpload: document.getElementById("btn-attach-file"),
  fileUploadInput: document.getElementById("file-upload-input"),
  attachmentPreview: document.getElementById("attachment-preview"),
  // Edit Conversation modal
  modalConv: document.getElementById("modal-conversation"),
  modalConvTitle: document.getElementById("modal-conv-title"),
  convEndpointPreset: document.getElementById("conv-endpoint-preset"),
  convModeText: document.getElementById("conv-mode-text"),
  convModeImage: document.getElementById("conv-mode-image"),
  convEndpoint: document.getElementById("conv-endpoint"),
  convApiKey: document.getElementById("conv-api-key"),
  convModel: document.getElementById("conv-model"),
  convTitle: document.getElementById("conv-title"),
  convSystemPrompt: document.getElementById("conv-system-prompt"),
  convTemperature: document.getElementById("conv-temperature"),
  convTopP: document.getElementById("conv-top-p"),
  convStream: document.getElementById("conv-stream"),
  btnConvSave: document.getElementById("btn-conv-save"),
  btnConvCancel: document.getElementById("btn-conv-cancel"),
  // Settings modal (no model selector here anymore)
  modalSettings: document.getElementById("modal-settings"),
  settingsEndpointPreset: document.getElementById("settings-endpoint-preset"),
  settingsEndpoint: document.getElementById("settings-endpoint"),
  settingsApiKey: document.getElementById("settings-api-key"),
  settingsSystemPrompt: document.getElementById("settings-system-prompt"),
  settingsTemperature: document.getElementById("settings-temperature"),
  settingsTopP: document.getElementById("settings-top-p"),
  settingsStream: document.getElementById("settings-stream"),
  // Plus menu
  btnPlus: document.getElementById("btn-plus"),
  plusMenu: document.getElementById("plus-menu"),
  btnGenerateImage: document.getElementById("btn-generate-image"),
  // Context menu (3-dot)
  convContextMenu: document.getElementById("conv-context-menu"),
  ctxRename: document.getElementById("ctx-rename"),
  ctxDuplicate: document.getElementById("ctx-duplicate"),
  ctxDelete: document.getElementById("ctx-delete"),
  // Theme toggle
  btnThemeToggle: document.getElementById("btn-theme-toggle"),
  // Sidebar backdrop
  sidebarBackdrop: document.getElementById("sidebar-backdrop"),
  // Toast
  toast: document.getElementById("toast"),
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
  const duration = type === "error" ? 8000 : 3000;
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove("show");
  }, duration);
}

/**
 * Extracts a human-readable error message from an API response body.
 * Handles common formats: { error: "str" }, { error: { message } }, { message }
 */
function extractApiError(data, status) {
  if (data?.error) {
    if (typeof data.error === "string") return data.error;
    if (typeof data.error.message === "string") return data.error.message;
    try {
      return JSON.stringify(data.error);
    } catch {
      return String(data.error);
    }
  }
  if (typeof data?.message === "string") return data.message;
  return `Request failed (${status})`;
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
    Render: Topbar
    ═══════════════════════════════════════════════════════════════════════════ */
function renderTopbar(conv) {
  if (!conv) {
    dom.topbarTitle.querySelector(".topbar__title-text").textContent = "";
    dom.topbarTitle.style.display = "none";
    // Restore topbar model selector to settings default
    populateTopbarModelSelect(state.settings.model || "");
    _syncDropdownLabel(state.settings.model || "");
    return;
  }

  dom.topbarTitle.querySelector(".topbar__title-text").textContent =
    conv.title || "";
  dom.topbarTitle.style.display = conv.title || "" ? "flex" : "none";
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

  // Auto-close sidebar on mobile after selecting a conversation
  if (
    window.innerWidth <= 768 &&
    !dom.sidebar.classList.contains("collapsed")
  ) {
    dom.sidebar.classList.add("collapsed");
    dom.sidebarBackdrop.classList.remove("active");
  }

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
        resolveApiKey(conv),
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
      temperature: s.temperature !== undefined ? s.temperature : "",
      top_p: s.top_p !== undefined ? s.top_p : "",
      endpoint: s.endpoint,
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

    const {
      preset: convPreset,
      mode: convMode,
      customUrl: convCustomUrl,
    } = parseEndpointPreset(conv.endpoint || "");
    applyEndpointUi(
      {
        presetEl: dom.convEndpointPreset,
        customEl: dom.convEndpoint,
        modeBtns: [dom.convModeText, dom.convModeImage],
      },
      convPreset,
      convMode,
      convCustomUrl,
    );
    // Show a placeholder indicating whether a key is already stored for this preset.
    const { preset: convEditPreset } = parseEndpointPreset(conv.endpoint || "");
    const storedKeyForPreset =
      (state.settings.api_keys || {})[convEditPreset] ||
      state.settings.api_key ||
      "";
    dom.convApiKey.value = "";
    dom.convApiKey.placeholder = storedKeyForPreset
      ? "Stored \u2713 \u2014 paste to replace"
      : "sk-\u2026 (leave empty for local models)";
    dom.convTitle.value = conv.title || "";
    dom.convSystemPrompt.value = conv.system_prompt || "";
    dom.convTemperature.value =
      conv.temperature !== undefined && conv.temperature !== ""
        ? conv.temperature
        : "";
    dom.convTopP.value =
      conv.top_p !== undefined && conv.top_p !== "" ? conv.top_p : "";
    dom.convStream.checked = conv.stream === "true" || conv.stream === true;

    const ep = conv.endpoint || "";
    if (ep) {
      fetchAndPopulateModels(
        ep,
        resolveApiKey(conv),
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
  const convActiveMode =
    [dom.convModeText, dom.convModeImage].find((b) =>
      b.classList.contains("mode-btn--active"),
    )?.dataset.mode || "text";
  const endpoint = buildEndpointUrl(
    dom.convEndpointPreset.value,
    convActiveMode,
    dom.convEndpoint.value,
  );
  const model = dom.convModel.value.trim();
  const title = dom.convTitle.value.trim() || "New Conversation";
  const system_prompt = dom.convSystemPrompt.value.trim();
  const temperatureRaw = dom.convTemperature.value;
  const temperature = temperatureRaw !== "" ? parseFloat(temperatureRaw) : "";
  const topPRaw = dom.convTopP.value;
  const top_p = topPRaw !== "" ? parseFloat(topPRaw) : "";
  const stream = String(dom.convStream.checked);

  if (!endpoint) {
    showToast("API Endpoint is required", "error");
    if (dom.convEndpointPreset.value === "custom") {
      dom.convEndpoint.focus();
    } else {
      dom.convEndpointPreset.focus();
    }
    return;
  }
  if (!model) {
    showToast("Please select or add a model", "error");
    dom.convModel.focus();
    return;
  }

  try {
    dom.btnConvSave.disabled = true;

    // If the user typed a new key for a custom endpoint, persist it into
    // settings.api_keys so it is available at runtime like any other preset.
    const typedKey = dom.convApiKey.value.trim();
    if (typedKey) {
      const { preset: convSavePreset } = parseEndpointPreset(endpoint);
      const api_keys = { ...(state.settings.api_keys || {}) };
      api_keys[convSavePreset] = typedKey;
      state.settings = storage.saveSettings({ api_keys });
    }

    storage.updateConversation(state.editingConvId, {
      title,
      model,
      system_prompt,
      temperature,
      top_p,
      endpoint,
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
  const content = getEditorText().trim();
  if (!content || state.isLoading || !state.activeConversationId) return;

  clearEditor();

  // Capture and clear pending attachments before dispatching
  const attachments = [...state.pendingAttachments];
  state.pendingAttachments = [];
  renderAttachmentPreview();

  await dispatchSend(content, attachments);
}

async function dispatchSend(content, attachments = []) {
  if (!content || state.isLoading || !state.activeConversationId) return;

  const activeConv = state.conversations.find(
    (c) => c.id === state.activeConversationId,
  );
  const useStreaming =
    activeConv?.stream === "true" || activeConv?.stream === true;

  state.isLoading = true;
  state.abortController = new AbortController();
  disableInput();
  showStopButton();

  const hasGenerateImage = attachments.some((a) => a.type === "generate-image");
  const imageAttachments = attachments.filter((a) => a.type === "image");
  const textAttachments = attachments.filter((a) => a.type === "text");
  const userWrapper = appendMessageBubble(
    "user",
    content,
    null,
    null,
    imageAttachments,
    textAttachments,
    hasGenerateImage,
  );

  // Save user message to storage before the fetch
  const userMsg = storage.addMessage(state.activeConversationId, {
    role: "user",
    content,
    attachments: attachments.length > 0 ? attachments : undefined,
  });
  addMessageActions(userWrapper, "user", userMsg.id);

  appendThinkingBubble();
  scrollToBottom();

  try {
    if (hasGenerateImage) {
      await sendImageGeneration(content, userWrapper, attachments, userMsg.id);
    } else if (useStreaming) {
      await sendMessageStreaming(content, userWrapper, attachments, userMsg.id);
    } else {
      await sendMessageBlocking(content, userWrapper, attachments, userMsg.id);
    }
    loadConversations();
  } catch (err) {
    removeThinkingBubble();
    if (err.name === "AbortError") {
      showToast("Generation stopped.", "info");
    } else {
      if (err.status == 401) {
        showToast(
          "Unauthorized. The API key is missing or not valid.",
          "error",
        );
        return;
      } else if (err.status == 403) {
        showToast(
          "Forbidden. You do not have permission to access this resource.",
          "error",
        );
        return;
      } else if (err.status == 404) {
        showToast("Not found. The requested resource does not exist.", "error");
        return;
      } else if (err.status == 429) {
        showToast(
          "Too many requests. You have exceeded the rate limit.",
          "error",
        );
        return;
      } else if (err.status == 500) {
        showToast(
          "Internal server error. Something went wrong on the server.",
          "error",
        );
        return;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg == "") showToast("Failed: " + errMsg, "error");
    }
  } finally {
    state.isLoading = false;
    state.abortController = null;
    hideStopButton();
    enableInput();
    dom.messageInput.focus();
  }
}

function getEditorText() {
  const el = dom.messageInput;
  let text = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.nodeName === "BR") {
        text += "\n";
      } else if (
        node.classList &&
        node.classList.contains("input-code-block")
      ) {
        const lang = node.dataset.lang || "";
        const code = node.dataset.code || "";
        text += "```" + lang + "\n" + code + "\n" + "```";
      } else if (node.nodeName === "DIV") {
        const inner = node.innerHTML === "<br>" ? "" : node.innerText;
        text += "\n" + inner;
      } else {
        text += node.innerText || node.textContent || "";
      }
    }
  }
  return text;
}

function clearEditor() {
  dom.messageInput.innerHTML = "";
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
    Input Helpers
    ═══════════════════════════════════════════════════════════════════════════ */
function enableInput() {
  dom.messageInput.contentEditable = "true";
  dom.btnSend.disabled = false;
  if (dom.btnPlus) dom.btnPlus.disabled = false;
}

function disableInput() {
  dom.messageInput.contentEditable = "false";
  dom.btnSend.disabled = true;
  if (dom.btnPlus) dom.btnPlus.disabled = true;
}

function showStopButton() {
  dom.btnSend.style.display = "none";
  dom.btnStop.style.display = "flex";
}

function hideStopButton() {
  dom.btnStop.style.display = "none";
  dom.btnSend.style.display = "flex";
}

function resetTextareaHeight() {}

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
/**
 * Resolve the API key for a conversation at runtime from settings,
 * so it is never persisted on the conversation object itself.
 */
function resolveApiKey(conv) {
  const { preset } = parseEndpointPreset(conv.endpoint || "");
  const api_keys = state.settings.api_keys || {};
  return api_keys[preset] || state.settings.api_key || "";
}

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
  const raw = marked.parse(content, {
    breaks: true,
    gfm: true,
  });
  const sanitized =
    typeof DOMPurify !== "undefined" ? DOMPurify.sanitize(raw) : raw;
  const wrapped = sanitized.replace(
    /<pre><code(?: class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) => {
      const decoded = code
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
      const langLabel = lang || "";
      return `<div class="code-block-wrapper">
  <div class="code-block__header">
    <span class="code-block__lang">${escapeHtml(langLabel)}</span>
    <button class="code-block__copy-btn" title="Copy code">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="8" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
  </div>
  <pre><code class="${escapeHtml(langLabel ? `language-${langLabel}` : "")}">${code}</code></pre>
</div>`;
    },
  );
  return wrapped;
}

async function downloadGeneratedImage(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = blob.type.includes("png")
      ? "png"
      : blob.type.includes("webp")
        ? "webp"
        : "jpg";
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `generated-image.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch {
    window.open(url, "_blank");
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Event Listeners
    ═══════════════════════════════════════════════════════════════════════════ */
function bindEvents() {
  // Sidebar toggle
  document
    .getElementById("btn-toggle-sidebar")
    .addEventListener("click", () => {
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        const isOpen = !dom.sidebar.classList.contains("collapsed");
        if (isOpen) {
          // Close sidebar
          dom.sidebar.classList.add("collapsed");
          dom.sidebarBackdrop.classList.remove("active");
        } else {
          // Open sidebar
          dom.sidebar.classList.remove("collapsed");
          dom.sidebarBackdrop.classList.add("active");
        }
      } else {
        dom.sidebar.classList.toggle("collapsed");
      }
    });

  // Topbar hamburger — open sidebar on mobile
  const btnTopbarMenu = document.getElementById("btn-topbar-menu");
  if (btnTopbarMenu) {
    btnTopbarMenu.addEventListener("click", () => {
      dom.sidebar.classList.remove("collapsed");
      dom.sidebarBackdrop.classList.add("active");
    });
  }

  // Sidebar backdrop click — close sidebar on mobile
  dom.sidebarBackdrop.addEventListener("click", () => {
    dom.sidebar.classList.add("collapsed");
    dom.sidebarBackdrop.classList.remove("active");
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

  // ── Settings endpoint custom select ───────────────────────
  const settingsCsel = document.getElementById("settings-endpoint-csel");
  const settingsCselTrigger = settingsCsel?.querySelector(".csel__trigger");

  function openSettingsCsel() {
    settingsCsel.classList.add("open");
    settingsCselTrigger.setAttribute("aria-expanded", "true");
  }
  function closeSettingsCsel() {
    settingsCsel.classList.remove("open");
    settingsCselTrigger.setAttribute("aria-expanded", "false");
  }

  if (settingsCsel) {
    settingsCselTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      settingsCsel.classList.contains("open")
        ? closeSettingsCsel()
        : openSettingsCsel();
    });

    settingsCsel.querySelectorAll(".csel__option").forEach((opt) => {
      opt.addEventListener("click", () => {
        const value = opt.dataset.value;
        // Update visual state
        settingsCsel
          .querySelectorAll(".csel__option")
          .forEach((o) => o.classList.remove("csel__option--active"));
        opt.classList.add("csel__option--active");
        settingsCsel.querySelector(".csel__label").textContent =
          opt.textContent.trim();
        // Sync hidden select + fire change so initEndpointControls reacts
        dom.settingsEndpointPreset.value = value;
        dom.settingsEndpointPreset.dispatchEvent(new Event("change"));
        closeSettingsCsel();
      });
    });
  }

  // ── Settings modal: wire endpoint preset + mode toggle ────
  // No live model-fetch here — models are refreshed on Save Settings.
  initEndpointControls(
    {
      presetEl: dom.settingsEndpointPreset,
      customEl: dom.settingsEndpoint,
      modeBtns: [],
    },
    () => {},
  );
  // Update API key placeholder whenever the settings preset changes.
  dom.settingsEndpointPreset.addEventListener(
    "change",
    updateSettingsApiKeyPlaceholder,
  );

  // ── Edit Conversation modal ────────────────────────────────
  dom.btnConvSave.addEventListener("click", saveConversationModal);
  document
    .getElementById("btn-conv-cancel")
    .addEventListener("click", () => closeModal(dom.modalConv));
  document
    .getElementById("btn-close-conv-modal")
    .addEventListener("click", () => closeModal(dom.modalConv));

  // Re-fetch models when conv modal endpoint preset / mode / key changes
  async function onConvEndpointOrKeyChange() {
    const activeMode =
      [dom.convModeText, dom.convModeImage].find((b) =>
        b.classList.contains("mode-btn--active"),
      )?.dataset.mode || "text";
    const ep = buildEndpointUrl(
      dom.convEndpointPreset.value,
      activeMode,
      dom.convEndpoint.value,
    );
    if (!ep) return;
    const currentModel = dom.convModel.value;
    // Use the typed key; fall back to the stored key kept in data-stored-key.
    const convKey =
      dom.convApiKey.value.trim() || dom.convApiKey.dataset.storedKey || "";
    await fetchAndPopulateModels(ep, convKey, dom.convModel, currentModel);
  }
  initEndpointControls(
    {
      presetEl: dom.convEndpointPreset,
      customEl: dom.convEndpoint,
      modeBtns: [dom.convModeText, dom.convModeImage],
    },
    onConvEndpointOrKeyChange,
  );
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
  document
    .getElementById("btn-settings-clear-storage")
    .addEventListener("click", clearLocalStorage);
  initClearKeysModal();

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
    // Close plus menu when clicking outside
    if (
      dom.plusMenu &&
      dom.plusMenu.classList.contains("open") &&
      !dom.plusMenu.contains(e.target) &&
      e.target !== dom.btnPlus &&
      !dom.btnPlus.contains(e.target)
    ) {
      closePlusMenu();
    }
    // Close settings custom select when clicking outside
    if (
      settingsCsel &&
      settingsCsel.classList.contains("open") &&
      !settingsCsel.contains(e.target)
    ) {
      closeSettingsCsel();
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
      closePlusMenu();
      closeSettingsCsel();
    }
  });

  // ── Send message ──────────────────────────────────────────────
  dom.btnSend.addEventListener("click", sendMessage);
  dom.btnStop.addEventListener("click", () => {
    if (state.abortController) state.abortController.abort();
  });

  dom.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }

    if (e.key === "Enter" && e.shiftKey) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const container = range.startContainer;
      const offset = range.startOffset;
      const lineText = getCaretLineText(container, offset);

      if (lineText.trim() === "```" || /^```\S*$/.test(lineText.trim())) {
        e.preventDefault();
        insertCodeBlock(range, lineText.trim().slice(3));
      }
    }

    if (e.key === "Backspace") {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) {
        const node = range.startContainer;
        const prev =
          node.previousSibling ||
          (node.parentNode !== dom.messageInput
            ? node.parentNode.previousSibling
            : null);
        if (
          prev &&
          prev.classList &&
          prev.classList.contains("input-code-block")
        ) {
          e.preventDefault();
          prev.remove();
        }
      }
    }
  });

  dom.messageInput.addEventListener("input", () => {
    collapseCompletedFences();
  });

  dom.messageInput.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".input-code-block__remove");
    if (removeBtn) {
      const block = removeBtn.closest(".input-code-block");
      if (block) {
        const rawText =
          "```" +
          (block.dataset.lang || "") +
          "\n" +
          (block.dataset.code || "") +
          "\n```";
        const textNode = document.createTextNode(rawText);
        block.replaceWith(textNode);
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStartAfter(textNode);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
  });

  function getCaretLineText(container, offset) {
    let text = "";
    if (container.nodeType === Node.TEXT_NODE) {
      text = container.textContent.slice(0, offset);
    }
    const newlineIdx = text.lastIndexOf("\n");
    return newlineIdx === -1 ? text : text.slice(newlineIdx + 1);
  }

  function insertCodeBlock(range, lang) {
    const container = range.startContainer;
    const offset = range.startOffset;

    if (container.nodeType !== Node.TEXT_NODE) {
      const br = document.createElement("br");
      range.insertNode(br);
      return;
    }

    const fullText = container.textContent;
    const lineStart = fullText.lastIndexOf("\n", offset - 1) + 1;
    const before = fullText.slice(0, lineStart);
    const after = fullText.slice(offset);

    const block = buildInputCodeBlock(lang, "");

    const afterNode = after ? document.createTextNode(after) : null;
    container.textContent = before;

    const parent = container.parentNode;
    const nextSibling = container.nextSibling;
    if (afterNode) {
      parent.insertBefore(afterNode, nextSibling || null);
    }
    parent.insertBefore(block, afterNode || nextSibling || null);

    const codeEl = block.querySelector(".input-code-block__pre");
    codeEl.focus();
  }

  function buildInputCodeBlock(lang, code) {
    const block = document.createElement("div");
    block.className = "input-code-block";
    block.contentEditable = "false";
    block.dataset.lang = lang;
    block.dataset.code = code;
    block.innerHTML = `
      <div class="input-code-block__header">
        <span>${lang || "code"}</span>
        <button class="input-code-block__remove" type="button" title="Remove">×</button>
      </div>
      <pre class="input-code-block__pre" contenteditable="true" spellcheck="false"></pre>
    `;
    block.querySelector(".input-code-block__pre").textContent = code;
    block
      .querySelector(".input-code-block__pre")
      .addEventListener("input", () => {
        block.dataset.code = block.querySelector(
          ".input-code-block__pre",
        ).textContent;
      });
    block
      .querySelector(".input-code-block__pre")
      .addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          const afterText = document.createTextNode("\n");
          block.parentNode.insertBefore(afterText, block.nextSibling || null);
          const sel = window.getSelection();
          const r = document.createRange();
          r.setStart(afterText, 1);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
          dom.messageInput.focus();
        }
      });
    return block;
  }

  function collapseCompletedFences() {
    const el = dom.messageInput;
    const sel = window.getSelection();
    const activeNode =
      sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;

    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      if (node === activeNode) continue;
      const text = node.textContent;
      const fenceRe = /```(\S*?)\n([\s\S]*?)\n```/g;
      let match;
      let lastIndex = 0;
      const fragments = [];
      let found = false;
      while ((match = fenceRe.exec(text)) !== null) {
        found = true;
        if (match.index > lastIndex) {
          fragments.push(
            document.createTextNode(text.slice(lastIndex, match.index)),
          );
        }
        fragments.push(buildInputCodeBlock(match[1], match[2]));
        lastIndex = match.index + match[0].length;
      }
      if (!found) continue;
      if (lastIndex < text.length) {
        fragments.push(document.createTextNode(text.slice(lastIndex)));
      }
      const parent = node.parentNode;
      const next = node.nextSibling;
      node.remove();
      for (const frag of fragments) {
        parent.insertBefore(frag, next || null);
      }
    }
  }

  // ── Resend / Regenerate / Edit buttons (event delegation) ─────
  dom.messages.addEventListener("click", (e) => {
    const resendBtn = e.target.closest(".btn--resend");
    if (resendBtn) {
      const wrapper = resendBtn.closest(".message[data-message-id]");
      if (wrapper) resendFromMessage(wrapper.dataset.messageId);
      return;
    }

    const editBtn = e.target.closest(".btn--edit");
    if (editBtn) {
      const wrapper = editBtn.closest(".message[data-message-id]");
      if (wrapper) {
        const role = wrapper.classList.contains("message--user")
          ? "user"
          : "assistant";
        startEditMessage(wrapper, role, wrapper.dataset.messageId);
      }
      return;
    }

    const deleteBtn = e.target.closest(".btn--delete");
    if (deleteBtn) {
      const wrapper = deleteBtn.closest(".message[data-message-id]");
      if (wrapper) deleteMessage(wrapper.dataset.messageId);
      return;
    }

    // Download generated image
    const dlBtn = e.target.closest(".btn--download-image");
    if (dlBtn) {
      const imgUrl = dlBtn.dataset.imgUrl;
      if (imgUrl) downloadGeneratedImage(imgUrl);
      return;
    }

    // Copy code block
    const copyBtn = e.target.closest(".code-block__copy-btn");
    if (copyBtn) {
      const wrapper = copyBtn.closest(".code-block-wrapper");
      if (wrapper) {
        const code = wrapper.querySelector("code");
        if (code) {
          navigator.clipboard
            .writeText(code.textContent || "")
            .then(() => {
              copyBtn.classList.add("copied");
              const originalTitle = copyBtn.getAttribute("title");
              copyBtn.setAttribute("title", "Copied!");
              setTimeout(() => {
                copyBtn.classList.remove("copied");
                copyBtn.setAttribute("title", originalTitle);
              }, 2000);
            })
            .catch(() => {});
        }
      }
      return;
    }
  });

  // ── Plus menu (More options) ───────────────────────────────────────
  function openPlusMenu() {
    dom.plusMenu.classList.add("open");
    dom.plusMenu.setAttribute("aria-hidden", "false");
    dom.btnPlus.classList.add("active");
  }
  function closePlusMenu() {
    dom.plusMenu.classList.remove("open");
    dom.plusMenu.setAttribute("aria-hidden", "true");
    dom.btnPlus.classList.remove("active");
  }

  if (dom.btnPlus) {
    dom.btnPlus.addEventListener("click", (e) => {
      e.stopPropagation();
      dom.plusMenu.classList.contains("open")
        ? closePlusMenu()
        : openPlusMenu();
    });
  }

  if (dom.btnGenerateImage) {
    dom.btnGenerateImage.addEventListener("click", () => {
      closePlusMenu();
      // Only add one generate-image chip at a time
      const alreadyAdded = state.pendingAttachments.some(
        (a) => a.type === "generate-image",
      );
      if (!alreadyAdded) {
        state.pendingAttachments.push({
          type: "generate-image",
          name: "Generate Image",
        });
        renderAttachmentPreview();
      }
    });
  }

  // ── File upload (now inside plus menu) ───────────────────
  if (dom.btnUpload) {
    dom.btnUpload.addEventListener("click", () => {
      closePlusMenu();
      dom.fileUploadInput.click();
    });
  }
  if (dom.fileUploadInput) {
    dom.fileUploadInput.addEventListener("change", handleFileUpload);
  }

  // ── Drag and drop onto the main chat area ───────────────────
  // Listening on #main so the whole chat surface accepts drops,
  // but the visual glow effect is applied to #input-bar only.
  const mainEl = document.getElementById("main");
  const inputBar = document.getElementById("input-bar");
  if (mainEl && inputBar) {
    mainEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!state.activeConversationId) return;
      inputBar.classList.add("drag-over");
    });
    mainEl.addEventListener("dragenter", (e) => {
      e.preventDefault();
      if (!state.activeConversationId) return;
      inputBar.classList.add("drag-over");
    });
    mainEl.addEventListener("dragleave", (e) => {
      if (!mainEl.contains(e.relatedTarget)) {
        inputBar.classList.remove("drag-over");
      }
    });
    mainEl.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      inputBar.classList.remove("drag-over");
      if (!state.activeConversationId) return;
      const files = e.dataTransfer.files;
      if (files && files.length) handleFileUpload(files);
    });
  }

  // ── Attachment chip removal ────────────────────────────────
  if (dom.attachmentPreview) {
    dom.attachmentPreview.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".attachment-chip__remove");
      if (removeBtn) {
        const idx = parseInt(removeBtn.dataset.index, 10);
        if (!isNaN(idx)) {
          state.pendingAttachments.splice(idx, 1);
          renderAttachmentPreview();
        }
      }
    });
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Init
    ═══════════════════════════════════════════════════════════════════════════ */
async function init() {
  initTheme();
  loadModels();
  bindEvents();

  // On mobile, start with the sidebar hidden (collapsed)
  if (window.innerWidth <= 768) {
    dom.sidebar.classList.add("collapsed");
  }
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
