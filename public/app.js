/*  State  */
const state = {
  conversations:       [],
  activeConversationId: null,
  settings:            {},
  isLoading:           false,
  editingConvId:       null,   // null = creating new, number = editing existing
};

/*  DOM References  */
const dom = {
  // Layout
  sidebar:            document.getElementById("sidebar"),
  // Conversation list
  convList:           document.getElementById("conversation-list"),
  // Messages
  messages:           document.getElementById("messages"),
  emptyState:         document.getElementById("empty-state"),
  // Topbar
  topbarMeta:         document.getElementById("topbar-meta"),
  btnDeleteChat:      document.getElementById("btn-delete-chat"),
  // Input bar
  messageInput:       document.getElementById("message-input"),
  btnSend:            document.getElementById("btn-send"),
  // Conversation modal
  modalConv:          document.getElementById("modal-conversation"),
  modalConvTitle:     document.getElementById("modal-conv-title"),
  convEndpoint:       document.getElementById("conv-endpoint"),
  convApiKey:         document.getElementById("conv-api-key"),
  convModel:          document.getElementById("conv-model"),
  convTitle:          document.getElementById("conv-title"),
  convSystemPrompt:   document.getElementById("conv-system-prompt"),
  convStream:         document.getElementById("conv-stream"),
  btnConvSave:        document.getElementById("btn-conv-save"),
  // Settings modal
  modalSettings:      document.getElementById("modal-settings"),
  settingsEndpoint:   document.getElementById("settings-endpoint"),
  settingsApiKey:     document.getElementById("settings-api-key"),
  settingsModel:      document.getElementById("settings-model"),
  settingsSystemPrompt: document.getElementById("settings-system-prompt"),
  settingsStream:     document.getElementById("settings-stream"),
  // Toast
  toast:              document.getElementById("toast"),
};

/*  API Helpers  */
const api = {
  async request(method, path, body = null) {
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`/api${path}`, opts);

    // 204 No Content has no body
    if (res.status === 204) return null;

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || `Request failed (${res.status})`);
    }

    return data;
  },

  getConversations:    ()           => api.request("GET",    "/conversations"),
  getConversation:     (id)         => api.request("GET",    `/conversations/${id}`),
  createConversation:  (body)       => api.request("POST",   "/conversations", body),
  updateConversation:  (id, body)   => api.request("PATCH",  `/conversations/${id}`, body),
  deleteConversation:  (id)         => api.request("DELETE", `/conversations/${id}`),
  sendMessage:         (id, content)=> api.request("POST",   `/conversations/${id}/messages`, { content }),
  getSettings:         ()           => api.request("GET",    "/settings"),
  saveSettings:        (body)       => api.request("POST",   "/settings", body),
};

/*  Toast  */
let toastTimer = null;

function showToast(message, type = "info") {
  dom.toast.textContent = message;
  dom.toast.className   = `toast show${type !== "info" ? ` toast--${type}` : ""}`;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove("show");
  }, 3000);
}

/*  Modal Helpers  */
function openModal(modalEl)  {
  modalEl.setAttribute("aria-hidden", "false");
  modalEl.classList.add("open");
}

function closeModal(modalEl) {
  modalEl.setAttribute("aria-hidden", "true");
  modalEl.classList.remove("open");
}

