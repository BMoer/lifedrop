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
      const float32 = new Float32Array(audioData.numberOfFrames);
      audioData.copyTo(float32, { planeIndex: 0 });
      onDecoded(float32);
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
