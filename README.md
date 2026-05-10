# LLM WebUI

A lightweight browser chat interface for any OpenAI-compatible API endpoint. No build step, no dependencies, no server required.

---

## Structure

```
index.html
favicon.ico
css/
    variables.css
    main.css
    sidebar.css
    messages.css
    buttons.css
    modals.css
    model-selector.css
js/
    main.js
    api.js
    conversations.js
    messages.js
    models.js
    settings.js
    storage.js
```

---

## Usage

Open `index.html` directly in a browser, or serve the directory with any static file server:

```
npx serve .
```

No installation or configuration required.

---

## Features

- Chat interface for any OpenAI-compatible API
- Endpoint, model, and API key configurable per conversation
- System prompt configurable per conversation
- Persistent chat history via `localStorage`
- Dark and light theme toggle
- Streaming support

---

## Configuration

All settings are configured through the UI and stored in `localStorage`. There are no server-side configuration files.

| Setting       | Description                                                  |
|---------------|--------------------------------------------------------------|
| Endpoint      | OpenAI-compatible API base URL                               |
| API Key       | Bearer token for the API                                     |
| Model         | Fetched automatically from the endpoint's `/v1/models`       |
| System Prompt | Optional system message prepended to every conversation      |
| Streaming     | Toggle streaming (server-sent events) per conversation       |

---

## License

MIT
