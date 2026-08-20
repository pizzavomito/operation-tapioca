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
// navigator.vibrate() renvoie true/false selon que le navigateur a accepté l'appel — utile
// pour diagnostiquer (voir #test-vibration dans home.js) plutôt que d'échouer en silence.
export function vibrate(pattern) {
  if (!('vibrate' in navigator)) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export function levelTag(level) {
  const label = { facile: 'Facile', moyen: 'Moyen', audacieux: 'Audacieux' }[level] || level;
  return `<span class="tag tag-${esc(level)}">${esc(label)}</span>`;
}
