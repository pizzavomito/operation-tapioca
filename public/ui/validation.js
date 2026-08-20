// Overlays plein écran (§6 « Validation » du PRD) : un seul à la fois, une seule action évidente.
import { h, esc, vibrate } from './components.js';

export function renderWitness(ctx, claim, queueLength) {
  const kindLabel = claim.kind === 'contamination' ? 'Contamination' : 'Mission';
  const el = h(`
    <div class="overlay">
      <div class="overlay-card">
        <div class="overlay-kicker">${esc(claim.requesterName)} réclame un témoin — ${esc(kindLabel)}</div>
        <p class="overlay-text">${esc(claim.text)}</p>
        <div class="overlay-actions">
          <button class="btn" id="no">Pas entendu</button>
          <button class="btn btn-success" id="yes">J'ai entendu</button>
        </div>
        ${queueLength > 1 ? `<p class="overlay-queue-hint">+${queueLength - 1} autre(s) en attente</p>` : ''}
      </div>
    </div>
  `);
  el.querySelector('#yes').addEventListener('click', () => {
    vibrate(15);
    ctx.actions.witnessVote(claim.claimId, true);
  });
  el.querySelector('#no').addEventListener('click', () => {
    ctx.actions.witnessVote(claim.claimId, false);
    ctx.dismissWitness(claim.claimId); // le serveur ne fait rien pour un "non" : la fermeture est locale
  });
  return el;
}

export function renderTabooConfirm(ctx, report, tabooText) {
  const el = h(`
    <div class="overlay">
      <div class="overlay-card">
        <div class="overlay-kicker">On t'a signalé un tabou</div>
        <p class="overlay-text">« ${esc(tabooText)} »</p>
        <div class="overlay-actions">
          <button class="btn" id="deny">Je conteste</button>
          <button class="btn btn-danger" id="accept">C'est vrai</button>
        </div>
        <p class="overlay-queue-hint">Aucune discussion, aucun arbitrage : ta réponse ferme l'incident.</p>
      </div>
    </div>
  `);
  el.querySelector('#accept').addEventListener('click', () => ctx.actions.tabooConfirm(report.reportId, true));
  el.querySelector('#deny').addEventListener('click', () => ctx.actions.tabooConfirm(report.reportId, false));
  return el;
}

export function renderChallengeRequest(ctx, challenge) {
  const el = h(`
    <div class="overlay">
      <div class="overlay-card">
        <div class="overlay-kicker">${esc(challenge.fromName)} te lance un défi — ${challenge.level === 'corse' ? 'Corsé' : 'Léger'}</div>
        <p class="overlay-text">${esc(challenge.text)}</p>
        <div class="overlay-actions">
          <button class="btn" id="decline">Décliner</button>
          <button class="btn btn-success" id="accept">Accepter</button>
        </div>
        <p class="overlay-queue-hint">Décliner ne coûte rien, personne ne le saura.</p>
      </div>
    </div>
  `);
  el.querySelector('#accept').addEventListener('click', () => {
    vibrate(15);
    ctx.actions.respondChallenge(challenge.challengeId, true);
  });
  el.querySelector('#decline').addEventListener('click', () => {
    // Contrairement à "Pas entendu" sur un témoin, le serveur supprime vraiment le défi ici :
    // pas besoin de fermeture locale, le prochain état confirmera que c'est réglé.
    ctx.actions.respondChallenge(challenge.challengeId, false);
  });
  return el;
}

export function renderSosRespond(ctx, sos) {
  const el = h(`
    <div class="overlay sos-overlay">
      <div class="overlay-card">
        <div class="overlay-kicker">SOS Batterie</div>
        <p class="overlay-text">${esc(sos.raisedByName)} a besoin d'air.</p>
        <div class="overlay-actions">
          <button class="btn" id="diversion">Diversion</button>
          <button class="btn btn-danger" id="extraction">Extraction</button>
        </div>
        <p class="overlay-queue-hint">Diversion : tu détournes l'attention du groupe. Extraction : tu le/la sors dehors.</p>
        <button class="btn btn-ghost btn-block" id="later">Pas maintenant</button>
      </div>
    </div>
  `);
  el.querySelector('#diversion').addEventListener('click', () => {
    vibrate(15);
    ctx.actions.sosTake(sos.id, 'diversion');
  });
  el.querySelector('#extraction').addEventListener('click', () => {
    vibrate(15);
    ctx.actions.sosTake(sos.id, 'extraction');
  });
  el.querySelector('#later').addEventListener('click', () => ctx.setUI({ dismissedSosId: sos.id }));
  return el;
}
