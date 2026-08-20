// État client + routage d'écrans (§7 du PRD).
import { GameSocket } from './ws.js';
import { C2S, S2C } from './protocol.js';
import { h, esc, vibrate, fmtCountdown } from './ui/components.js';
import * as Home from './ui/home.js';
import * as Lobby from './ui/lobby.js';
import * as Mission from './ui/mission.js';
import * as Dossier from './ui/dossier.js';
import * as Spectator from './ui/spectator.js';
import * as Chat from './ui/chat.js';
import * as Challenges from './ui/challenges.js';
import * as Debrief from './ui/debrief.js';
import * as History from './ui/history.js';
import * as Tutorial from './ui/tutorial.js';
import * as Validation from './ui/validation.js';

const LS_SESSION = 'tapioca:session';
const LS_TUTORIAL_SEEN = 'tapioca:tutorialSeen';

const appRoot = document.getElementById('app');
const screenRoot = h('<div id="screen-root"></div>');
const bannerRoot = h('<div id="banner-root"></div>');
const statusRoot = h('<div id="status-root"></div>');
appRoot.append(bannerRoot, statusRoot, screenRoot);

const overlayRoot = h('<div id="overlay-root"></div>');
const toastRoot = h('<div id="toast-root"></div>');
// Élément dédié pour le flash visuel (SOS, demande de témoin) : position fixed sur tout
// le viewport, indépendant de la hauteur réelle du contenu — contrairement à #app qui
// grandit avec la page et rendait le halo invisible dès que l'écran scrollait.
const flashRoot = h('<div id="flash-root"></div>');
document.body.append(overlayRoot, toastRoot, flashRoot);

let session = loadSession();
let serverState = null; // dernier payload de 'state'
let genericTaboos = [];
let challengeDeck = []; // deck de défis directs (§ demande : le lanceur choisit la carte à vue)
let openChallengeDeck = []; // deck de défis ouverts, même principe
let connectionStatus = 'connecting';
let toastTimer = null;

let ui = {
  homeMode: 'join',
  homeName: '',
  homeCode: '',
  joinError: null,
  prefillCode: new URLSearchParams(location.search).get('code') || '',
  showHistory: false, // écran Historique, accessible depuis l'accueil, indépendant d'une session de partie
  historyDetailId: null,
  showTutorial: false, // accessible à tout moment (accueil, Dossier, écran spectateur)
  tutorialStep: 0,
  view: 'mission', // sous-écran quand la partie est en cours : mission | dossier
  dismissedSosId: null,
  dismissedClaimIds: new Set(), // "Pas entendu" : fermeture locale, le serveur ne fait rien exprès
  chatSeenCount: 0, // nombre de messages déjà vus, pour le badge "non lu" sur l'onglet Chat
  toast: null,
};

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
  } catch {
    return null;
  }
}
function saveSession(s) {
  session = s;
  localStorage.setItem(LS_SESSION, JSON.stringify(s));
}
function clearSession() {
  session = null;
  localStorage.removeItem(LS_SESSION);
}

const socket = new GameSocket({
  onMessage: handleMessage,
  onStatusChange: (status) => {
    connectionStatus = status;
    if (status === 'open' && session?.token) {
      socket.send(C2S.JOIN, { token: session.token });
    }
    render();
  },
});

