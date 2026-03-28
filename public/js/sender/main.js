import { createAudioCapture } from './audio-capture.js';
import { createSenderSocket } from './websocket-sender.js';
import { generateQR } from '../vendor/qr.js';

// --- DOM Elements ---

const deviceSelect = document.getElementById('deviceSelect');
const sessionNameInput = document.getElementById('sessionName');
const goLiveBtn = document.getElementById('goLiveBtn');
const setupSection = document.getElementById('setupSection');
const liveSection = document.getElementById('liveSection');
const shareUrl = document.getElementById('shareUrl');
const copyBtn = document.getElementById('copyBtn');
const qrCanvas = document.getElementById('qrCanvas');
const listenerCountEl = document.getElementById('listenerCount');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');

// --- State ---

let socket = null;
let capture = null;

// --- Device Enumeration ---

async function loadDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput');

    deviceSelect.innerHTML = '';

    if (audioInputs.length === 0) {
      deviceSelect.innerHTML = '<option value="">No audio inputs found</option>';
      return;
    }

    audioInputs.forEach((device, i) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${i + 1}`;
      deviceSelect.appendChild(option);
    });
  } catch (err) {
    statusEl.textContent = `Error loading devices: ${err.message}`;
  }
}

// --- Go Live ---

async function goLive() {
  goLiveBtn.disabled = true;
  statusEl.textContent = 'Requesting audio access...';

  const deviceId = deviceSelect.value;

  let stream;
  try {
    const constraints = deviceId
      ? { audio: { deviceId: { exact: deviceId } } }
      : { audio: true };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    statusEl.textContent = `Microphone access denied: ${err.message}`;
    goLiveBtn.disabled = false;
    return;
  }

  // Reload devices (now with labels after permission grant)
  await loadDevices();
  statusEl.textContent = 'Connecting...';

  const sessionName = sessionNameInput.value.trim() || undefined;

  socket = createSenderSocket({
    sessionName,
    onSession: (sessionId) => startCapture(sessionId, stream),
    onListeners: (count) => { listenerCountEl.textContent = count; },
    onClose: () => {
      stopStream();
      statusEl.textContent = 'Connection lost.';
    },
    onError: (message) => {
      statusEl.textContent = message || 'WebSocket error.';
      goLiveBtn.disabled = false;
    },
  });
}

async function startCapture(sessionId, stream) {
  const url = `${location.origin}/s/${sessionId}`;
  shareUrl.textContent = url;
  setupSection.style.display = 'none';
  liveSection.classList.add('active');
  statusEl.textContent = '';

  // Generate QR code
  try {
    generateQR(url, qrCanvas);
    qrCanvas.style.display = 'block';
  } catch { /* QR generation optional */ }

  try {
    capture = await createAudioCapture({
      stream,
      onEncodedChunk: (buf) => socket.sendAudio(buf),
      onPcmChunk: (buf) => socket.sendAudio(buf),
    });

    socket.sendConfig(capture.encoding);
  } catch (err) {
    statusEl.textContent = `Audio capture failed: ${err.message}`;
    stopStream();
  }
}

// --- Copy Link ---

async function copyLink() {
  const url = shareUrl.textContent;
  try {
    await navigator.clipboard.writeText(url);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 2000);
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = url;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 2000);
  }
}

// --- Stop ---

function stopStream() {
  if (capture) {
    capture.destroy();
    capture = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  setupSection.style.display = '';
  liveSection.classList.remove('active');
  goLiveBtn.disabled = false;
}

// --- Event Listeners ---

goLiveBtn.addEventListener('click', goLive);
copyBtn.addEventListener('click', copyLink);
stopBtn.addEventListener('click', () => {
  stopStream();
  statusEl.textContent = 'Stream stopped.';
});

// --- Init ---

loadDevices();
navigator.mediaDevices.addEventListener('devicechange', loadDevices);
