// Règles du jeu, scoring, timers (§4 et §5 du PRD).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newId, shuffle } from './rooms.js';
import {
  S2C, SCORE, WITNESS_WINDOW_MS, ENERGY_LOW_THRESHOLD, CHEER_EMOJIS, CHAT_MAX_LENGTH, CHAT_MAX_HISTORY,
  CHALLENGE_COOLDOWN_MS, CHALLENGE_ACCEPT_WINDOW_MS, CHALLENGE_COMPLETE_WINDOW_MS,
  OPEN_CHALLENGE_COOLDOWN_MS, OPEN_CHALLENGE_WINDOW_MS, OPEN_CHALLENGE_ANSWER_MAX_LENGTH,
} from './protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadContent() {
  const missions = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'missions.json'), 'utf8'));
  const taboos = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'taboos.json'), 'utf8'));
  const challenges = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'challenges.json'), 'utf8'));
  const openChallenges = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'open-challenges.json'), 'utf8'));
  return { missions, taboos, challenges, openChallenges };
}

export function createPlayer({ id, token, name, isHost, isSpectator }) {
  return {
    id,
    token,
    name,
    ws: null,
    connected: true,
    isHost: !!isHost,
    isSpectator: !!isSpectator,
    paused: false,
    score: 0,
    energy: 100,
    missionQueue: [],
    missionHistory: [],
    taboos: [],
    tabooIncidents: [],
    reportsMade: [],
    sosHandled: 0,
    contaminations: 0,
    pushSubscription: null, // abonnement Web Push, voir server/push.js
    visible: true, // Page Visibility API côté client : false = page en arrière-plan
    lastChallengeAt: 0, // pour le cooldown des défis directs lancés
    lastOpenChallengeAt: 0, // pour le cooldown des défis ouverts lancés
  };
}

// Fil d'événements de la partie : visible par tout le monde (agents et spectateurs),
// c'est le seul endroit qui raconte ce qu'il se passe pour ceux qui suivent sans jouer.
const LOG_MAX = 60;
export function logEvent(room, text) {
  if (!room.log) room.log = []; // filet si un snapshot plus ancien que ce champ a été restauré
  room.log.push({ id: newId('log'), ts: Date.now(), text });
  if (room.log.length > LOG_MAX) room.log.shift();
}

// ---------- Cycle de vie de la partie ----------

// Attribution des tabous + remplissage de la file de missions pour UN joueur — factorisé
// car utilisé à la fois au lancement (tout le monde) et pour un arrivant en cours de
// partie (un seul joueur, voir onboardLateJoiner).
function assignMissionsAndTaboos(room, player, content) {
  if (player.isSpectator) return; // pas de mission ni de tabou à suivre pour un spectateur
  const tabooDeck = [...content.taboos, ...room.customTaboos];
  player.taboos = shuffle(tabooDeck).slice(0, 3).map((t) => t.id);
  for (let i = 0; i < room.settings.missionQueueMax; i++) fillMissionSlot(room, player);
}

export function startGame(room, content) {
  room.status = 'playing';
  for (const m of content.missions) room.allMissions.set(m.id, m);
  room.missionPool = shuffle(content.missions.map((m) => m.id));

  for (const player of room.players.values()) assignMissionsAndTaboos(room, player, content);
  recomputeWitnessRequirement(room);
  logEvent(room, "🚀 L'opération a commencé.");
}

// Rejoindre une opération déjà lancée : la partie tourne déjà (allMissions/missionPool
// existent), il ne manque que l'attribution personnelle du nouvel arrivant.
export function onboardLateJoiner(room, player, content) {
  if (room.status !== 'playing') return;
  assignMissionsAndTaboos(room, player, content);
  logEvent(room, player.isSpectator ? `👀 ${player.name} rejoint en cours de route.` : `🆕 ${player.name} rejoint l'opération en cours de route.`);
}

// Départ volontaire (distinct d'une simple perte de connexion) : le joueur quitte pour de
// bon. S'il revient, ce sera comme un nouvel arrivant (§ demande : "recommence à zéro").
export function removePlayer(room, playerId) {
  const player = room.players.get(playerId);
  if (!player) return null;

  // SOS orphelin : inutile de laisser les autres répondre à quelqu'un qui n'est plus là.
  if (room.sos && room.sos.active && room.sos.raisedBy === playerId) room.sos = null;

  // Demandes de validation en attente : plus personne pour les voir aboutir.
  for (const claim of [...room.claims.values()]) {
    if (claim.playerId === playerId && claim.status === 'pending') {
      clearTimeout(claim.timer);
      room.claims.delete(claim.id);
    }
  }

  room.players.delete(playerId);
  room.tokenIndex.delete(player.token);

  if (room.hostId === playerId) {
    const remaining = [...room.players.values()];
    const next = remaining.find((p) => !p.isSpectator) || remaining[0];
    if (next) {
      room.hostId = next.id;
      next.isHost = true;
    }
  }

  logEvent(room, `🚪 ${player.name} a quitté l'opération.`);
  return player;
}

export function recomputeWitnessRequirement(room) {
  room.settings.witnessRequired = room.players.size >= 5 ? 2 : 1;
}

