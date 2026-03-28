import { SAMPLE_RATE, OPUS_BITRATE, CHANNELS, CAPTURE_BUFFER_SIZE } from '../shared/constants.js';

/**
 * Creates an audio capture pipeline using AudioWorklet for mic/line-in capture
 * and WebCodecs AudioEncoder for Opus encoding.
 * Supports mono and stereo based on CHANNELS constant.
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
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [CHANNELS],
    processorOptions: {
      chunkSize: CAPTURE_BUFFER_SIZE,
      channels: CHANNELS,
    },
  });

  workletNode.port.onmessage = (event) => {
    if (event.data.type !== 'audio') return;
    const { channelData, channels } = event.data;

    if (encoder && encoder.state === 'configured') {
      // Create planar AudioData from channel buffers
      const framesPerChannel = channelData[0].length;
      const planarData = new Float32Array(framesPerChannel * channels);

      // f32-planar format: all samples of ch0, then all samples of ch1, etc.
      for (let ch = 0; ch < channels; ch++) {
        planarData.set(channelData[ch], ch * framesPerChannel);
      }

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: SAMPLE_RATE,
        numberOfFrames: framesPerChannel,
        numberOfChannels: channels,
        timestamp: encoderTimestamp,
        data: planarData,
      });
      encoder.encode(audioData);
      audioData.close();
      encoderTimestamp += (framesPerChannel / SAMPLE_RATE) * 1_000_000;
    } else {
      // Fallback: raw Int16 PCM (interleaved for stereo)
      const framesPerChannel = channelData[0].length;
      const int16 = new Int16Array(framesPerChannel * channels);

      for (let i = 0; i < framesPerChannel; i++) {
        for (let ch = 0; ch < channels; ch++) {
          const s = Math.max(-1, Math.min(1, channelData[ch][i]));
          int16[i * channels + ch] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
      }
      onPcmChunk(int16.buffer);
    }
  };

  source.connect(workletNode);
  workletNode.connect(audioCtx.destination);

  return {
    encoding,
    channels: CHANNELS,
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
