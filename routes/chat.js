const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

//  Database
// Same swap rule applies: change only this require to switch databases.
const {
  getAllConversations,
  getConversationById,
  createConversation,
  updateConversation,
  deleteConversation,
  getMessagesByConversationId,
  createMessage,
} = require("../db/sqlite");

//  GET /api/conversations
// Returns a list of all conversations (no messages, just metadata)
router.get("/", (req, res, next) => {
  try {
    const conversations = getAllConversations();
    res.json(conversations);
  } catch (err) {
    next(err);
  }
});

//  POST /api/conversations
// Creates a new conversation
// Body: { title?, model, system_prompt?, endpoint, api_key?, stream? }
router.post("/", (req, res, next) => {
  try {
    const {
      title = "New Conversation",
      model = "",
      system_prompt = "",
      endpoint = "",
      api_key = "",
      stream = "false",
    } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: "endpoint is required" });
    }

    const conversation = createConversation({
      title,
      model,
      system_prompt,
      endpoint,
      api_key,
      stream: String(stream),
    });

    res.status(201).json(conversation);
  } catch (err) {
    next(err);
  }
});

//  GET /api/conversations/:id
// Returns a single conversation with all its messages
router.get("/:id", (req, res, next) => {
  try {
    const conversation = getConversationById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const messages = getMessagesByConversationId(req.params.id);
    res.json({ ...conversation, messages });
  } catch (err) {
    next(err);
  }
});