/*  Render: Conversation List  */
function renderConversationList() {
  dom.convList.innerHTML = "";

  if (state.conversations.length === 0) {
    dom.convList.innerHTML =
      `<p style="padding:16px;font-size:0.8rem;color:var(--clr-text-muted);text-align:center;">
        No conversations yet
      </p>`;
    return;
  }

  for (const conv of state.conversations) {
    const item = document.createElement("div");
    item.className = "conv-item" + (conv.id === state.activeConversationId ? " active" : "");
    item.dataset.id = conv.id;

    const date = new Date(conv.updated_at);
    const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

    item.innerHTML = `
      <div class="conv-item__info">
        <div class="conv-item__title">${escapeHtml(conv.title)}</div>
        <div class="conv-item__meta">${escapeHtml(conv.model || "No model")} · ${dateStr}</div>
      </div>
      <button class="btn btn--icon conv-item__edit" data-id="${conv.id}" title="Edit conversation">
        ✏
      </button>
    `;

    // Select conversation on click (but not if clicking the edit button)
    item.addEventListener("click", (e) => {
      if (e.target.closest(".conv-item__edit")) return;
      selectConversation(conv.id);
    });

    // Edit button
    item.querySelector(".conv-item__edit").addEventListener("click", (e) => {
      e.stopPropagation();
      openEditConversationModal(conv.id);
    });

    dom.convList.appendChild(item);
  }
}

