// État client + routage d'écrans (§7 du PRD).
import { GameSocket } from './ws.js';
import { C2S, S2C } from './protocol.js';
import { h, vibrate } from './ui/components.js';
import * as Home from './ui/home.js';
import * as Lobby from './ui/lobby.js';
import * as Terrain from './ui/terrain.js';
import * as Dossier from './ui/dossier.js';
import * as Debrief from './ui/debrief.js';
import * as Validation from './ui/validation.js';

const LS_SESSION = 'tapioca:session';

const appRoot = document.getElementById('app');
const screenRoot = h('<div id="screen-root"></div>');
const bannerRoot = h('<div id="banner-root"></div>');
appRoot.append(bannerRoot, screenRoot);

const overlayRoot = h('<div id="overlay-root"></div>');
const toastRoot = h('<div id="toast-root"></div>');
document.body.append(overlayRoot, toastRoot);

let session = loadSession();
let serverState = null; // dernier payload de 'state'
let genericTaboos = [];
let connectionStatus = 'connecting';
let toastTimer = null;

let ui = {
  homeMode: 'join',
  homeName: '',
  homeCode: '',
  joinError: null,
  prefillCode: new URLSearchParams(location.search).get('code') || '',
  view: 'terrain', // sous-écran quand la partie est en cours : terrain | dossier
  dismissedSosId: null,
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
  join: ({ name, roomCode }) => socket.send(C2S.JOIN, { name, roomCode }),
  start: () => socket.send(C2S.START, {}),
  updateSettings: (patch) => socket.send(C2S.SETTINGS_UPDATE, patch),
  addTaboo: (text) => socket.send(C2S.TABOO_ADD, { text }),
  missionDone: (missionId) => socket.send(C2S.MISSION_DONE, { missionId }),
  missionSkip: (missionId) => socket.send(C2S.MISSION_SKIP, { missionId }),
  witnessVote: (claimId, vote) => socket.send(C2S.MISSION_WITNESS, { claimId, vote }),
  contaminationClaim: (missionId) => socket.send(C2S.CONTAMINATION_CLAIM, { missionId }),
  tabooSelf: (tabooId) => socket.send(C2S.TABOO_SELF, { tabooId }),
  tabooReport: (targetId, tabooId) => socket.send(C2S.TABOO_REPORT, { targetId, tabooId }),
  tabooConfirm: (reportId, accept) => socket.send(C2S.TABOO_CONFIRM, { reportId, accept }),
  setEnergy: (value) => socket.send(C2S.ENERGY_SET, { value }),
  sosRaise: () => socket.send(C2S.SOS_RAISE, {}),
  sosTake: (sosId, mode) => socket.send(C2S.SOS_TAKE, { sosId, mode }),
  gameEnd: () => socket.send(C2S.GAME_END, {}),
  leave: () => {
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
      render(); // l'overlay se déduit de serverState.pendingWitnessRequests au prochain state, mais on rafraîchit déjà l'affichage
      break;

    case S2C.SOS_ALERT:
      vibrate([40, 80, 40, 80, 40]);
      render();
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
      render();
      break;
    case 'joined':
      showToast(`${payload.name} a rejoint la partie.`);
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
    default:
      break;
  }
}

function currentScreen() {
  if (!session || !serverState) return 'loading';
  const status = serverState.room.status;
  if (status === 'lobby') return 'lobby';
  if (status === 'playing') return ui.view === 'dossier' ? 'dossier' : 'terrain';
  if (status === 'ended') return 'debrief';
  return 'loading';
}

function buildCtx() {
  return { server: serverState, ui, actions, setUI, genericTaboos };
}

function render() {
  renderBanner();
  renderScreen();
  renderOverlay();
  renderToast();
  renderSosButton();
}

function renderBanner() {
  bannerRoot.innerHTML = connectionStatus === 'offline'
    ? '<div class="connection-banner offline">Hors ligne — reconnexion en cours…</div>'
    : '';
}

function renderScreen() {
  const screen = currentScreen();
  const ctx = buildCtx();
  if (screen === 'home' || (screen === 'loading' && !session)) {
    Home.render(screenRoot, ctx);
    return;
  }
  if (screen === 'loading') {
    screenRoot.replaceChildren(h('<div class="screen center"><p class="muted">Reconnexion à la partie…</p></div>'));
    return;
  }
  if (screen === 'lobby') return Lobby.render(screenRoot, ctx);
  if (screen === 'terrain') return Terrain.render(screenRoot, ctx);
  if (screen === 'dossier') return Dossier.render(screenRoot, ctx);
  if (screen === 'debrief') return Debrief.render(screenRoot, ctx);
}

function renderOverlay() {
  overlayRoot.replaceChildren();
  if (!serverState || !session) return;
  const { sos, myPendingTabooReports, pendingWitnessRequests, me } = serverState;
  const ctx = buildCtx();

  if (sos && sos.raisedBy !== me.id && ui.dismissedSosId !== sos.id) {
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
  if (pendingWitnessRequests?.length) {
    overlayRoot.appendChild(Validation.renderWitness(ctx, pendingWitnessRequests[0], pendingWitnessRequests.length));
  }
}

function renderToast() {
  toastRoot.replaceChildren();
  if (ui.toast) toastRoot.appendChild(h(`<div class="toast">${ui.toast}</div>`));
}

let sosButtonEl = null;
function renderSosButton() {
  const shouldShow = serverState?.room?.status === 'playing';
  if (!shouldShow) {
    if (sosButtonEl) { sosButtonEl.remove(); sosButtonEl = null; }
    return;
  }
  if (sosButtonEl) return; // déjà monté, ses handlers restent valides via closures sur `actions`
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
    sosButtonEl.classList.add('charging');
    raf = requestAnimationFrame(tick);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((evt) => sosButtonEl.addEventListener(evt, reset));
}

async function boot() {
  try {
    const res = await fetch('/taboos.json');
    genericTaboos = await res.json();
  } catch {
    genericTaboos = [];
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  render();
  socket.connect();
}

boot();
