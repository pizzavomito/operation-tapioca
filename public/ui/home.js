import { h, esc, vibrate } from './components.js';

export function render(root, ctx) {
  const mode = ctx.ui.homeMode || 'join'; // 'join' | 'create'
  const name = ctx.ui.homeName ?? localStorage.getItem('tapioca:name') ?? '';
  const code = ctx.ui.homeCode ?? ctx.ui.prefillCode ?? '';

  const el = h(`
    <div class="screen">
      <div class="brand">
        <div class="mark"></div>
        <h1>Opération Tapioca</h1>
        <p>Un repas de famille. Une mission secrète. Personne ne doit rien voir.</p>
      </div>

      <div class="row" style="justify-content:center;">
        <button class="btn ${mode === 'join' ? 'btn-primary' : ''}" data-mode="join">Rejoindre</button>
        <button class="btn ${mode === 'create' ? 'btn-primary' : ''}" data-mode="create">Créer une partie</button>
      </div>

      <div class="card stack">
        <div class="field">
          <label for="pseudo">Ton pseudo d'agent</label>
          <input id="pseudo" type="text" maxlength="24" placeholder="Agent Mystère" autocomplete="off" value="${esc(name)}" />
        </div>
        ${mode === 'join' ? `
          <div class="field code-input">
            <label for="code">Code de partie</label>
            <input id="code" type="text" maxlength="4" placeholder="ABCD" autocomplete="off" value="${esc(code)}" />
          </div>
          <label class="row checkbox-row">
            <input type="checkbox" id="spectator" ${ctx.ui.homeSpectator ? 'checked' : ''} />
            <span>Je veux juste suivre (spectateur, pas de mission)</span>
          </label>
        ` : ''}
        ${ctx.ui.joinError ? `<p class="small" style="color:var(--danger)">${esc(ctx.ui.joinError)}</p>` : ''}
        <button class="btn btn-primary btn-block" id="submit">
          ${mode === 'join' ? 'Rejoindre l’opération' : 'Créer l’opération'}
        </button>
      </div>

      <p class="muted small center">Aucune inscription. Le code de partie se scanne en QR une fois dans le salon.</p>

      <button class="btn btn-ghost btn-block" id="show-history">📜 Historique des parties</button>
      <button class="btn btn-ghost btn-block" id="test-vibration">🔊 Tester la vibration du téléphone</button>
    </div>
  `);

  el.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ctx.setUI({ homeMode: btn.dataset.mode, joinError: null });
    });
  });

  const pseudoInput = el.querySelector('#pseudo');
  pseudoInput.addEventListener('input', () => ctx.setUI({ homeName: pseudoInput.value }, { silent: true }));

  const codeInput = el.querySelector('#code');
  if (codeInput) {
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      ctx.setUI({ homeCode: codeInput.value }, { silent: true });
    });
  }

  const spectatorInput = el.querySelector('#spectator');
  spectatorInput?.addEventListener('change', () => ctx.setUI({ homeSpectator: spectatorInput.checked }, { silent: true }));

  el.querySelector('#submit').addEventListener('click', () => {
    const finalName = pseudoInput.value.trim();
    const finalCode = codeInput ? codeInput.value.trim() : '';
    if (!finalName) {
      ctx.setUI({ joinError: 'Choisis un pseudo.' });
      return;
    }
    if (mode === 'join' && finalCode.length !== 4) {
      ctx.setUI({ joinError: 'Le code fait 4 lettres.' });
      return;
    }
    localStorage.setItem('tapioca:name', finalName);
    ctx.actions.join({
      name: finalName,
      roomCode: mode === 'join' ? finalCode : '',
      spectator: mode === 'join' && !!spectatorInput?.checked,
    });
  });

  el.querySelector('#show-history').addEventListener('click', () => ctx.setUI({ showHistory: true }));

  el.querySelector('#test-vibration').addEventListener('click', () => {
    if (!('vibrate' in navigator)) {
      ctx.showToast('Pas d\'API vibration ici — limite du navigateur, rien à faire côté appli.');
      return;
    }
    const accepted = vibrate(300);
    ctx.showToast(accepted ? 'Vibration envoyée. Ça a bougé ?' : 'Vibration refusée par le navigateur.');
  });

  root.replaceChildren(el);
}
