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

// Confirmation en deux temps sur un bouton (« Terminer l'opération », « Quitter l'opération »...) :
// premier tap arme le bouton avec un texte différent, deuxième tap dans la fenêtre déclenche
// vraiment l'action. Évite une boîte de dialogue native (bruyante, pas dans le ton du jeu).
export function mountTwoTapConfirm(btn, { armedText, onConfirm, timeoutMs = 4000 }) {
  if (!btn) return;
  const originalText = btn.textContent;
  let confirming = false;
  let resetTimer = null;
  btn.addEventListener('click', () => {
    if (!confirming) {
      confirming = true;
      btn.textContent = armedText;
      resetTimer = setTimeout(() => {
        confirming = false;
        btn.textContent = originalText;
      }, timeoutMs);
    } else {
      clearTimeout(resetTimer);
      onConfirm();
    }
  });
}
