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

// Auto-gain (conservative to prevent clipping)
export const TARGET_RMS = 0.12;
export const MAX_GAIN = 1.5;
export const MIN_GAIN = 0.3;
export const GAIN_SMOOTHING = 0.98;
export const RMS_SMOOTHING = 0.95;
export const RMS_FLOOR = 0.001;

// Compressor/limiter settings
export const COMPRESSOR_THRESHOLD = -6;   // dB — start compressing at -6dB
export const COMPRESSOR_KNEE = 6;         // dB — soft knee
export const COMPRESSOR_RATIO = 4;        // 4:1 compression
export const COMPRESSOR_ATTACK = 0.003;   // 3ms attack (fast, catches transients)
export const COMPRESSOR_RELEASE = 0.1;    // 100ms release

// Reconnect
export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MULTIPLIER = 1.5;
export const RECONNECT_MAX_MS = 10000;
