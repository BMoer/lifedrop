import { createAudioPlayback } from './audio-playback.js';
import { createOpusDecoder } from './opus-decoder.js';
import { createListenerSocket } from './websocket-listener.js';
import { setupBackgroundAudio } from './background-audio.js';
import { createVisualizer } from './visualizer.js';

// --- DOM Elements ---

const statusEl = document.getElementById('status');
const playBtn = document.getElementById('playBtn');
const listeningSection = document.getElementById('listeningSection');
const levelBar = document.getElementById('levelBar');
const listenerCountEl = document.getElementById('listenerCount');
const endedSection = document.getElementById('endedSection');
const visualizerCanvas = document.getElementById('visualizer');

// --- Session ID ---

const sessionId = location.pathname.split('/s/')[1];
if (!sessionId) {
  statusEl.textContent = 'No session ID in URL.';
  statusEl.classList.add('error');
}

// --- State ---

let playback = null;
let decoder = null;
let socket = null;
let bgAudio = null;
let visualizer = null;
let encoding = 'pcm';
let isPlaying = false;

// --- Level Meter ---

function updateLevelMeter(analyser) {
  if (!isPlaying) return;

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);

  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
  const avg = sum / dataArray.length;
  levelBar.style.width = Math.min(100, (avg / 128) * 100) + '%';

  requestAnimationFrame(() => updateLevelMeter(analyser));
}

// --- Audio Data Handler ---

function handleAudioData(data) {
  if (!playback) return;

  if (encoding === 'opus' && decoder) {
    decoder.decode(data);
  } else {
    // PCM fallback: Int16 → Float32
    const int16 = new Int16Array(data);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF);
    }
    playback.feedAudio(float32);
  }
}

// --- Start Playback ---

async function startPlayback() {
  if (playback) return;

  try {
    playback = await createAudioPlayback({
      onPlaybackStarted: () => {
        // Prebuffer filled, audio will start
      },
      onLevel: ({ rms }) => {
        // Level updates handled via analyser in updateLevelMeter
      },
    });

    // Setup Opus decoder if needed
    if (encoding === 'opus') {
      decoder = createOpusDecoder((float32) => {
        playback.feedAudio(float32);
      });
    }

    // Background audio hacks
    bgAudio = setupBackgroundAudio(() => playback?.audioCtx);

    isPlaying = true;
    updateLevelMeter(playback.analyser);

    // Start waveform visualizer
    visualizer = createVisualizer(playback.analyser, visualizerCanvas);
  } catch (err) {
    statusEl.textContent = `Audio playback failed: ${err.message}`;
    statusEl.classList.add('error');
  }
}

// --- WebSocket Connection ---

function connectSocket() {
  socket = createListenerSocket({
    sessionId,
    onJoined: () => {
      if (!isPlaying) {
        statusEl.textContent = 'Waiting for audio...';
        statusEl.classList.add('connected');
        playBtn.classList.add('visible');
      }
    },
    onConfig: (msg) => {
      encoding = msg.encoding || 'pcm';

      // Re-init decoder on reconnect if needed
      if (encoding === 'opus' && isPlaying && (!decoder || !decoder.isConfigured)) {
        decoder = createOpusDecoder((float32) => {
          playback.feedAudio(float32);
        });
      }
    },
    onAudioData: handleAudioData,
    onListeners: (count) => {
      listenerCountEl.textContent = count;
    },
    onEnded: () => {
      statusEl.textContent = '';
      listeningSection.classList.remove('active');
      playBtn.classList.remove('visible');
      endedSection.classList.add('active');
      isPlaying = false;
    },
    onError: (message) => {
      statusEl.textContent = message;
      statusEl.classList.add('error');
    },
    onReconnecting: () => {
      if (isPlaying) {
        statusEl.textContent = 'Reconnecting...';
      }
    },
  });
}

// --- Play Button ---

playBtn.addEventListener('click', async () => {
  playBtn.classList.remove('visible');
  statusEl.textContent = '';
  listeningSection.classList.add('active');
  await startPlayback();
});

// --- Init ---

if (sessionId) {
  connectSocket();
}