export function updateSettings(room, patch) {
  if (room.status !== 'lobby') return { error: "Les réglages sont verrouillés une fois l'opération lancée." };
  if (patch.missionQueueMax != null) {
    const v = Math.round(patch.missionQueueMax);
    if (v < 1 || v > 3) return { error: 'La file de missions doit être entre 1 et 3.' };
    room.settings.missionQueueMax = v;
  }
  if (patch.name != null) {
    room.name = String(patch.name).trim().slice(0, 60);
  }
  if (patch.challengesEnabled != null) {
    room.settings.challengesEnabled = !!patch.challengesEnabled;
  }
  return {};
}

export function addCustomTaboo(room, text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { error: 'Formule tabou vide.' };
  if (room.status !== 'lobby') return { error: "On ne modifie plus le deck une fois l'opération lancée." };
  const taboo = { id: newId('taboo'), text: trimmed };
  room.customTaboos.push(taboo);
  return { taboo };
}

// ---------- Missions ----------

function fillMissionSlot(room, player) {
  if (player.missionQueue.length >= room.settings.missionQueueMax) return null;
  if (room.missionPool.length === 0) {
    // Repioche : remet en jeu les missions déjà vues par ce joueur uniquement en dernier recours.
    const seen = new Set(player.missionHistory.map((h) => h.missionId));
    room.missionPool = shuffle([...room.allMissions.keys()].filter((id) => !seen.has(id)));
    if (room.missionPool.length === 0) room.missionPool = shuffle([...room.allMissions.keys()]);
  }
  const id = room.missionPool.pop();
  if (id) player.missionQueue.push(id);
  return id;
}

// Un agent ne peut avoir qu'une seule demande en cours par mission et par nature
// (mission ou contamination) — sinon un double-tap sur « C'est fait » crée deux
// témoignages distincts pour la même mission et peut faire créditer les points deux fois.
function hasPendingClaim(room, playerId, missionId, kind) {
  for (const c of room.claims.values()) {
    if (c.status === 'pending' && c.playerId === playerId && c.missionId === missionId && c.kind === kind) return true;
  }
  return false;
}

export function completeMission(room, player, missionId, broadcast) {
  if (!player.missionQueue.includes(missionId)) {
    return { error: 'Cette mission n\'est plus active.' };
  }
  if (hasPendingClaim(room, player.id, missionId, 'mission')) {
    return { error: 'Cette mission est déjà en attente de validation.' };
  }
  const mission = room.allMissions.get(missionId);
  const claimId = newId('claim');
  const timer = setTimeout(() => expireClaim(room, claimId, broadcast), WITNESS_WINDOW_MS);
  room.claims.set(claimId, {
    id: claimId,
    kind: 'mission',
    playerId: player.id,
    missionId,
    text: mission.text,
    votes: {},
    requiredVotes: room.settings.witnessRequired,
    status: 'pending',
    createdAt: Date.now(),
    timer,
  });

  broadcast(room, (targetId) =>
    targetId === player.id
      ? null
      : {
          type: S2C.WITNESS_REQUEST,
          payload: { claimId, kind: 'mission', requesterName: player.name, text: mission.text },
        }
  );
  return { claimId };
}

export function skipMission(room, player, missionId) {
  const idx = player.missionQueue.indexOf(missionId);
  if (idx === -1) return { error: 'Cette mission n\'est plus active.' };
  if (hasPendingClaim(room, player.id, missionId, 'mission')) {
    return { error: 'Impossible de passer : une validation est en cours.' };
  }
  player.missionQueue.splice(idx, 1);
  const skipped = room.allMissions.get(missionId);
  player.missionHistory.push({
    missionId,
    text: skipped?.text,
    level: skipped?.level,
    status: 'skipped',
    ts: Date.now(),
  });
  fillMissionSlot(room, player);
  return {};
}

export function claimContamination(room, player, missionId, broadcast) {
  const inHistory = player.missionHistory.some((h) => h.missionId === missionId && h.status === 'validated');
  const inQueue = player.missionQueue.includes(missionId);
  if (!inHistory && !inQueue) return { error: "Mission introuvable pour la contamination." };
  if (hasPendingClaim(room, player.id, missionId, 'contamination')) {
    return { error: 'Cette contamination est déjà en attente de validation.' };
  }
  const mission = room.allMissions.get(missionId);
  const claimId = newId('claim');
  const timer = setTimeout(() => expireClaim(room, claimId, broadcast), WITNESS_WINDOW_MS);
  // 2 témoins normalement, mais jamais plus que le nombre d'autres agents dans la partie
  // (sinon une contamination est structurellement invalidable en partie à 2).
  const requiredVotes = Math.max(1, Math.min(2, room.players.size - 1));
  room.claims.set(claimId, {
    id: claimId,
    kind: 'contamination',
    playerId: player.id,
    missionId,
    text: mission ? mission.text : '',
    votes: {},
    requiredVotes,
    status: 'pending',
    createdAt: Date.now(),
    timer,
  });

  broadcast(room, (targetId) =>
    targetId === player.id
      ? null
      : {
          type: S2C.WITNESS_REQUEST,
          payload: { claimId, kind: 'contamination', requesterName: player.name, text: mission?.text || '' },
        }
  );
  return { claimId };
}