const actions = {
  join: ({ name, roomCode, spectator }) => socket.send(C2S.JOIN, { name, roomCode, spectator }),
  start: () => socket.send(C2S.START, {}),
  updateSettings: (patch) => socket.send(C2S.SETTINGS_UPDATE, patch),
  addTaboo: (text) => socket.send(C2S.TABOO_ADD, { text }),
  missionDone: (missionId) => socket.send(C2S.MISSION_DONE, { missionId }),
  missionSkip: (missionId) => socket.send(C2S.MISSION_SKIP, { missionId }),
  witnessVote: (claimId, vote) => socket.send(C2S.MISSION_WITNESS, { claimId, vote }),
  contaminationClaim: (missionId) => socket.send(C2S.CONTAMINATION_CLAIM, { missionId }),
  cancelClaim: (claimId) => socket.send(C2S.CLAIM_CANCEL, { claimId }),
  tabooSelf: (tabooId) => socket.send(C2S.TABOO_SELF, { tabooId }),
  tabooReport: (targetId, tabooId) => socket.send(C2S.TABOO_REPORT, { targetId, tabooId }),
  tabooConfirm: (reportId, accept) => socket.send(C2S.TABOO_CONFIRM, { reportId, accept }),
  setEnergy: (value) => socket.send(C2S.ENERGY_SET, { value }),
  sosRaise: () => socket.send(C2S.SOS_RAISE, {}),
  sosTake: (sosId, mode) => socket.send(C2S.SOS_TAKE, { sosId, mode }),
  cheer: (emoji) => socket.send(C2S.CHEER, { emoji }),
  sendChat: (text) => socket.send(C2S.CHAT_SEND, { text }),
  sendChallenge: (targetId, cardId) => socket.send(C2S.CHALLENGE_SEND, { targetId, cardId }),
  respondChallenge: (challengeId, accept) => socket.send(C2S.CHALLENGE_RESPOND, { challengeId, accept }),
  claimChallenge: (challengeId) => socket.send(C2S.CHALLENGE_CLAIM, { challengeId }),
  validateChallenge: (challengeId) => socket.send(C2S.CHALLENGE_VALIDATE, { challengeId }),
  sendOpenChallenge: (cardId) => socket.send(C2S.OPEN_CHALLENGE_SEND, { cardId }),
  answerOpenChallenge: (openChallengeId, text) => socket.send(C2S.OPEN_CHALLENGE_ANSWER, { openChallengeId, text }),
  awardOpenChallenge: (openChallengeId, winnerId) => socket.send(C2S.OPEN_CHALLENGE_AWARD, { openChallengeId, winnerId }),
  gameEnd: () => socket.send(C2S.GAME_END, {}),
  leave: () => {
    // Départ volontaire : on prévient le serveur pour qu'il libère vraiment la place — sinon
    // un ancien joueur reste "fantôme" (déconnecté mais toujours dans la partie) pour
    // toujours. Si on revient plus tard, ce sera comme un nouvel arrivant, pas une reprise.
    socket.send(C2S.LEAVE_ROOM, {});
    clearSession();
    location.reload();
  },
};

function setUI(patch, opts = {}) {
  ui = { ...ui, ...patch };
  if (!opts.silent) render();
}

function showToast(text) {
  ui.toast = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setUI({ toast: null }), 3200);
  render();
}

// "Pas entendu" : le serveur ne fait rien exprès (§4.1, pas de sanction), donc c'est
// au client de retirer la demande de l'écran — c'est ce qui manquait.
function dismissWitness(claimId) {
  ui.dismissedClaimIds.add(claimId);
  render();
}

// Repli visuel pour les événements urgents (SOS, demande de témoin) : sur certains
// navigateurs Android durcis (ROM confidentialité type e/OS), navigator.vibrate() est
// silencieusement bloqué. Un pulse unique (pas un clignotement répété, §6 du PRD) sur le
// bord de l'écran garantit un signal visible même sans haptique.
function flashScreen(tone) {
  flashRoot.classList.remove('flash-accent', 'flash-danger');
  // relance l'animation même si la précédente n'est pas finie
  void flashRoot.offsetWidth;
  flashRoot.classList.add(`flash-${tone}`);
  setTimeout(() => flashRoot.classList.remove(`flash-${tone}`), 700);
}

