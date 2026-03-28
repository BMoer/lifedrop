import { RECONNECT_BASE_MS, RECONNECT_MULTIPLIER, RECONNECT_MAX_MS } from '../shared/constants.js';

/**
 * Creates a WebSocket connection for the listener role.
 * Handles auto-reconnect with exponential backoff.
 *
 * @returns {{ close }}
 */
export function createListenerSocket({
  sessionId,
  onJoined,
  onConfig,
  onAudioData,
  onListeners,
  onEnded,
  onError,
  onPinRequired,
  onReconnecting,
}) {
  let ws = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let streamEnded = false;
  let destroyed = false;

  function connect() {
    if (destroyed) return;
    if (ws && ws.readyState <= WebSocket.OPEN) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      reconnectAttempts = 0;
      ws.send(JSON.stringify({ type: 'join', sessionId }));
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onAudioData(event.data);
        return;
      }

      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'joined') onJoined();
        if (msg.type === 'config') onConfig(msg);
        if (msg.type === 'listeners') onListeners(msg.count);
        if (msg.type === 'ended') {
          streamEnded = true;
          onEnded();
        }
        if (msg.type === 'pin-required') onPinRequired();
        if (msg.type === 'error') onError(msg.message);
      } catch (err) {
        console.error('Failed to parse server message:', err);
      }
    };

    ws.onclose = () => {
      if (streamEnded || destroyed) return;
      scheduleReconnect();
    };

    ws.onerror = () => {};
  }

  function scheduleReconnect() {
    if (streamEnded || destroyed) return;
    if (reconnectTimer) return;

    reconnectAttempts++;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(RECONNECT_MULTIPLIER, reconnectAttempts - 1),
      RECONNECT_MAX_MS,
    );

    onReconnecting();

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  // Handle visibility change — reconnect when coming back to foreground
  function onVisibilityChange() {
    if (document.visibilityState === 'visible' && ws && ws.readyState > WebSocket.OPEN) {
      scheduleReconnect();
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);

  // Start initial connection
  connect();

  return {
    submitPin(pin) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'join', sessionId, pin }));
      }
    },

    close() {
      destroyed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
    },
  };
}
