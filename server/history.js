// Archive des parties terminées : un fichier JSON par partie, écrit à la fin de l'opération
// (§ demande : pouvoir consulter une partie passée après coup, distinct du snapshot de
// reprise qui ne garde que l'état courant des parties encore en mémoire).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_DIR = path.join(__dirname, 'data', 'history');

function ensureDir() {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

export function saveGameRecord(room) {
  ensureDir();
  const endedAt = Date.now();
  const record = {
    id: `${room.code}-${endedAt}`,
    code: room.code,
    createdAt: room.createdAt,
    endedAt,
    players: [...room.players.values()].map((p) => ({
      name: p.name,
      isSpectator: p.isSpectator,
      score: p.score,
      missionHistory: p.missionHistory,
      tabooIncidents: p.tabooIncidents,
      sosHandled: p.sosHandled,
      contaminations: p.contaminations,
    })),
    debrief: room.debrief || null,
    log: room.log || [],
    chat: room.chat || [],
  };
  try {
    fs.writeFileSync(path.join(HISTORY_DIR, `${record.id}.json`), JSON.stringify(record), 'utf8');
  } catch (err) {
    console.error('[history] échec de sauvegarde', err);
  }
  return record.id;
}

// Résumé léger pour la liste (pas besoin de charger chat/journal complets pour l'afficher).
export function listGames() {
  ensureDir();
  try {
    return fs
      .readdirSync(HISTORY_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const record = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), 'utf8'));
          return {
            id: record.id,
            code: record.code,
            endedAt: record.endedAt,
            playerCount: record.players.filter((p) => !p.isSpectator).length,
            podium: record.debrief?.podium || [],
          };
        } catch {
          return null; // fichier corrompu/illisible : on l'ignore plutôt que de tout planter
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.endedAt - a.endedAt);
  } catch (err) {
    console.error('[history] échec de listage', err);
    return [];
  }
}

export function loadGame(id) {
  ensureDir();
  // L'id vient d'une requête HTTP : on le nettoie avant de bâtir un chemin de fichier avec,
  // pour ne jamais laisser un id forgé sortir du dossier history/ (path traversal).
  const safe = String(id || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!safe) return null;
  const filePath = path.join(HISTORY_DIR, `${safe}.json`);
  if (!filePath.startsWith(HISTORY_DIR)) return null;
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error('[history] échec de lecture', err);
    return null;
  }
}