function handleMessage(msg) {
  const { type, payload } = msg;
  switch (type) {
    case S2C.STATE:
      serverState = payload;
      // Une fois qu'on a un état de partie, on peut nettoyer une erreur de join affichée.
      if (ui.joinError) ui.joinError = null;
      render();
      break;

    case S2C.MISSION_NEW:
      vibrate(25);
      showToast('Nouvelle mission reçue.');
      break;

    case S2C.WITNESS_REQUEST:
      vibrate(25);
      flashScreen('accent');
      render(); // l'overlay se déduit de serverState.pendingWitnessRequests au prochain state, mais on rafraîchit déjà l'affichage
      break;

    case S2C.SOS_ALERT:
      vibrate([40, 80, 40, 80, 40]);
      flashScreen('danger');
      render();
      break;

    case S2C.CHAT_MESSAGE:
      vibrate(15);
      // Sur l'onglet Chat, le message arrive déjà visible via le prochain state ; ailleurs
      // (ou en spectateur, qui n'a pas d'onglet dédié), un toast suffit à prévenir.
      if (ui.view !== 'chat' || serverState?.me?.isSpectator) {
        showToast(`${payload.name} : ${payload.text}`.slice(0, 90));
      }
      break;

    case S2C.CHALLENGE_REQUEST:
      vibrate(25);
      flashScreen('accent');
      render(); // l'overlay se déduit de serverState.me.myChallenge au prochain state
      break;

    case S2C.OPEN_CHALLENGE_ALERT:
      vibrate(20);
      flashScreen('accent');
      showToast(`🏆 ${payload.fromName} : ${payload.text}`.slice(0, 90));
      break;

    case S2C.NOTIFY:
      handleNotify(payload);
      break;

    case S2C.ERROR:
      showToast(payload?.message || 'Erreur.');
      break;

    default:
      break;
  }
}

function handleNotify(payload) {
  switch (payload.kind) {
    case 'session':
      saveSession({ playerId: payload.playerId, token: payload.token, roomCode: payload.roomCode });
      setupPush(); // (re)lie l'abonnement push à ce playerId — sans bloquer si refusé
      sendVisibility();
      render();
      break;
    case 'joined':
      showToast(`${payload.name} a rejoint l'opération.`);
      break;
    case 'reconnected':
      showToast(`${payload.name} est de retour.`);
      break;
    case 'disconnected':
      showToast(`${payload.name} a perdu la connexion.`);
      break;
    case 'low-energy':
      vibrate(15);
      showToast(`${payload.name} a l'énergie basse.`);
      break;
    case 'expired':
      showToast(payload.text);
      break;
    case 'mission-validated':
      vibrate(15);
      showToast(payload.text);
      break;
    case 'contamination-validated':
      vibrate([15, 40, 15]);
      showToast(payload.text);
      break;
    case 'sos-taken':
      vibrate(20);
      showToast(`${payload.responderName} s'en occupe (${payload.mode === 'extraction' ? 'extraction' : 'diversion'}).`);
      break;
    case 'taboo-report':
      vibrate(20);
      render();
      break;
    case 'report-resolved':
      showToast(
        payload.accepted
          ? `${payload.targetName} a reconnu le tabou.`
          : `${payload.targetName} conteste ton signalement.`
      );
      break;
    case 'cheer':
      vibrate(15);
      showToast(`${payload.name} t'envoie ${payload.emoji}`);
      break;
    case 'challenge-accepted':
      showToast(`${payload.name} a accepté ton défi.`);
      break;
    case 'challenge-claimed':
      vibrate(15);
      showToast(`${payload.name} dit avoir fini — à toi de valider.`);
      break;
    case 'challenge-done':
      vibrate(15);
      showToast(`${payload.name} a validé ton défi !`);
      break;
    case 'open-challenge-won':
      vibrate([15, 40, 15]);
      showToast(`Tu as gagné le défi de ${payload.fromName} !`);
      break;
    default:
      break;
  }
}

function currentScreen() {
  // Consultables à tout moment, indépendamment d'être dans une partie ou pas.
  if (ui.showTutorial) return 'tutorial';
  if (ui.showHistory) return ui.historyDetailId ? 'history-detail' : 'history';
  if (!session || !serverState) return 'loading';
  const status = serverState.room.status;
  if (status === 'lobby') return 'lobby';
  if (status === 'playing') {
    if (serverState.me?.isSpectator) return 'spectator';
    if (ui.view === 'dossier') return 'dossier';
    if (ui.view === 'chat') return 'chat';
    if (ui.view === 'challenges') return 'challenges';
    return 'mission';
  }
  if (status === 'ended') return 'debrief';
  return 'loading';
}

