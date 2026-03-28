/**
 * AudioWorkletProcessor for capturing audio from the microphone.
 * Accumulates 128-frame render quanta into larger chunks (~2048 samples)
 * and posts them to the main thread for encoding.
 */
class SenderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const chunkSize = options.processorOptions?.chunkSize || 2048;
    this._buffer = new Float32Array(chunkSize);
    this._writePos = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._writePos] = channelData[i];
      this._writePos++;

      if (this._writePos >= this._buffer.length) {
        // Send a copy to main thread
        this.port.postMessage({
          type: 'audio',
          samples: this._buffer.slice(),
        });
        this._writePos = 0;
      }
    }

    return true;
  }
}

registerProcessor('sender-processor', SenderProcessor);
