const streamsList = document.getElementById('streamsList');
const emptyState = document.getElementById('emptyState');

const REFRESH_INTERVAL_MS = 5000;

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function renderStreams(sessions) {
  if (sessions.length === 0) {
    emptyState.style.display = '';
    return;
  }

  emptyState.style.display = 'none';

  // Remove old stream cards (keep emptyState)
  const existingCards = streamsList.querySelectorAll('.stream-card');
  existingCards.forEach(card => card.remove());

  sessions.forEach(session => {
    const card = document.createElement('a');
    card.href = `/s/${session.id}`;
    card.className = 'stream-card';

    const lockHtml = session.hasPin ? '<span class="lock-icon">🔒</span>' : '';

    card.innerHTML = `
      <div class="stream-info">
        <div class="stream-name">${escapeHtml(session.id)}${lockHtml}</div>
        <div class="stream-meta">
          <span>${session.listeners}</span> listener${session.listeners !== 1 ? 's' : ''} · started ${formatTimeAgo(session.createdAt)}
        </div>
      </div>
      <div class="stream-badge">
        <div class="live-dot-sm"></div>
      </div>
    `;

    streamsList.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function fetchSessions() {
  try {
    const res = await fetch('/api/sessions');
    if (!res.ok) return;
    const data = await res.json();
    renderStreams(data.sessions || []);
  } catch {
    // Network error — silent retry on next interval
  }
}

// Initial fetch + auto-refresh
fetchSessions();
setInterval(fetchSessions, REFRESH_INTERVAL_MS);
