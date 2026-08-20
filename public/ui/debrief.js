import { h, esc } from './components.js';

export function render(root, ctx) {
  const { debrief, me } = ctx.server;
  const podium = debrief?.podium || [];
  const titles = debrief?.titles || {};
  const order = [1, 0, 2]; // 2e, 1er, 3e — mise en scène classique du podium

  const el = h(`
    <div class="screen">
      <div class="brand">
        <h1>Débriefing</h1>
        <p>Le repas est sauvé. Voici le tableau d'honneur.</p>
      </div>

      <div class="podium">
        ${order.map((i) => {
          const p = podium[i];
          if (!p) return '';
          const rank = i + 1;
          return `
            <div class="podium-step rank-${rank}">
              <div class="bar">
                <div style="font-size:1.4rem;">${rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</div>
              </div>
              <div class="name">${esc(p.name)}</div>
              <div class="score">${p.score} pts</div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="titles">
        ${titles.meilleurInfiltre ? `
          <div class="title-row"><span class="label">Meilleur infiltré</span><span class="spacer"></span><span class="who">${esc(titles.meilleurInfiltre.name)}</span></div>
        ` : ''}
        ${titles.angeGardien ? `
          <div class="title-row"><span class="label">Ange gardien</span><span class="spacer"></span><span class="who">${esc(titles.angeGardien.name)}</span></div>
        ` : ''}
        ${titles.roiDeLaContamination ? `
          <div class="title-row"><span class="label">Roi de la contamination</span><span class="spacer"></span><span class="who">${esc(titles.roiDeLaContamination.name)}</span></div>
        ` : ''}
      </div>

      ${me.isSpectator
        ? '<p class="muted small center">Merci d\'avoir suivi l\'opération 💛</p>'
        : `<p class="muted small center">Ton score final : <strong style="color:var(--accent)">${me.score}</strong></p>`
      }

      <button class="btn btn-block" id="leave">Quitter l'opération</button>
    </div>
  `);

  el.querySelector('#leave').addEventListener('click', () => ctx.actions.leave());

  root.replaceChildren(el);
}
