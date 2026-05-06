# LLM WebUI

A lightweight, self-hosted browser chat interface for any OpenAI-compatible API endpoint.

Built with **Node.js**, **Express**, and **Vanilla JS**.

---

## Features

- Chat interface in the browser
- Custom API endpoint, model, and API key - configurable per conversation
- System prompt configuration per conversation
- Persistent chat history stored in `localStorage`
- Dark / light theme toggle

---

## Tech Stack

| Layer      | Technology              |
|------------|-------------------------|
| Runtime    | Node.js                 |
| Framework  | Express (static server) |
| Frontend   | HTML / CSS / Vanilla JS |
| Storage    | Browser `localStorage`  |

---

## Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the App

```bash
npm start
```

Then open your browser at **http://localhost:3000**

---

## Configuration

| Setting         | Description                                                  |
|-----------------|--------------------------------------------------------------|
| `PORT`          | Port the server listens on (default: `3000` and configurable with `.env`)                 |
| Endpoint        | Your OpenAI-compatible API base URL (set in the UI)         |
| API Key         | Bearer token for your API (set in the UI, stored locally)   |
| Model           | Fetched automatically from `/v1/models` endpoint       |
| System Prompt   | Optional system message prepended to every conversation     |
| Streaming       | Toggle server-sent event streaming on or off per conversation|

---

## License

MIT