function buildCtx() {
  return { server: serverState, ui, actions, setUI, genericTaboos, challengeDeck, openChallengeDeck, dismissWitness, showToast };
}

function render() {
  renderBanner();
  renderStatusStrip();
  renderScreen();
  renderOverlay();
  renderToast();
  renderSosButton();
  renderTabBar();
  renderChatBar();
}

function renderBanner() {
  bannerRoot.innerHTML = connectionStatus === 'offline'
    ? '<div class="connection-banner offline">Hors ligne — reconnexion en cours…</div>'
    : '';
}

// Bande persistante (pas juste un overlay qui passe) : ce qui attend une action de ta part
// reste visible même si tu as fermé l'overlay ("Pas entendu", "Pas maintenant" sur un SOS).
function renderStatusStrip() {
  statusRoot.replaceChildren();
  if (!serverState || serverState.room.status !== 'playing') return;
  const witnessCount = (serverState.pendingWitnessRequests || []).length;
  const sos = serverState.sos && serverState.sos.raisedBy !== serverState.me.id ? serverState.sos : null;
  const inProgress = (c) => !!c && (c.status === 'accepted' || c.status === 'claimed');
  const activeDirectChallenge = (inProgress(serverState.me.myChallenge) ? serverState.me.myChallenge : null)
    || (inProgress(serverState.me.myLaunchedChallenge) ? serverState.me.myLaunchedChallenge : null);
  // Défis ouverts : visibles depuis n'importe quel onglet dès qu'il y en a un en cours, que ce
  // soit le mien (à désigner) ou celui d'un autre agent (à qui répondre).
  // Une fois tranché (status 'awarded'), seul le lanceur garde une action possible (changer
  // d'avis) — ça ne concerne plus les autres agents, pas la peine de garder la pastille pour eux.
  const activeOpenChallenges = (serverState.openChallenges || []).filter(
    (o) => o.fromId === serverState.me.id || o.status === 'pending'
  ).length;
  if (!witnessCount && !sos && !activeDirectChallenge && !activeOpenChallenges) return;

  const pills = [];
  if (witnessCount) {
    pills.push(`<button class="status-pill" data-reopen="witness">🔔 ${witnessCount} à valider</button>`);
  }
  if (sos) {
    pills.push(`<button class="status-pill status-pill-urgent" data-reopen="sos">🆘 SOS — ${esc(sos.raisedByName)}</button>`);
  }
  if (activeDirectChallenge) {
    pills.push(`<button class="status-pill" data-reopen="challenge">🎲 Défi en cours</button>`);
  }
  if (activeOpenChallenges) {
    pills.push(`<button class="status-pill" data-reopen="challenge">🏆 ${activeOpenChallenges > 1 ? `${activeOpenChallenges} défis ouverts` : 'Défi ouvert'} en cours</button>`);
  }
  const strip = h(`<div class="status-strip">${pills.join('')}</div>`);
  strip.querySelector('[data-reopen="witness"]')?.addEventListener('click', () => setUI({ dismissedClaimIds: new Set() }));
  strip.querySelector('[data-reopen="sos"]')?.addEventListener('click', () => setUI({ dismissedSosId: null }));
  strip.querySelectorAll('[data-reopen="challenge"]').forEach((btn) => btn.addEventListener('click', () => setUI({ view: 'challenges' })));
  statusRoot.appendChild(strip);
}

