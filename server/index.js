// Express (static) + serveur ws — point d'entrée (§7 du PRD).
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';

import { RoomStore, newId, newToken } from './rooms.js';
import * as game from './game.js';
import * as push from './push.js';
import { C2S, S2C, SNAPSHOT_INTERVAL_MS, PING_INTERVAL_MS } from './protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const app = express();
app.set('trust proxy', true); // nginx en reverse proxy (§7.2) : fait confiance à X-Forwarded-Proto
app.use(express.static(PUBLIC_DIR));
// protocol.js vit sous server/ (types de messages partagés) mais doit être servable au client.
app.get('/protocol.js', (req, res) => res.sendFile(path.join(__dirname, 'protocol.js')));
// Le deck de tabous génériques est une connaissance commune (§4.3) : seule l'attribution par joueur est secrète.
app.get('/taboos.json', (req, res) => res.sendFile(path.join(__dirname, 'data', 'taboos.json')));
// Clé publique VAPID pour l'abonnement Web Push côté client (notifications même app en arrière-plan).
app.get('/push/vapid-public-key', (req, res) => res.type('text/plain').send(push.getPublicKey()));

// QR code de la partie (écran Salon, §6) : encode l'URL de rejoin directe.
app.get('/qr/:code.svg', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const url = `${req.protocol}://${req.get('host')}/?code=${encodeURIComponent(code)}`;
  try {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#0e131a', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  } catch (err) {
    res.status(500).send('');
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const store = new RoomStore();
store.load();
const content = game.loadContent();

function sendJSON(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function sendError(ws, message) {
  sendJSON(ws, { type: S2C.ERROR, payload: { message } });
}

// Envoie perPlayerMsgFn(playerId) (si non nul) à chaque joueur connecté, puis
// pousse systématiquement un snapshot d'état personnalisé à tout le monde.
// Un seul mécanisme de synchronisation pour tout le jeu : simple, jamais désynchronisé.
function broadcast(room, perPlayerMsgFn) {
  for (const player of room.players.values()) {
    const extra = perPlayerMsgFn ? perPlayerMsgFn(player.id) : null;
    if (extra) {
      if (player.connected && player.ws) sendJSON(player.ws, extra);
      maybeSendPush(player, extra);
    }
    if (player.connected && player.ws) sendJSON(player.ws, game.serializeStateFor(room, player.id));
  }
}

// Notification système, en plus du message WS : le seul moyen d'atteindre un joueur dont la
// page est en arrière-plan (le navigateur suspend son JS, navigator.vibrate() ne se déclenche
// plus, la connexion WS ne sert plus à rien pour le prévenir). Limité aux deux événements
// vraiment urgents — pas la peine de notifier une mission validée ou un score qui bouge.
function maybeSendPush(player, extra) {
  if (!player.pushSubscription) return;
  if (player.visible && player.connected) return; // déjà affiché à l'écran, pas la peine de doubler
  let notif = null;
  if (extra.type === S2C.SOS_ALERT) {
    notif = { title: 'SOS Batterie 🆘', body: `${extra.payload.raisedByName} a besoin d'air.`, tag: 'sos' };
  } else if (extra.type === S2C.WITNESS_REQUEST) {
    notif = { title: 'On a besoin de toi', body: `${extra.payload.requesterName} réclame un témoin.`, tag: 'witness' };
  } else if (extra.type === S2C.CHAT_MESSAGE) {
    notif = { title: extra.payload.name, body: extra.payload.text, tag: 'chat' };
  }
  if (!notif) return;
  push.sendPush(player.pushSubscription, notif).then(({ gone }) => {
    if (gone) player.pushSubscription = null; // abonnement mort confirmé : on arrête d'essayer
  });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.meta = { roomCode: null, playerId: null };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return sendError(ws, 'Message illisible.');
    }
    const { type, payload = {} } = msg || {};

    if (type === C2S.PONG) {
      ws.isAlive = true;
      return;
    }

    if (type === C2S.JOIN) return handleJoin(ws, payload);

    // Toutes les autres actions nécessitent une session valide.
    const { roomCode, playerId } = ws.meta;
    const room = roomCode && store.get(roomCode);
    const player = room && room.players.get(playerId);
    if (!room || !player) return sendError(ws, 'Session invalide, reconnecte-toi.');

    handleAction(ws, room, player, type, payload);
  });

  ws.on('close', () => {
    const { roomCode, playerId } = ws.meta;
    const room = roomCode && store.get(roomCode);
    const player = room && room.players.get(playerId);
    if (player && player.ws === ws) {
      player.connected = false;
      player.ws = null;
      player.visible = false; // plus de connexion active : le push est le seul moyen de le joindre
      broadcast(room, (targetId) =>
        targetId === playerId ? null : { type: S2C.NOTIFY, payload: { kind: 'disconnected', name: player.name } }
      );
    }
  });
});

