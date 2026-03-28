# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LiveDrop is a lo-fi audio live-streaming prototype. A sender captures audio in the browser (mic/line-in from iPhone via USB-C), streams it through a Node.js relay server via WebSockets, and listeners hear it by opening a URL on any device.

## Commands

```bash
npm install          # Install dependencies (just `ws`)
npm start            # Start server on port 3000
node server.js       # Alternative direct start
```

For external access: run ngrok separately (`ngrok http 3000`).

## Architecture

```
iPhone (audio source) → USB-C → Mac Audio Input
    → Chrome getUserMedia → MediaRecorder (opus, 250ms chunks)
    → WebSocket → Node.js relay server (port 3000)
    → WebSocket → Listener browsers (Web Audio API / MSE)
```

- **server.js** — Single-file Node.js server. WebSocket relay + static file serving. No framework besides `ws`. Routes: `GET /` (sender page), `GET /s/:sessionId` (listener page).
- **public/index.html** — Sender page. Audio device selection dropdown, "Go Live" button, shareable URL display, listener count, live indicator.
- **public/listener.html** — Listener page. Connects via session ID from URL, plays audio chunks. MSE primary, blob-based fallback for Safari/iOS.

## WebSocket Protocol

- **Control messages**: JSON (`{type: "start", role: "sender"}`, `{type: "join", sessionId: "abc123"}`)
- **Audio data**: Binary (raw MediaRecorder chunks, `audio/webm;codecs=opus`)
- Sessions identified by 6-char alphanumeric IDs

## Key Constraints

- Language: German UI/spec, English code
- No CSS framework — inline styles, dark theme (#0a0a0a bg), mobile-first
- Safari/iOS lacks MSE support — blob-based audio fallback required
- 1-3s latency is acceptable for MVP
- Single dependency: `ws`
