import { h, esc, vibrate, fmtCountdown } from './components.js';

// Ligne "Expire dans X" sous une carte de défi en cours — silencieuse si pas de date connue.
// Le span porte data-expires-at : c'est app.js qui le fait vivre à la seconde (mise à jour de
// texte ciblée, pas de re-render — voir le commentaire sur le setInterval dans app.js).
function expiryLine(expiresAt, now) {
  if (!expiresAt) return '';
  const remaining = expiresAt - now;
  return `<p class="muted small">Expire dans <span data-expires-at="${expiresAt}">${remaining > 0 ? fmtCountdown(remaining) : '0:00'}</span></p>`;
}

export function render(root, ctx) {
  const { me, players } = ctx.server;
  const openChallenges = ctx.server.openChallenges || [];
  const others = players.filter((p) => !p.isSpectator && p.id !== me.id);
  const now = Date.now();
  const directWait = Math.max(0, (me.nextChallengeAt || 0) - now);
  const openWait = Math.max(0, (me.nextOpenChallengeAt || 0) - now);
  const myOpenChallenge = openChallenges.find((o) => o.fromId === me.id);
  // Une fois tranché (status 'awarded'), plus personne d'autre ne répond — seul le lanceur
  // garde la main pour changer d'avis (droit à l'erreur, voir sa propre carte plus bas).
  const othersOpenChallenges = openChallenges.filter((o) => o.fromId !== me.id && o.status === 'pending');
  const myLaunched = me.myLaunchedChallenge || null;
  // Tant que j'ai un défi direct en cours (à faire accepter ou à valider), pas de nouveau
  // formulaire d'envoi : un seul à la fois, comme pour le défi ouvert.
  const canSendDirect = !myLaunched && directWait <= 0 && others.length > 0;
  const level = ctx.ui.challengeLevel === 'corse' ? 'corse' : 'leger';
  const deckCards = (ctx.challengeDeck || []).filter((c) => c.level === level);
  const targetId = ctx.ui.challengeTargetId && others.some((p) => p.id === ctx.ui.challengeTargetId)
    ? ctx.ui.challengeTargetId
    : others[0]?.id || '';
  const cardId = ctx.ui.challengeCardId && deckCards.some((c) => c.id === ctx.ui.challengeCardId)
    ? ctx.ui.challengeCardId
    : '';
  const openDeck = ctx.openChallengeDeck || [];
  const canSendOpen = openWait <= 0 && !myOpenChallenge;
  const openCardId = ctx.ui.openChallengeCardId && openDeck.some((c) => c.id === ctx.ui.openChallengeCardId)
    ? ctx.ui.openChallengeCardId
    : '';

  // Un push d'état déclenché par n'importe qui (chat, score d'un autre agent…) redessine tout
  // cet écran — sans ça, une réponse en cours de frappe dans une des textarea serait perdue au
  // prochain state. On la récupère avant de reconstruire, et on rend le focus/la sélection après.
  const preservedAnswers = {};
  let focusedAnswerId = null, selStart = null, selEnd = null;
  root.querySelectorAll('textarea[data-answer-for]').forEach((ta) => {
    preservedAnswers[ta.dataset.answerFor] = ta.value;
    if (document.activeElement === ta) {
      focusedAnswerId = ta.dataset.answerFor;
      selStart = ta.selectionStart;
      selEnd = ta.selectionEnd;
    }
  });

  const el = h(`
    <div class="screen screen-with-tabbar" style="gap:16px;">
      <div class="brand" style="padding-top:0;">
        <h1>Défis</h1>
        <p>Des moments visibles, en plus des missions discrètes.</p>
      </div>

      ${me.myChallenge && (me.myChallenge.status === 'accepted' || me.myChallenge.status === 'claimed') ? `
        <div class="card challenge-active">
          <div class="tag tag-${me.myChallenge.level === 'corse' ? 'audacieux' : 'facile'}">${me.myChallenge.level === 'corse' ? 'Corsé' : 'Léger'}</div>
          <p class="mission-text">${esc(me.myChallenge.text)}</p>
          ${me.myChallenge.status === 'accepted'
            ? `<button class="btn btn-primary btn-block" id="challenge-claim">J'ai fini</button>`
            : `<p class="muted small">${esc(me.myChallenge.fromName)} est prévenu, il valide quand il constate.</p>`}
          ${expiryLine(me.myChallenge.expiresAt, now)}
        </div>
      ` : ''}

      ${myLaunched ? `
        <div class="card challenge-active">
          <h3>Ton défi lancé — ${esc(myLaunched.targetName)}</h3>
          <div class="tag tag-${myLaunched.level === 'corse' ? 'audacieux' : 'facile'}">${myLaunched.level === 'corse' ? 'Corsé' : 'Léger'}</div>
          <p class="mission-text">${esc(myLaunched.text)}</p>
          ${myLaunched.status === 'pending'
            ? `<p class="muted small">En attente que ${esc(myLaunched.targetName)} accepte.</p>`
            : myLaunched.status === 'accepted'
            ? `<p class="muted small">En attente que ${esc(myLaunched.targetName)} signale que c'est fait.</p>`
            : `<button class="btn btn-primary btn-block" id="challenge-validate">C'est fait</button>`}
          ${expiryLine(myLaunched.expiresAt, now)}
        </div>
      ` : ''}

      ${myOpenChallenge ? `
        <div class="card stack">
          <h3>Ton défi ouvert</h3>
          <p class="mission-text">${esc(myOpenChallenge.text)}</p>
          <p class="muted small">${myOpenChallenge.status === 'awarded' ? "Déjà tranché — tu peux encore changer d'avis." : 'Réponses reçues — désigne qui a trouvé.'}</p>
          ${expiryLine(myOpenChallenge.expiresAt, now)}
          <div class="history-list">
            ${myOpenChallenge.respondents.map((r) => `
              <div class="history-row">
                <div style="flex:1;">
                  <div>${esc(r.name)}</div>
                  <div class="muted small">${r.status === 'received' ? `« ${esc(r.text)} »` : 'En attente…'}</div>
                </div>
                <button class="btn ${myOpenChallenge.awardedTo === r.id ? 'btn-success' : ''}" data-winner="${esc(r.id)}">${myOpenChallenge.awardedTo === r.id ? 'Retenu ✓' : 'A trouvé'}</button>
              </div>
            `).join('')}
          </div>
          <button class="btn btn-ghost btn-block ${myOpenChallenge.status === 'awarded' && myOpenChallenge.awardedTo === null ? 'btn-success' : ''}" id="challenge-no-winner">${myOpenChallenge.status === 'awarded' && myOpenChallenge.awardedTo === null ? 'Retenu ✓ — personne n\'a trouvé' : "Personne n'a trouvé"}</button>
        </div>
      ` : ''}

      ${othersOpenChallenges.map((o) => {
        const value = preservedAnswers[o.id] ?? o.myAnswer ?? '';
        const others_ = o.respondents.filter((r) => r.id !== me.id);
        return `
          <div class="card stack">
            <div class="muted small">${esc(o.fromName)}</div>
            <p class="mission-text">${esc(o.text)}</p>
            ${expiryLine(o.expiresAt, now)}
            <textarea data-answer-for="${esc(o.id)}" maxlength="200" placeholder="Ta réponse…">${esc(value)}</textarea>
            <button class="btn btn-block" data-submit-answer="${esc(o.id)}">${o.myAnswer ? 'Modifier ma réponse' : 'Envoyer ma réponse'}</button>
            ${others_.length ? `
              <p class="muted small">${others_.map((r) => `${esc(r.name)} : ${r.status === 'received' ? 'reçu ✓' : 'en attente'}`).join(' · ')}</p>
            ` : ''}
          </div>
        `;
      }).join('')}

      ${!myLaunched ? `
        <div class="card stack">
          <h3>Lancer un défi direct</h3>
          <p class="muted small">Choisis quelqu'un, un niveau, puis la carte précise à lui envoyer dans la liste. C'est toi qui valideras quand ce sera fait.</p>
          <select id="challenge-target" ${others.length ? '' : 'disabled'}>
            ${others.map((p) => `<option value="${esc(p.id)}" ${p.id === targetId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
          <div class="row">
            <button class="btn ${level === 'leger' ? 'btn-primary' : ''}" id="challenge-level-leger" ${!canSendDirect ? 'disabled' : ''}>Léger</button>
            <button class="btn ${level === 'corse' ? 'btn-primary' : ''}" id="challenge-level-corse" ${!canSendDirect ? 'disabled' : ''}>Corsé</button>
          </div>
          ${directWait > 0 ? `<p class="muted small center">Encore ${fmtCountdown(directWait)} avant de pouvoir relancer.</p>` : ''}
          ${canSendDirect ? `
            <select id="challenge-card">
              <option value="">Choisis une carte…</option>
              ${deckCards.map((c) => `<option value="${esc(c.id)}" ${c.id === cardId ? 'selected' : ''}>${esc(c.text)}</option>`).join('')}
            </select>
            <button class="btn btn-primary btn-block" id="challenge-send-direct" ${!targetId || !cardId ? 'disabled' : ''}>Envoyer le défi</button>
          ` : ''}
        </div>
      ` : ''}

      <div class="card stack">
        <h3>Lancer un défi ouvert</h3>
        <p class="muted small">Choisis une question posée à tout le monde — chacun répond dans sa carte, tu désigneras le gagnant toi-même.</p>
        ${canSendOpen ? `
          <select id="open-challenge-card">
            <option value="">Choisis une question…</option>
            ${openDeck.map((c) => `<option value="${esc(c.id)}" ${c.id === openCardId ? 'selected' : ''}>${esc(c.text)}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-block" id="challenge-open" ${!openCardId ? 'disabled' : ''}>Lancer le défi ouvert</button>
        ` : ''}
        ${openWait > 0 && !myOpenChallenge ? `<p class="muted small center">Encore ${fmtCountdown(openWait)} avant de pouvoir relancer.</p>` : ''}
      </div>
    </div>
  `);

  el.querySelector('#challenge-claim')?.addEventListener('click', (e) => {
    e.target.disabled = true;
    vibrate(20);
    ctx.actions.claimChallenge(me.myChallenge.id);
  });

  el.querySelector('#challenge-validate')?.addEventListener('click', (e) => {
    e.target.disabled = true;
    vibrate(20);
    ctx.actions.validateChallenge(myLaunched.id);
  });

  const targetSelect = el.querySelector('#challenge-target');
  targetSelect?.addEventListener('change', () => ctx.setUI({ challengeTargetId: targetSelect.value }));
  el.querySelector('#challenge-level-leger')?.addEventListener('click', () => ctx.setUI({ challengeLevel: 'leger', challengeCardId: null }));
  el.querySelector('#challenge-level-corse')?.addEventListener('click', () => ctx.setUI({ challengeLevel: 'corse', challengeCardId: null }));
  const cardSelect = el.querySelector('#challenge-card');
  cardSelect?.addEventListener('change', () => ctx.setUI({ challengeCardId: cardSelect.value }));
  el.querySelector('#challenge-send-direct')?.addEventListener('click', (e) => {
    if (!targetSelect?.value || !cardSelect?.value) return;
    e.target.disabled = true;
    ctx.actions.sendChallenge(targetSelect.value, cardSelect.value);
  });

  const openCardSelect = el.querySelector('#open-challenge-card');
  openCardSelect?.addEventListener('change', () => ctx.setUI({ openChallengeCardId: openCardSelect.value }));
  el.querySelector('#challenge-open')?.addEventListener('click', (e) => {
    if (!openCardSelect?.value) return;
    e.target.disabled = true;
    ctx.actions.sendOpenChallenge(openCardSelect.value);
  });

  el.querySelectorAll('[data-submit-answer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const openChallengeId = btn.dataset.submitAnswer;
      const textarea = el.querySelector(`textarea[data-answer-for="${openChallengeId}"]`);
      const text = (textarea?.value || '').trim();
      if (!text) return;
      vibrate(10);
      ctx.actions.answerOpenChallenge(openChallengeId, text);
    });
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

  if (focusedAnswerId) {
    const ta = el.querySelector(`textarea[data-answer-for="${focusedAnswerId}"]`);
    if (ta) {
      ta.focus();
      ta.setSelectionRange(selStart, selEnd);
    }
  }
}
