import { h, esc } from './components.js';

export function render(root, ctx) {
  const { room, me, players } = ctx.server;
  const isHost = !!me?.isHost;

  const el = h(`
    <div class="screen">
      <div class="brand">
        <h1>Salon</h1>
        <p>On attend tout le monde. Le repas peut commencer dès que l'équipe est là.</p>
      </div>

      <div class="room-code">${esc(room.code)}</div>
      <div class="qr-wrap"><img alt="QR code de la partie" src="/qr/${esc(room.code)}.svg" /></div>

      <div class="card">
        <h3 style="margin-bottom:10px;">Agents (${players.length}/8)</h3>
        <div class="player-list">
          ${players.map((p) => `
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

      ${isHost ? `
        <div class="card stack">
          <h3>Réglages</h3>
          <div class="row">
            <span class="small muted">Missions en file</span>
            <span class="spacer"></span>
            <div class="row" id="queue-controls">
              <button class="btn" data-q="-1" style="min-height:40px;padding:8px 14px;">−</button>
              <strong id="queue-value">${room.settings.missionQueueMax}</strong>
              <button class="btn" data-q="1" style="min-height:40px;padding:8px 14px;">+</button>
            </div>
          </div>
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
        <button class="btn btn-primary btn-block" id="start" ${players.length < 2 ? 'disabled' : ''}>
          Lancer l'opération
        </button>
        ${players.length < 2 ? '<p class="small muted center">Il faut au moins 2 agents.</p>' : ''}
      ` : `
        <p class="muted center">En attente que l'hôte lance l'opération…</p>
      `}
    </div>
  `);

  if (isHost) {
    el.querySelectorAll('[data-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = room.settings.missionQueueMax + Number(btn.dataset.q);
        ctx.actions.updateSettings({ missionQueueMax: Math.max(1, Math.min(3, next)) });
      });
    });
    el.querySelector('#taboo-add').addEventListener('click', () => {
      const input = el.querySelector('#taboo-text');
      if (!input.value.trim()) return;
      ctx.actions.addTaboo(input.value.trim());
      input.value = '';
    });
    el.querySelector('#start').addEventListener('click', () => ctx.actions.start());
  }

  root.replaceChildren(el);
}