// Retour en arrière avant la fenêtre de 3 min (§4.1) : sans ça, un joueur qui a cliqué
// « C'est fait » trop vite (personne à portée de voix, mauvais moment) reste bloqué en
// attente sans pouvoir rien faire d'autre jusqu'à l'expiration automatique.
export function cancelClaim(room, player, claimId) {
  const claim = room.claims.get(claimId);
  if (!claim || claim.status !== 'pending') return { error: 'Cette demande n\'est plus active.' };
  if (claim.playerId !== player.id) return { error: 'Ce n\'est pas ta demande.' };
  clearTimeout(claim.timer);
  room.claims.delete(claimId);
  return {};
}

export function witnessVote(room, voter, claimId, vote, broadcast) {
  if (voter.isSpectator) return { error: 'Un spectateur ne peut pas valider — juste suivre.' };
  const claim = room.claims.get(claimId);
  if (!claim || claim.status !== 'pending') return { error: 'Cette validation n\'est plus disponible.' };
  if (claim.playerId === voter.id) return { error: 'Tu ne peux pas valider ta propre mission.' };
  if (!vote) return {}; // "Pas entendu" ne fait rien côté serveur, juste fermeture locale.

  claim.votes[voter.id] = true;
  const votesCount = Object.keys(claim.votes).length;
  if (votesCount < claim.requiredVotes) {
    broadcast(room, () => null); // pas encore assez de témoins, mais on synchronise l'état
    return {};
  }

  // Seuil atteint : validation.
  clearTimeout(claim.timer);
  claim.status = 'validated';
  const requester = room.players.get(claim.playerId);
  const witnessNames = Object.keys(claim.votes)
    .map((id) => room.players.get(id)?.name)
    .filter(Boolean);
  if (requester) {
    if (claim.kind === 'mission') {
      requester.score += SCORE.MISSION_VALIDATED;
      requester.energy = Math.min(100, requester.energy + SCORE.ENERGY_RECHARGE_ON_VALIDATION);
      const idx = requester.missionQueue.indexOf(claim.missionId);
      if (idx !== -1) requester.missionQueue.splice(idx, 1);
      requester.missionHistory.push({
        missionId: claim.missionId,
        text: claim.text,
        level: room.allMissions.get(claim.missionId)?.level,
        status: 'validated',
        validatedBy: witnessNames,
        ts: Date.now(),
      });
      fillMissionSlot(room, requester);
      logEvent(room, `🎯 ${requester.name} a validé : « ${claim.text} »`);
    } else {
      requester.score += SCORE.CONTAMINATION_VALIDATED;
      requester.contaminations += 1;
      requester.missionHistory.push({
        missionId: claim.missionId,
        text: claim.text,
        level: room.allMissions.get(claim.missionId)?.level,
        status: 'contamination',
        validatedBy: witnessNames,
        ts: Date.now(),
      });
      logEvent(room, `🫧 ${requester.name} a réussi une contamination !`);
    }
  }
  for (const witnessId of Object.keys(claim.votes)) {
    const w = room.players.get(witnessId);
    if (w) w.score += SCORE.WITNESS_VOTE;
  }

  broadcast(room, (targetId) =>
    targetId === claim.playerId
      ? {
          type: S2C.NOTIFY,
          payload: {
            kind: claim.kind === 'mission' ? 'mission-validated' : 'contamination-validated',
            text: claim.kind === 'mission' ? 'Mission validée.' : 'Contamination validée !',
          },
        }
      : null
  );
  room.claims.delete(claim.id); // résolue, plus besoin de la garder (§ fuite mémoire signalée)
  return {};
}

function expireClaim(room, claimId, broadcast) {
  const claim = room.claims.get(claimId);
  if (!claim || claim.status !== 'pending') return;
  claim.status = 'expired';
  const requester = room.players.get(claim.playerId);
  if (requester && claim.kind === 'mission') {
    const idx = requester.missionQueue.indexOf(claim.missionId);
    if (idx !== -1) requester.missionQueue.splice(idx, 1);
    requester.missionHistory.push({
      missionId: claim.missionId,
      text: claim.text,
      level: room.allMissions.get(claim.missionId)?.level,
      status: 'expired',
      ts: Date.now(),
    });
    fillMissionSlot(room, requester);
  }
  broadcast(room, (targetId) =>
    requester && targetId === requester.id
      ? { type: S2C.NOTIFY, payload: { kind: 'expired', text: 'Personne n\'a validé à temps. Pas grave, nouvelle mission.' } }
      : null
  );
  room.claims.delete(claimId); // résolue, plus besoin de la garder
}

// ---------- Tabous ----------

export function tabooSelf(room, player, tabooId) {
  if (!player.taboos.includes(tabooId)) return { error: 'Ce tabou ne fait pas partie de tes formules.' };
  player.score += SCORE.TABOO_SELF_NET;
  player.tabooIncidents.push({ tabooId, type: 'self', ts: Date.now() });
  logEvent(room, `🗣️ ${player.name} a avoué un tabou.`);
  return {};
}

