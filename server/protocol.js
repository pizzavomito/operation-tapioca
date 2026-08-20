// Protocole WebSocket partagé entre le serveur et le client (Opération Tapioca).
// Fichier chargé tel quel côté navigateur via /protocol.js (voir server/index.js).

// Client -> serveur
export const C2S = {
  JOIN: 'join',
  START: 'start',
  MISSION_DONE: 'mission:done',
  MISSION_SKIP: 'mission:skip',
  MISSION_WITNESS: 'mission:witness',
  CONTAMINATION_CLAIM: 'contamination:claim',
  CLAIM_CANCEL: 'claim:cancel', // { claimId } — annule sa propre demande de validation en attente
  TABOO_SELF: 'taboo:self',
  TABOO_REPORT: 'taboo:report',
  TABOO_CONFIRM: 'taboo:confirm',
  ENERGY_SET: 'energy:set',
  SOS_RAISE: 'sos:raise',
  SOS_TAKE: 'sos:take',
  GAME_END: 'game:end',
  LEAVE_ROOM: 'room:leave', // départ volontaire — distinct d'une simple perte de connexion
  PONG: 'pong',
  // Extensions nécessaires au lobby (§6 écran 2 : « réglages hôte », tabous ajoutés par l'hôte)
  // non détaillées dans le tableau §7.1 du PRD mais requises pour le remplir fonctionnellement.
  SETTINGS_UPDATE: 'settings:update', // hôte, { missionQueueMax: 1-3 }
  TABOO_ADD: 'taboo:add', // hôte, { text }
  CHEER: 'cheer', // spectateur, { emoji } — un des CHEER_EMOJIS ci-dessous
  PUSH_SUBSCRIBE: 'push:subscribe', // { subscription } — objet PushSubscription.toJSON()
  VISIBILITY: 'visibility', // { visible: boolean } — Page Visibility API côté client
  CHAT_SEND: 'chat:send', // { text } — chat de partie, agents et spectateurs
  CHALLENGE_SEND: 'challenge:send', // { targetId, cardId } — carte choisie par le lanceur dans le deck
  CHALLENGE_RESPOND: 'challenge:respond', // { challengeId, accept: boolean }
  CHALLENGE_CLAIM: 'challenge:claim', // { challengeId } — la cible signale avoir fini, prévient le lanceur
  CHALLENGE_VALIDATE: 'challenge:validate', // { challengeId } — le lanceur constate et valide, pas la cible
  OPEN_CHALLENGE_SEND: 'openChallenge:send', // { cardId } — question choisie par le lanceur dans le deck
  OPEN_CHALLENGE_ANSWER: 'openChallenge:answer', // { openChallengeId, text } — soumet/modifie sa réponse écrite
  OPEN_CHALLENGE_AWARD: 'openChallenge:award', // { openChallengeId, winnerId: string|null }
};

// Serveur -> client
export const S2C = {
  STATE: 'state',
  MISSION_NEW: 'mission:new',
  WITNESS_REQUEST: 'witness:request',
  SOS_ALERT: 'sos:alert',
  CHAT_MESSAGE: 'chat:message',
  CHALLENGE_REQUEST: 'challenge:request', // reçu par la cible : { challengeId, fromName, level, text }
  OPEN_CHALLENGE_ALERT: 'openChallenge:alert', // reçu par tous sauf le lanceur : { openChallengeId, fromName, text }
  NOTIFY: 'notify',
  ERROR: 'error',
  PING: 'ping',
};

// Barème (§5 du PRD) — centralisé ici pour que serveur et débriefing restent cohérents.
export const SCORE = {
  MISSION_VALIDATED: 10,
  CONTAMINATION_VALIDATED: 30,
  WITNESS_VOTE: 2,
  SOS_RESPONSE: 15,
  TABOO_SELF_NET: -3, // -5 + 2 (honnêteté)
  TABOO_REPORTED_CONFIRMED: -5,
  MISSION_EXPIRED: 0,
  ENERGY_RECHARGE_ON_VALIDATION: 5,
  // Défis (§ demande) : le lanceur ne touche des points que si le défi aboutit — il doit
  // bien choisir la bonne carte pour la bonne personne, pas juste spammer des demandes.
  CHALLENGE_LEGER_TARGET: 8,
  CHALLENGE_LEGER_LAUNCHER: 3,
  CHALLENGE_CORSE_TARGET: 15,
  CHALLENGE_CORSE_LAUNCHER: 5,
  OPEN_CHALLENGE_WINNER: 20,
  OPEN_CHALLENGE_LAUNCHER: 5,
};

// Encouragements du mode spectateur : ensemble fixe et rapide, en plus du chat texte.
export const CHEER_EMOJIS = ['💪', '😘', '👏', '🔥'];

export const WITNESS_WINDOW_MS = 3 * 60 * 1000; // 3 min
export const SOS_LONGPRESS_MS = 1500;
export const ENERGY_LOW_THRESHOLD = 25;
export const SNAPSHOT_INTERVAL_MS = 30 * 1000;
export const PING_INTERVAL_MS = 25 * 1000;
export const CHAT_MAX_LENGTH = 500;
export const CHAT_MAX_HISTORY = 200;

// Défis : cooldowns individuels pour rester rares (§ demande, mode furtif) — pas de spam.
export const CHALLENGE_COOLDOWN_MS = 10 * 60 * 1000; // 10 min entre deux défis directs lancés
export const CHALLENGE_ACCEPT_WINDOW_MS = 5 * 60 * 1000; // fenêtre pour accepter/décliner
export const CHALLENGE_COMPLETE_WINDOW_MS = 10 * 60 * 1000; // fenêtre pour le faire une fois accepté
export const OPEN_CHALLENGE_COOLDOWN_MS = 15 * 60 * 1000; // 15 min entre deux défis ouverts lancés
export const OPEN_CHALLENGE_WINDOW_MS = 5 * 60 * 1000; // fenêtre avant clôture automatique sans gagnant
export const OPEN_CHALLENGE_ANSWER_MAX_LENGTH = 200;
