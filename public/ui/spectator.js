import { h, esc, vibrate, mountTwoTapConfirm } from './components.js';
import { renderMessages as renderChatMessages, renderQuickEmotes, QUICK_EMOTES } from './chat.js';
import { CHEER_EMOJIS } from '/protocol.js';

const CHEER_LABEL = { '💪': 'Courage', '😘': 'Bisou', '👏': 'Bravo', '🔥': 'Vas-y' };

export function render(root, ctx) {
  const { me, players, room } = ctx.server;
  const ranked = players.filter((p) => !p.isSpectator).sort((a, b) => b.score - a.score);
  const log = (room.log || []).slice().reverse();

  const el = h(`
    <div class="screen" style="gap:16px;">
      <div class="brand">
        <h1>Tu suis l'opération</h1>
        <p>Aucune mission pour toi — juste de quoi encourager la table.</p>
      </div>

      <div class="card">
        <h3 style="margin-bottom:10px;">Scores</h3>
        <div class="score-list">
          ${ranked.map((p, i) => `
            <div class="score-row">
              <span class="rank">${i + 1}</span>
              <span style="flex:1;">${esc(p.name)}${!p.connected ? ' <span class="muted small">· absent</span>' : ''}</span>
              <span class="score">${p.score}</span>
            </div>
          `).join('')}
          ${ranked.length === 0 ? '<p class="muted small">Personne ne joue encore.</p>' : ''}
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:10px;">Énergie de la tablée</h3>
        <div class="gauges">
          ${players.filter((p) => !p.isSpectator).map((p) => `
            <div class="gauge ${p.energy < 25 ? 'low' : ''}">
              <div class="name">${esc(p.name)}</div>
              <div class="bar"><span style="width:${p.energy}%"></span></div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:10px;">Envoyer un encouragement</h3>
        <div class="cheer-grid">
          ${CHEER_EMOJIS.map((emoji) => `
            <button class="btn cheer-btn" data-emoji="${esc(emoji)}">
              <span class="cheer-emoji">${emoji}</span>
              <span class="small">${esc(CHEER_LABEL[emoji] || '')}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:10px;">Chat</h3>
        <div class="chat-messages chat-messages-inline" id="spec-chat">${renderChatMessages(room.chat, me.id)}</div>
        ${renderQuickEmotes()}
        <form class="row" id="spec-chat-form" style="margin-top:10px;">
          <input type="text" id="spec-chat-text" maxlength="500" placeholder="Écrire un message…" autocomplete="off" style="flex:1;" />
          <button class="btn btn-primary" type="submit" style="min-height:56px;">Envoyer</button>
        </form>
      </div>

      <div class="card">
        <h3 style="margin-bottom:10px;">Journal</h3>
        <div class="history-list">
          ${log.length === 0 ? '<p class="muted small">Rien pour l\'instant.</p>' : ''}
          ${log.map((entry) => `<div class="log-row">${esc(entry.text)}</div>`).join('')}
        </div>
      </div>

      <div class="card stack">
        <button class="btn btn-ghost btn-block" id="show-tutorial">❓ Comment jouer</button>
        <button class="btn btn-ghost btn-block" id="leave-room">Quitter l'opération</button>
      </div>
    </div>
  `);

  el.querySelector('#show-tutorial').addEventListener('click', () => ctx.setUI({ showTutorial: true, tutorialStep: 0 }));

  el.querySelectorAll('[data-emoji]').forEach((btn) => {
    btn.addEventListener('click', () => {
      vibrate(15);
      btn.disabled = true;
      ctx.actions.cheer(btn.dataset.emoji);
      setTimeout(() => { btn.disabled = false; }, 800); // évite le spam, pas une vraie limite serveur
    });
  });

  el.querySelector('#spec-chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = el.querySelector('#spec-chat-text');
    const text = input.value.trim();
    if (!text) return;
    ctx.actions.sendChat(text);
    input.value = '';
  });

  el.querySelectorAll('[data-quick-emote]').forEach((btn) => {
    btn.addEventListener('click', () => {
      vibrate(10);
      ctx.actions.sendChat(btn.dataset.quickEmote);
    });
  });

  mountTwoTapConfirm(el.querySelector('#leave-room'), {
    armedText: 'Sûr ? Retape pour confirmer',
    onConfirm: () => ctx.actions.leave(),
  });

  root.replaceChildren(el);
  const chatBox = el.querySelector('#spec-chat');
  chatBox.scrollTop = chatBox.scrollHeight;
  ctx.setUI({ chatSeenCount: (room.chat || []).length }, { silent: true });
}
