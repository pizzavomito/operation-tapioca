import { h, esc } from './components.js';

// Cartes explicatives navigables — pas un vrai "tour" qui pointe sur les boutons réels :
// les écrans changent en permanence avec l'état de la partie (mission du moment, joueurs
// connectés...), un ciblage live serait fragile. Ici, du contenu autonome, fiable, et
// consultable à tout moment sans dépendre d'être dans une partie.
const STEPS = [
  {
    emoji: '🕵️',
    title: 'Le principe',
    text: "Chaque joueur est un agent avec des missions secrètes. Réussir une mission demande de parler ; valider celle des autres demande d'écouter. Personne autour de la table ne doit se douter de rien.",
  },
  {
    emoji: '🎯',
    title: 'Mission',
    text: "Ton écran principal : une mission à la fois. Tu la réalises dans la vraie conversation, puis tu appuies sur « C'est fait ». « Passer » si elle ne te convient pas, aucune pénalité.",
  },
  {
    emoji: '👂',
    title: 'Validation',
    text: "Une fois « C'est fait » pressé, les autres reçoivent une demande de témoin. Un seul « J'ai entendu » suffit (deux à partir de 5 agents). 3 minutes pour valider, sinon la mission expire sans pénalité — et tu peux annuler et revenir en arrière à tout moment pendant l'attente.",
  },
  {
    emoji: '🫧',
    title: 'Contamination',
    text: "Le coup d'éclat : un non-joueur reprend spontanément le mot ou le sujet de ta mission, sans le savoir. Déclare-le, ça demande 2 validations, mais ça rapporte gros.",
  },
  {
    emoji: '🤐',
    title: 'Tabous',
    text: "Tu reçois 3 formules interdites en début d'opération. Si tu en dis une, auto-déclare-toi (léger malus, mais bonus d'honnêteté) plutôt que d'attendre de te faire signaler.",
  },
  {
    emoji: '🔋',
    title: 'Énergie sociale',
    text: "Le curseur en bas de l'écran Mission, c'est ton niveau du moment — ajuste-le toi-même. Sous 25, les autres reçoivent une alerte discrète. Chaque mission validée te recharge un peu.",
  },
  {
    emoji: '🆘',
    title: 'SOS Batterie',
    text: "Le bouton le plus important. Appui long si tu sens que tu sature. Quelqu'un répond « Je m'en occupe » et vient te chercher (extraction) ou détourne l'attention (diversion). Tu ne dois rien justifier.",
  },
  {
    emoji: '💬',
    title: 'Chat & émotes',
    text: "Un chat discret entre agents (et spectateurs), avec des émotes rapides à un tap pour réagir sans ouvrir le clavier.",
  },
  {
    emoji: '👀',
    title: 'Mode spectateur',
    text: "Pour ceux qui préfèrent juste suivre : pas de mission, mais les scores, l'ambiance de la table, et des encouragements à envoyer.",
  },
  {
    emoji: '📖',
    title: 'Dossier & Historique',
    text: "Ton Dossier regroupe scores, tabous, journal de l'opération, et le bouton pour quitter. Une fois l'opération finie, retrouve-la dans l'Historique depuis l'accueil.",
  },
];

export function render(root, ctx) {
  const step = Math.min(ctx.ui.tutorialStep || 0, STEPS.length - 1);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const el = h(`
    <div class="screen">
      <div class="tutorial-dots">
        ${STEPS.map((_, i) => `<span class="tutorial-dot ${i === step ? 'active' : ''}"></span>`).join('')}
      </div>

      <div class="card tutorial-card">
        <div class="tutorial-emoji">${current.emoji}</div>
        <h2>${esc(current.title)}</h2>
        <p>${esc(current.text)}</p>
      </div>

      <div class="row">
        <button class="btn" id="tuto-prev" ${step === 0 ? 'disabled' : ''}>Précédent</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" id="tuto-next">${isLast ? 'Terminer' : 'Suivant'}</button>
      </div>
      <button class="btn btn-ghost btn-block" id="tuto-close">Fermer</button>
    </div>
  `);

  el.querySelector('#tuto-prev').addEventListener('click', () => ctx.setUI({ tutorialStep: step - 1 }));
  el.querySelector('#tuto-next').addEventListener('click', () => {
    if (isLast) ctx.setUI({ showTutorial: false, tutorialStep: 0 });
    else ctx.setUI({ tutorialStep: step + 1 });
  });
  el.querySelector('#tuto-close').addEventListener('click', () => ctx.setUI({ showTutorial: false, tutorialStep: 0 }));

  root.replaceChildren(el);
}
