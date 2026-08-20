import { h, esc } from './components.js';

export function render(root, ctx) {
  const { room, me, players } = ctx.server;
  const isHost = !!me?.isHost;
  const agents = players.filter((p) => !p.isSpectator);
  const spectators = players.filter((p) => p.isSpectator);

  const el = h(`
    <div class="screen">
      <div class="brand">
        <h1>Salon</h1>
        <p>On attend tout le monde. L'opération peut commencer dès que l'équipe est là.</p>
      </div>

      ${room.name ? `<p class="operation-name">« ${esc(room.name)} »</p>` : ''}
      <div class="room-code">${esc(room.code)}</div>
      <div class="qr-wrap"><img alt="QR code de l'opération" src="/qr/${esc(room.code)}.svg" /></div>

      <div class="card">
        <h3 style="margin-bottom:10px;">Agents (${agents.length}/8)</h3>
        <div class="player-list">
          ${agents.map((p) => `
            <div class="player-row ${p.connected ? 'connected' : ''}">
              <span class="dot"></span>
              <span>${esc(p.name)}</span>
              ${p.isHost ? '<span class="host-badge">hôte</span>' : ''}
              <span class="spacer"></span>
              ${!p.connected ? '<span class="muted small">absent</span>' : ''}
            </div>
          `).join('')}
        </div>
      </div>

      ${spectators.length ? `
        <div class="card">
          <h3 style="margin-bottom:10px;">Spectateurs</h3>
          <div class="player-list">
            ${spectators.map((p) => `
              <div class="player-row ${p.connected ? 'connected' : ''}">
                <span class="dot"></span>
                <span>${esc(p.name)}</span>
                <span class="spacer"></span>
                ${!p.connected ? '<span class="muted small">absent</span>' : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${isHost ? `
        <div class="card stack">
          <h3>Réglages</h3>
          <div class="field">
            <label for="op-name">Nom de l'opération (facultatif)</label>
            <input id="op-name" type="text" maxlength="60" placeholder="ex : Pot de départ de Julie" value="${esc(room.name || '')}" />
          </div>
          <div class="row">
            <span class="small muted">Missions en file</span>
            <span class="spacer"></span>
            <div class="row" id="queue-controls">
              <button class="btn" data-q="-1" style="min-height:40px;padding:8px 14px;">−</button>
              <strong id="queue-value">${room.settings.missionQueueMax}</strong>
              <button class="btn" data-q="1" style="min-height:40px;padding:8px 14px;">+</button>
            </div>
          </div>
          <label class="row checkbox-row">
            <input type="checkbox" id="challenges-toggle" ${room.settings.challengesEnabled ? 'checked' : ''} />
            <span>Activer les défis (moments visibles entre agents, en plus des missions discrètes)</span>
          </label>
          <div class="field">
            <label for="taboo-text">Ajouter un tabou perso (formule, pas une personne)</label>
            <div class="row">
              <input id="taboo-text" type="text" maxlength="80" placeholder="ex : « à l'époque déjà »" />
              <button class="btn" id="taboo-add" style="min-height:56px;">Ajouter</button>
            </div>
          </div>
          ${room.customTaboos.length ? `
            <div class="taboo-list">
              ${room.customTaboos.map((t) => `<div class="taboo-row"><span class="text small">${esc(t.text)}</span></div>`).join('')}
            </div>
          ` : ''}
        </div>
        <button class="btn btn-primary btn-block" id="start" ${agents.length < 2 ? 'disabled' : ''}>
          Lancer l'opération
        </button>
        ${agents.length < 2 ? '<p class="small muted center">Il faut au moins 2 agents (les spectateurs ne comptent pas).</p>' : ''}
      ` : `
        <p class="muted center">En attente que l'hôte lance l'opération…</p>
      `}

      <button class="btn btn-ghost btn-block" id="leave-lobby">Quitter le salon</button>
    </div>
  `);

  if (isHost) {
    el.querySelector('#op-name').addEventListener('change', (e) => {
      ctx.actions.updateSettings({ name: e.target.value });
    });
    el.querySelectorAll('[data-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = room.settings.missionQueueMax + Number(btn.dataset.q);
        ctx.actions.updateSettings({ missionQueueMax: Math.max(1, Math.min(3, next)) });
      });
    });
    el.querySelector('#challenges-toggle').addEventListener('change', (e) => {
      ctx.actions.updateSettings({ challengesEnabled: e.target.checked });
    });
    el.querySelector('#taboo-add').addEventListener('click', () => {
      const input = el.querySelector('#taboo-text');
      if (!input.value.trim()) return;
      ctx.actions.addTaboo(input.value.trim());
      input.value = '';
    });
    el.querySelector('#start').addEventListener('click', () => ctx.actions.start());
  }

  // Rien n'est encore en jeu à ce stade (pas de score, pas de mission) : pas besoin de la
  // confirmation en deux temps utilisée ailleurs pour quitter en cours de partie.
  el.querySelector('#leave-lobby').addEventListener('click', () => ctx.actions.leave());

  root.replaceChildren(el);
}
