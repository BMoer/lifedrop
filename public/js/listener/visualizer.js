/**
 * Canvas-based audio waveform visualizer.
 * Draws an oscilloscope-style waveform using data from an AnalyserNode.
 */

const WAVEFORM_COLOR = '#30d158';
const WAVEFORM_LINE_WIDTH = 2;

/**
 * Starts rendering a waveform on the given canvas using the analyser node.
 * Returns a stop function.
 *
 * @param {AnalyserNode} analyser
 * @param {HTMLCanvasElement} canvas
 * @returns {{ stop: Function }}
 */
export function createVisualizer(analyser, canvas) {
  const ctx = canvas.getContext('2d');
  let animationId = null;
  let running = true;

  // Use time domain data for oscilloscope waveform
  analyser.fftSize = 2048;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  function draw() {
    if (!running) return;

    animationId = requestAnimationFrame(draw);

    const width = canvas.getBoundingClientRect().width;
    const height = canvas.getBoundingClientRect().height;

    analyser.getByteTimeDomainData(dataArray);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw waveform
    ctx.lineWidth = WAVEFORM_LINE_WIDTH;
    ctx.strokeStyle = WAVEFORM_COLOR;
    ctx.beginPath();

    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0; // normalize to 0-2 range
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  draw();

  return {
    stop() {
      running = false;
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      window.removeEventListener('resize', resizeCanvas);
    },
  };
}
