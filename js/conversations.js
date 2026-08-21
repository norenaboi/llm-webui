/*  ═══════════════════════════════════════════════════════════════════════════
    Render: Conversation List
    ═══════════════════════════════════════════════════════════════════════════ */
function reconcileAttachmentStorage() {
  storage.reconcileAttachments().catch(() => {});
}

function renderConversationList(searchQuery = "") {
  dom.convList.innerHTML = "";

  if (state.conversations.length === 0) {
    dom.convList.innerHTML = `<p style="padding:16px 12px;font-size:0.78rem;color:var(--clr-text-muted);text-align:center;line-height:1.5;">
        No conversations yet.<br>Click ✏ to start one.
      </p>`;
    return;
  }

  // If there's a search query, show search results
  if (searchQuery.trim()) {
    renderSearchResults(searchQuery.trim());
    return;
  }

  // Normal conversation list
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
    Search: Render Search Results
    ═══════════════════════════════════════════════════════════════════════════ */
function renderSearchResults(query) {
  const results = searchConversationsAndMessages(query);

  if (results.length === 0) {
    dom.convList.innerHTML = `<p style="padding:16px 12px;font-size:0.78rem;color:var(--clr-text-muted);text-align:center;line-height:1.5;">
        No results found for "${escapeHtml(query)}"
      </p>`;
    return;
  }

  for (const result of results) {
    const item = document.createElement("div");
    item.className = "conv-item conv-item--search-result";
    item.dataset.id = result.conversationId;
    if (result.messageId) {
      item.dataset.messageId = result.messageId;
    }

    const conv = state.conversations.find(
      (c) => c.id === result.conversationId,
    );
    if (!conv) continue;

    const date = new Date(conv.updated_at);
    const dateStr = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

    let titleHtml = "";
    let previewHtml = "";

    if (result.type === "title") {
      // Highlight matched title
      titleHtml = highlightText(conv.title, query);
      previewHtml = `<div class="conv-item__meta"><span class="conv-item__search-badge">Title</span>${escapeHtml(conv.model || "No model")} · ${dateStr}</div>`;
    } else if (result.type === "message") {
      // Show conversation title + message preview
      titleHtml = escapeHtml(conv.title);
      const messagePreview = truncateText(result.messageContent, 60);
      const highlightedPreview = highlightText(messagePreview, query);
      const roleBadge = result.messageRole === "user" ? "You" : "Assistant";
      previewHtml = `
        <div class="conv-item__meta"><span class="conv-item__search-badge">${roleBadge}</span>${escapeHtml(conv.model || "No model")} · ${dateStr}</div>
        <div class="conv-item__message-preview">${highlightedPreview}</div>
      `;
    }

    item.innerHTML = `
      <div class="conv-item__info">
        <div class="conv-item__title">${titleHtml}</div>
        ${previewHtml}
      </div>
    `;

    item.addEventListener("click", () => {
      selectConversation(result.conversationId, result.messageId);
    });

    dom.convList.appendChild(item);
  }
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Search: Core Search Logic
    ═══════════════════════════════════════════════════════════════════════════ */
function searchConversationsAndMessages(query) {
  const results = [];
  const lowerQuery = query.toLowerCase();
  const allMessages = lsGet(STORAGE_KEYS.messages) || {};

  for (const conv of state.conversations) {
    // Search in conversation title
    if (conv.title.toLowerCase().includes(lowerQuery)) {
      results.push({
        type: "title",
        conversationId: conv.id,
        messageId: null,
      });
    }

    // Search in messages
    const messages = allMessages[conv.id] || [];
    for (const msg of messages) {
      if (msg.content && msg.content.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: "message",
          conversationId: conv.id,
          messageId: msg.id,
          messageContent: msg.content,
          messageRole: msg.role,
        });
      }
    }
  }

  return results;
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Search: Helper Functions
    ═══════════════════════════════════════════════════════���═══════════════════ */
function highlightText(text, query) {
  const escaped = escapeHtml(text);
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return escaped;

  const before = escapeHtml(text.substring(0, index));
  const match = escapeHtml(text.substring(index, index + query.length));
  const after = escapeHtml(text.substring(index + query.length));

  return `${before}<mark>${match}</mark>${after}`;
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
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
      const titleText = dom.topbarTitle.querySelector(".topbar__title-text");
      if (titleText) titleText.textContent = trimmed;
      else dom.topbarTitle.textContent = trimmed;
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
      temperature: conv.temperature !== undefined ? conv.temperature : "",
      top_p: conv.top_p !== undefined ? conv.top_p : "",
      endpoint: conv.endpoint || "",
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
    reconcileAttachmentStorage();

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
