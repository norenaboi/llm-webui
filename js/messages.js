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
    const attachments = msg.attachments || [];
    const imageAtts = attachments.filter((a) => a.type === "image");
    const textAtts = attachments.filter((a) => a.type === "text");
    const hasGenImg = attachments.some((a) => a.type === "generate-image");
    appendMessageBubble(
      msg.role,
      msg.content,
      msg.created_at,
      msg.id,
      imageAtts,
      textAtts,
      hasGenImg,
    );
  }

  scrollToBottom();
}

function buildActionsHtml(role) {
  return `<div class="message__actions">
    <button class="btn--edit" title="Edit">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Edit
    </button>
    <button class="btn--delete" title="Delete">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Delete
    </button>
    <button class="btn--resend">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3 3v5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>`;
}

function addMessageActions(wrapper, role, messageId) {
  wrapper.dataset.messageId = String(messageId);
  const existing = wrapper.querySelector(".message__actions");
  if (existing) existing.remove();
  wrapper.insertAdjacentHTML("beforeend", buildActionsHtml(role));
}

function appendMessageBubble(
  role,
  content,
  timestamp = null,
  messageId = null,
  imageAttachments = [],
  textAttachments = [],
  hasGenerateImage = false,
) {
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

  let bubbleInner;
  const _trimmedContent = (content || "").trim();
  if (
    role === "assistant" &&
    _trimmedContent.startsWith("[GENERATED_IMAGE]:")
  ) {
    const imgUrl = _trimmedContent.slice("[GENERATED_IMAGE]:".length);
    bubbleInner = `
      <div class="message__image-response">
        <button class="btn--download-image" data-img-url="${escapeHtml(imgUrl)}" title="Download image">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3v13M6 11l6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 20h18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
        </button>
        <img class="message__generated-img" src="${escapeHtml(imgUrl)}" alt="Generated image" />
      </div>`;
  } else if (role === "user") {
    bubbleInner = `<span style="white-space: pre-wrap">${escapeHtml(content)}</span>`;
  } else {
    bubbleInner = formatMessageContent(content);
  }

  // Prepend any inline images inside the bubble (in-memory only, not persisted)
  if (imageAttachments.length > 0 && role === "user") {
    const imgsHtml = imageAttachments
      .map(
        (a) =>
          `<img class="message__attachment-img" src="${a.dataUrl}" alt="${escapeHtml(a.name)}" />`,
      )
      .join("");
    bubbleInner = imgsHtml + bubbleInner;
  }

  const roleLabel = role === "user" ? "You" : "Assistant";

  // Build text file chips as a separate row above the bubble (in-memory only, not persisted)
  let attachmentsHtml = "";
  if ((textAttachments.length > 0 || hasGenerateImage) && role === "user") {
    const fileChipsHtml = textAttachments
      .map(
        (a) =>
          `<div class="message__file-chip">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 1H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5L9 1z" stroke="currentColor" stroke-width="1.5"/><path d="M9 1v4h4" stroke="currentColor" stroke-width="1.5"/></svg>
            <span>${escapeHtml(a.name)}</span>
          </div>`,
      )
      .join("");
    const genImgChip = hasGenerateImage
      ? `<div class="message__file-chip message__file-chip--generate-image">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15.5l-5.5-5.5L5 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Generate Image</span>
        </div>`
      : "";
    attachmentsHtml = `<div class="message__attachments">${genImgChip}${fileChipsHtml}</div>`;
  }

  let html = `
    <span class="message__role">${roleLabel}</span>
    ${attachmentsHtml}
    <div class="message__bubble">${bubbleInner}</div>
    <span class="message__time">${time}</span>
  `;

  if (messageId != null) {
    wrapper.dataset.messageId = String(messageId);
    html += buildActionsHtml(role);
  }

  wrapper.innerHTML = html;
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

async function resendFromMessage(messageId) {
  if (state.isLoading || !state.activeConversationId) return;

  const messages = storage.getMessages(state.activeConversationId);
  const idx = messages.findIndex((m) => String(m.id) === String(messageId));
  if (idx === -1) return;

  const msg = messages[idx];
  let userMessage;
  let deleteFromIdx;

  if (msg.role === "user") {
    userMessage = msg;
    deleteFromIdx = idx;
  } else if (msg.role === "assistant") {
    // Walk back to find the preceding user message
    let prevUserIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        prevUserIdx = i;
        break;
      }
    }
    if (prevUserIdx === -1) return;
    userMessage = messages[prevUserIdx];
    deleteFromIdx = prevUserIdx;
  } else {
    return;
  }

  const storedAttachments = userMessage.attachments || [];
  storage.deleteMessagesFrom(state.activeConversationId, deleteFromIdx);
  renderMessages(storage.getMessages(state.activeConversationId));
  await dispatchSend(userMessage.content, storedAttachments);
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Delete Message
    ═══════════════════════════════════════════════════════════════════════════ */