function handleJoin(ws, payload) {
  const { roomCode, name, token } = payload;

  // Reconnexion : le token identifie déjà un joueur existant, peu importe la room demandée.
  if (token) {
    const found = store.findByToken(token);
    if (found) {
      const { room, playerId } = found;
      const player = room.players.get(playerId);
      player.ws = ws;
      player.connected = true;
      player.visible = true; // corrigé sous peu par le premier message "visibility" du client si besoin
      ws.meta = { roomCode: room.code, playerId };
      sendJSON(ws, { type: S2C.NOTIFY, payload: { kind: 'session', playerId, token: player.token, roomCode: room.code } });
      broadcast(room, (targetId) =>
        targetId === playerId ? null : { type: S2C.NOTIFY, payload: { kind: 'reconnected', name: player.name } }
      );
      return;
    }
    // Token inconnu (partie disparue après redémarrage, par ex.) : on retombe sur un join classique.
  }

  const cleanName = (name || '').trim().slice(0, 24) || 'Agent';
  const isSpectator = !!payload.spectator;

  let room;
  let isHost = false;
  if (roomCode) {
    room = store.get(roomCode);
    if (!room) return sendError(ws, 'Partie introuvable. Vérifie le code.');
    if (room.status === 'ended') return sendError(ws, "L'opération est terminée.");
    // Rejoindre en cours de route est permis (onboardLateJoiner s'occupe de l'attribution) —
    // seule une partie déjà finie est fermée.
    if (room.players.size >= 8) return sendError(ws, 'La partie est complète (8 agents max).');
  } else {
    const hostId = newId('p');
    room = store.create(hostId);
    isHost = true;
  }

  const playerId = isHost ? room.hostId : newId('p');
  const player = game.createPlayer({ id: playerId, token: newToken(), name: cleanName, isHost, isSpectator });
  player.ws = ws;
  room.players.set(playerId, player);
  room.tokenIndex.set(player.token, playerId);
  game.recomputeWitnessRequirement(room);

  if (room.status === 'playing') {
    game.onboardLateJoiner(room, player, content);
  } else {
    game.logEvent(room, isSpectator ? `👀 ${player.name} suit la partie.` : `👋 ${player.name} a rejoint la partie.`);
  }

  ws.meta = { roomCode: room.code, playerId };
  sendJSON(ws, { type: S2C.NOTIFY, payload: { kind: 'session', playerId, token: player.token, roomCode: room.code } });
  broadcast(room, (targetId) =>
    targetId === playerId ? null : { type: S2C.NOTIFY, payload: { kind: 'joined', name: player.name } }
  );
}