/*  Render: Messages  */
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
  // Remove empty state if present
  const empty = dom.messages.querySelector(".empty-state");
  if (empty) empty.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `message message--${role}`;

  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  wrapper.innerHTML = `
    <div class="message__bubble">${formatMessageContent(content)}</div>
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

/*  Render: Topbar  */
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

/*  Select Conversation  */
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

/*  Send Message  */
async function sendMessage() {
  const content = dom.messageInput.value.trim();
  if (!content || state.isLoading || !state.activeConversationId) return;

  // Check active conversation's stream setting
  const activeConv   = state.conversations.find(c => c.id === state.activeConversationId);
  const useStreaming = activeConv?.stream === "true" || activeConv?.stream === true;

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
    result.assistant_message.created_at
  );
  scrollToBottom();
}

async function sendMessageStreaming(content) {
  return new Promise((resolve, reject) => {
    const url = `/api/conversations/${state.activeConversationId}/messages?stream=true`;

    const eventSource = new EventSource(
      // EventSource is GET-only, so we use fetch with a ReadableStream instead
      // We'll use fetch + manual SSE parsing
      "about:blank"
    );
    eventSource.close(); // immediately close the dummy, we use fetch below

    fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ content }),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      // Remove thinking bubble and create a streaming bubble
      removeThinkingBubble();
      const wrapper  = appendMessageBubble("assistant", "");
      const bubble   = wrapper.querySelector(".message__bubble");
      let fullContent = "";

      const reader  = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith("event:")) continue; // event name line

          if (trimmed.startsWith("data:")) {
            const raw = trimmed.slice(5).trim();

            let parsed;
            try { parsed = JSON.parse(raw); } catch { continue; }

            if (parsed.token) {
              fullContent += parsed.token;
              // Re-render with accumulated content so markdown formats correctly
              bubble.innerHTML = formatMessageContent(fullContent);
              scrollToBottom();
            }

            if (parsed.error) {
              throw new Error(parsed.error);
            }
          }
        }
      }

      scrollToBottom();
      resolve();
    }).catch(reject);
  });
}

/*  Load Conversations  */
async function loadConversations() {
  try {
    state.conversations = await api.getConversations();
    renderConversationList();
  } catch (err) {
    showToast("Failed to load conversations: " + err.message, "error");
  }
}

/*  Load Settings  */
async function loadSettings() {
  try {
    state.settings = await api.getSettings();
  } catch (err) {
    // Non-fatal: settings might just be empty
    state.settings = {};
  }
}

/*  New Conversation Modal  */
function openNewConversationModal() {
  state.editingConvId = null;

  // Pre-fill from global settings
  dom.convEndpoint.value     = state.settings.endpoint      || "";
  dom.convApiKey.value       = state.settings.api_key       || "";
  dom.convModel.value        = state.settings.model         || "";
  dom.convTitle.value        = "";
  dom.convSystemPrompt.value = state.settings.system_prompt || "";
  dom.convStream.checked = state.settings.stream === "true";

  dom.modalConvTitle.textContent = "New Conversation";
  dom.btnConvSave.textContent    = "Create";

  openModal(dom.modalConv);
  dom.convModel.focus();
}

async function openEditConversationModal(id) {
  state.editingConvId = id;

  try {
    const conv = await api.getConversation(id);

    dom.convEndpoint.value     = conv.endpoint      || "";
    dom.convApiKey.value       = conv.api_key       || "";
    dom.convModel.value        = conv.model         || "";
    dom.convTitle.value        = conv.title         || "";
    dom.convSystemPrompt.value = conv.system_prompt || "";
    dom.convStream.checked = conv.stream === "true" || conv.stream === true;

    dom.modalConvTitle.textContent = "Edit Conversation";
    dom.btnConvSave.textContent    = "Save Changes";

    openModal(dom.modalConv);
    dom.convTitle.focus();
  } catch (err) {
    showToast("Failed to load conversation: " + err.message, "error");
  }
}

async function saveConversationModal() {
  const endpoint     = dom.convEndpoint.value.trim();
  const model        = dom.convModel.value.trim();
  const api_key      = dom.convApiKey.value.trim();
  const title        = dom.convTitle.value.trim() || "New Conversation";
  const system_prompt = dom.convSystemPrompt.value.trim();
  const stream = String(dom.convStream.checked);

  if (!endpoint) {
    showToast("API Endpoint is required", "error");
    dom.convEndpoint.focus();
    return;
  }
  if (!model) {
    showToast("Model is required", "error");
    dom.convModel.focus();
    return;
  }

  try {
    dom.btnConvSave.disabled = true;

    if (state.editingConvId) {
      //  Edit mode
      await api.updateConversation(state.editingConvId, {
        title, model, system_prompt, endpoint, api_key, steam
      });

      showToast("Conversation updated", "success");
      closeModal(dom.modalConv);
      await loadConversations();

      // Re-render topbar if we edited the active conversation
      if (state.editingConvId === state.activeConversationId) {
        const refreshed = await api.getConversation(state.editingConvId);
        renderTopbar(refreshed);
      }
    } else {
      //  Create mode
      const newConv = await api.createConversation({
        title, model, system_prompt, endpoint, api_key, stream
      });

      showToast("Conversation created", "success");
      closeModal(dom.modalConv);
      await loadConversations();
      await selectConversation(newConv.id);
    }
  } catch (err) {
    showToast("Error: " + err.message, "error");
  } finally {
    dom.btnConvSave.disabled = false;
  }
}

/*  Delete Conversation  */
async function deleteActiveConversation() {
  if (!state.activeConversationId) return;

  const conv = state.conversations.find(c => c.id === state.activeConversationId);
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

/*  Settings Modal  */
function openSettingsModal() {
  dom.settingsEndpoint.value     = state.settings.endpoint      || "";
  dom.settingsApiKey.value       = state.settings.api_key       || "";
  dom.settingsModel.value        = state.settings.model         || "";
  dom.settingsSystemPrompt.value = state.settings.system_prompt || "";
  dom.settingsStream.checked = state.settings.stream === "true";
  openModal(dom.modalSettings);
}

async function saveSettingsModal() {
  const endpoint      = dom.settingsEndpoint.value.trim();
  const api_key       = dom.settingsApiKey.value.trim();
  const model         = dom.settingsModel.value.trim();
  const system_prompt = dom.settingsSystemPrompt.value.trim();
  const stream = String(dom.settingsStream.checked);

  try {
    document.getElementById("btn-settings-save").disabled = true;
    state.settings = await api.saveSettings({ endpoint, api_key, model, system_prompt, stream });
    showToast("Settings saved", "success");
    closeModal(dom.modalSettings);
  } catch (err) {
    showToast("Failed to save settings: " + err.message, "error");
  } finally {
    document.getElementById("btn-settings-save").disabled = false;
  }
}

/*  Input Helpers  */
function enableInput() {
  dom.messageInput.disabled = false;
  dom.btnSend.disabled      = false;
}

function disableInput() {
  dom.messageInput.disabled = true;
  dom.btnSend.disabled      = true;
}

function resetTextareaHeight() {
  dom.messageInput.style.height = "auto";
}

function showEmptyState() {
  dom.messages.innerHTML = `
    <div class="empty-state" id="empty-state">
      <div class="empty-state__icon">🤖</div>
      <h2>Welcome to LLM WebUI</h2>
      <p>Start a new conversation or select one from the sidebar.</p>
      <button class="btn btn--primary" id="btn-new-chat-2">New Conversation</button>
    </div>`;

  // Re-bind the button inside the empty state since we just recreated it
  document.getElementById("btn-new-chat-2")
    .addEventListener("click", openNewConversationModal);
}

function scrollToBottom() {
  dom.messages.scrollTop = dom.messages.scrollHeight;
}

/*  Formatting Helpers  */

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Very lightweight Markdown-like formatter.
 * Handles: fenced code blocks, inline code, bold, italic.
 * Full content is HTML-escaped first to prevent XSS.
 * @param {string} content
 * @returns {string} HTML string safe to set as innerHTML
 */
function formatMessageContent(content) {
  let escaped = escapeHtml(content);

  // Fenced code blocks (``` ... ```)
  escaped = escaped.replace(
    /```([a-z]*)\n?([\s\S]*?)```/g,
    (_, lang, code) =>
      `<pre><code class="language-${lang}">${code.trim()}</code></pre>`
  );

  // Inline code (`...`)
  escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold (**text**)
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic (*text*)
  escaped = escaped.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Newlines to <br> (outside of pre blocks)
  escaped = escaped.replace(/(?<!<\/pre>)\n/g, "<br>");

  return escaped;
}

/*  Event Listeners  */
function bindEvents() {
  //  Sidebar toggle
  document.getElementById("btn-toggle-sidebar").addEventListener("click", () => {
    dom.sidebar.classList.toggle("collapsed");
  });

  //  New conversation buttons
  document.getElementById("btn-new-chat").addEventListener("click", openNewConversationModal);
  document.getElementById("btn-new-chat-2").addEventListener("click", openNewConversationModal);

  //  Delete conversation
  dom.btnDeleteChat.addEventListener("click", deleteActiveConversation);

  //  Conversation modal
  dom.btnConvSave.addEventListener("click", saveConversationModal);
  document.getElementById("btn-conv-cancel").addEventListener("click",       () => closeModal(dom.modalConv));
  document.getElementById("btn-close-conv-modal").addEventListener("click",  () => closeModal(dom.modalConv));

  //  Settings modal
  document.getElementById("btn-open-settings").addEventListener("click",          openSettingsModal);
  document.getElementById("btn-settings-save").addEventListener("click",          saveSettingsModal);
  document.getElementById("btn-settings-cancel").addEventListener("click",        () => closeModal(dom.modalSettings));
  document.getElementById("btn-close-settings-modal").addEventListener("click",   () => closeModal(dom.modalSettings));

  //  Close modals on overlay click
  dom.modalConv.addEventListener("click", (e) => {
    if (e.target === dom.modalConv) closeModal(dom.modalConv);
  });
  dom.modalSettings.addEventListener("click", (e) => {
    if (e.target === dom.modalSettings) closeModal(dom.modalSettings);
  });

  //  Close modals on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal(dom.modalConv);
      closeModal(dom.modalSettings);
    }
  });

  //  Send message
  dom.btnSend.addEventListener("click", sendMessage);

  dom.messageInput.addEventListener("keydown", (e) => {
    // Enter sends, Shift+Enter inserts a newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  //  Auto-resize textarea as user types
  dom.messageInput.addEventListener("input", () => {
    dom.messageInput.style.height = "auto";
    dom.messageInput.style.height = Math.min(dom.messageInput.scrollHeight, 160) + "px";
  });
}

/*  Init  */
async function init() {
  bindEvents();
  await loadSettings();
  await loadConversations();
}

init();