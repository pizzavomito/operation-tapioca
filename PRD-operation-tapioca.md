# PRD — Opération Tapioca

**Version** 1.0 · **Date** 20 août 2026 · **Statut** prêt pour développement

---

## 1. Le pitch

Un jeu discret, joué sur téléphone pendant un événement social (repas de famille, pot de départ, séminaire, réunion...), par les participants que ce type de moment épuise. Chaque joueur est un « agent » qui reçoit des missions conversationnelles secrètes. Réussir une mission demande de parler ; valider celle des autres demande d'écouter. Le jeu transforme une contrainte sociale subie en activité pilotée.

**Objectif produit :** rendre le moment *traversable*, et accessoirement plus vivant pour tout le monde — y compris les non-joueurs.

## 2. Principe non négociable

> **Aucune mission, aucun tabou, aucun pari ne prend une personne pour cible.**

Toutes les missions portent sur les actions du joueur lui-même. Jamais « fais dire X à quelqu'un », jamais « compte les fois où Untel fait Y ». C'est ce qui sépare ce jeu d'un bingo moqueur — lequel isolerait encore plus les joueurs au lieu de les réintégrer.

Corollaires appliqués au design :
- Le deck de missions est relu à cette aune avant chaque ajout.
- Les tabous sont des **formules** (« et sinon, tu fais quoi ? »), pas des personnes.
- Le podium final n'a aucun titre dévalorisant.

## 3. Utilisateurs

| Profil | Besoin | Conséquence design |
|---|---|---|
| Agent TDAH | Un objectif concret pour ancrer l'attention ; feedback rapide | Missions courtes, points immédiats, notifications par vibration |
| Agent TSA | Script d'interaction explicite ; prévisibilité | Consigne littérale et non ambiguë, aucune règle implicite |
| Agent introverti | Doser son énergie ; pouvoir sortir sans se justifier | Baromètre + SOS Batterie |
| Non-joueur | Ne rien remarquer | Écran sombre, zéro son, usage au pouce sous la table |

**Taille de partie :** 2 à 8 agents. Durée : 1 à 4 h.

## 4. Boucles de jeu

### 4.1 Boucle principale — les missions

1. Le joueur a **1 mission active** (max 3 en file selon réglage).
2. Il l'accomplit dans la conversation réelle.
3. Il appuie sur **« C'est fait »**.
4. Les autres agents reçoivent une demande de validation avec le texte de la mission.
5. **1 témoin suffit** (2 si la partie compte 5 agents ou plus). Fenêtre : 3 min.
6. Points crédités, mission suivante piochée.

Le témoin gagne aussi des points : écouter est explicitement récompensé.

Si personne ne valide dans la fenêtre → mission **expirée**, aucun point, aucune pénalité, repiochage possible. Pas de punition pour un ratage : le jeu ne doit jamais ajouter du stress.

### 4.2 Contamination (bonus)

Un **non-joueur** reprend spontanément le mot ou le sujet de ta mission. Le joueur déclare une contamination ; il faut **2 validations**. C'est le coup d'éclat de la partie.

### 4.3 Tabous

Chaque agent reçoit **3 formules tabou** en début de partie (tirées d'un deck commun + celles ajoutées par l'hôte). Les prononcer coûte des points.

- Auto-déclaration : bouton « je l'ai dit », −5 pts mais **+2 pts d'honnêteté** (net −3). On récompense le fair-play plutôt que de créer une police.
- Signalement par un autre agent : le joueur reçoit une demande de confirmation. S'il conteste, l'incident est annulé, sans arbitrage. Aucune discussion, aucun conflit.

### 4.4 Baromètre d'énergie sociale

Curseur 0–100 en permanence sur l'écran d'accueil, mis à jour en temps réel pour tous les agents. Affiché sous forme de petites jauges nominatives.

- Passage sous 25 → les autres agents reçoivent une notification discrète.
- Sert de signal social sans avoir à formuler quoi que ce soit à voix haute.
- Se recharge de +5 automatiquement à chaque mission validée (le jeu *donne* de l'énergie, c'est le message).

### 4.5 SOS Batterie

Le bouton le plus important du produit. Appui long (1,5 s) → tous les agents sont alertés.

Un agent répond **« Je m'en occupe »** et choisit :
- **Diversion** — il lance un sujet pour détourner l'attention du groupe.
- **Extraction** — il rejoint le demandeur dehors sous un prétexte (« je vais chercher le pain »).

