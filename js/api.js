/*  ═══════════════════════════════════════════════════════════════════════════
    Reasoning Extraction
    Extracts <think>...</think> blocks from text and returns separated
    reasoning + content. Handles unclosed <think> tags (streaming —
    closing tag hasn't arrived yet).
    ═══════════════════════════════════════════════════════════════════════════ */
function extractThinkTags(text) {
  const reasoningParts = [];
  const contentParts = [];
  let lastIndex = 0;

  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let match;
  while ((match = thinkRegex.exec(text)) !== null) {
    contentParts.push(text.slice(lastIndex, match.index));
    reasoningParts.push(match[1]);
    lastIndex = match.index + match[0].length;
  }

  const afterClosed = text.slice(lastIndex);
  const unclosedIdx = afterClosed.indexOf("<think>");
  if (unclosedIdx !== -1) {
    contentParts.push(afterClosed.slice(0, unclosedIdx));
    reasoningParts.push(afterClosed.slice(7)); // 7 = "<think>".length
  } else {
    contentParts.push(afterClosed);
  }

  return {
    reasoning: reasoningParts.join("\n").trim(),
    content: contentParts.join("").trim(),
  };
}

/* Extract reasoning from a delta/message object, checking both
   `reasoning` and `reasoning_content` fields (different providers
   use different names). */
function extractReasoningField(obj) {
  return obj?.reasoning || obj?.reasoning_content || "";
}

async function sendMessageBlocking(
  content,
  userWrapper = null,
  attachments = [],
  userMsgId,
) {
  const conv = storage.getConversation(state.activeConversationId);
  if (!conv) throw new Error("Conversation not found");

  const imageAttachments = attachments.filter((a) => a.type === "image");
  const textAttachments = attachments.filter((a) => a.type === "text");

  const history = storage.getMessages(state.activeConversationId);
  const llmMessages = [];
  if (conv.system_prompt && conv.system_prompt.trim()) {
    llmMessages.push({
      role: "system",
      content: conv.system_prompt.trim() + "\n",
    });
  }

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    // Last user message: inject text file contents + image vision parts
    if (
      i === history.length - 1 &&
      msg.role === "user" &&
      (imageAttachments.length > 0 || textAttachments.length > 0)
    ) {
      let fullContent = msg.content;
      if (textAttachments.length > 0) {
        fullContent += textAttachments
          .map((a) => `\n\n[File: ${a.name}]\n\`\`\`\n${a.content}\n\`\`\``)
          .join("");
      }
      if (imageAttachments.length > 0) {
        const contentParts = [{ type: "text", text: fullContent }];
        for (const att of imageAttachments) {
          contentParts.push({
            type: "image_url",
            image_url: { url: att.dataUrl },
          });
        }
        llmMessages.push({ role: msg.role, content: contentParts });
      } else {
        llmMessages.push({ role: msg.role, content: fullContent });
      }
    } else {
      llmMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const url = buildChatUrl(conv.endpoint);
  const headers = { "Content-Type": "application/json" };
  const _keyBlocking = resolveApiKey(conv);
  if (_keyBlocking) headers["Authorization"] = `Bearer ${_keyBlocking}`;

  const reqBody = {
    model: conv.model,
    messages: llmMessages,
    stream: false,
  };
  const _temp = parseFloat(conv.temperature);
  if (!isNaN(_temp)) reqBody.temperature = _temp;
  const _topP = parseFloat(conv.top_p);
  if (!isNaN(_topP)) reqBody.top_p = _topP;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(reqBody),
    signal: state.abortController?.signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    let errMsg = errText;
    try {
      errMsg = extractApiError(JSON.parse(errText), res.status);
    } catch {
      /* use raw text */
    }
    throw new Error(errMsg || `LLM API error ${res.status}`);
  }

  const data = await res.json();
  const choice = data?.choices?.[0]?.message;
  if (!choice) throw new Error("Unexpected response format from LLM API");

  let reply = choice.content || "";
  let reasoning = extractReasoningField(choice);

  // Fallback: strip <think> tags from content and route to reasoning
  if (reply.includes("<think>")) {
    const extracted = extractThinkTags(reply);
    reasoning = (reasoning + "\n" + extracted.reasoning).trim();
    reply = extracted.content;
  }

  if (!reply) throw new Error("Unexpected response format from LLM API");

  const msgData = { role: "assistant", content: reply };
  if (reasoning) msgData.reasoning = reasoning;
  const assistantMessage = storage.addMessage(state.activeConversationId, msgData);

  removeThinkingBubble();
  const assistantWrapper = appendMessageBubble(
    "assistant",
    assistantMessage.content,
    assistantMessage.created_at,
    assistantMessage.id,
    [],
    [],
    false,
    reasoning,
  );
  addMessageActions(assistantWrapper, "assistant", assistantMessage.id);
  scrollToBottom();
}

