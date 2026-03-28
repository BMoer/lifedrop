// Audio configuration constants
export const SAMPLE_RATE = 48000;
export const OPUS_BITRATE = 510000; // Max Opus: 510kbps stereo, 256kbps mono
export const CHANNELS = 2; // Stereo for max quality

// Sender capture
export const CAPTURE_BUFFER_SIZE = 2048; // ~43ms at 48kHz

// Listener playback
export const PLAYBACK_BUFFER_SIZE = 4096; // ~85ms at 48kHz
export const RING_BUFFER_SECONDS = 30;
export const PREBUFFER_MS = 800;
export const PREBUFFER_SAMPLES = SAMPLE_RATE * (PREBUFFER_MS / 1000);
export const SKIP_THRESHOLD_SECONDS = 3;
export const SKIP_TARGET_SECONDS = 0.8;

// Auto-gain
export const TARGET_RMS = 0.15;
export const MAX_GAIN = 3.0;
export const MIN_GAIN = 0.5;
export const GAIN_SMOOTHING = 0.97;
export const RMS_SMOOTHING = 0.95;
export const RMS_FLOOR = 0.001;

// Reconnect
export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MULTIPLIER = 1.5;
export const RECONNECT_MAX_MS = 10000;
