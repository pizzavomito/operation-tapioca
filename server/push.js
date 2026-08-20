// Notifications push (Web Push) : réveille le téléphone même quand la page est en arrière-plan
// ou fermée — chose que navigator.vibrate() ne peut jamais faire (le navigateur suspend le JS
// de la page dès qu'elle n'est plus au premier plan, quelle que soit la connexion WS).
import webpush from 'web-push';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAPID_PATH = path.join(__dirname, 'data', 'vapid.json');

function loadOrCreateVapidKeys() {
  if (fs.existsSync(VAPID_PATH)) {
    return JSON.parse(fs.readFileSync(VAPID_PATH, 'utf8'));
  }
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_PATH, JSON.stringify(keys), 'utf8');
  console.log('[push] nouvelles clés VAPID générées');
  return keys;
}

const vapidKeys = loadOrCreateVapidKeys();
webpush.setVapidDetails('mailto:contact@operation-tapioca.invalid', vapidKeys.publicKey, vapidKeys.privateKey);

export function getPublicKey() {
  return vapidKeys.publicKey;
}

// { ok } si envoyé ; sinon { ok: false, gone } où `gone` ne vaut true que si le service de
// push confirme l'abonnement mort (410/404 — désinstallé, expiré). Une erreur réseau ou
// serveur passagère ne doit pas faire oublier l'abonnement, seulement une mort confirmée.
export async function sendPush(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    const gone = err.statusCode === 404 || err.statusCode === 410;
    if (!gone) console.error('[push] échec d\'envoi', err.statusCode || err.message);
    return { ok: false, gone };
  }
}
