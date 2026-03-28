/**
 * AudioWorkletProcessor for capturing audio from the microphone.
 * Supports mono and stereo capture. Accumulates 128-frame render quanta
 * into larger chunks and posts planar channel data to the main thread.
 */
class SenderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const chunkSize = options.processorOptions?.chunkSize || 2048;
    const channels = options.processorOptions?.channels || 2;

    this._chunkSize = chunkSize;
    this._channels = channels;
    this._buffers = [];
    for (let ch = 0; ch < channels; ch++) {
      this._buffers.push(new Float32Array(chunkSize));
    }
    this._writePos = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const numInputChannels = input.length;
    const frameCount = input[0].length;

    for (let i = 0; i < frameCount; i++) {
      for (let ch = 0; ch < this._channels; ch++) {
        // If input has fewer channels than requested, duplicate channel 0
        const srcCh = ch < numInputChannels ? ch : 0;
        this._buffers[ch][this._writePos] = input[srcCh][i];
      }
      this._writePos++;

      if (this._writePos >= this._chunkSize) {
        // Send copies of all channel buffers
        const channelData = this._buffers.map(buf => buf.slice());
        this.port.postMessage({
          type: 'audio',
          channelData,
          channels: this._channels,
        });
        this._writePos = 0;
      }
    }

    return true;
  }
}

registerProcessor('sender-processor', SenderProcessor);