export function tabooReport(room, reporter, targetId, tabooId, broadcast) {
  const target = room.players.get(targetId);
  if (!target) return { error: 'Agent introuvable.' };
  if (!target.taboos.includes(tabooId)) return { error: 'Ce tabou ne fait pas partie de ses formules.' };
  const reportId = newId('report');
  room.tabooReports.set(reportId, {
    id: reportId,
    reporterId: reporter.id,
    targetId,
    tabooId,
    status: 'pending',
    createdAt: Date.now(),
  });
  reporter.reportsMade.push({
    reportId,
    targetId,
    targetName: target.name,
    tabooId,
    status: 'pending',
    ts: Date.now(),
  });
  broadcast(room, (tid) =>
    tid === targetId
      ? { type: S2C.NOTIFY, payload: { kind: 'taboo-report', reportId, tabooId } }
      : null
  );
  return { reportId };
}

export function tabooConfirm(room, target, reportId, accept, broadcast) {
  const report = room.tabooReports.get(reportId);
  if (!report || report.status !== 'pending') return { error: 'Ce signalement n\'est plus disponible.' };
  if (report.targetId !== target.id) return { error: "Ce signalement ne te concerne pas." };
  report.status = accept ? 'confirmed' : 'rejected';
  if (accept) {
    target.score += SCORE.TABOO_REPORTED_CONFIRMED;
    target.tabooIncidents.push({ tabooId: report.tabooId, type: 'reported', ts: Date.now() });
    logEvent(room, `🗣️ ${target.name} a été pris·e en flagrant délit de tabou.`);
  }
  const reporter = room.players.get(report.reporterId);
  if (reporter) {
    const entry = reporter.reportsMade.find((r) => r.reportId === reportId);
    if (entry) entry.status = report.status;
  }
  broadcast(room, (tid) =>
    tid === report.reporterId
      ? {
          type: S2C.NOTIFY,
          payload: {
            kind: 'report-resolved',
            accepted: accept,
            targetName: target.name,
          },
        }
      : null
  );
  room.tabooReports.delete(reportId); // résolu ; le résultat vit déjà dans reportsMade/tabooIncidents
  return {};
}

// ---------- Énergie ----------

export function setEnergy(room, player, value, broadcast) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const wasLow = player.energy < ENERGY_LOW_THRESHOLD;
  player.energy = clamped;
  const isLow = player.energy < ENERGY_LOW_THRESHOLD;
  const crossedDown = isLow && !wasLow;
  broadcast(room, (targetId) =>
    crossedDown && targetId !== player.id ? { type: S2C.NOTIFY, payload: { kind: 'low-energy', name: player.name } } : null
  );
  return {};
}

// ---------- SOS ----------

export function sosRaise(room, player, broadcast) {
  if (room.sos && room.sos.active) return { error: 'Un SOS est déjà en cours.' };
  const id = newId('sos');
  room.sos = { id, raisedBy: player.id, ts: Date.now(), active: true, responder: null, mode: null };
  logEvent(room, `🆘 ${player.name} a levé un SOS.`);
  broadcast(room, (targetId) =>
    targetId === player.id ? null : { type: S2C.SOS_ALERT, payload: { sosId: id, raisedByName: player.name } }
  );
  return { sosId: id };
}

export function sosTake(room, responder, sosId, mode, broadcast) {
  if (responder.isSpectator) return { error: 'Un spectateur ne peut pas répondre — juste suivre.' };
  if (!room.sos || room.sos.id !== sosId || !room.sos.active) return { error: 'Ce SOS n\'est plus disponible.' };
  if (room.sos.raisedBy === responder.id) return { error: 'Tu ne peux pas répondre à ton propre SOS.' };
  room.sos.active = false;
  room.sos.responder = responder.id;
  room.sos.mode = mode;
  responder.score += SCORE.SOS_RESPONSE;
  responder.sosHandled += 1;
  const raiser = room.players.get(room.sos.raisedBy);
  logEvent(room, `🆘 ${responder.name} s'occupe du SOS de ${raiser ? raiser.name : '?'} (${mode === 'extraction' ? 'extraction' : 'diversion'}).`);
  broadcast(room, (targetId) =>
    targetId === (raiser && raiser.id)
      ? { type: S2C.NOTIFY, payload: { kind: 'sos-taken', responderName: responder.name, mode } }
      : null
  );
  return {};
}

// ---------- Encouragements (mode spectateur) ----------

export function sendCheer(room, spectator, emoji, broadcast) {
  if (!spectator.isSpectator) return { error: 'Seul un spectateur peut envoyer un encouragement.' };
  if (!CHEER_EMOJIS.includes(emoji)) return { error: 'Encouragement invalide.' };
  logEvent(room, `${emoji} ${spectator.name} envoie ${emoji} à tout le monde.`);
  broadcast(room, (targetId) =>
    targetId === spectator.id ? null : { type: S2C.NOTIFY, payload: { kind: 'cheer', name: spectator.name, emoji } }
  );
  return {};
}

