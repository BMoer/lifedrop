/**
 * AudioWorkletProcessor for audio playback from a ring buffer.
 * Receives decoded audio chunks via MessagePort and outputs them
 * in the render callback. All buffer logic runs off the main thread.
 */
class ListenerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const bufferSeconds = options.processorOptions?.bufferSeconds || 30;
    const sampleRate = options.processorOptions?.sampleRate || 48000;

    this._bufferSize = sampleRate * bufferSeconds;
    this._buffer = new Float32Array(this._bufferSize);
    this._writePos = 0;
    this._readPos = 0;
    this._bufferedSamples = 0;
    this._playbackStarted = false;
    this._prebufferSamples = options.processorOptions?.prebufferSamples || (sampleRate * 0.8);
    this._sampleRate = sampleRate;
    this._skipThresholdSamples = (options.processorOptions?.skipThresholdSeconds || 3) * sampleRate;
    this._skipTargetSamples = (options.processorOptions?.skipTargetSeconds || 0.8) * sampleRate;
    this._frameCount = 0;

    this.port.onmessage = (event) => {
      const { type, samples } = event.data;
      if (type === 'audio') {
        this._writeToBuffer(samples);
      } else if (type === 'reset') {
        this._reset();
      }
    };
  }

  _writeToBuffer(float32) {
    for (let i = 0; i < float32.length; i++) {
      this._buffer[this._writePos] = float32[i];
      this._writePos = (this._writePos + 1) % this._bufferSize;
      this._bufferedSamples = Math.min(this._bufferedSamples + 1, this._bufferSize);
    }

    if (!this._playbackStarted && this._bufferedSamples >= this._prebufferSamples) {
      this._playbackStarted = true;
      this.port.postMessage({ type: 'playback-started' });
    }
  }

  _reset() {
    this._buffer.fill(0);
    this._writePos = 0;
    this._readPos = 0;
    this._bufferedSamples = 0;
    this._playbackStarted = false;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const channel = output[0];
    const needed = channel.length;

    if (!this._playbackStarted || this._bufferedSamples < needed) {
      // Underrun: gentle fade to silence
      for (let i = 0; i < needed; i++) {
        if (this._bufferedSamples > 0) {
          channel[i] = this._buffer[this._readPos] * (this._bufferedSamples / needed);
          this._readPos = (this._readPos + 1) % this._bufferSize;
          this._bufferedSamples--;
        } else {
          channel[i] = 0;
        }
      }
      return true;
    }

    // Normal playback
    for (let i = 0; i < needed; i++) {
      channel[i] = this._buffer[this._readPos];
      this._readPos = (this._readPos + 1) % this._bufferSize;
    }
    this._bufferedSamples -= needed;

    // Soft skip if too far behind live
    if (this._bufferedSamples > this._skipThresholdSamples) {
      const skip = this._bufferedSamples - this._skipTargetSamples;
      this._readPos = (this._readPos + skip) % this._bufferSize;
      this._bufferedSamples -= skip;
    }

    // Post level info every ~20 frames (~60ms) for UI meter
    this._frameCount++;
    if (this._frameCount % 20 === 0) {
      let rms = 0;
      for (let i = 0; i < needed; i++) {
        rms += channel[i] * channel[i];
      }
      rms = Math.sqrt(rms / needed);
      this.port.postMessage({
        type: 'level',
        rms,
        bufferedSamples: this._bufferedSamples,
      });
    }

    return true;
  }
}

registerProcessor('listener-processor', ListenerProcessor);