async function sendImageGeneration(
  content,
  userWrapper,
  attachments = [],
  userMsgId,
) {
  const conv = storage.getConversation(state.activeConversationId);
  if (!conv) throw new Error("Conversation not found");

  let imageUrl = null;
  const endpoint = (conv.endpoint || "").toLowerCase();
  const isPollinations = endpoint.includes("pollinations");

  if (isPollinations) {
    // Strip the path suffix so we get just the base URL, e.g. https://gen.pollinations.ai
    const pollinationsBase = conv.endpoint
      .replace(/\/+$/, "")
      .replace(/\/v1\/chat\/completions$/, "")
      .replace(/\/image$/, "");

    let promptUrl = `${pollinationsBase}/image/${encodeURIComponent(content)}`;
    if (conv.model && conv.model.trim()) {
      promptUrl += `?model=${encodeURIComponent(conv.model.trim())}`;
    }

    const imgHeaders = {};
    const _keyImg = resolveApiKey(conv);
    if (_keyImg) imgHeaders["Authorization"] = `Bearer ${_keyImg}`;

    const imgRes = await fetch(promptUrl, {
      headers: imgHeaders,
      signal: state.abortController?.signal,
    });
    if (!imgRes.ok) {
      const errText = await imgRes.text();
      let errMsg = errText;
      try {
        errMsg = extractApiError(JSON.parse(errText), imgRes.status);
      } catch {
        /* use raw text */
      }
      throw new Error(
        errMsg || `Pollinations image generation failed (${imgRes.status})`,
      );
    }

    const blob = await imgRes.blob();
    // Convert to data URL so it persists in localStorage across page reloads
    imageUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } else {
    // OpenRouter / other: POST to chat completions with modalities:["image"]
    const url = buildChatUrl(conv.endpoint);
    const headers = { "Content-Type": "application/json" };
    const _keyImgGen = resolveApiKey(conv);
    if (_keyImgGen) headers["Authorization"] = `Bearer ${_keyImgGen}`;
    const reqBody = {
      model: conv.model,
      messages: [{ role: "user", content }],
      modalities: ["image"],
      stream: false,
    };
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(reqBody),
      signal: state.abortController?.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      let errMsg = errText;
      try {
        errMsg = extractApiError(JSON.parse(errText), res.status);
      } catch {
        /* use raw text */
      }
      throw new Error(errMsg || `Image generation API error ${res.status}`);
    }
    const data = await res.json();
    const images = data?.choices?.[0]?.message?.images;
    if (images && images.length > 0) {
      imageUrl = images[0].image_url?.url;
    }
    if (!imageUrl) throw new Error("No image returned by the model");
  }

  const storedContent = `[GENERATED_IMAGE]:${imageUrl}`;
  const assistantMsg = storage.addMessage(state.activeConversationId, {
    role: "assistant",
    content: storedContent,
  });

  removeThinkingBubble();
  const wrapper = appendMessageBubble(
    "assistant",
    storedContent,
    assistantMsg.created_at,
    assistantMsg.id,
  );
  addMessageActions(wrapper, "assistant", assistantMsg.id);
  scrollToBottom();
}

