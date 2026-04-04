# LLM WebUI

A simple web-based chat interface for interacting with Large Language Models (LLMs) via a custom OpenAI-compatible API endpoint.

Built with **Node.js**, **Express**, and **SQLite**.

---

## Features

- 💬 Chat interface in the browser
- 🔧 Custom API endpoint configuration (OpenAI-compatible)
- 🤖 Model selection
- 📝 System prompt configuration
- 🗄️ Persistent chat history stored in a database

---

## Tech Stack

| Layer      | Technology              |
|------------|-------------------------|
| Runtime    | Node.js                 |
| Framework  | Express                 |
| Frontend   | Vanilla HTML/CSS/JS     |
| Database   | SQLite (via `better-sqlite3`) |

---

## Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your preferred settings.

### 4. Run the App

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Then open your browser at **http://localhost:3000**

---

## Configuration

All configuration is done through the UI or the `.env` file.

| Setting         | Description                                      | Default               |
|-----------------|--------------------------------------------------|-----------------------|
| `PORT`          | Port the server listens on                       | `3000`                |
| `DB_PATH`       | Path to the SQLite database file                 | `./data/chat.db`      |

---

## API Endpoints

| Method | Path                        | Description                        |
|--------|-----------------------------|------------------------------------|
| `GET`  | `/api/conversations`        | List all conversations             |
| `POST` | `/api/conversations`        | Create a new conversation          |
| `GET`  | `/api/conversations/:id`    | Get messages for a conversation    |
| `POST` | `/api/conversations/:id/messages` | Send a message and get a reply |
| `DELETE` | `/api/conversations/:id`  | Delete a conversation              |
| `GET`  | `/api/settings`             | Get current settings               |
| `POST` | `/api/settings`             | Save settings                      |

---

## License

MIT