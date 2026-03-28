/**
 * Minimal QR code generator using the QR Server API as image source.
 * Renders a QR code onto a canvas element.
 *
 * For offline/PWA use, falls back to displaying the URL text.
 */
export function generateQR(text, canvas, size = 200) {
  const ctx = canvas.getContext('2d');
  canvas.width = size;
  canvas.height = size;

  // Use QR Server API to generate QR code image
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
  };
  img.onerror = () => {
    // Fallback: show URL as text on canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Scan QR not available', size / 2, size / 2 - 10);
    ctx.fillText('Use link above', size / 2, size / 2 + 10);
  };

  const encodedText = encodeURIComponent(text);
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedText}&bgcolor=ffffff&color=000000`;
}
