import {
  SAMPLE_RATE,
  CHANNELS,
  RING_BUFFER_SECONDS,
  PREBUFFER_SAMPLES,
  SKIP_THRESHOLD_SECONDS,
  SKIP_TARGET_SECONDS,
  TARGET_RMS,
  MAX_GAIN,
  MIN_GAIN,
  GAIN_SMOOTHING,
  RMS_SMOOTHING,
  RMS_FLOOR,
  COMPRESSOR_THRESHOLD,
  COMPRESSOR_KNEE,
  COMPRESSOR_RATIO,
  COMPRESSOR_ATTACK,
  COMPRESSOR_RELEASE,
} from '../shared/constants.js';

/**
 * Creates the listener audio playback pipeline:
 * WorkletNode → GainNode → CompressorNode → AnalyserNode → destination
 *
 * The compressor prevents clipping on loud signals.
 * Auto-gain gently normalizes volume. Compressor catches peaks.
 */
export async function createAudioPlayback({ onPlaybackStarted, onLevel }) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: SAMPLE_RATE,
  });
  await audioCtx.resume();

  // Load listener worklet
  await audioCtx.audioWorklet.addModule('/js/worklets/listener-worklet.js');

  const workletNode = new AudioWorkletNode(audioCtx, 'listener-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [CHANNELS],
    processorOptions: {
      bufferSeconds: RING_BUFFER_SECONDS,
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      prebufferSamples: PREBUFFER_SAMPLES,
      skipThresholdSeconds: SKIP_THRESHOLD_SECONDS,
      skipTargetSeconds: SKIP_TARGET_SECONDS,
    },
  });

  // Gain node for gentle auto-gain normalization
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 1.0;

  // Compressor/limiter — prevents clipping on loud signals
  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = COMPRESSOR_THRESHOLD;
  compressor.knee.value = COMPRESSOR_KNEE;
  compressor.ratio.value = COMPRESSOR_RATIO;
  compressor.attack.value = COMPRESSOR_ATTACK;
  compressor.release.value = COMPRESSOR_RELEASE;

  // Analyser for level meter / visualizer
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;

  // Chain: Worklet → Gain → Compressor → Analyser → Speakers
  workletNode.connect(gainNode);
  gainNode.connect(compressor);
  compressor.connect(analyser);
  analyser.connect(audioCtx.destination);

  // Auto-gain based on RMS from worklet
  let rmsSmoothed = 0;

  workletNode.port.onmessage = (event) => {
    const { type } = event.data;

    if (type === 'playback-started') {
      onPlaybackStarted();
    }

    if (type === 'level') {
      const { rms } = event.data;

      // Smooth auto-gain — conservative to avoid fighting the compressor
      rmsSmoothed = rmsSmoothed * RMS_SMOOTHING + rms * (1 - RMS_SMOOTHING);

      if (rmsSmoothed > RMS_FLOOR) {
        const desiredGain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET_RMS / rmsSmoothed));
        const currentGain = gainNode.gain.value;
        gainNode.gain.value = currentGain * GAIN_SMOOTHING + desiredGain * (1 - GAIN_SMOOTHING);
      }

      onLevel({ rms });
    }
  };

  return {
    audioCtx,
    analyser,

    feedAudio(float32, channels) {
      workletNode.port.postMessage({
        type: 'audio',
        samples: float32,
        channels: channels || CHANNELS,
      });
    },

    reset() {
      workletNode.port.postMessage({ type: 'reset' });
    },

    resume() {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    },

    destroy() {
      workletNode.disconnect();
      gainNode.disconnect();
      compressor.disconnect();
      analyser.disconnect();
      audioCtx.close();
    },
  };
}
