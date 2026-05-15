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
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      throw new Error(
        "Storage quota exceeded. Try deleting some old conversations to free up space.",
      );
    }
    throw e;
  }
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
    stream = "false",
    temperature = "",
    top_p = "",
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
      stream,
      temperature,
      top_p,
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

  addMessage(conversationId, msgData) {
    const msgs = lsGet(STORAGE_KEYS.messages) || {};
    if (!msgs[conversationId]) msgs[conversationId] = [];
    const now = new Date().toISOString();
    const msg = {
      id: Date.now(),
      conversation_id: conversationId,
      created_at: now,
      ...msgData,
    };
    msgs[conversationId].push(msg);
    lsSet(STORAGE_KEYS.messages, msgs);
    storage.updateConversation(conversationId, {});
    return msg;
  },

  updateMessage(conversationId, messageId, updates) {
    const msgs = lsGet(STORAGE_KEYS.messages) || {};
    if (!msgs[conversationId]) return null;
    const idx = msgs[conversationId].findIndex(
      (m) => String(m.id) === String(messageId),
    );
    if (idx === -1) return null;
    Object.assign(msgs[conversationId][idx], updates);
    lsSet(STORAGE_KEYS.messages, msgs);
    return msgs[conversationId][idx];
  },

  deleteMessagesFrom(conversationId, fromIndex) {
    const msgs = lsGet(STORAGE_KEYS.messages) || {};
    if (!msgs[conversationId]) return;
    msgs[conversationId] = msgs[conversationId].slice(0, fromIndex);
    lsSet(STORAGE_KEYS.messages, msgs);
  },

  deleteMessage(conversationId, messageId) {
    const msgs = lsGet(STORAGE_KEYS.messages) || {};
    if (!msgs[conversationId]) return;
    msgs[conversationId] = msgs[conversationId].filter(
      (m) => String(m.id) !== String(messageId),
    );
    lsSet(STORAGE_KEYS.messages, msgs);
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
