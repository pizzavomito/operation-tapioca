// Règles du jeu, scoring, timers (§4 et §5 du PRD).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newId, shuffle } from './rooms.js';
import { S2C, SCORE, WITNESS_WINDOW_MS, ENERGY_LOW_THRESHOLD, CHEER_EMOJIS } from './protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadContent() {
  const missions = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'missions.json'), 'utf8'));
  const taboos = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'taboos.json'), 'utf8'));
  return { missions, taboos };
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

export function startGame(room, content) {
  room.status = 'playing';
  for (const m of content.missions) room.allMissions.set(m.id, m);
  room.missionPool = shuffle(content.missions.map((m) => m.id));

  const tabooDeck = [...content.taboos, ...room.customTaboos];
  for (const player of room.players.values()) {
    if (player.isSpectator) continue; // pas de mission ni de tabou à suivre pour un spectateur
    player.taboos = shuffle(tabooDeck)
      .slice(0, 3)
      .map((t) => t.id);
    for (let i = 0; i < room.settings.missionQueueMax; i++) fillMissionSlot(room, player);
  }
  recomputeWitnessRequirement(room);
  logEvent(room, "🚀 L'opération a commencé.");
}

export function recomputeWitnessRequirement(room) {
  room.settings.witnessRequired = room.players.size >= 5 ? 2 : 1;
}

export function updateSettings(room, patch) {
  if (room.status !== 'lobby') return { error: 'Les réglages sont verrouillés une fois la partie lancée.' };
  if (patch.missionQueueMax != null) {
    const v = Math.round(patch.missionQueueMax);
    if (v < 1 || v > 3) return { error: 'La file de missions doit être entre 1 et 3.' };
    room.settings.missionQueueMax = v;
  }
  return {};
}

export function addCustomTaboo(room, text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { error: 'Formule tabou vide.' };
  if (room.status !== 'lobby') return { error: 'On ne modifie plus le deck une fois la partie lancée.' };
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

export function witnessVote(room, voter, claimId, vote, broadcast) {
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
  logEvent(room, `${emoji} ${spectator.name} envoie ${emoji} à toute la table.`);
  broadcast(room, (targetId) =>
    targetId === spectator.id ? null : { type: S2C.NOTIFY, payload: { kind: 'cheer', name: spectator.name, emoji } }
  );
  return {};
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

  const pendingWitnessRequests = [...room.claims.values()]
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

  return {
    type: 'state',
    payload: {
      room: {
        code: room.code,
        status: room.status,
        settings: room.settings,
        customTaboos: room.customTaboos,
        log: room.log,
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
          }
        : null,
      players,
      sos:
        room.sos && room.sos.active
          ? { id: room.sos.id, raisedBy: room.sos.raisedBy, raisedByName: room.players.get(room.sos.raisedBy)?.name }
          : null,
      pendingWitnessRequests,
      myPendingTabooReports,
      debrief: room.status === 'ended' ? room.debrief : null,
    },
  };
}
