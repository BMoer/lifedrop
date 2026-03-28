import { SAMPLE_RATE } from '../shared/constants.js';

/**
 * Creates a WebSocket connection for the sender role.
 * Sends start/config messages and provides a send() method for audio data.
 *
 * Returns an object with { send, close, encoding } and calls lifecycle callbacks.
 */
export function createSenderSocket({ sessionName, pin, onSession, onListeners, onClose, onError }) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    const startMsg = { type: 'start', role: 'sender' };
    if (sessionName) {
      startMsg.sessionName = sessionName;
    }
    if (pin) {
      startMsg.pin = pin;
    }
    ws.send(JSON.stringify(startMsg));
  };

  ws.onmessage = (event) => {
    if (typeof event.data !== 'string') return;

    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'session') {
        onSession(msg.sessionId);
      }
      if (msg.type === 'listeners') {
        onListeners(msg.count);
      }
      if (msg.type === 'error') {
        onError(msg.message);
      }
    } catch (err) {
      console.error('Failed to parse server message:', err);
    }
  };

  ws.onclose = () => onClose();
  ws.onerror = () => onError('Connection error');

  return {
    sendConfig(encoding, channels) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'config',
          sampleRate: SAMPLE_RATE,
          encoding,
          channels: channels || 2,
        }));
      }
    },

    sendAudio(buffer) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(buffer);
      }
    },

    close() {
      ws.close();
    },

    get isOpen() {
      return ws.readyState === WebSocket.OPEN;
    },
  };
}