async function sendMessageStreaming(
  content,
  userWrapper = null,
  attachments = [],
  userMsgId,
) {
  const conv = storage.getConversation(state.activeConversationId);
  if (!conv) throw new Error("Conversation not found");

  const imageAttachments = attachments.filter((a) => a.type === "image");
  const textAttachments = attachments.filter((a) => a.type === "text");

  const history = storage.getMessages(state.activeConversationId);
  const llmMessages = [];
  if (conv.system_prompt && conv.system_prompt.trim()) {
    llmMessages.push({
      role: "system",
      content: conv.system_prompt.trim() + "\n",
    });
  }

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    // Last user message: inject text file contents + image vision parts
    if (
      i === history.length - 1 &&
      msg.role === "user" &&
      (imageAttachments.length > 0 || textAttachments.length > 0)
    ) {
      let fullContent = msg.content;
      if (textAttachments.length > 0) {
        fullContent += textAttachments
          .map((a) => `\n\n[File: ${a.name}]\n\`\`\`\n${a.content}\n\`\`\``)
          .join("");
      }
      if (imageAttachments.length > 0) {
        const contentParts = [{ type: "text", text: fullContent }];
        for (const att of imageAttachments) {
          contentParts.push({
            type: "image_url",
            image_url: { url: att.dataUrl },
          });
        }
        llmMessages.push({ role: msg.role, content: contentParts });
      } else {
        llmMessages.push({ role: msg.role, content: fullContent });
      }
    } else {
      llmMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const headers = { "Content-Type": "application/json" };
  const _keyStreaming = resolveApiKey(conv);
  if (_keyStreaming) headers["Authorization"] = `Bearer ${_keyStreaming}`;

  const url = buildChatUrl(conv.endpoint);

  const reqBody = {
    model: conv.model,
    messages: llmMessages,
    stream: true,
  };
  const _temp = parseFloat(conv.temperature);
  if (!isNaN(_temp)) reqBody.temperature = _temp;
  const _topP = parseFloat(conv.top_p);
  if (!isNaN(_topP)) reqBody.top_p = _topP;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(reqBody),
    signal: state.abortController?.signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    let errMsg = errText;
    try {
      errMsg = extractApiError(JSON.parse(errText), res.status);
    } catch {
      /* use raw text */
    }
    throw new Error(errMsg || `Request failed (${res.status})`);
  }

  removeThinkingBubble();
  const wrapper = appendMessageBubble("assistant", "");
  const bubble = wrapper.querySelector(".message__bubble");
  let fullContent = "";
  let fullReasoning = "";

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
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

        const delta = parsed?.choices?.[0]?.delta;
        if (!delta) continue;

        // Reasoning token (separate field from providers like OpenRouter)
        const reasoningToken = extractReasoningField(delta);
        if (reasoningToken) {
          fullReasoning += reasoningToken;
          updateReasoningBlock(wrapper, fullReasoning);
          scrollToBottom();
        }

        // Content token
        const token = delta.content;
        if (token) {
          // Check for <think> tags inline in content (fallback for
          // providers that embed reasoning in the content stream)
          if (token.includes("<think>") || fullContent.includes("<think>")) {
            fullContent += token;
            const extracted = extractThinkTags(fullContent);
            if (extracted.reasoning) {
              fullReasoning = (fullReasoning + "\n" + extracted.reasoning).trim();
              updateReasoningBlock(wrapper, fullReasoning);
            }
            bubble.innerHTML = formatMessageContent(extracted.content);
          } else {
            fullContent += token;
            bubble.innerHTML = formatMessageContent(fullContent);
          }
          scrollToBottom();
        }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      // Save whatever partial content was received before re-throwing
      if (fullContent.trim()) {
        const msgData = { role: "assistant", content: fullContent };
        if (fullReasoning.trim()) msgData.reasoning = fullReasoning.trim();
        const savedMsg = storage.addMessage(state.activeConversationId, msgData);
        addMessageActions(wrapper, "assistant", savedMsg.id);
        scrollToBottom();
      }
      throw err;
    }
    throw err;
  }

  // Final cleanup: strip any lingering <think> tags from content
  if (fullContent.includes("<think>")) {
    const extracted = extractThinkTags(fullContent);
    if (extracted.reasoning) {
      fullReasoning = (fullReasoning + "\n" + extracted.reasoning).trim();
    }
    fullContent = extracted.content;
    bubble.innerHTML = formatMessageContent(fullContent);
    updateReasoningBlock(wrapper, fullReasoning);
  }

  if (fullContent.trim()) {
    const msgData = { role: "assistant", content: fullContent };
    if (fullReasoning.trim()) msgData.reasoning = fullReasoning.trim();
    const savedMsg = storage.addMessage(state.activeConversationId, msgData);
    addMessageActions(wrapper, "assistant", savedMsg.id);
  }

  scrollToBottom();
}
