import { h, esc, levelTag, vibrate } from './components.js';

export function render(root, ctx) {
  const { me, players } = ctx.server;
  const mission = me.missionQueue[0] || null;
  const lastValidated = [...me.missionHistory].reverse().find((h) => h.status === 'validated');
  const contaminationTarget = mission?.id || lastValidated?.missionId || null;

  const pendingClaims = me.pendingClaims || [];
  const pendingMission = mission && pendingClaims.find((c) => c.kind === 'mission' && c.missionId === mission.id);
  const pendingContamination = contaminationTarget && pendingClaims.find((c) => c.kind === 'contamination' && c.missionId === contaminationTarget);

  const el = h(`
    <div class="screen screen-with-tabbar" style="gap:14px;">
      <div class="row">
        <span class="muted small">Salle : ${esc(ctx.server.room.code)}</span>
        <span class="spacer"></span>
        <span class="muted small">Score : <strong style="color:var(--accent)">${me.score}</strong></span>
      </div>

      <div class="card mission-card">
        ${mission ? `
          ${levelTag(mission.level)}
          <p class="mission-text">${esc(mission.text)}</p>
          ${pendingMission ? `
            <p class="muted small">⏳ En attente d'un témoin pour valider…</p>
          ` : `
            <div class="mission-actions">
              <button class="btn btn-ghost" id="skip">Passer</button>
              <button class="btn btn-primary btn-block" id="done">C'est fait</button>
            </div>
          `}
        ` : `
          <p class="mission-text muted">Aucune mission active pour l'instant.</p>
        `}
      </div>

      <button class="btn btn-block" id="contamination" ${contaminationTarget && !pendingContamination ? '' : 'disabled'}>
        ${pendingContamination ? '⏳ Contamination en attente de témoins…' : '🫧 Contamination sur un non-joueur'}
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
    </div>
  `);

  if (mission && !pendingMission) {
    el.querySelector('#done').addEventListener('click', (e) => {
      e.target.disabled = true; // évite un double-tap avant que le nouvel état n'arrive du serveur
      vibrate(20);
      ctx.actions.missionDone(mission.id);
    });
    el.querySelector('#skip').addEventListener('click', () => ctx.actions.missionSkip(mission.id));
  }

  if (contaminationTarget && !pendingContamination) {
    el.querySelector('#contamination').addEventListener('click', (e) => {
      e.currentTarget.disabled = true;
      vibrate([20, 40, 20]);
      ctx.actions.contaminationClaim(contaminationTarget);
    });
  }

  const energyInput = el.querySelector('#energy');
  const energyValue = el.querySelector('#energy-value');
  let energyDebounce = null;
  energyInput.addEventListener('input', () => {
    energyValue.textContent = energyInput.value;
    clearTimeout(energyDebounce);
    energyDebounce = setTimeout(() => ctx.actions.setEnergy(Number(energyInput.value)), 200);
  });

  root.replaceChildren(el);
}