L'intervenant gagne **+15 pts**, le score le plus élevé du jeu. Le barème dit ce que le produit valorise : s'occuper des autres rapporte plus que briller.

Le demandeur ne perd rien et n'a rien à justifier.

### 4.6 Défis (optionnel, réglage hôte)

Une couche à part, visible et ludique, en plus des missions discrètes — désactivable au Salon.

Deux formats, tirés au hasard côté serveur dans un deck préétabli (respecte le principe non négociable du §2 : jamais dégradant, jamais ciblé de force) :
- **Défi direct** — un agent en défie un autre, léger ou corsé (« touche quelque chose de rouge », « porte une casquette 2 minutes »). La cible peut décliner sans coût ni conséquence.
- **Défi ouvert** — un agent lance une question à tout le monde (« combien de personnes portent des lunettes ? ») ; le premier arrivé gagne, le lanceur désigne lui-même le gagnant.

Auto-déclaration à la fin, comme pour les tabous — pas de témoin requis.

**Le lanceur ne gagne des points que si le défi aboutit** : c'est le levier de conception qui rend le mécanisme intéressant. Lancer un défi, c'est parier sur quelqu'un — un rôle de « marieur » plutôt qu'un moyen de scorer à ses propres frais. Cooldown par agent entre deux lancers (10 min en direct, 15 min en ouvert) pour éviter le spam.

## 5. Barème

| Action | Points |
|---|---|
| Mission validée | +10 |
| Contamination validée | +30 |
| Validation d'un autre agent (témoin) | +2 |
| Réponse à un SOS | +15 |
| Tabou auto-déclaré | −3 (net) |
| Tabou signalé et confirmé | −5 |
| Mission expirée | 0 |
| Défi direct relevé (léger) — cible / lanceur | +8 / +3 |
| Défi direct relevé (corsé) — cible / lanceur | +15 / +5 |
| Défi ouvert gagné — gagnant / lanceur | +20 / +5 |

## 6. Écrans

1. **Accueil / Rejoindre** — code de partie à 4 lettres, QR code, pseudo d'agent.
2. **Salon (lobby)** — liste des agents, réglages hôte, bouton « Lancer l'opération ».
3. **Terrain** — écran principal : mission active en grand, bouton « C'est fait », baromètre en bas, SOS en coin. Une seule action évidente à l'écran.
4. **Validation** — overlay plein écran quand un agent réclame un témoin : mission + « J'ai entendu » / « Pas entendu ».
5. **Dossier** — score, historique des missions, mes tabous.
6. **Débriefing** — podium et titres à la fin (« Meilleur infiltré », « Ange gardien » pour le plus de SOS traités, « Roi de la contamination »).

### Contraintes d'interface

- Thème sombre uniquement, contraste maîtrisé, luminosité basse par défaut (**mode furtif**).
- Zéro son. Retour haptique via `navigator.vibrate()`.
- Cibles tactiles ≥ 56 px, tout atteignable au pouce d'une main.
- Une info principale par écran, lisible en moins de 2 secondes.
- Aucune animation clignotante ou agressive.
- Français, tutoiement, ton complice.

## 7. Architecture technique

```
tapioca/
├─ server/
│  ├─ index.js          # Express (static) + serveur ws
│  ├─ rooms.js          # état des parties en mémoire
│  ├─ game.js           # règles, scoring, timers
│  ├─ protocol.js       # types de messages partagés
│  └─ data/
│     ├─ missions.json
│     └─ taboos.json
├─ public/
│  ├─ index.html
│  ├─ app.js            # état client + routage d'écrans
│  ├─ ws.js             # connexion, reconnexion, file d'envoi
│  ├─ ui/               # composants par écran
│  ├─ style.css
│  ├─ manifest.json
│  ├─ sw.js             # service worker
│  └─ icons/
└─ package.json
```

**Stack :** Node 20 · `ws` · `express` · HTML/CSS/JS vanilla (pas de build step, on reste éditable directement en prod).

**Persistance :** état en mémoire, snapshot JSON sur disque toutes les 30 s pour survivre à un redémarrage. Pas de base de données.

**Identité :** à la connexion, le serveur émet un `playerId` + `token` stockés en `localStorage`. La reconnexion (écran verrouillé, perte de réseau) restaure la session automatiquement.

### 7.1 Protocole WebSocket

Messages JSON `{ type, payload }`. Client → serveur :

