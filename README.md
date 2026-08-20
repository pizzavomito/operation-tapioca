# Opération Tapioca

Jeu discret de missions conversationnelles pour repas de famille. Voir [PRD-operation-tapioca.md](PRD-operation-tapioca.md) pour la spec complète.

## Démarrer en local

```bash
npm install
npm start
```

Le serveur écoute sur `http://localhost:3000` (variable `PORT` pour changer le port). Ouvre cette URL sur plusieurs téléphones (même Wi-Fi) ou plusieurs onglets pour tester une partie.

`npm run dev` relance automatiquement le serveur à chaque modification (`node --watch`).

## Structure

```
tapioca/
├─ server/
│  ├─ index.js       # Express (static) + serveur ws + routes /qr, /taboos.json, /protocol.js
│  ├─ rooms.js        # état des parties en mémoire + snapshot disque
│  ├─ game.js          # règles, scoring, timers
│  ├─ protocol.js      # types de messages partagés (servis tels quels au client)
│  └─ data/
│     ├─ missions.json
│     ├─ taboos.json
│     └─ snapshot.json   # généré à l'exécution, ignoré par git
├─ public/              # coquille PWA (aucun build step)
│  ├─ index.html, app.js, ws.js, style.css
│  ├─ ui/                # un module par écran
│  ├─ manifest.json, sw.js, icons/
├─ scripts/
│  └─ generate-icons.mjs # régénère les PNG d'icônes PWA si besoin
└─ package.json
```

## Comment ça marche

- **État en mémoire**, snapshot JSON toutes les 30 s (`server/data/snapshot.json`) pour survivre à un redémarrage. Pas de base de données.
- **Identité** : à la connexion, le serveur émet `playerId` + `token`, stockés en `localStorage` côté client. La reconnexion (écran verrouillé, perte réseau) renvoie le token et restaure la session automatiquement — aucune action manuelle.
- **Protocole WS** : messages `{ type, payload }`, décrits dans [server/protocol.js](server/protocol.js). Le serveur pousse un snapshot d'état personnalisé (`state`) après chaque changement — pas de diff, pas de désync possible.
- Deux messages étendent le tableau du PRD §7.1 pour que le lobby soit fonctionnel : `settings:update` (réglages hôte) et `taboo:add` (tabous perso ajoutés dans le salon). Documentés en commentaire dans `protocol.js`.
- Le deck de **tabous génériques est une connaissance commune** (servi en clair sur `/taboos.json`) : seule l'attribution des 3 formules à chaque agent est secrète. Ça permet à n'importe qui de signaler un agent sans connaître sa liste privée.

## Déploiement OVH (§7.2 du PRD)

### systemd — `/etc/systemd/system/tapioca.service`

```ini
[Unit]
Description=Opération Tapioca
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/tapioca
Environment=PORT=3000
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
User=tapioca

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tapioca.service
```

### Nginx — reverse proxy TLS + WSS

```nginx
server {
    listen 443 ssl http2;
    server_name tapioca.exemple.fr;

    ssl_certificate     /etc/letsencrypt/live/tapioca.exemple.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tapioca.exemple.fr/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

server {
    listen 80;
    server_name tapioca.exemple.fr;
    return 301 https://$host$request_uri;
}
```

**WSS est impératif** : sans TLS, le service worker et l'installation PWA sont refusés par les navigateurs mobiles. Le ping applicatif toutes les 25 s (déjà dans le code) évite que Nginx ne coupe les connexions WS inactives sur mobile.

## Icônes PWA

Générées sans dépendance (`scripts/generate-icons.mjs`, encodeur PNG minimal). Pour les régénérer après modification des couleurs :

```bash
node scripts/generate-icons.mjs
```

## Statut

MVP (§9 du PRD) : lobby + QR, missions, validation par témoin, tabous, baromètre, SOS, scoring, podium, PWA installable, reconnexion — tout implémenté. Testé de bout en bout via un scénario WebSocket automatisé (join, start, mission → validation, contamination, tabou auto-déclaré, énergie basse, SOS, reconnexion par token, débriefing).

Reste à faire avant un vrai repas : test manuel sur téléphones réels (critères d'acceptation §10), déploiement OVH effectif.