// ---------- Chat ----------

export function sendChatMessage(room, player, text, broadcast) {
  const trimmed = (text || '').trim().slice(0, CHAT_MAX_LENGTH);
  if (!trimmed) return { error: 'Message vide.' };
  const message = { id: newId('chat'), playerId: player.id, name: player.name, isSpectator: player.isSpectator, text: trimmed, ts: Date.now() };
  room.chat.push(message);
  if (room.chat.length > CHAT_MAX_HISTORY) room.chat.shift();
  broadcast(room, (targetId) =>
    targetId === player.id ? null : { type: S2C.CHAT_MESSAGE, payload: { name: player.name, text: trimmed } }
  );
  return {};
}

// ---------- Défis (§ demande : moments visibles et partagés, en plus des missions discrètes) ----------
//
// Barème pensé pour que lancer un défi soit un choix, pas un réflexe : le lanceur ne touche
// des points que si le défi aboutit. Il doit donc bien choisir — la bonne carte pour la
// bonne personne — plutôt que spammer. Décliner reste toujours possible et silencieux,
// aucune pénalité (même philosophie que le reste du jeu).
//
// C'est aussi le lanceur qui choisit la carte précise (plutôt qu'un tirage au hasard) et qui
// valide que c'est fait (plutôt que la cible qui s'auto-déclare) : un défi direct est un moment
// que le lanceur observe en personne, il est donc le mieux placé pour trancher — comme pour
// les défis ouverts, où c'est déjà lui qui désigne le gagnant.
//
// Cycle de vie d'un défi direct : pending (à accepter) -> accepted (à faire) -> claimed (la
// cible dit avoir fini, prévient le lanceur) -> supprimé une fois validé par le lanceur. Décliner,
// laisser expirer ou refuser une validation trop précipitée reste toujours sans pénalité.

function remainingCooldown(lastAt, cooldownMs) {
  const remaining = (lastAt || 0) + cooldownMs - Date.now();
  return remaining > 0 ? remaining : 0;
}

export function sendDirectChallenge(room, launcher, targetId, cardId, content, broadcast) {
  if (!room.settings.challengesEnabled) return { error: 'Les défis sont désactivés pour cette opération.' };
  if (launcher.isSpectator) return { error: 'Un spectateur ne peut pas lancer de défi.' };
  const target = room.players.get(targetId);
  if (!target || target.isSpectator) return { error: 'Cible introuvable.' };
  if (target.id === launcher.id) return { error: 'Tu ne peux pas te lancer un défi à toi-même.' };
  const wait = remainingCooldown(launcher.lastChallengeAt, CHALLENGE_COOLDOWN_MS);
  if (wait > 0) return { error: `Encore ${Math.ceil(wait / 60000)} min avant de pouvoir relancer un défi.` };

  const card = content.challenges.find((c) => c.id === cardId);
  if (!card) return { error: 'Carte de défi introuvable.' };

  launcher.lastChallengeAt = Date.now();
  const challengeId = newId('chal');
  const timer = setTimeout(() => expireChallenge(room, challengeId, broadcast), CHALLENGE_ACCEPT_WINDOW_MS);
  room.challenges.set(challengeId, {
    id: challengeId,
    fromId: launcher.id,
    targetId,
    level: card.level,
    text: card.text,
    status: 'pending', // voir cycle de vie en tête de section
    createdAt: Date.now(),
    timer,
  });

  broadcast(room, (tid) =>
    tid === targetId
      ? { type: S2C.CHALLENGE_REQUEST, payload: { challengeId, fromName: launcher.name, level: card.level, text: card.text } }
      : null
  );
  return { challengeId };
}

export function respondChallenge(room, player, challengeId, accept, broadcast) {
  const challenge = room.challenges.get(challengeId);
  if (!challenge || challenge.status !== 'pending') return { error: "Ce défi n'est plus disponible." };
  if (challenge.targetId !== player.id) return { error: 'Ce défi ne te concerne pas.' };
  clearTimeout(challenge.timer);

  if (!accept) {
    room.challenges.delete(challengeId); // décliné : silencieux, aucune trace, aucune pénalité
    broadcast(room, () => null);
    return {};
  }

  challenge.status = 'accepted';
  challenge.timer = setTimeout(() => expireChallenge(room, challengeId, broadcast), CHALLENGE_COMPLETE_WINDOW_MS);
  broadcast(room, (tid) =>
    tid === challenge.fromId
      ? { type: S2C.NOTIFY, payload: { kind: 'challenge-accepted', name: player.name } }
      : null
  );
  return {};
}