| Type | Payload |
|---|---|
| `join` | `{ roomCode, name, token? }` |
| `start` | `{}` (hôte uniquement) |
| `mission:done` | `{ missionId }` |
| `mission:skip` | `{ missionId }` |
| `mission:witness` | `{ claimId, vote: true\|false }` |
| `contamination:claim` | `{ missionId }` |
| `taboo:self` | `{ tabooId }` |
| `taboo:report` | `{ targetId, tabooId }` |
| `taboo:confirm` | `{ reportId, accept: true\|false }` |
| `energy:set` | `{ value: 0-100 }` |
| `sos:raise` | `{}` |
| `sos:take` | `{ sosId, mode: 'diversion'\|'extraction' }` |
| `game:end` | `{}` (hôte) |

Serveur → client : `state` (snapshot complet, envoyé à chaque changement — plus simple et suffisant à cette échelle), `mission:new`, `witness:request`, `sos:alert`, `notify`, `error`.

Le snapshot complet évite toute désynchronisation. Volume négligeable pour 8 joueurs.

### 7.2 Déploiement OVH

- Node lancé via **systemd** (`tapioca.service`, redémarrage auto).
- **Nginx** en reverse proxy : TLS Let's Encrypt + `proxy_set_header Upgrade/Connection` pour le passage en `wss://`.
- Impératif : **WSS obligatoire**, sinon le service worker et l'installation PWA sont refusés.
- Ping/pong applicatif toutes les 25 s pour éviter les coupures de proxy sur connexion mobile inactive.

### 7.3 PWA

- `manifest.json` : `display: standalone`, `orientation: portrait`, `theme_color` sombre.
- Service worker : cache de la coquille applicative (HTML/CSS/JS/icônes). Les données de partie passent uniquement par WS, jamais mises en cache.
- Écran de reconnexion explicite en cas de perte réseau, avec file d'attente des actions.

## 8. Contenu initial

- **60 missions** minimum, en 3 niveaux : `facile` (placer un mot), `moyen` (lancer un sujet), `audacieux` (mener une conversation à trois relances).
- **25 tabous** génériques + tabous personnalisés ajoutés par l'hôte dans le lobby.
- Format :

```json
{ "id": "m042", "level": "moyen", "text": "Lance une conversation sur les tunnels.", "tags": ["sujet"] }
```

## 9. Périmètre

**MVP (v1) :** lobby + QR, missions, validation par témoin, tabous, baromètre, SOS, scoring, podium, PWA installable, reconnexion.

**Hors périmètre v1 :** comptes utilisateurs, historique inter-parties, chat texte, mode multi-tablée, éditeur de deck en ligne, statistiques.

**v2 envisagée :** éditeur de missions dans l'appli, decks thématiques (Noël, mariage, pot de départ), mode « duo » silencieux à deux joueurs, export du débriefing en image.

## 10. Critères d'acceptation

- [ ] 6 téléphones rejoignent une partie via QR en moins de 30 s.
- [ ] Un aller-retour mission → validation → points prend moins de 10 s de manipulation cumulée.
- [ ] Écran verrouillé 20 min puis rouvert : la session reprend sans reconnexion manuelle.
- [ ] Aucun son émis, en aucune circonstance.
- [ ] Un SOS atteint tous les agents en moins de 3 s.
- [ ] L'appli est installable sur l'écran d'accueil iOS et Android.
- [ ] Relecture du deck complet : aucune carte ne cible une personne.
- [ ] Utilisable d'une seule main, écran à moitié caché sous la table.

## 11. Risques

| Risque | Réponse |
|---|---|
| Les joueurs regardent leur téléphone en continu, ce qui se voit | Missions rares (1 active), notifications haptiques, écran conçu pour être lu en 2 s |
| Un non-joueur se sent exclu ou visé | Règle du §2 ; l'hôte peut expliquer le principe sans dévoiler les missions |
| Wi-Fi familial capricieux | Reconnexion automatique + file d'attente ; option d'hébergement local en secours |
| Le jeu devient une charge de plus | Aucune pénalité de temps, aucune mission obligatoire, bouton « pause » individuel |

---

## Plan de développement suggéré

1. Serveur `ws` + `rooms.js` + écran de lobby fonctionnel (le squelette).
2. Boucle missions + validation (le cœur du jeu — à tester en premier, en vrai).
3. Tabous et scoring.
4. Baromètre et SOS.
5. Habillage PWA, mode furtif, haptique.
6. Déploiement OVH + nginx/TLS.
7. Rédaction du deck de 60 missions.
