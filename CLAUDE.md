# Opération Tapioca — mémo de travail

Instructions pour Claude Code sur ce repo : comment tester, committer, pousser et déployer
sans que l'utilisateur ait à tout réexpliquer à chaque session.

## Le projet

PWA Node/Express/`ws` (pas de build step), front vanilla JS. Voir
[PRD-operation-tapioca.md](PRD-operation-tapioca.md) et [README.md](README.md) pour la spec et
l'architecture. Dépôt GitHub : `https://github.com/pizzavomito/operation-tapioca` (public).

## Avant de committer : toujours vérifier la syntaxe

```bash
node --check server/index.js server/game.js server/rooms.js server/protocol.js
node --check public/app.js public/ui/*.js public/sw.js
```

Un find-replace automatisé a déjà cassé `public/app.js` en silence une fois (apostrophe dans une
chaîne). Ne jamais committer/déployer sans être passé par `node --check` sur chaque fichier touché.

## Tester avant de committer

### Script WebSocket brut (logique serveur)

Le serveur n'expose aucune route REST pour join/create — tout passe par le protocole WS
(`C2S.JOIN` avec ou sans `roomCode`). Lancer un serveur de test sur un port dédié (jamais 3000,
c'est la prod locale potentielle) :

```bash
PORT=3210 nohup node server/index.js > /tmp/tapioca-test.log 2>&1 &
```

Écrire le script de test **dans le dossier du projet** (pas dans le scratchpad) le temps du test,
pour que `import 'ws'` résolisse via `node_modules` — sinon `ERR_MODULE_NOT_FOUND`. Le supprimer
après coup.

**Piège de timing rencontré et à ne pas reproduire** : `broadcast()` envoie plusieurs messages
dos-à-dos sur la même socket (ex. `challenge:request` puis `state`, ou `openChallenge:alert` puis
`state`). Si on `await` un premier message puis qu'on attache *ensuite* un `onNext()` pour le
second, le second peut être arrivé et perdu entre-temps (les event listeners Node ne bufferisent
rien). Toujours attacher **tous** les listeners nécessaires *avant* d'envoyer l'action qui
déclenche la réponse, puis `Promise.all([...])` :

```js
const reqP = onNext(bobWs, (m) => m.type === 'challenge:request');
const stateP = onNext(bobWs, (m) => m.type === 'state'); // attaché AVANT le send, pas après un await
send(aliceWs, 'challenge:send', { targetId: bobId, ... });
const [req, state] = await Promise.all([reqP, stateP]);
```

Toujours mettre un timeout de secours (`setTimeout(() => process.exit(2), 15000)`) pour ne pas
bloquer indéfiniment si un message n'arrive jamais.

### Playwright (visuel)

Chromium est déjà en cache local (`~/AppData/Local/ms-playwright`), pas besoin de
`playwright install`. Installer juste le package le temps du test :

```bash
npm install --no-save playwright
# ... écrire et lancer le script de test (contexts multiples pour simuler plusieurs joueurs) ...
npm uninstall playwright
```

**Piège** : au premier lancement, l'appli affiche automatiquement le tutoriel plein écran
(`#tuto-close` pour le fermer) avant que l'écran d'accueil soit utilisable — sinon les sélecteurs
`#pseudo`, `[data-mode]` etc. ne matchent rien et Playwright timeout.

**Vérifier `package.json` après toute install/uninstall de test** — `npm uninstall` a déjà
supprimé `ws` des dépendances réelles par erreur plusieurs fois dans le passé :

```bash
grep -A6 '"dependencies"' package.json   # doit toujours contenir express, qrcode, web-push, ws
```

### Nettoyage avant de committer

- Supprimer tout script/screenshot de test créé dans le repo.
- Tuer les serveurs de test qui tournent encore (`netstat -ano | grep ':PORT'` puis
  `taskkill //F //PID <pid>` — environnement Windows/Git Bash).
- Vérifier qu'aucun fichier de conflit de synchro ne traîne (OneDrive sur ce dossier en génère
  parfois, nommés `... (# Edit conflict DATE ID #).ext` ou `(# Name clash ... #)`) :
  ```bash
  find . -iname "*clash*" -o -iname "*edit conflict*" 2>/dev/null | grep -v node_modules
  ```
  Les supprimer après avoir vérifié que le fichier réel (sans le suffixe) est correct — ce sont
  des doublons générés localement, jamais suivis par git.

