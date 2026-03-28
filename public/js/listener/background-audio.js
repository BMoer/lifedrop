/**
 * Sets up background audio hacks to keep audio playing when the browser
 * is backgrounded on mobile:
 * - MediaSession API metadata + disabled pause/stop
 * - Silent <audio> loop to keep iOS audio session alive
 * - Visibility change handler to resume AudioContext
 */
export function setupBackgroundAudio(getAudioCtx) {
  // Media Session metadata
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'LiveDrop',
      artist: 'Live Stream',
    });
    navigator.mediaSession.setActionHandler('pause', () => {});
    navigator.mediaSession.setActionHandler('stop', () => {});
  }

  // Silent <audio> loop keeps iOS audio session alive
  const keepAlive = document.createElement('audio');
  keepAlive.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  keepAlive.loop = true;
  keepAlive.volume = 0.01;
  keepAlive.play().catch(() => {});

  // Resume AudioContext on visibility change
  const handler = () => {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  };

  document.addEventListener('visibilitychange', handler);

  return {
    destroy() {
      document.removeEventListener('visibilitychange', handler);
      keepAlive.pause();
      keepAlive.src = '';
    },
  };
}