function renderScreen() {
  const screen = currentScreen();
  const ctx = buildCtx();
  if (screen === 'tutorial') return Tutorial.render(screenRoot, ctx);
  if (screen === 'history') return History.renderList(screenRoot, ctx);
  if (screen === 'history-detail') return History.renderDetail(screenRoot, ctx);
  if (screen === 'home' || (screen === 'loading' && !session)) {
    Home.render(screenRoot, ctx);
    return;
  }
  if (screen === 'loading') {
    screenRoot.replaceChildren(h("<div class=\"screen center\"><p class=\"muted\">Reconnexion à l'opération…</p></div>"));
    return;
  }
  if (screen === 'lobby') return Lobby.render(screenRoot, ctx);
  if (screen === 'mission') return Mission.render(screenRoot, ctx);
  if (screen === 'dossier') return Dossier.render(screenRoot, ctx);
  if (screen === 'chat') return Chat.render(screenRoot, ctx);
  if (screen === 'challenges') return Challenges.render(screenRoot, ctx);
  if (screen === 'spectator') return Spectator.render(screenRoot, ctx);
  if (screen === 'debrief') return Debrief.render(screenRoot, ctx);
}

function renderOverlay() {
  overlayRoot.replaceChildren();
  if (!serverState || !session) return;
  const { sos, myPendingTabooReports, pendingWitnessRequests, me } = serverState;
  const ctx = buildCtx();

  if (sos && sos.raisedBy !== me.id && ui.dismissedSosId !== sos.id && !me.isSpectator) {
    overlayRoot.appendChild(Validation.renderSosRespond(ctx, sos));
    return;
  }
  if (myPendingTabooReports?.length) {
    const report = myPendingTabooReports[0];
    const fullDeck = [...genericTaboos, ...serverState.room.customTaboos];
    const text = fullDeck.find((t) => t.id === report.tabooId)?.text || '';
    overlayRoot.appendChild(Validation.renderTabooConfirm(ctx, report, text));
    return;
  }
  const visibleWitnessRequests = (pendingWitnessRequests || []).filter((r) => !ui.dismissedClaimIds.has(r.claimId));
  if (visibleWitnessRequests.length) {
    overlayRoot.appendChild(Validation.renderWitness(ctx, visibleWitnessRequests[0], visibleWitnessRequests.length));
    return;
  }
  if (me?.myChallenge?.status === 'pending') {
    overlayRoot.appendChild(Validation.renderChallengeRequest(ctx, {
      challengeId: me.myChallenge.id,
      fromName: me.myChallenge.fromName || '?',
      level: me.myChallenge.level,
      text: me.myChallenge.text,
      expiresAt: me.myChallenge.expiresAt,
    }));
  }
}

function renderToast() {
  toastRoot.replaceChildren();
  if (ui.toast) toastRoot.appendChild(h(`<div class="toast">${ui.toast}</div>`));
}

let sosButtonEl = null;
function renderSosButton() {
  // Un spectateur suit, ne joue pas : pas de batterie sociale à lui à gérer, pas de bouton
  // pour en lever un — mais il peut toujours répondre au SOS de quelqu'un d'autre (overlay).
  const shouldShow = serverState?.room?.status === 'playing' && !serverState.me?.isSpectator;
  if (!shouldShow) {
    if (sosButtonEl) { sosButtonEl.remove(); sosButtonEl = null; }
    return;
  }
  // Couleur distincte uniquement pour celui qui l'a levé : c'est sa confirmation que
  // c'est bien enregistré. Les autres gardent un bouton SOS normal, prêt à l'emploi.
  const sosInProgress = !!(serverState.sos && serverState.sos.raisedBy === serverState.me.id);
  if (!sosButtonEl) {
    sosButtonEl = h('<button class="sos-button" id="sos">SOS</button>');
    document.body.appendChild(sosButtonEl);

    const SOS_LONGPRESS_MS = 1500;
    let raf = null, start = null, fired = false;
    const reset = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null; start = null; fired = false;
      sosButtonEl.style.setProperty('--charge', '0%');
      sosButtonEl.classList.remove('charging');
    };
    const tick = (ts) => {
      if (start == null) start = ts;
      const progress = Math.min(1, (ts - start) / SOS_LONGPRESS_MS);
      sosButtonEl.style.setProperty('--charge', `${Math.round(progress * 100)}%`);
      if (progress >= 1 && !fired) {
        fired = true;
        vibrate([30, 60, 30, 60, 30]);
        actions.sosRaise();
        reset();
        return;
      }
      if (!fired) raf = requestAnimationFrame(tick);
    };
    sosButtonEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (sosButtonEl.classList.contains('in-progress')) {
        vibrate(10);
        return; // un SOS est déjà ouvert, pas la peine de charger pour rien
      }
      sosButtonEl.classList.add('charging');
      raf = requestAnimationFrame(tick);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((evt) => sosButtonEl.addEventListener(evt, reset));
  }
  sosButtonEl.classList.toggle('in-progress', sosInProgress);
  sosButtonEl.textContent = sosInProgress ? '…' : 'SOS';
}