//  PATCH /api/conversations/:id
// Updates conversation metadata (title, model, system_prompt, endpoint, api_key)
// Body: any subset of those fields
router.patch("/:id", (req, res, next) => {
  try {
    const conversation = getConversationById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const { title, model, system_prompt, endpoint, api_key, stream } = req.body;

    const updated = updateConversation(req.params.id, {
      title,
      model,
      system_prompt,
      endpoint,
      api_key,
      stream: stream !== undefined ? String(stream) : undefined,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

//  DELETE /api/conversations/:id
// Deletes a conversation and all its messages
router.delete("/:id", (req, res, next) => {
  try {
    const deleted = deleteConversation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/conversations/:id/messages ────────────────────────────────────
// Sends a user message, forwards the full history to the LLM, stores and
// returns the assistant reply.
// Body: { content: string }
router.post("/:id/messages", async (req, res, next) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    // 1. Load the conversation
    const conversation = getConversationById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // 2. Persist the user message
    const userMessage = createMessage({
      conversation_id: req.params.id,
      role: "user",
      content: content.trim(),
    });

    // 3. Build the messages array for the LLM
    const history = getMessagesByConversationId(req.params.id);
    const llmMessages = [];

    if (conversation.system_prompt && conversation.system_prompt.trim()) {
      llmMessages.push({
        role: "system",
        content: conversation.system_prompt.trim(),
      });
    }

    for (const msg of history) {
      llmMessages.push({ role: msg.role, content: msg.content });
    }

    // 4. Check if streaming is requested
    const useStream = req.query.stream === "true";

    if (useStream) {
      await handleStreamingResponse({
        req,
        res,
        conversation,
        llmMessages,
        conversationId: req.params.id,
      });
    } else {
      await handleBlockingResponse({
        res,
        conversation,
        llmMessages,
        conversationId: req.params.id,
        userMessage,
      });
    }
  } catch (err) {
    // Only send error headers if we haven't started streaming yet
    if (!res.headersSent) {
      next(err);
    } else {
      console.error("[Stream error]", err);
      res.end();
    }
  }
});

// ─── Blocking (non-streaming) response handler ────────────────────────────────
async function handleBlockingResponse({
  res,
  conversation,
  llmMessages,
  conversationId,
  userMessage,
}) {
  const reply = await callLLM({
    endpoint: conversation.endpoint,
    api_key: conversation.api_key,
    model: conversation.model,
    messages: llmMessages,
    stream: false,
  });

  const assistantMessage = createMessage({
    conversation_id: conversationId,
    role: "assistant",
    content: reply,
  });

  res.status(201).json({
    user_message: userMessage,
    assistant_message: assistantMessage,
  });
}

// ─── Streaming response handler ───────────────────────────────────────────────
// Uses Server-Sent Events (SSE) to stream tokens to the client as they arrive.
// Final event saves the complete message to the database.
async function handleStreamingResponse({
  req,
  res,
  conversation,
  llmMessages,
  conversationId,
}) {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Helper to send an SSE event
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let fullContent = "";

  try {
    const llmRes = await callLLM({
      endpoint: conversation.endpoint,
      api_key: conversation.api_key,
      model: conversation.model,
      messages: llmMessages,
      stream: true,
    });

    // llmRes is the raw fetch Response when streaming
    const body = llmRes.body;

    // Buffer for incomplete chunks (network may split SSE lines mid-packet)
    let buffer = "";

    await new Promise((resolve, reject) => {
      body.on("data", (chunk) => {
        buffer += chunk.toString("utf-8");

        // Process all complete lines in the buffer
        const lines = buffer.split("\n");

        // Keep the last (potentially incomplete) line in the buffer
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();

          // SSE lines that carry data start with "data: "
          if (!trimmed.startsWith("data:")) continue;

          const raw = trimmed.slice(5).trim();

          // The stream is done
          if (raw === "[DONE]") {
            resolve();
            return;
          }

          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            // Malformed chunk — skip it
            continue;
          }

          const token = parsed?.choices?.[0]?.delta?.content;
          if (token) {
            fullContent += token;
            sendEvent("token", { token });
          }
        }
      });

      body.on("end", resolve);
      body.on("error", reject);

      // If the client disconnects early, abort cleanly
      req.on("close", () => {
        body.destroy();
        resolve();
      });
    });
  } catch (err) {
    sendEvent("error", { error: err.message });
    res.end();
    return;
  }

  // Save the complete assembled message to the database
  if (fullContent.trim()) {
    const assistantMessage = createMessage({
      conversation_id: conversationId,
      role: "assistant",
      content: fullContent,
    });
    // Send the final event with the persisted message metadata (id, created_at, etc.)
    sendEvent("done", { assistant_message: assistantMessage });
  } else {
    sendEvent("done", { assistant_message: null });
  }

  res.end();
}

// ─── LLM Helper ───────────────────────────────────────────────────────────────
/**
 * Sends a chat completion request to an OpenAI-compatible endpoint.
 * @param {Object}  params
 * @param {string}  params.endpoint
 * @param {string}  params.api_key
 * @param {string}  params.model
 * @param {Array}   params.messages
 * @param {boolean} params.stream    - If true, returns the raw fetch Response
 *                                     If false, returns the assistant reply string
 * @returns {Promise<string|Response>}
 */
async function callLLM({ endpoint, api_key, model, messages, stream = false }) {
  const baseUrl = endpoint.replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;

  const headers = { "Content-Type": "application/json" };
  if (api_key && api_key.trim()) {
    headers["Authorization"] = `Bearer ${api_key.trim()}`;
  }

  const body = JSON.stringify({ model, messages, stream });

  let response;
  try {
    response = await fetch(url, { method: "POST", headers, body });
  } catch (networkErr) {
    throw Object.assign(new Error(`Could not reach LLM endpoint: ${url}`), {
      status: 502,
    });
  }

  if (!response.ok) {
    const text = await response.text();
    throw Object.assign(
      new Error(`LLM API error ${response.status}: ${text}`),
      { status: 502 },
    );
  }

  // Streaming: return the raw response for the caller to consume
  if (stream) return response;

  // Blocking: parse and return just the text content
  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) {
    throw Object.assign(new Error("Unexpected response format from LLM API"), {
      status: 502,
    });
  }
  return reply;
}

module.exports = router;