// La cible signale qu'elle a fini (accepted -> claimed) : le lanceur, prévenu, n'a plus qu'à
// confirmer. Sans ce signal, le lanceur devait deviner le bon moment tout seul.
export function claimChallenge(room, player, challengeId, broadcast) {
  const challenge = room.challenges.get(challengeId);
  if (!challenge || challenge.status !== 'accepted') return { error: "Ce défi n'est plus disponible." };
  if (challenge.targetId !== player.id) return { error: 'Ce défi ne te concerne pas.' };
  clearTimeout(challenge.timer);

  challenge.status = 'claimed';
  // Fenêtre repartie à zéro : le lanceur vient d'être prévenu, il doit avoir le temps de
  // constater et valider plutôt qu'hériter d'un compte à rebours déjà bien entamé.
  challenge.timer = setTimeout(() => expireChallenge(room, challengeId, broadcast), CHALLENGE_COMPLETE_WINDOW_MS);
  broadcast(room, (tid) =>
    tid === challenge.fromId
      ? { type: S2C.NOTIFY, payload: { kind: 'challenge-claimed', name: player.name } }
      : null
  );
  return {};
}

export function validateChallenge(room, launcher, challengeId, broadcast) {
  const challenge = room.challenges.get(challengeId);
  if (!challenge || challenge.status !== 'claimed') return { error: "Ce défi n'est plus disponible." };
  if (challenge.fromId !== launcher.id) return { error: "Seul l'agent qui a lancé ce défi peut le valider." };
  clearTimeout(challenge.timer);

  const target = room.players.get(challenge.targetId);
  const targetPts = challenge.level === 'corse' ? SCORE.CHALLENGE_CORSE_TARGET : SCORE.CHALLENGE_LEGER_TARGET;
  const launcherPts = challenge.level === 'corse' ? SCORE.CHALLENGE_CORSE_LAUNCHER : SCORE.CHALLENGE_LEGER_LAUNCHER;
  if (target) target.score += targetPts;
  launcher.score += launcherPts;
  logEvent(room, `🎲 ${target ? target.name : '?'} a relevé le défi de ${launcher.name} (+${targetPts} points, +${launcherPts} pour ${launcher.name}) : « ${challenge.text} »`);

  room.challenges.delete(challengeId);
  broadcast(room, (tid) =>
    tid === challenge.targetId
      ? { type: S2C.NOTIFY, payload: { kind: 'challenge-done', name: launcher.name } }
      : null
  );
  return {};
}

function expireChallenge(room, challengeId, broadcast) {
  const challenge = room.challenges.get(challengeId);
  if (!challenge) return;
  room.challenges.delete(challengeId); // ni pénalité ni trace, comme une mission expirée
  broadcast(room, () => null);
}

export function sendOpenChallenge(room, launcher, cardId, content, broadcast) {
  if (!room.settings.challengesEnabled) return { error: 'Les défis sont désactivés pour cette opération.' };
  if (launcher.isSpectator) return { error: 'Un spectateur ne peut pas lancer de défi.' };
  const wait = remainingCooldown(launcher.lastOpenChallengeAt, OPEN_CHALLENGE_COOLDOWN_MS);
  if (wait > 0) return { error: `Encore ${Math.ceil(wait / 60000)} min avant de pouvoir relancer un défi ouvert.` };

  const card = content.openChallenges.find((c) => c.id === cardId);
  if (!card) return { error: 'Question de défi ouvert introuvable.' };

  launcher.lastOpenChallengeAt = Date.now();
  const openChallengeId = newId('ochal');
  const timer = setTimeout(() => expireOpenChallenge(room, openChallengeId, broadcast), OPEN_CHALLENGE_WINDOW_MS);
  room.openChallenges.set(openChallengeId, {
    id: openChallengeId,
    fromId: launcher.id,
    text: card.text,
    status: 'pending',
    createdAt: Date.now(),
    timer,
    answers: new Map(), // playerId -> { text, submittedAt } — réponses écrites, visibles du lanceur seul
    awardedTo: null, // playerId du gagnant actuellement désigné, ou null — voir awardOpenChallenge
  });

  logEvent(room, `🏆 ${launcher.name} lance un défi ouvert : « ${card.text} »`);
  broadcast(room, (tid) =>
    tid === launcher.id ? null : { type: S2C.OPEN_CHALLENGE_ALERT, payload: { openChallengeId, fromName: launcher.name, text: card.text } }
  );
  return { openChallengeId };
}

// Réponse écrite dans la carte (§ demande) : remplace le seul "cri à l'oral" par une trace que
// le lanceur peut relire pour juger. Les autres agents ne voient qu'un statut reçu/en attente
// (voir serializeStateFor) — pas le contenu, pour ne pas se souffler la réponse entre eux.
export function answerOpenChallenge(room, player, openChallengeId, text, broadcast) {
  const challenge = room.openChallenges.get(openChallengeId);
  if (!challenge || challenge.status !== 'pending') return { error: 'Le lanceur a déjà tranché ce défi.' };
  if (player.isSpectator) return { error: 'Un spectateur ne peut pas répondre à un défi.' };
  if (challenge.fromId === player.id) return { error: 'Tu ne peux pas répondre à ton propre défi.' };
  const trimmed = (text || '').trim().slice(0, OPEN_CHALLENGE_ANSWER_MAX_LENGTH);
  if (!trimmed) return { error: 'Réponse vide.' };

  challenge.answers.set(player.id, { text: trimmed, submittedAt: Date.now() });
  broadcast(room, () => null);
  return {};
}

