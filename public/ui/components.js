// Petits utilitaires partagés entre écrans.

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Retour haptique uniquement — zéro son, partout (§6 du PRD).
export function vibrate(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}

export function levelTag(level) {
  const label = { facile: 'Facile', moyen: 'Moyen', audacieux: 'Audacieux' }[level] || level;
  return `<span class="tag tag-${esc(level)}">${esc(label)}</span>`;
}
