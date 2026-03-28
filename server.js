const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;

// --- Session state ---

const sessions = new Map(); // sessionId -> { sender, listeners, config, pin, createdAt }

function generateSessionId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

const SESSION_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

function validateSessionName(name) {
  if (!name) return { valid: true, name: null };
  const normalized = name.toLowerCase().trim();
  if (!SESSION_NAME_PATTERN.test(normalized)) {
    return { valid: false, error: 'Name must be 3-30 chars, lowercase alphanumeric and hyphens only' };
  }
  if (sessions.has(normalized)) {
    return { valid: false, error: 'Name already in use' };
  }
  return { valid: true, name: normalized };
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin.toString()).digest('hex');
}

function getPublicSessions() {
  const result = [];
  for (const [id, session] of sessions) {
    result.push({
      id,
      listeners: session.listeners.size,
      hasPin: !!session.pin,
      createdAt: session.createdAt,
    });
  }
  return result;
}

function broadcastListenerCount(session) {
  const msg = JSON.stringify({ type: 'listeners', count: session.listeners.size });
  if (session.sender && session.sender.readyState === WebSocket.OPEN) {
    session.sender.send(msg);
  }
  for (const listener of session.listeners) {
    if (listener.readyState === WebSocket.OPEN) {
      listener.send(msg);
    }
  }
}

// --- HTTP server ---

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/') {
    serveFile(res, path.join(__dirname, 'public', 'lobby.html'));
    return;
  }

  if (pathname === '/broadcast') {
    serveFile(res, path.join(__dirname, 'public', 'sender.html'));
    return;
  }

  if (pathname === '/api/sessions') {
    const data = JSON.stringify({ sessions: getPublicSessions() });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(data);
    return;
  }

  if (pathname.startsWith('/s/')) {
    serveFile(res, path.join(__dirname, 'public', 'listener.html'));
    return;
  }

  // Serve static files from public/
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  serveFile(res, path.join(__dirname, 'public', safePath));
});

// --- WebSocket server ---

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let role = null;     // 'sender' | 'listener'
  let sessionId = null;

  ws.on('message', (data, isBinary) => {
    // Binary messages: relay from sender to listeners
    if (isBinary) {
      if (role !== 'sender' || !sessionId) return;
      const session = sessions.get(sessionId);
      if (!session) return;
      const size = data.length || data.byteLength || 0;
      if (!ws._chunkCount) ws._chunkCount = 0;
      ws._chunkCount++;
      if (ws._chunkCount <= 3 || ws._chunkCount % 50 === 0) {
        console.log(`Chunk #${ws._chunkCount}: ${size} bytes → ${session.listeners.size} listener(s)`);
      }
      for (const listener of session.listeners) {
        if (listener.readyState === WebSocket.OPEN) {
          listener.send(data, { binary: true });
        }
      }
      return;
    }

    // Text messages: control protocol
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'start' && msg.role === 'sender' && !role) {
      // Support custom session names
      const nameResult = validateSessionName(msg.sessionName);
      if (!nameResult.valid) {
        ws.send(JSON.stringify({ type: 'error', message: nameResult.error }));
        return;
      }

      role = 'sender';
      sessionId = nameResult.name || generateSessionId();
      const sessionData = {
        sender: ws,
        listeners: new Set(),
        pin: msg.pin ? hashPin(msg.pin) : null,
        createdAt: Date.now(),
      };
      sessions.set(sessionId, sessionData);
      ws.send(JSON.stringify({ type: 'session', sessionId }));
      console.log(`Session ${sessionId} created`);
      return;
    }

    if (msg.type === 'config' && role === 'sender' && sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return;
      // Store config and forward to all current listeners
      session.config = data.toString();
      for (const listener of session.listeners) {
        if (listener.readyState === WebSocket.OPEN) {
          listener.send(session.config);
        }
      }
      return;
    }

    if (msg.type === 'join' && msg.sessionId && !role) {
      const session = sessions.get(msg.sessionId);
      if (!session) {
        ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
        return;
      }
      // PIN check
      if (session.pin) {
        if (!msg.pin) {
          ws.send(JSON.stringify({ type: 'pin-required' }));
          return;
        }
        if (hashPin(msg.pin) !== session.pin) {
          ws.send(JSON.stringify({ type: 'error', message: 'Wrong PIN' }));
          return;
        }
      }
      role = 'listener';
      sessionId = msg.sessionId;
      session.listeners.add(ws);
      ws.send(JSON.stringify({ type: 'joined', sessionId }));
      if (session.config) {
        ws.send(session.config);
      }
      broadcastListenerCount(session);
      console.log(`Listener joined ${sessionId} (${session.listeners.size} total)`);
      return;
    }
  });

  ws.on('close', () => {
    if (!sessionId) return;
    const session = sessions.get(sessionId);
    if (!session) return;

    if (role === 'sender') {
      // Notify all listeners and clean up
      for (const listener of session.listeners) {
        if (listener.readyState === WebSocket.OPEN) {
          listener.send(JSON.stringify({ type: 'ended' }));
        }
      }
      sessions.delete(sessionId);
      console.log(`Session ${sessionId} ended`);
    }

    if (role === 'listener') {
      session.listeners.delete(ws);
      broadcastListenerCount(session);
      console.log(`Listener left ${sessionId} (${session.listeners.size} remaining)`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`LiveDrop server running on http://localhost:${PORT}`);
});