// Droit à l'erreur (§ demande) : le lanceur peut redésigner le gagnant tant que le défi n'a pas
// expiré (timer posé au lancement, cf. sendOpenChallenge) — pas de suppression au premier clic.
// On annule d'abord les points du choix précédent avant d'appliquer le nouveau, pour ne jamais
// cumuler deux attributions. Le statut passe à 'awarded' : plus personne d'autre ne peut
// répondre à partir de là (voir answerOpenChallenge), mais le lanceur, lui, garde la main.
export function awardOpenChallenge(room, launcher, openChallengeId, winnerId, broadcast) {
  const challenge = room.openChallenges.get(openChallengeId);
  if (!challenge) return { error: "Ce défi n'est plus disponible." };
  if (challenge.fromId !== launcher.id) return { error: "Seul l'agent qui a lancé ce défi peut désigner le gagnant." };

  const newWinnerId = winnerId || null;
  if (challenge.status === 'awarded' && challenge.awardedTo === newWinnerId) return {}; // rien n'a changé

  if (challenge.status === 'awarded') {
    const prevWinner = challenge.awardedTo ? room.players.get(challenge.awardedTo) : null;
    if (prevWinner && prevWinner.id !== launcher.id) {
      prevWinner.score -= SCORE.OPEN_CHALLENGE_WINNER;
      launcher.score -= SCORE.OPEN_CHALLENGE_LAUNCHER;
    }
  }

  const winner = newWinnerId ? room.players.get(newWinnerId) : null;
  challenge.status = 'awarded';
  challenge.awardedTo = winner ? winner.id : null;
  if (winner && winner.id !== launcher.id) {
    winner.score += SCORE.OPEN_CHALLENGE_WINNER;
    launcher.score += SCORE.OPEN_CHALLENGE_LAUNCHER;
    logEvent(room, `🏆 ${winner.name} remporte le défi ouvert de ${launcher.name} (+${SCORE.OPEN_CHALLENGE_WINNER} points, +${SCORE.OPEN_CHALLENGE_LAUNCHER} pour ${launcher.name}) : « ${challenge.text} »`);
  } else {
    logEvent(room, `🏆 Défi ouvert de ${launcher.name} : personne n'a trouvé « ${challenge.text} ».`);
  }
  broadcast(room, (tid) =>
    winner && tid === winner.id
      ? { type: S2C.NOTIFY, payload: { kind: 'open-challenge-won', fromName: launcher.name } }
      : null
  );
  return {};
}

function expireOpenChallenge(room, openChallengeId, broadcast) {
  const challenge = room.openChallenges.get(openChallengeId);
  if (!challenge) return;
  // Si déjà tranché (status 'awarded'), les points de la dernière désignation restent acquis —
  // ce timer ne fait que clore l'écran, il ne touche jamais au score.
  room.openChallenges.delete(openChallengeId);
  broadcast(room, () => null);
}

// ---------- Débriefing ----------

export function endGame(room) {
  room.status = 'ended';
  logEvent(room, "🏁 L'opération est terminée.");
  const players = [...room.players.values()].filter((p) => !p.isSpectator);
  const podium = players
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((p) => ({ id: p.id, name: p.name, score: p.score }));

  const missionsValidated = (p) => p.missionHistory.filter((h) => h.status === 'validated').length;

  const infiltre = players.length ? players.reduce((a, b) => (missionsValidated(b) > missionsValidated(a) ? b : a)) : null;
  const angeGardien = players.length ? players.reduce((a, b) => (b.sosHandled > a.sosHandled ? b : a)) : null;
  const roiContamination = players.length ? players.reduce((a, b) => (b.contaminations > a.contaminations ? b : a)) : null;

  const title = (p, minValue, valueFn) => (p && valueFn(p) >= minValue ? { id: p.id, name: p.name } : null);

  return {
    podium,
    titles: {
      meilleurInfiltre: title(infiltre, 1, missionsValidated),
      angeGardien: title(angeGardien, 1, (p) => p.sosHandled),
      roiDeLaContamination: title(roiContamination, 1, (p) => p.contaminations),
    },
  };
}

// ---------- Sérialisation ----------

