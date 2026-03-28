# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LiveDrop is a lo-fi audio live-streaming app. A sender captures audio in the browser (mic/line-in), streams it through a Node.js relay server via WebSockets, and listeners hear it by opening a URL on any device. Supports custom stream names, PIN protection, and a lobby showing active streams.

## Commands

```bash
npm install          # Install dependencies
npm start            # Start server on port 3000
node server.js       # Alternative direct start
flyctl deploy        # Deploy to fly.io
```

### Mobile App (Capacitor)
```bash
npm run cap:init         # Initialize Capacitor
npm run cap:add:ios      # Add iOS platform
npm run cap:add:android  # Add Android platform
npm run cap:sync         # Sync web assets to native
npm run cap:open:ios     # Open Xcode project
npm run cap:open:android # Open Android Studio project
```

## Architecture

```
iPhone (audio source) → USB-C → Mac Audio Input
    → Chrome getUserMedia → AudioWorklet (capture)
    → WebCodecs AudioEncoder (opus, 192kbps)
    → WebSocket → Node.js relay server (port 3000)
    → WebSocket → Listener browsers
    → WebCodecs AudioDecoder → AudioWorklet (ring buffer playback)
```

### Server (server.js)
- HTTP static file serving + WebSocket relay (raw `http` + `ws`)
- Routes: `GET /` (lobby), `GET /broadcast` (sender), `GET /s/:id` (listener), `GET /api/sessions` (JSON)
- Sessions: `Map<sessionId, { sender, listeners, config, pin, createdAt }>`
- Custom session names: 3-30 chars, lowercase alphanumeric + hyphens
- PIN auth: SHA-256 hashed, checked on listener join
- `Cache-Control: no-store` on all responses

### Client JS Modules (public/js/)
```
js/
  sender/
    main.js              — Entry point, DOM wiring
    audio-capture.js     — AudioWorklet capture + Opus encoding
    websocket-sender.js  — WS connection, send logic
  listener/
    main.js              — Entry point, DOM wiring
    audio-playback.js    — AudioWorklet playback + auto-gain
    opus-decoder.js      — WebCodecs AudioDecoder wrapper
    websocket-listener.js — WS connection + auto-reconnect
    background-audio.js  — Mobile background audio hacks
    visualizer.js        — Canvas waveform visualizer
  lobby/
    main.js              — Fetch + render active streams
  shared/
    constants.js         — All audio/network constants
  worklets/
    sender-worklet.js    — AudioWorkletProcessor (capture)
    listener-worklet.js  — AudioWorkletProcessor (ring buffer playback)
  vendor/
    qr.js               — QR code generation
```

### HTML Pages
- **public/lobby.html** — Landing page, shows active streams, "Start Broadcasting" button
- **public/sender.html** — Audio device selection, stream name, PIN, Go Live, QR code
- **public/listener.html** — Play button, waveform visualizer, level meter, PIN entry

## WebSocket Protocol

- **Control messages**: JSON
  - `{type: "start", role: "sender", sessionName?: "...", pin?: "1234"}`
  - `{type: "join", sessionId: "...", pin?: "1234"}`
  - `{type: "config", sampleRate: 48000, encoding: "opus"|"pcm"}`
  - `{type: "session", sessionId: "..."}`
  - `{type: "joined", sessionId: "..."}`
  - `{type: "pin-required"}`
  - `{type: "listeners", count: N}`
  - `{type: "ended"}`
  - `{type: "error", message: "..."}`
- **Audio data**: Binary (Opus-encoded chunks or raw PCM Int16)

## Key Constraints

- Language: German UI/spec, English code
- No CSS framework — inline styles, dark theme (#0a0a0a bg), mobile-first
- Safari/iOS lacks WebCodecs — PCM fallback required
- 1-3s latency acceptable
- Single server dependency: `ws`
- PWA installable on mobile
- Capacitor wraps the web app for native iOS/Android