function deleteMessage(messageId) {
  if (!state.activeConversationId) return;
  storage.deleteMessage(state.activeConversationId, messageId);
  renderMessages(storage.getMessages(state.activeConversationId));
}

/*  ═══════════════════════════════════════════════════════════════════════════
    Inline Edit
    ═══════════════════════════════════════════════════════════════════════════ */
function startEditMessage(wrapper, role, messageId) {
  // Prevent opening a second edit session on the same message
  if (wrapper.classList.contains("message--editing")) return;

  const messages = storage.getMessages(state.activeConversationId);
  const msg = messages.find((m) => String(m.id) === String(messageId));
  if (!msg) return;

  const originalContent = msg.content;

  wrapper.classList.add("message--editing");

  // ── Preserve & expose attachments for editing ──────────────
  // editAttachments is mutated in-place as the user removes chips;
  // doSave() captures it by reference so commitEdit sees the final list.
  const editAttachments = (msg.attachments || []).slice();
  let attachmentsEl = wrapper.querySelector(".message__attachments");
  // Remember whether the element pre-existed (null = we created it).
  const originalAttachmentsHtml = attachmentsEl
    ? attachmentsEl.innerHTML
    : null;

  // Create the element if it doesn't exist but there are attachments to show.
  if (editAttachments.length > 0 && !attachmentsEl) {
    attachmentsEl = document.createElement("div");
    attachmentsEl.className = "message__attachments";
    const _bubble = wrapper.querySelector(".message__bubble");
    wrapper.insertBefore(attachmentsEl, _bubble);
  }

  const renderEditChips = () => {
    if (!attachmentsEl) return;
    if (editAttachments.length === 0) {
      attachmentsEl.innerHTML = "";
      return;
    }
    attachmentsEl.innerHTML = editAttachments
      .map((a, i) => {
        let iconHtml;
        if (a.type === "image") {
          iconHtml = `<img class="message__file-chip__thumb" src="${a.dataUrl}" alt="${escapeHtml(a.name)}" />`;
        } else if (a.type === "generate-image") {
          iconHtml = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15.5l-5.5-5.5L5 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        } else {
          iconHtml = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 1H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5L9 1z" stroke="currentColor" stroke-width="1.5"/><path d="M9 1v4h4" stroke="currentColor" stroke-width="1.5"/></svg>`;
        }
        const extraClass =
          a.type === "generate-image"
            ? " message__file-chip--generate-image"
            : "";
        return `<div class="message__file-chip${extraClass} message__file-chip--editing">
          ${iconHtml}
          <span>${escapeHtml(a.name || "Generate Image")}</span>
          <button class="message__file-chip__remove" data-att-idx="${i}" title="Remove">&times;</button>
        </div>`;
      })
      .join("");

    attachmentsEl
      .querySelectorAll(".message__file-chip__remove")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.attIdx, 10);
          if (!isNaN(idx)) {
            editAttachments.splice(idx, 1);
            renderEditChips();
          }
        });
      });
  };

  if (editAttachments.length > 0) renderEditChips();

  // ── Swap bubble into an editable textarea ─────────────────
  const bubble = wrapper.querySelector(".message__bubble");
  const originalBubbleHtml = bubble.innerHTML;

  // Capture the rendered height BEFORE clearing so that assistant messages
  // (whose markdown renders taller than the raw text) open at the same visual
  // size as the bubble they replace.  We subtract the padding change:
  // base bubble uses 11px top/bottom, edit mode uses 6px top/bottom → 10px less.
  const renderedHeight = bubble.getBoundingClientRect().height - 10;

  bubble.innerHTML = "";

  const textarea = document.createElement("textarea");
  textarea.className = "message__edit-area";
  textarea.value = originalContent;
  bubble.appendChild(textarea);

  // On initial open: use whichever is larger — the raw content height or the
  // original rendered bubble height — so the edit area never feels smaller
  // than the message it replaced.  While typing, resize freely to content.
  const autoResize = () => {
    textarea.style.height = "0";
    textarea.style.height = textarea.scrollHeight + "px";
  };
  textarea.style.height = "0";
  textarea.style.height =
    Math.max(textarea.scrollHeight, renderedHeight) + "px";
  textarea.addEventListener("input", autoResize);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  // ── Swap action row into save / cancel controls ────────────
  const actionsEl = wrapper.querySelector(".message__actions");
  const editActionsEl = document.createElement("div");
  editActionsEl.className = "message__edit-actions";
  const saveLabel = role === "user" ? "Save" : "Save";
  editActionsEl.innerHTML = `
    <button class="btn--edit-save">${saveLabel}</button>
    <button class="btn--edit-cancel">Cancel</button>
  `;
  if (actionsEl) {
    actionsEl.replaceWith(editActionsEl);
  } else {
    wrapper.appendChild(editActionsEl);
  }

  // ── Wire up save / cancel ──────────────────────────────────
  const doSave = () =>
    commitEdit(
      wrapper,
      role,
      messageId,
      textarea.value,
      originalBubbleHtml,
      editActionsEl,
      editAttachments,
      attachmentsEl,
      originalAttachmentsHtml,
    );
  const doCancel = () =>
    cancelEdit(
      wrapper,
      originalBubbleHtml,
      editActionsEl,
      role,
      messageId,
      attachmentsEl,
      originalAttachmentsHtml,
    );

  editActionsEl
    .querySelector(".btn--edit-save")
    .addEventListener("click", doSave);
  editActionsEl
    .querySelector(".btn--edit-cancel")
    .addEventListener("click", doCancel);

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      doCancel();
    }
  });
}

