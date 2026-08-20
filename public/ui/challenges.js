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
  const myLaunched = me.myLaunchedChallenge || null;
  // Tant que j'ai un défi direct en cours (à faire accepter ou à valider), pas de nouveau
  // formulaire d'envoi : un seul à la fois, comme pour le défi ouvert.
  const canSendDirect = !myLaunched && directWait <= 0 && others.length > 0;
  const level = ctx.ui.challengeLevel === 'corse' ? 'corse' : 'leger';
  const deckCards = (ctx.challengeDeck || []).filter((c) => c.level === level);
  const targetId = ctx.ui.challengeTargetId && others.some((p) => p.id === ctx.ui.challengeTargetId)
    ? ctx.ui.challengeTargetId
    : others[0]?.id || '';

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
          <p class="muted small">${esc(me.myChallenge.fromName)} valide lui-même quand c'est fait — rien à faire ici.</p>
        </div>
      ` : ''}

      ${myLaunched ? `
        <div class="card challenge-active">
          <h3>Ton défi lancé — ${esc(myLaunched.targetName)}</h3>
          <div class="tag tag-${myLaunched.level === 'corse' ? 'audacieux' : 'facile'}">${myLaunched.level === 'corse' ? 'Corsé' : 'Léger'}</div>
          <p class="mission-text">${esc(myLaunched.text)}</p>
          ${myLaunched.status === 'pending'
            ? `<p class="muted small">En attente que ${esc(myLaunched.targetName)} accepte.</p>`
            : `<button class="btn btn-primary btn-block" id="challenge-validate">C'est fait</button>`}
        </div>
      ` : `
        <div class="card stack">
          <h3>Lancer un défi direct</h3>
          <p class="muted small">Choisis quelqu'un et une carte à lui envoyer. C'est toi qui valideras quand ce sera fait.</p>
          <select id="challenge-target" ${others.length ? '' : 'disabled'}>
            ${others.map((p) => `<option value="${esc(p.id)}" ${p.id === targetId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
          <div class="row">
            <button class="btn ${level === 'leger' ? 'btn-primary' : ''}" id="challenge-level-leger" ${!canSendDirect ? 'disabled' : ''}>Léger</button>
            <button class="btn ${level === 'corse' ? 'btn-primary' : ''}" id="challenge-level-corse" ${!canSendDirect ? 'disabled' : ''}>Corsé</button>
          </div>
          ${directWait > 0 ? `<p class="muted small center">Encore ${fmtCountdown(directWait)} avant de pouvoir relancer.</p>` : ''}
          ${canSendDirect ? `
            <div class="history-list">
              ${deckCards.map((c) => `
                <button class="btn btn-block challenge-card-pick" data-card="${esc(c.id)}" style="text-align:left;">${esc(c.text)}</button>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `}

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

  el.querySelector('#challenge-validate')?.addEventListener('click', (e) => {
    e.target.disabled = true;
    vibrate(20);
    ctx.actions.validateChallenge(myLaunched.id);
  });

  const targetSelect = el.querySelector('#challenge-target');
  targetSelect?.addEventListener('change', () => ctx.setUI({ challengeTargetId: targetSelect.value }));
  el.querySelector('#challenge-level-leger')?.addEventListener('click', () => ctx.setUI({ challengeLevel: 'leger' }));
  el.querySelector('#challenge-level-corse')?.addEventListener('click', () => ctx.setUI({ challengeLevel: 'corse' }));
  el.querySelectorAll('.challenge-card-pick').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (!targetSelect?.value) return;
      e.target.disabled = true;
      ctx.actions.sendChallenge(targetSelect.value, btn.dataset.card);
    });
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
