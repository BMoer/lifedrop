# LiveDrop - Lo-Fi MVP

## Was wir bauen

Ein Audio-Live-Streaming-Prototyp. Sender captured Audio im Browser (Mikrofon/Line-In), streamt es über einen Server an Empfänger, die eine URL im Handy-Browser öffnen und sofort mithören.

## Setup

- Sender: Chrome auf Mac. iPhone ist per USB-C verbunden, iPhone-Audio kommt als Audio-Input am Mac an.
- Server: Node.js, lokal am Mac, über ngrok nach außen erreichbar.
- Empfänger: Beliebiger Browser auf beliebigem Gerät. Öffnet URL, hört mit.

## Architektur

```
iPhone (Rekordbox) → USB-C → Mac Audio Input
                                    ↓
                         Chrome (getUserMedia)
                                    ↓
                          WebSocket (Audio-Chunks)
                                    ↓
                         Node.js Relay Server
                                    ↓
                          WebSocket (Audio-Chunks)
                                    ↓
                    Empfänger-Browser (Web Audio API)
```

## Technische Anforderungen

### 1. Node.js Server (`server.js`)

Einzelne Datei, kein Framework außer `ws` für WebSockets.

Funktionen:
- WebSocket-Server auf Port 3000
- Zwei Rollen: `sender` und `listener`
- Sender verbindet sich, bekommt eine Session-ID (6 Zeichen, alphanumerisch)
- Listener verbindet sich mit Session-ID, empfängt alle Audio-Chunks die der Sender schickt
- Server relayt Audio-Chunks vom Sender an alle Listener der Session
- Served auch die statischen HTML-Dateien (Sender-Page und Listener-Page)
- Endpoint GET `/` → Sender-Page
- Endpoint GET `/s/:sessionId` → Listener-Page
- WebSocket-Nachrichten-Format: JSON für Control-Messages (`{type: "start", role: "sender"}`, `{type: "join", sessionId: "abc123"}`), Binary für Audio-Chunks

### 2. Sender-Page (`public/index.html`)

Minimales UI:
- Ein Button: "Go Live"
- Nach Klick: Browser fragt nach Mikrofon/Audio-Input Permission (getUserMedia mit audio: true)
- User wählt das iPhone als Audio-Quelle (der Browser zeigt die verfügbaren Inputs)
- Audio wird über AudioContext + MediaRecorder in Chunks geschnitten (z.B. alle 250ms)
- Chunks werden per WebSocket an den Server geschickt
- Nach erfolgreichem Connect: Zeigt die shareable URL an (z.B. `https://abc123.ngrok.io/s/xK9mQ2`)
- Copy-Button für die URL
- Zeigt Anzahl der aktuell verbundenen Listener
- Zeigt "Live" Indikator (pulsierender roter Punkt)

Wichtig für Audio-Input-Auswahl:
- Nutze `navigator.mediaDevices.enumerateDevices()` um verfügbare Audio-Inputs zu listen
- Zeige ein Dropdown mit allen Audio-Inputs VOR dem "Go Live" Button
- Der User wählt das richtige Input-Device (iPhone) aus dem Dropdown
- Dann `getUserMedia({ audio: { deviceId: { exact: selectedDeviceId } } })`

MediaRecorder Config:
- `mimeType: 'audio/webm;codecs=opus'` (beste Browser-Kompatibilität)
- `audioBitsPerSecond: 128000`
- `timeslice: 250` (alle 250ms ein Chunk)

### 3. Listener-Page (`public/listener.html`)

Minimales UI:
- Zeigt "Connecting..." beim Laden
- WebSocket-Verbindung zum Server mit der Session-ID aus der URL
- Empfängt Audio-Chunks per WebSocket
- Playback über MediaSource Extensions (MSE) oder Web Audio API
- Ein "Play" Button (wegen Autoplay-Policy muss User einmal tippen)
- Nach Play: Zeigt "Listening..." mit Waveform oder simplem Audio-Level-Meter
- Zeigt Anzahl Listener

Audio-Playback-Strategie:
- Versuche zuerst MediaSource Extensions mit `audio/webm;codecs=opus`
- Fallback: Sammle Chunks in einem Buffer, erstelle periodisch neue Audio-Blobs und spiele sie über ein `<audio>` Element ab
- Wichtig: Es wird eine Latenz von 1-3 Sekunden geben, das ist OK

### 4. Styling

Kein CSS-Framework. Inline Styles oder minimales `<style>` Tag.

Design:
- Dark Theme (Hintergrund: #0a0a0a, Text: #ffffff)
- Akzentfarbe: #ff3b30 (für Live-Indikator)
- Sekundärfarbe: #30d158 (für Connected-Status)
- Font: system-ui
- Zentriertes Layout, max-width 400px
- Mobile-first (Listener-Page wird primär auf Handys geöffnet)

### 5. Projekt-Struktur

```
livedrop/
  server.js
  package.json
  public/
    index.html      (Sender)
    listener.html   (Empfänger)
```

### 6. Dependencies

Nur `ws` für WebSockets. Sonst nichts.

```json
{
  "name": "livedrop",
  "version": "0.1.0",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "ws": "^8.0.0"
  }
}
```

## Reihenfolge

1. Server mit WebSocket-Relay und statischem File-Serving
2. Sender-Page mit Audio-Capture und Device-Auswahl
3. Listener-Page mit Audio-Playback
4. Testen: `npm start`, ngrok starten, URL am Handy öffnen

## Bekannte Einschränkungen

- Audio-Playback im Empfänger-Browser kann Glitches haben (Chunks kommen nicht smooth an). Für den Prototyp OK, für Produktion braucht es HLS oder einen richtigen Jitter-Buffer.
- getUserMedia zeigt nicht immer alle Audio-Devices sofort. Manchmal muss man erst Permission geben, dann die Device-Liste neu laden.
- Safari auf iOS hat Einschränkungen mit MediaSource Extensions. Fallback-Strategie ist wichtig.
- WebSocket-Verbindung kann abbrechen. Reconnect-Logik ist nice-to-have aber nicht MVP-kritisch.