async function commitEdit(
  wrapper,
  role,
  messageId,
  newContent,
  originalBubbleHtml,
  editActionsEl,
  editAttachments = [],
  attachmentsEl = null,
  originalAttachmentsHtml = null,
) {
  const trimmed = newContent.trim();
  if (!trimmed) return; // don't save empty

  wrapper.classList.remove("message--editing");

  if (role === "user") {
    // Delete this message and everything after it, then re-send with new text
    const messages = storage.getMessages(state.activeConversationId);
    const idx = messages.findIndex((m) => String(m.id) === String(messageId));
    if (idx !== -1) storage.deleteMessagesFrom(state.activeConversationId, idx);
    renderMessages(storage.getMessages(state.activeConversationId));
    await dispatchSend(trimmed, editAttachments);
  } else {
    // assistant — update in storage and re-render the bubble in place
    storage.updateMessage(state.activeConversationId, messageId, {
      content: trimmed,
    });
    const bubble = wrapper.querySelector(".message__bubble");
    bubble.innerHTML = formatMessageContent(trimmed);
    // Restore original attachment chips (no remove buttons)
    if (attachmentsEl && originalAttachmentsHtml !== null) {
      attachmentsEl.innerHTML = originalAttachmentsHtml;
    }
    // Restore standard action buttons
    if (editActionsEl) editActionsEl.remove();
    addMessageActions(wrapper, role, messageId);
  }
}

function cancelEdit(
  wrapper,
  originalBubbleHtml,
  editActionsEl,
  role,
  messageId,
  attachmentsEl = null,
  originalAttachmentsHtml = null,
) {
  wrapper.classList.remove("message--editing");
  // Restore the original bubble HTML
  const bubble = wrapper.querySelector(".message__bubble");
  bubble.innerHTML = originalBubbleHtml;
  // Restore attachment chips
  if (attachmentsEl) {
    if (originalAttachmentsHtml !== null) {
      // Element existed before editing — put its original chips back
      attachmentsEl.innerHTML = originalAttachmentsHtml;
    } else {
      // We created this element during edit — remove it
      attachmentsEl.remove();
    }
  }
  // Restore standard action buttons
  if (editActionsEl) editActionsEl.remove();
  addMessageActions(wrapper, role, messageId);
}

/*  ═══════════════════════════════════════════════════════════════════════════
    File Upload
    ═══════════════════════════════════════════════════════════════════════════ */
function handleFileUpload(files) {
  // Accept either a DOM Event (from file input) or a FileList/Array (from drag-and-drop)
  const fileList =
    files instanceof Event ? Array.from(files.target.files) : Array.from(files);
  if (!fileList.length) return;

  for (const file of fileList) {
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        state.pendingAttachments.push({
          type: "image",
          name: file.name,
          mimeType: file.type,
          dataUrl: e.target.result,
        });
        renderAttachmentPreview();
      };
      reader.readAsDataURL(file);
    } else {
      // Text-based file: store as an attachment chip (content sent to LLM on dispatch)
      const reader = new FileReader();
      reader.onload = (e) => {
        state.pendingAttachments.push({
          type: "text",
          name: file.name,
          content: e.target.result,
        });
        renderAttachmentPreview();
      };
      reader.readAsText(file);
    }
  }

  // Reset the file input so the same file can be re-selected
  if (files instanceof Event) files.target.value = "";
}

function renderAttachmentPreview() {
  const preview = dom.attachmentPreview;
  if (!preview) return;

  if (!state.pendingAttachments.length) {
    preview.innerHTML = "";
    return;
  }

  preview.innerHTML = state.pendingAttachments
    .map(
      (att, i) => `
        <div class="attachment-chip${att.type === "generate-image" ? " attachment-chip--generate-image" : ""}" data-index="${i}">
          ${
            att.type === "image"
              ? `<img class="attachment-chip__thumb" src="${att.dataUrl}" alt="${escapeHtml(att.name)}" />`
              : att.type === "generate-image"
                ? `<svg class="attachment-chip__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15.5l-5.5-5.5L5 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
                : `<svg class="attachment-chip__icon" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 1H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5L9 1z" stroke="currentColor" stroke-width="1.5"/><path d="M9 1v4h4" stroke="currentColor" stroke-width="1.5"/></svg>`
          }
          <span class="attachment-chip__name">${escapeHtml(att.name)}</span>
          <button class="attachment-chip__remove" data-index="${i}" title="Remove">&times;</button>
        </div>`,
    )
    .join("");
}
