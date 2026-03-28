import { SAMPLE_RATE, CHANNELS } from '../shared/constants.js';

/**
 * Creates an Opus decoder using WebCodecs AudioDecoder.
 * Falls back gracefully — returns null if WebCodecs unavailable.
 *
 * @param {Function} onDecoded - Callback receiving Float32Array of decoded samples
 * @returns {{ decode, destroy } | null}
 */
export function createOpusDecoder(onDecoded) {
  if (typeof AudioDecoder === 'undefined') {
    return null;
  }

  let decoderTimestamp = 0;

  const decoder = new AudioDecoder({
    output: (audioData) => {
      const numFrames = audioData.numberOfFrames;
      const numChannels = audioData.numberOfChannels;

      // Interleave channels: [L0, R0, L1, R1, ...]
      const interleaved = new Float32Array(numFrames * numChannels);

      if (numChannels === 1) {
        audioData.copyTo(interleaved, { planeIndex: 0 });
      } else {
        // Copy each plane separately then interleave
        const planes = [];
        for (let ch = 0; ch < numChannels; ch++) {
          const plane = new Float32Array(numFrames);
          audioData.copyTo(plane, { planeIndex: ch });
          planes.push(plane);
        }
        for (let i = 0; i < numFrames; i++) {
          for (let ch = 0; ch < numChannels; ch++) {
            interleaved[i * numChannels + ch] = planes[ch][i];
          }
        }
      }

      onDecoded(interleaved, numChannels);
      audioData.close();
    },
    error: () => {
      // Opus decode errors are recoverable — just skip the chunk
    },
  });

  decoder.configure({
    codec: 'opus',
    sampleRate: SAMPLE_RATE,
    numberOfChannels: CHANNELS,
  });

  return {
    decode(data) {
      if (decoder.state !== 'configured') return;

      const chunk = new EncodedAudioChunk({
        type: 'key',
        timestamp: decoderTimestamp,
        data,
      });
      decoder.decode(chunk);
      decoderTimestamp += 20000; // ~20ms per Opus frame
    },

    get isConfigured() {
      return decoder.state === 'configured';
    },

    destroy() {
      try { decoder.close(); } catch { /* already closed */ }
    },
  };
}
