import { h, esc, levelTag, vibrate } from './components.js';

export function render(root, ctx) {
  const { me, players } = ctx.server;
  const mission = me.missionQueue[0] || null;
  const lastValidated = [...me.missionHistory].reverse().find((h) => h.status === 'validated');
  const contaminationTarget = mission?.id || lastValidated?.missionId || null;

  const el = h(`
    <div class="screen" style="gap:14px;">
      <div class="row">
        <span class="muted small">Salle : ${esc(ctx.server.room.code)}</span>
        <span class="spacer"></span>
        <span class="muted small">Score : <strong style="color:var(--accent)">${me.score}</strong></span>
      </div>

      <div class="card mission-card">
        ${mission ? `
          ${levelTag(mission.level)}
          <p class="mission-text">${esc(mission.text)}</p>
          <div class="mission-actions">
            <button class="btn btn-ghost" id="skip">Passer</button>
            <button class="btn btn-primary btn-block" id="done">C'est fait</button>
          </div>
        ` : `
          <p class="mission-text muted">Aucune mission active pour l'instant.</p>
        `}
      </div>

      <button class="btn btn-block" id="contamination" ${contaminationTarget ? '' : 'disabled'}>
        🫧 Contamination sur un non-joueur
      </button>

      <div class="energy-wrap">
        <div class="energy-label"><span>Énergie sociale</span><span id="energy-value">${me.energy}</span></div>
        <input type="range" min="0" max="100" value="${me.energy}" class="energy-slider" id="energy" />
      </div>

      <div class="gauges">
        ${players.map((p) => `
          <div class="gauge ${p.energy < 25 ? 'low' : ''}">
            <div class="name">${esc(p.name)}${p.id === me.id ? ' (toi)' : ''}</div>
            <div class="bar"><span style="width:${p.energy}%"></span></div>
          </div>
        `).join('')}
      </div>

      <div class="bottom-nav">
        <button class="btn active" id="nav-terrain">Terrain</button>
        <button class="btn" id="nav-dossier">Dossier</button>
      </div>
    </div>
  `);

  if (mission) {
    el.querySelector('#done').addEventListener('click', () => {
      vibrate(20);
      ctx.actions.missionDone(mission.id);
    });
    el.querySelector('#skip').addEventListener('click', () => ctx.actions.missionSkip(mission.id));
  }

  el.querySelector('#contamination').addEventListener('click', () => {
    if (!contaminationTarget) return;
    vibrate([20, 40, 20]);
    ctx.actions.contaminationClaim(contaminationTarget);
  });

  const energyInput = el.querySelector('#energy');
  const energyValue = el.querySelector('#energy-value');
  let energyDebounce = null;
  energyInput.addEventListener('input', () => {
    energyValue.textContent = energyInput.value;
    clearTimeout(energyDebounce);
    energyDebounce = setTimeout(() => ctx.actions.setEnergy(Number(energyInput.value)), 200);
  });

  el.querySelector('#nav-dossier').addEventListener('click', () => ctx.setUI({ view: 'dossier' }));

  root.replaceChildren(el);
}
