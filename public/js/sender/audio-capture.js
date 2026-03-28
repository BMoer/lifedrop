import { SAMPLE_RATE, OPUS_BITRATE, CHANNELS, CAPTURE_BUFFER_SIZE } from '../shared/constants.js';

/**
 * Creates an audio capture pipeline using AudioWorklet for mic/line-in capture
 * and WebCodecs AudioEncoder for Opus encoding.
 *
 * Returns a cleanup function to stop capture.
 */
export async function createAudioCapture({ stream, onEncodedChunk, onPcmChunk }) {
  const supportsOpus = typeof AudioEncoder !== 'undefined';
  const encoding = supportsOpus ? 'opus' : 'pcm';

  const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = audioCtx.createMediaStreamSource(stream);

  let encoder = null;
  let encoderTimestamp = 0;

  if (supportsOpus) {
    encoder = new AudioEncoder({
      output: (chunk) => {
        const buf = new ArrayBuffer(chunk.byteLength);
        chunk.copyTo(buf);
        onEncodedChunk(buf);
      },
      error: (err) => console.error('AudioEncoder error:', err),
    });

    encoder.configure({
      codec: 'opus',
      sampleRate: SAMPLE_RATE,
      numberOfChannels: CHANNELS,
      bitrate: OPUS_BITRATE,
    });
  }

  // Register and connect AudioWorklet
  await audioCtx.audioWorklet.addModule('/js/worklets/sender-worklet.js');

  const workletNode = new AudioWorkletNode(audioCtx, 'sender-processor', {
    processorOptions: { chunkSize: CAPTURE_BUFFER_SIZE },
  });

  workletNode.port.onmessage = (event) => {
    if (event.data.type !== 'audio') return;
    const float32 = event.data.samples;

    if (encoder && encoder.state === 'configured') {
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: SAMPLE_RATE,
        numberOfFrames: float32.length,
        numberOfChannels: CHANNELS,
        timestamp: encoderTimestamp,
        data: float32,
      });
      encoder.encode(audioData);
      audioData.close();
      encoderTimestamp += (float32.length / SAMPLE_RATE) * 1_000_000;
    } else {
      // Fallback: raw Int16 PCM
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      onPcmChunk(int16.buffer);
    }
  };

  source.connect(workletNode);
  // Connect to destination to keep the graph alive (output is silence from worklet)
  workletNode.connect(audioCtx.destination);

  // Return encoding type and cleanup function
  return {
    encoding,
    destroy() {
      if (encoder) {
        try { encoder.close(); } catch { /* already closed */ }
      }
      workletNode.disconnect();
      source.disconnect();
      audioCtx.close();
      stream.getTracks().forEach(t => t.stop());
    },
  };
}
