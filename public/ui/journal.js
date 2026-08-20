// Page dédiée au journal (§ demande) : le fil de l'opération, sorti de l'écran Dossier où il
// était noyé sous les scores, tabous et historique de missions.
import { h, esc } from './components.js';

export function render(root, ctx) {
  const { room } = ctx.server;
  const log = (room.log || []).slice().reverse();

  const el = h(`
    <div class="screen screen-with-tabbar" style="gap:16px;">
      <div class="row">
        <button class="btn" id="journal-back">← Retour</button>
      </div>
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

  el.querySelector('#journal-back').addEventListener('click', () => ctx.setUI({ view: 'dossier' }));

  root.replaceChildren(el);
}