export function serializeStateFor(room, playerId) {
  const self = room.players.get(playerId);
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    isHost: p.isHost,
    isSpectator: p.isSpectator,
    connected: p.connected,
    paused: p.paused,
    score: p.score,
    energy: p.energy,
    sosHandled: p.sosHandled,
    contaminations: p.contaminations,
  }));

  const missionQueue = self
    ? self.missionQueue.map((id) => room.allMissions.get(id)).filter(Boolean)
    : [];

  // Un spectateur ne valide rien — juste suivre — donc il ne reçoit même pas la demande.
  const pendingWitnessRequests = self?.isSpectator
    ? []
    : [...room.claims.values()]
        .filter((c) => c.status === 'pending' && c.playerId !== playerId && !c.votes[playerId])
        .map((c) => ({ claimId: c.id, kind: c.kind, requesterName: room.players.get(c.playerId)?.name, text: c.text }));

  const myPendingTabooReports = [...room.tabooReports.values()]
    .filter((r) => r.status === 'pending' && r.targetId === playerId)
    .map((r) => ({ reportId: r.id, tabooId: r.tabooId }));

  // Mes propres demandes en attente (mission / contamination que j'ai déclarées) : sert au
  // client à désactiver « C'est fait » / « Contamination » tant que ça n'est pas tranché,
  // plutôt que de laisser retaper et créer des doublons.
  const myPendingClaims = [...room.claims.values()]
    .filter((c) => c.status === 'pending' && c.playerId === playerId)
    .map((c) => ({ claimId: c.id, kind: c.kind, missionId: c.missionId }));

  // Défis : un spectateur ne lance ni ne reçoit rien — pur observateur, même principe que
  // pour les demandes de témoin.
  const myChallengeRaw = self?.isSpectator
    ? null
    : [...room.challenges.values()].find((c) => c.targetId === playerId); // toujours non terminal : validé/refusé/expiré = supprimé de la map
  // Jamais l'objet interne tel quel (il porte un timer, non sérialisable) : juste ce que le client affiche.
  const myChallenge = myChallengeRaw
    ? {
        id: myChallengeRaw.id,
        fromId: myChallengeRaw.fromId,
        fromName: room.players.get(myChallengeRaw.fromId)?.name,
        level: myChallengeRaw.level,
        text: myChallengeRaw.text,
        status: myChallengeRaw.status,
      }
    : null;
  // Le défi que j'ai lancé moi-même : c'est moi qui verrai le bouton « C'est fait » une fois
  // que la cible a signalé avoir fini (status 'claimed'), pas la cible elle-même.
  const myLaunchedChallengeRaw = self?.isSpectator
    ? null
    : [...room.challenges.values()].find((c) => c.fromId === playerId);
  const myLaunchedChallenge = myLaunchedChallengeRaw
    ? {
        id: myLaunchedChallengeRaw.id,
        targetId: myLaunchedChallengeRaw.targetId,
        targetName: room.players.get(myLaunchedChallengeRaw.targetId)?.name,
        level: myLaunchedChallengeRaw.level,
        text: myLaunchedChallengeRaw.text,
        status: myLaunchedChallengeRaw.status,
      }
    : null;
  const openChallenges = self?.isSpectator
    ? []
    // 'awarded' reste inclus : le lanceur garde la main pour redésigner (droit à l'erreur, voir
    // awardOpenChallenge) jusqu'à l'expiration naturelle du défi, pas seulement au premier clic.
    : [...room.openChallenges.values()]
        .filter((c) => c.status === 'pending' || c.status === 'awarded')
        .map((c) => {
          // Qui peut répondre : tout agent sauf le lanceur lui-même. Le texte des réponses n'est
          // révélé qu'au lanceur (qui doit juger) ; les autres ne voient qu'un statut reçu/en
          // attente — pas de quoi se souffler la réponse entre agents.
          const eligible = [...room.players.values()].filter((p) => !p.isSpectator && p.id !== c.fromId);
          const isLauncher = c.fromId === playerId;
          return {
            id: c.id,
            fromId: c.fromId,
            fromName: room.players.get(c.fromId)?.name,
            text: c.text,
            status: c.status,
            myAnswer: c.answers.get(playerId)?.text ?? null,
            awardedTo: isLauncher && c.status === 'awarded' ? c.awardedTo : undefined, // id du gagnant actuel, ou null si "personne"
            respondents: eligible.map((p) => ({
              id: p.id,
              name: p.name,
              status: c.answers.has(p.id) ? 'received' : 'pending',
              text: isLauncher ? (c.answers.get(p.id)?.text ?? null) : null,
            })),
          };
        });

  return {
    type: 'state',
    payload: {
      room: {
        code: room.code,
        name: room.name || '',
        status: room.status,
        settings: room.settings,
        customTaboos: room.customTaboos,
        log: room.log,
        chat: room.chat,
      },
      me: self
        ? {
            id: self.id,
            name: self.name,
            isHost: self.isHost,
            isSpectator: self.isSpectator,
            score: self.score,
            energy: self.energy,
            paused: self.paused,
            taboos: self.taboos,
            missionQueue,
            missionHistory: self.missionHistory,
            tabooIncidents: self.tabooIncidents,
            reportsMade: self.reportsMade,
            pendingClaims: myPendingClaims,
            sosHandled: self.sosHandled,
            contaminations: self.contaminations,
            myChallenge: myChallenge || null,
            myLaunchedChallenge: myLaunchedChallenge || null,
            nextChallengeAt: (self.lastChallengeAt || 0) + CHALLENGE_COOLDOWN_MS,
            nextOpenChallengeAt: (self.lastOpenChallengeAt || 0) + OPEN_CHALLENGE_COOLDOWN_MS,
          }
        : null,
      players,
      sos:
        room.sos && room.sos.active
          ? { id: room.sos.id, raisedBy: room.sos.raisedBy, raisedByName: room.players.get(room.sos.raisedBy)?.name }
          : null,
      pendingWitnessRequests,
      myPendingTabooReports,
      openChallenges,
      debrief: room.status === 'ended' ? room.debrief : null,
    },
  };
}
