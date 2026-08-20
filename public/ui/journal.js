// Page dédiée au journal (§ demande) : le fil de l'opération, avec son propre onglet dans la
// barre du bas plutôt que noyé sous les scores, tabous et historique de missions du Dossier.
import { h, esc } from './components.js';

export function render(root, ctx) {
  const { room } = ctx.server;
  const log = (room.log || []).slice().reverse();

  const el = h(`
    <div class="screen screen-with-tabbar" style="gap:16px;">
      <div class="brand" style="padding-top:0;">
        <h1>Journal</h1>
        <p>Tout ce qui s'est passé, dans l'ordre.</p>
      </div>
      <div class="card">
        <div class="history-list">
          ${log.length === 0 ? '<p class="muted small">Rien pour l\'instant.</p>' : ''}
          ${log.map((entry) => `<div class="log-row">${esc(entry.text)}</div>`).join('')}
        </div>
      </div>
    </div>
  `);

  root.replaceChildren(el);
}
