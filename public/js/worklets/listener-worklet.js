/**
 * AudioWorkletProcessor for audio playback from interleaved ring buffer.
 * Supports mono and stereo. Receives decoded audio chunks via MessagePort
 * and outputs them in the render callback.
 */
class ListenerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const bufferSeconds = options.processorOptions?.bufferSeconds || 30;
    const sampleRate = options.processorOptions?.sampleRate || 48000;
    const channels = options.processorOptions?.channels || 2;

    this._channels = channels;
    this._sampleRate = sampleRate;
    // Buffer stores interleaved samples: [L0, R0, L1, R1, ...]
    this._bufferSize = sampleRate * bufferSeconds * channels;
    this._buffer = new Float32Array(this._bufferSize);
    this._writePos = 0;
    this._readPos = 0;
    // bufferedFrames = number of complete frames (not individual samples)
    this._bufferedFrames = 0;
    this._maxFrames = sampleRate * bufferSeconds;
    this._playbackStarted = false;
    this._prebufferFrames = options.processorOptions?.prebufferSamples
      ? Math.floor(options.processorOptions.prebufferSamples)
      : Math.floor(sampleRate * 0.8);
    this._skipThresholdFrames = (options.processorOptions?.skipThresholdSeconds || 3) * sampleRate;
    this._skipTargetFrames = (options.processorOptions?.skipTargetSeconds || 0.8) * sampleRate;
    this._frameCount = 0;

    this.port.onmessage = (event) => {
      const { type } = event.data;
      if (type === 'audio') {
        this._writeToBuffer(event.data.samples, event.data.channels || this._channels);
      } else if (type === 'reset') {
        this._reset();
      }
    };
  }

  _writeToBuffer(float32, incomingChannels) {
    const ch = this._channels;

    if (incomingChannels === ch) {
      // Data is already interleaved with correct channel count
      const frames = float32.length / ch;
      for (let i = 0; i < float32.length; i++) {
        this._buffer[this._writePos] = float32[i];
        this._writePos = (this._writePos + 1) % this._bufferSize;
      }
      this._bufferedFrames = Math.min(this._bufferedFrames + frames, this._maxFrames);
    } else if (incomingChannels === 1 && ch === 2) {
      // Mono → Stereo: duplicate to both channels
      for (let i = 0; i < float32.length; i++) {
        this._buffer[this._writePos] = float32[i];
        this._writePos = (this._writePos + 1) % this._bufferSize;
        this._buffer[this._writePos] = float32[i];
        this._writePos = (this._writePos + 1) % this._bufferSize;
      }
      this._bufferedFrames = Math.min(this._bufferedFrames + float32.length, this._maxFrames);
    } else {
      // Stereo → Mono or other: take first channel
      const frames = float32.length / incomingChannels;
      for (let f = 0; f < frames; f++) {
        const sample = float32[f * incomingChannels];
        for (let c = 0; c < ch; c++) {
          this._buffer[this._writePos] = sample;
          this._writePos = (this._writePos + 1) % this._bufferSize;
        }
      }
      this._bufferedFrames = Math.min(this._bufferedFrames + frames, this._maxFrames);
    }

    if (!this._playbackStarted && this._bufferedFrames >= this._prebufferFrames) {
      this._playbackStarted = true;
      this.port.postMessage({ type: 'playback-started' });
    }
  }

  _reset() {
    this._buffer.fill(0);
    this._writePos = 0;
    this._readPos = 0;
    this._bufferedFrames = 0;
    this._playbackStarted = false;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const needed = output[0].length; // frames needed
    const ch = this._channels;

    if (!this._playbackStarted || this._bufferedFrames < needed) {
      // Underrun: gentle fade to silence
      for (let i = 0; i < needed; i++) {
        const fade = this._bufferedFrames > 0 ? (this._bufferedFrames / needed) : 0;
        if (this._bufferedFrames > 0) {
          for (let c = 0; c < ch && c < output.length; c++) {
            output[c][i] = this._buffer[this._readPos + c] * fade;
          }
          this._readPos = (this._readPos + ch) % this._bufferSize;
          this._bufferedFrames--;
        } else {
          for (let c = 0; c < output.length; c++) {
            output[c][i] = 0;
          }
        }
      }
      return true;
    }

    // Normal playback — read interleaved into separate output channels
    for (let i = 0; i < needed; i++) {
      for (let c = 0; c < ch && c < output.length; c++) {
        output[c][i] = this._buffer[this._readPos + c];
      }
      // If output has more channels than buffer, fill with channel 0
      for (let c = ch; c < output.length; c++) {
        output[c][i] = this._buffer[this._readPos];
      }
      this._readPos = (this._readPos + ch) % this._bufferSize;
    }
    this._bufferedFrames -= needed;

    // Soft skip if too far behind live
    if (this._bufferedFrames > this._skipThresholdFrames) {
      const skip = this._bufferedFrames - this._skipTargetFrames;
      this._readPos = (this._readPos + skip * ch) % this._bufferSize;
      this._bufferedFrames -= skip;
    }

    // Post level info for UI meter
    this._frameCount++;
    if (this._frameCount % 20 === 0) {
      let rms = 0;
      // Use channel 0 for level
      for (let i = 0; i < needed; i++) {
        rms += output[0][i] * output[0][i];
      }
      rms = Math.sqrt(rms / needed);
      this.port.postMessage({
        type: 'level',
        rms,
        bufferedFrames: this._bufferedFrames,
      });
    }

    return true;
  }
}

registerProcessor('listener-processor', ListenerProcessor);