function handleAction(ws, room, player, type, payload) {
  switch (type) {
    case C2S.START: {
      if (!player.isHost) return sendError(ws, "Seul l'hôte peut lancer l'opération.");
      if (room.status !== 'lobby') return sendError(ws, 'La partie est déjà lancée.');
      const activeCount = [...room.players.values()].filter((p) => !p.isSpectator).length;
      if (activeCount < 2) return sendError(ws, 'Il faut au moins 2 agents (les spectateurs ne comptent pas).');
      game.startGame(room, content);
      broadcast(room, (targetId) => {
        const p = room.players.get(targetId);
        const mission = p && p.missionQueue[0] && room.allMissions.get(p.missionQueue[0]);
        return mission ? { type: S2C.MISSION_NEW, payload: { mission } } : null;
      });
      break;
    }

    case C2S.SETTINGS_UPDATE: {
      if (!player.isHost) return sendError(ws, "Seul l'hôte peut changer les réglages.");
      const res = game.updateSettings(room, payload);
      if (res.error) return sendError(ws, res.error);
      broadcast(room, () => null);
      break;
    }

    case C2S.TABOO_ADD: {
      if (!player.isHost) return sendError(ws, "Seul l'hôte peut ajouter un tabou.");
      const res = game.addCustomTaboo(room, payload.text);
      if (res.error) return sendError(ws, res.error);
      broadcast(room, () => null);
      break;
    }

    case C2S.MISSION_DONE: {
      if (room.status !== 'playing') return sendError(ws, "La partie n'est pas en cours.");
      const res = game.completeMission(room, player, payload.missionId, broadcast);
      if (res.error) sendError(ws, res.error);
      break;
    }

    case C2S.MISSION_SKIP: {
      if (room.status !== 'playing') return sendError(ws, "La partie n'est pas en cours.");
      const res = game.skipMission(room, player, payload.missionId);
      if (res.error) return sendError(ws, res.error);
      broadcast(room, () => null);
      break;
    }

    case C2S.MISSION_WITNESS: {
      const res = game.witnessVote(room, player, payload.claimId, !!payload.vote, broadcast);
      if (res.error) sendError(ws, res.error);
      break;
    }

    case C2S.CONTAMINATION_CLAIM: {
      if (room.status !== 'playing') return sendError(ws, "La partie n'est pas en cours.");
      const res = game.claimContamination(room, player, payload.missionId, broadcast);
      if (res.error) sendError(ws, res.error);
      break;
    }

    case C2S.CLAIM_CANCEL: {
      const res = game.cancelClaim(room, player, payload.claimId);
      if (res.error) return sendError(ws, res.error);
      broadcast(room, () => null);
      break;
    }

    case C2S.TABOO_SELF: {
      const res = game.tabooSelf(room, player, payload.tabooId);
      if (res.error) return sendError(ws, res.error);
      broadcast(room, () => null);
      break;
    }

    case C2S.TABOO_REPORT: {
      const res = game.tabooReport(room, player, payload.targetId, payload.tabooId, broadcast);
      if (res.error) sendError(ws, res.error);
      break;
    }

    case C2S.TABOO_CONFIRM: {
      const res = game.tabooConfirm(room, player, payload.reportId, !!payload.accept, broadcast);
      if (res.error) sendError(ws, res.error);
      break;
    }

    case C2S.ENERGY_SET: {
      const res = game.setEnergy(room, player, Number(payload.value), broadcast);
      if (res.error) sendError(ws, res.error);
      break;
    }

    case C2S.SOS_RAISE: {
      const res = game.sosRaise(room, player, broadcast);
      if (res.error) sendError(ws, res.error);
      break;
    }

    case C2S.SOS_TAKE: {
      const res = game.sosTake(room, player, payload.sosId, payload.mode, broadcast);
      if (res.error) sendError(ws, res.error);
      break;
    }

    case C2S.CHEER: {
      const res = game.sendCheer(room, player, payload.emoji, broadcast);
      if (res.error) sendError(ws, res.error);
      break;
    }

    case C2S.CHAT_SEND: {
      const res = game.sendChatMessage(room, player, payload.text, broadcast);
      if (res.error) sendError(ws, res.error);
      break;
    }

    case C2S.PUSH_SUBSCRIBE: {
      player.pushSubscription = payload.subscription || null;
      break; // pas de broadcast : c'est un détail de transport, personne d'autre n'a besoin de le savoir
    }

    case C2S.VISIBILITY: {
      player.visible = !!payload.visible;
      break;
    }

    case C2S.GAME_END: {
      if (!player.isHost) return sendError(ws, "Seul l'hôte peut clore l'opération.");
      room.debrief = game.endGame(room);
      broadcast(room, () => null);
      break;
    }

    case C2S.LEAVE_ROOM: {
      game.removePlayer(room, player.id);
      ws.meta = { roomCode: null, playerId: null }; // cette connexion n'a plus de session valide
      if (room.players.size === 0) store.remove(room.code);
      else broadcast(room, () => null);
      break;
    }

    default:
      sendError(ws, `Type de message inconnu : ${type}`);
  }
}

// Ping applicatif toutes les 25 s (§7.2) : évite les coupures de proxy sur connexion mobile inactive.
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    sendJSON(ws, { type: S2C.PING, payload: {} });
  });
}, PING_INTERVAL_MS);

const snapshotInterval = setInterval(() => store.save(), SNAPSHOT_INTERVAL_MS);
const sweepInterval = setInterval(() => store.sweep(), 60 * 60 * 1000);

function shutdown() {
  clearInterval(pingInterval);
  clearInterval(snapshotInterval);
  clearInterval(sweepInterval);
  store.save();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`Opération Tapioca en écoute sur le port ${PORT}`);
});