## Commit / push

- Messages de commit **en français**, dans le style des commits existants (`git log --oneline`) :
  résumé court à l'impératif, puis corps expliquant le *pourquoi* si pertinent.
- Toujours terminer par :
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```
- `git add -A && git commit -m "..." && git push` — branche `main`, pas de PR, push direct.

## Déployer sur le VPS OVH

```bash
ssh -i ~/.ssh/vectoid ubuntu@vps-5b452401.vps.ovh.net "cd /var/www/operation-tapioca && git pull && git log -1 --oneline"
```

Si `package.json` a changé (nouvelle dépendance) :
```bash
ssh -i ~/.ssh/vectoid ubuntu@vps-5b452401.vps.ovh.net "cd /var/www/operation-tapioca && npm install --omit=dev"
```

Redémarrer le service :
```bash
ssh -i ~/.ssh/vectoid ubuntu@vps-5b452401.vps.ovh.net "sudo systemctl restart tapioca && sleep 1 && sudo systemctl status tapioca --no-pager -l | head -15"
```

Le service tourne sous nvm-node (`/home/ubuntu/.nvm/versions/node/v20.20.1/bin/node`), derrière
nginx en reverse proxy WSS. Au restart, le serveur restaure les parties en cours depuis le
snapshot disque (`[snapshot] N partie(s) restaurée(s)` dans les logs) — normal, pas une erreur.

### Toujours bumper le cache du service worker

Le PWA cache le shell applicatif offline. **Tout changement dans `public/`** (JS, CSS, nouveau
fichier `ui/*.js`) doit s'accompagner d'un bump de version dans `public/sw.js` :
```js
const CACHE_NAME = 'tapioca-shell-vNN'; // incrémenter
```
Et ajouter tout nouveau fichier client à `SHELL_FILES` dans le même fichier. Sans ça, les
utilisateurs qui ont déjà l'appli en PWA peuvent rester bloqués sur l'ancienne version.

### Vérifier après déploiement

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://vps-5b452401.vps.ovh.net/app.js -k
curl -s https://vps-5b452401.vps.ovh.net/sw.js -k | grep CACHE_NAME   # bonne version ?
```

Télécharger et vérifier la syntaxe des fichiers réellement servis (pas juste ceux du repo local —
ça a déjà divergé par le passé) :
```bash
curl -s https://vps-5b452401.vps.ovh.net/app.js -k -o /tmp/live-app.js
node --check /tmp/live-app.js && echo OK
rm -f /tmp/live-app.js
```

(`-k` car le certificat est probablement auto-signé ou non vérifiable depuis cet environnement —
sinon retirer.)

## Autres contraintes établies au fil du projet

- Terminologie : toujours « opération », jamais « partie ». Vocabulaire d'occasion générique
  (« pot de départ », « séminaire », « réunion »...), jamais spécifique à un repas de famille.
- Principe non négociable (PRD §2) : aucune mission/défi ne doit jamais cibler quelqu'un de façon
  dégradante ou non consentie ; toujours déclinable sans pénalité.
- Spectateurs = observateurs purs : jamais de mission, jamais de témoin, jamais de défi (ni
  lanceur ni cible).
- Pattern de sync : chaque action mutante se termine par `broadcast()` qui repousse un état complet
  et personnalisé à tout le monde — pas de diff, jamais de désync possible. Respecter ce pattern
  pour toute nouvelle fonctionnalité plutôt que d'inventer un mécanisme de sync parallèle.