// Barre d'onglets fixe (Mission / Dossier) : montée une fois comme le bouton SOS, jamais
// dans le flux scrollable — plus besoin de scroller pour l'atteindre.
let tabBarEl = null;
function renderTabBar() {
  // Le spectateur a un seul écran (Suivi) : rien à basculer, pas de barre à afficher.
  const shouldShow = serverState?.room?.status === 'playing' && !serverState.me?.isSpectator;
  if (!shouldShow) {
    if (tabBarEl) { tabBarEl.remove(); tabBarEl = null; }
    return;
  }
  const challengesOn = !!serverState.room.settings?.challengesEnabled;
  if (!tabBarEl) {
    tabBarEl = h(`
      <div class="tab-bar">
        <button class="btn" id="tab-mission">Mission</button>
        <button class="btn" id="tab-dossier">Dossier</button>
        <button class="btn" id="tab-chat">Chat<span class="tab-badge" id="chat-badge" hidden></span></button>
        ${challengesOn ? `<button class="btn" id="tab-challenges">Défis<span class="tab-badge" id="challenges-badge" hidden></span></button>` : ''}
      </div>
    `);
    tabBarEl.querySelector('#tab-mission').addEventListener('click', () => setUI({ view: 'mission' }));
    tabBarEl.querySelector('#tab-dossier').addEventListener('click', () => setUI({ view: 'dossier' }));
    tabBarEl.querySelector('#tab-chat').addEventListener('click', () => setUI({ view: 'chat' }));
    tabBarEl.querySelector('#tab-challenges')?.addEventListener('click', () => setUI({ view: 'challenges' }));
    document.body.appendChild(tabBarEl);
  }
  const activeViews = ['dossier', 'chat', 'challenges'];
  tabBarEl.querySelector('#tab-mission').classList.toggle('active', !activeViews.includes(ui.view));
  tabBarEl.querySelector('#tab-dossier').classList.toggle('active', ui.view === 'dossier');
  tabBarEl.querySelector('#tab-chat').classList.toggle('active', ui.view === 'chat');
  const unread = Math.max(0, (serverState.room.chat || []).length - (ui.chatSeenCount || 0));
  tabBarEl.querySelector('#chat-badge').hidden = ui.view === 'chat' || unread === 0;
  const challengesTab = tabBarEl.querySelector('#tab-challenges');
  if (challengesTab) {
    challengesTab.classList.toggle('active', ui.view === 'challenges');
    const hasChallengeToHandle = serverState.me?.myChallenge?.status === 'accepted' // à moi de signaler que j'ai fini
      || serverState.me?.myLaunchedChallenge?.status === 'claimed' // à moi de valider
      || (serverState.openChallenges || []).some((o) => o.fromId === serverState.me?.id);
    tabBarEl.querySelector('#challenges-badge').hidden = ui.view === 'challenges' || !hasChallengeToHandle;
  }
}

