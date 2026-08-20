// État des parties en mémoire + persistance légère (§7 du PRD).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(__dirname, 'data', 'snapshot.json');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I/O, ambigus au clavier tactile

export function makeRoomCode(existingCodes) {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
  } while (existingCodes.has(code));
  return code;
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * rooms: Map<code, Room>
 * Room = {
 *   code, createdAt, hostId, status: 'lobby'|'playing'|'ended',
 *   settings: { missionQueueMax, witnessRequired },
 *   players: Map<playerId, Player>,
 *   tokenIndex: Map<token, playerId>,
 *   missionPool: string[] (ids restants, mélangés),
 *   allMissions: Map<id, mission>,
 *   customTaboos: [{id, text}],
 *   claims: Map<claimId, Claim>,          // missions + contaminations
 *   tabooReports: Map<reportId, Report>,
 *   sos: null | { id, raisedBy, ts, responder, mode },
 * }
 * Player = {
 *   id, token, name, ws, connected, isHost, paused,
 *   score, energy, missionQueue: [missionId...], missionHistory: [...],
 *   taboos: [tabooId x3], tabooIncidents: [...], sosHandled, contaminations,
 * }
 */
export class RoomStore {
  constructor() {
    this.rooms = new Map();
  }

  create(hostPlayerId) {
    const code = makeRoomCode(new Set(this.rooms.keys()));
    const room = {
      code,
      createdAt: Date.now(),
      hostId: hostPlayerId,
      status: 'lobby',
      settings: { missionQueueMax: 1, witnessRequired: 1 },
      players: new Map(),
      tokenIndex: new Map(),
      missionPool: [],
      allMissions: new Map(),
      customTaboos: [],
      claims: new Map(),
      tabooReports: new Map(),
      sos: null,
      log: [], // fil d'événements de la partie, voir game.js#logEvent
    };
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get((code || '').toUpperCase());
  }

  findByToken(token) {
    for (const room of this.rooms.values()) {
      const playerId = room.tokenIndex.get(token);
      if (playerId) return { room, playerId };
    }
    return null;
  }

  // Nettoyage des parties terminées ou abandonnées depuis longtemps (>12h).
  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const stale = now - room.createdAt > 12 * 60 * 60 * 1000;
      const empty = [...room.players.values()].every((p) => !p.connected);
      if (stale && empty) this.rooms.delete(code);
    }
  }

  toJSON() {
    const rooms = [];
    for (const room of this.rooms.values()) {
      rooms.push({
        ...room,
        players: [...room.players.values()].map((p) => ({ ...p, ws: undefined })),
        tokenIndex: [...room.tokenIndex.entries()],
        allMissions: [...room.allMissions.entries()],
        claims: [...room.claims.entries()].map(([id, c]) => [id, { ...c, timer: undefined }]),
        tabooReports: [...room.tabooReports.entries()],
      });
    }
    return { savedAt: Date.now(), rooms };
  }

  save() {
    try {
      fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(this.toJSON()), 'utf8');
    } catch (err) {
      console.error('[snapshot] échec de sauvegarde', err);
    }
  }

  load() {
    if (!fs.existsSync(SNAPSHOT_PATH)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
      for (const r of raw.rooms || []) {
        const room = {
          ...r,
          players: new Map(r.players.map((p) => [p.id, { ...p, ws: null, connected: false }])),
          tokenIndex: new Map(r.tokenIndex),
          allMissions: new Map(r.allMissions),
          claims: new Map(r.claims),
          tabooReports: new Map(r.tabooReports),
        };
        // Les fenêtres de validation en cours ne survivent pas à un redémarrage :
        // on les referme proprement plutôt que de laisser des timers fantômes.
        for (const claim of room.claims.values()) {
          if (claim.status === 'pending') claim.status = 'expired';
        }
        this.rooms.set(room.code, room);
      }
      console.log(`[snapshot] ${this.rooms.size} partie(s) restaurée(s)`);
    } catch (err) {
      console.error('[snapshot] échec de restauration', err);
    }
  }
}
