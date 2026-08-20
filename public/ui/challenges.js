import { h, esc, vibrate } from './components.js';

function fmtCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function render(root, ctx) {
  const { me, players } = ctx.server;
  const openChallenges = ctx.server.openChallenges || [];
  const others = players.filter((p) => !p.isSpectator && p.id !== me.id);
  const now = Date.now();
  const directWait = Math.max(0, (me.nextChallengeAt || 0) - now);
  const openWait = Math.max(0, (me.nextOpenChallengeAt || 0) - now);
  const myOpenChallenge = openChallenges.find((o) => o.fromId === me.id);
  const othersOpenChallenges = openChallenges.filter((o) => o.fromId !== me.id);

  const el = h(`
    <div class="screen screen-with-tabbar" style="gap:16px;">
      <div class="brand" style="padding-top:0;">
        <h1>Défis</h1>
        <p>Des moments visibles, en plus des missions discrètes.</p>
      </div>

      ${me.myChallenge && me.myChallenge.status === 'accepted' ? `
        <div class="card challenge-active">
          <div class="tag tag-${me.myChallenge.level === 'corse' ? 'audacieux' : 'facile'}">${me.myChallenge.level === 'corse' ? 'Corsé' : 'Léger'}</div>
          <p class="mission-text">${esc(me.myChallenge.text)}</p>
          <button class="btn btn-primary btn-block" id="challenge-done">C'est fait</button>
        </div>
      ` : ''}

      <div class="card stack">
        <h3>Lancer un défi direct</h3>
        <p class="muted small">Choisis quelqu'un, une carte est tirée au hasard pour lui.</p>
        <select id="challenge-target" ${others.length ? '' : 'disabled'}>
          ${others.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
        </select>
        <div class="row">
          <button class="btn" id="challenge-leger" ${!others.length || directWait > 0 ? 'disabled' : ''}>Léger</button>
          <button class="btn" id="challenge-corse" ${!others.length || directWait > 0 ? 'disabled' : ''}>Corsé</button>
        </div>
        ${directWait > 0 ? `<p class="muted small center">Encore ${fmtCountdown(directWait)} avant de pouvoir relancer.</p>` : ''}
      </div>

      <div class="card stack">
        <h3>Lancer un défi ouvert</h3>
        <p class="muted small">Une question posée à tout le monde — le premier qui trouve gagne. Tu désigneras le gagnant toi-même.</p>
        <button class="btn btn-primary btn-block" id="challenge-open" ${openWait > 0 || myOpenChallenge ? 'disabled' : ''}>
          Lancer un défi ouvert
        </button>
        ${openWait > 0 && !myOpenChallenge ? `<p class="muted small center">Encore ${fmtCountdown(openWait)} avant de pouvoir relancer.</p>` : ''}
      </div>

      ${myOpenChallenge ? `
        <div class="card stack">
          <h3>Ton défi ouvert</h3>
          <p class="mission-text">${esc(myOpenChallenge.text)}</p>
          <p class="muted small">Qui a trouvé en premier ?</p>
          ${others.map((p) => `<button class="btn btn-block" data-winner="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
          <button class="btn btn-ghost btn-block" id="challenge-no-winner">Personne n'a trouvé</button>
        </div>
      ` : ''}

      ${othersOpenChallenges.length ? `
        <div class="card">
          <h3 style="margin-bottom:10px;">En cours</h3>
          <div class="history-list">
            ${othersOpenChallenges.map((o) => `
              <div class="history-row">
                <div style="flex:1;">
                  <div class="muted small">${esc(o.fromName)}</div>
                  <div>${esc(o.text)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `);

  el.querySelector('#challenge-done')?.addEventListener('click', (e) => {
    e.target.disabled = true;
    vibrate(20);
    ctx.actions.challengeDone(me.myChallenge.id);
  });

  const targetSelect = el.querySelector('#challenge-target');
  el.querySelector('#challenge-leger')?.addEventListener('click', (e) => {
    if (!targetSelect.value) return;
    e.target.disabled = true;
    ctx.actions.sendChallenge(targetSelect.value, 'leger');
  });
  el.querySelector('#challenge-corse')?.addEventListener('click', (e) => {
    if (!targetSelect.value) return;
    e.target.disabled = true;
    ctx.actions.sendChallenge(targetSelect.value, 'corse');
  });

  el.querySelector('#challenge-open')?.addEventListener('click', (e) => {
    e.target.disabled = true;
    ctx.actions.sendOpenChallenge();
  });

  el.querySelectorAll('[data-winner]').forEach((btn) => {
    btn.addEventListener('click', () => {
      vibrate(15);
      ctx.actions.awardOpenChallenge(myOpenChallenge.id, btn.dataset.winner);
    });
  });
  el.querySelector('#challenge-no-winner')?.addEventListener('click', () => {
    ctx.actions.awardOpenChallenge(myOpenChallenge.id, null);
  });

  root.replaceChildren(el);
}
