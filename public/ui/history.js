import { h, esc } from './components.js';

function fmtDate(ts) {
  return new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function renderList(root, ctx) {
  root.replaceChildren(h('<div class="screen center"><p class="muted">Chargement…</p></div>'));
  let games = [];
  try {
    const res = await fetch('/api/history');
    games = await res.json();
  } catch {
    games = []; // hors ligne ou serveur indisponible : liste vide plutôt qu'une erreur bloquante
  }
  if (ctx.ui.showHistory !== true) return; // l'utilisateur est reparti pendant le chargement

  const el = h(`
    <div class="screen">
      <div class="brand">
        <h1>Historique</h1>
        <p>Les opérations passées, pour se souvenir.</p>
      </div>
      ${games.length === 0 ? '<p class="muted small center">Aucune partie terminée pour l\'instant.</p>' : ''}
      <div class="stack">
        ${games.map((g) => `
          <button class="btn btn-block history-row-btn" data-id="${esc(g.id)}">
            <span class="history-row-main">
              <strong>${esc(g.code)}</strong>
              <span class="muted small">${esc(fmtDate(g.endedAt))} · ${g.playerCount} agent(s)</span>
            </span>
            <span class="muted small">${g.podium[0] ? '🥇 ' + esc(g.podium[0].name) : ''}</span>
          </button>
        `).join('')}
      </div>
      <button class="btn btn-ghost btn-block" id="history-back">Retour</button>
    </div>
  `);

  el.querySelectorAll('[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.setUI({ historyDetailId: btn.dataset.id }));
  });
  el.querySelector('#history-back').addEventListener('click', () => ctx.setUI({ showHistory: false, historyDetailId: null }));

  root.replaceChildren(el);
}

export async function renderDetail(root, ctx) {
  root.replaceChildren(h('<div class="screen center"><p class="muted">Chargement…</p></div>'));
  const id = ctx.ui.historyDetailId;
  let game = null;
  try {
    const res = await fetch(`/api/history/${encodeURIComponent(id)}`);
    if (res.ok) game = await res.json();
  } catch {
    game = null;
  }
  if (ctx.ui.historyDetailId !== id) return; // l'utilisateur a changé d'écran pendant le chargement

  if (!game) {
    const el = h(`
      <div class="screen center">
        <p class="muted">Partie introuvable.</p>
        <button class="btn" id="history-back">Retour</button>
      </div>
    `);
    el.querySelector('#history-back').addEventListener('click', () => ctx.setUI({ historyDetailId: null }));
    root.replaceChildren(el);
    return;
  }

  const podium = game.debrief?.podium || [];
  const titles = game.debrief?.titles || {};
  const chat = game.chat || [];
  const log = (game.log || []).slice().reverse();

  const el = h(`
    <div class="screen" style="gap:16px;">
      <div class="brand">
        <h1>${esc(game.code)}</h1>
        <p>${esc(fmtDate(game.endedAt))}</p>
      </div>

      <div class="card">
        <h3 style="margin-bottom:10px;">Podium</h3>
        <div class="score-list">
          ${podium.map((p, i) => `
            <div class="score-row">
              <span class="rank">${i + 1}</span>
              <span style="flex:1;">${esc(p.name)}</span>
              <span class="score">${p.score}</span>
            </div>
          `).join('') || '<p class="muted small">Aucun agent classé.</p>'}
        </div>
      </div>

      ${titles.meilleurInfiltre || titles.angeGardien || titles.roiDeLaContamination ? `
        <div class="titles">
          ${titles.meilleurInfiltre ? `<div class="title-row"><span class="label">Meilleur infiltré</span><span class="spacer"></span><span class="who">${esc(titles.meilleurInfiltre.name)}</span></div>` : ''}
          ${titles.angeGardien ? `<div class="title-row"><span class="label">Ange gardien</span><span class="spacer"></span><span class="who">${esc(titles.angeGardien.name)}</span></div>` : ''}
          ${titles.roiDeLaContamination ? `<div class="title-row"><span class="label">Roi de la contamination</span><span class="spacer"></span><span class="who">${esc(titles.roiDeLaContamination.name)}</span></div>` : ''}
        </div>
      ` : ''}

      <div class="card">
        <h3 style="margin-bottom:10px;">Journal</h3>
        <div class="history-list">
          ${log.length === 0 ? '<p class="muted small">Rien.</p>' : ''}
          ${log.map((e) => `<div class="log-row">${esc(e.text)}</div>`).join('')}
        </div>
      </div>

      ${chat.length ? `
        <div class="card">
          <h3 style="margin-bottom:10px;">Chat</h3>
          <div class="chat-messages chat-messages-inline" style="max-height:320px;">
            ${chat.map((m) => `
              <div class="chat-msg">
                <div class="chat-msg-name">${esc(m.name)}${m.isSpectator ? ' 👀' : ''}</div>
                <div class="chat-msg-text">${esc(m.text)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <button class="btn btn-ghost btn-block" id="history-back">Retour à la liste</button>
    </div>
  `);
  el.querySelector('#history-back').addEventListener('click', () => ctx.setUI({ historyDetailId: null }));
  root.replaceChildren(el);
}
