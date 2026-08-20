import { h, esc } from './components.js';

// Réactions rapides : un tap envoie directement l'emoji comme message de chat, pas besoin
// d'ouvrir le clavier. Partagé avec l'écran spectateur et la bande de saisie fixe (app.js).
export const QUICK_EMOTES = ['😂', '👍', '❤️', '😮', '🎉', '🙈'];

export function renderQuickEmotes() {
  return `
    <div class="chat-quick-emotes">
      ${QUICK_EMOTES.map((e) => `<button type="button" class="chat-quick-emote" data-quick-emote="${esc(e)}">${e}</button>`).join('')}
    </div>
  `;
}

// Partagé avec l'écran spectateur (qui incruste le chat dans sa propre carte).
export function renderMessages(messages, meId) {
  if (!messages || !messages.length) return '<p class="muted small center">Aucun message pour l\'instant.</p>';
  return messages.map((m) => `
    <div class="chat-msg ${m.playerId === meId ? 'mine' : ''}">
      <div class="chat-msg-name">${esc(m.name)}${m.isSpectator ? ' 👀' : ''}</div>
      <div class="chat-msg-text">${esc(m.text)}</div>
    </div>
  `).join('');
}

export function render(root, ctx) {
  const { me, room } = ctx.server;
  const messages = room.chat || [];

  const el = h(`
    <div class="screen screen-with-chatbar" style="gap:12px;">
      <div class="brand" style="padding-top:0;">
        <h1>Chat</h1>
      </div>
      <div class="chat-messages">${renderMessages(messages, me.id)}</div>
    </div>
  `);

  root.replaceChildren(el);
  // Toujours voir le dernier message ; marque tout comme lu puisqu'on est sur l'écran.
  requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
  ctx.setUI({ chatSeenCount: messages.length }, { silent: true });
}
