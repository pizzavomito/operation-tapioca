// Connexion WebSocket : reconnexion auto + file d'attente des actions hors-ligne (§7.3 du PRD).

const RECONNECT_BASE_MS = 800;
const RECONNECT_MAX_MS = 8000;

export class GameSocket {
  constructor({ onMessage, onStatusChange }) {
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange || (() => {});
    this.ws = null;
    this.queue = [];
    this.attempt = 0;
    this.status = 'connecting'; // connecting | open | offline
    this.wantedOpen = true;
  }

  url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}`;
  }

  connect() {
    this.wantedOpen = true;
    this._setStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this._scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.attempt = 0;
      this._setStatus('open');
      // Vide la file d'attente accumulée hors-ligne.
      const pending = this.queue.splice(0);
      for (const msg of pending) this._sendNow(msg);
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'ping') {
        this._sendNow({ type: 'pong', payload: {} });
        return;
      }
      this.onMessage(msg);
    });

    ws.addEventListener('close', () => {
      this._setStatus('offline');
      if (this.wantedOpen) this._scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    });
  }

  disconnect() {
    this.wantedOpen = false;
    if (this.ws) this.ws.close();
  }

  _scheduleReconnect() {
    this.attempt += 1;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (this.attempt - 1));
    setTimeout(() => {
      if (this.wantedOpen) this.connect();
    }, delay);
  }

  _setStatus(status) {
    this.status = status;
    this.onStatusChange(status);
  }

  _sendNow(msg) {
    this.ws.send(JSON.stringify(msg));
  }

  send(type, payload = {}) {
    const msg = { type, payload };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this._sendNow(msg);
    } else {
      this.queue.push(msg);
    }
  }
}
