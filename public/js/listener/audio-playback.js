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
} from '../shared/constants.js';

/**
 * Creates the listener audio playback pipeline:
 * AudioWorkletNode (ring buffer) → GainNode (auto-gain) → AnalyserNode → destination
 *
 * Returns controls for feeding audio data and reading levels.
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

  // Gain node for auto-gain normalization
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 1.0;

  // Analyser for level meter / visualizer
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;

  workletNode.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(audioCtx.destination);

  // Auto-gain based on RMS from worklet
  let rmsSmoothed = 0;

  workletNode.port.onmessage = (event) => {
    const { type } = event.data;

    if (type === 'playback-started') {
      onPlaybackStarted();
    }

    if (type === 'level') {
      const { rms, bufferedSamples } = event.data;

      // Smooth auto-gain adjustment
      rmsSmoothed = rmsSmoothed * RMS_SMOOTHING + rms * (1 - RMS_SMOOTHING);

      if (rmsSmoothed > RMS_FLOOR) {
        const desiredGain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET_RMS / rmsSmoothed));
        const currentGain = gainNode.gain.value;
        gainNode.gain.value = currentGain * GAIN_SMOOTHING + desiredGain * (1 - GAIN_SMOOTHING);
      }

      onLevel({ rms, bufferedSamples });
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
      analyser.disconnect();
      audioCtx.close();
    },
  };
}