// Bande de saisie fixe, juste au-dessus de la barre d'onglets — comme le bouton SOS,
// toujours atteignable sans avoir à scroller jusqu'en bas des messages.
let chatBarEl = null;
function renderChatBar() {
  const shouldShow = serverState?.room?.status === 'playing' && !serverState.me?.isSpectator && ui.view === 'chat';
  // Le bouton SOS et les toasts flottent normalement juste au-dessus de la barre d'onglets ;
  // quand la bande de saisie du chat s'ajoute par-dessus, ils doivent monter encore plus haut
  // pour ne pas se chevaucher (voir style.css : body.chatbar-visible).
  document.body.classList.toggle('chatbar-visible', shouldShow);
  if (!shouldShow) {
    if (chatBarEl) { chatBarEl.remove(); chatBarEl = null; }
    return;
  }
  if (chatBarEl) return; // déjà monté, ses handlers restent valides
  chatBarEl = h(`
    <div class="chat-input-bar">
      ${Chat.renderQuickEmotes()}
      <form class="row" id="chat-form">
        <input type="text" id="chat-text" maxlength="500" placeholder="Écrire un message…" autocomplete="off" style="flex:1;" />
        <button class="btn btn-primary" type="submit">Envoyer</button>
      </form>
    </div>
  `);
  document.body.appendChild(chatBarEl);
  chatBarEl.querySelectorAll('[data-quick-emote]').forEach((btn) => {
    btn.addEventListener('click', () => {
      vibrate(10);
      actions.sendChat(btn.dataset.quickEmote);
    });
  });
  chatBarEl.querySelector('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = chatBarEl.querySelector('#chat-text');
    const text = input.value.trim();
    if (!text) return;
    actions.sendChat(text);
    input.value = '';
    input.focus();
  });
}

// Notifications push : réveille le téléphone même page en arrière-plan ou fermée — chose que
// navigator.vibrate() ne peut jamais faire (le navigateur suspend le JS hors premier plan).
// Échoue silencieusement si refusé/non supporté : le flash visuel reste le repli dans ce cas.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

async function setupPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const keyRes = await fetch('/push/vapid-public-key');
      const publicKey = (await keyRes.text()).trim();
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    socket.send(C2S.PUSH_SUBSCRIBE, { subscription: sub.toJSON() });
  } catch {
    // permission refusée, ou navigateur qui n'implémente pas fidèlement l'API — pas grave
  }
}

// Page Visibility API : le serveur ne notifie en push que si la page n'est pas au premier
// plan (sinon le message WS + navigator.vibrate() normal suffisent, pas la peine de doubler).
function sendVisibility() {
  if (!session) return;
  socket.send(C2S.VISIBILITY, { visible: document.visibilityState === 'visible' });
}
document.addEventListener('visibilitychange', sendVisibility);

// Fait vivre les comptes à rebours (expiration des défis) sans attendre un nouveau push d'état —
// sinon "Expire dans 4:32" resterait figé tant que personne d'autre n'agit. Surtout : PAS un
// render() complet ici (ça a été essayé — ça reconstruit tout le DOM chaque seconde, ce qui
// clignote visiblement sur un vrai téléphone). On se contente de mettre à jour le texte des
// éléments marqués data-expires-at, où qu'ils soient dans l'écran courant.
setInterval(() => {
  document.querySelectorAll('[data-expires-at]').forEach((el) => {
    const expiresAt = Number(el.dataset.expiresAt);
    if (!expiresAt) return;
    const remaining = expiresAt - Date.now();
    el.textContent = remaining > 0 ? fmtCountdown(remaining) : '0:00';
  });
}, 1000);

async function boot() {
  try {
    const res = await fetch('/taboos.json');
    genericTaboos = await res.json();
  } catch {
    genericTaboos = [];
  }
  try {
    const res = await fetch('/challenges.json');
    challengeDeck = await res.json();
  } catch {
    challengeDeck = [];
  }
  try {
    const res = await fetch('/open-challenges.json');
    openChallengeDeck = await res.json();
  } catch {
    openChallengeDeck = [];
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  // Premier lancement jamais vu, et pas déjà en pleine partie : on propose le tutoriel
  // spontanément. Il reste consultable manuellement ensuite (accueil, Dossier, spectateur).
  if (!session && !localStorage.getItem(LS_TUTORIAL_SEEN)) {
    localStorage.setItem(LS_TUTORIAL_SEEN, '1');
    ui = { ...ui, showTutorial: true };
  }
  render();
  socket.connect();
}

boot();
