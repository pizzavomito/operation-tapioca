import { h, esc, levelTag } from './components.js';

const STATUS_LABEL = { validated: 'Validée', contamination: 'Contamination', expired: 'Expirée', skipped: 'Passée' };
const REPORT_STATUS_LABEL = { pending: 'En attente', confirmed: 'Confirmé', rejected: 'Contesté' };

export function render(root, ctx) {
  const { me, players, room } = ctx.server;
  const fullDeck = [...ctx.genericTaboos, ...room.customTaboos];
  const tabooText = (id) => fullDeck.find((t) => t.id === id)?.text || '(formule inconnue)';
  const others = players.filter((p) => p.id !== me.id);
  const incidents = me.tabooIncidents || [];
  const reports = me.reportsMade || [];

  const el = h(`
    <div class="screen" style="gap:16px;">
      <div class="score-hero">
        <div class="muted small">Ton score</div>
        <div class="value">${me.score}</div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:10px;">Mes tabous</h3>
        <div class="taboo-list">
          ${me.taboos.map((id) => `
            <div class="taboo-row">
              <span class="text small">${esc(tabooText(id))}</span>
              <button class="btn btn-danger" data-self="${esc(id)}" style="min-height:44px;padding:8px 14px;">Je l'ai dit</button>
            </div>
          `).join('')}
        </div>
        <p class="muted small" style="margin-top:8px;">−5 pts, +2 pts d'honnêteté. Le fair-play paie plus que le silence.</p>
      </div>

      <div class="card stack">
        <h3>Signaler un agent</h3>
        <p class="muted small">Il vient de dire une formule tabou ? C'est le deck commun, pas une accusation.</p>
        <select id="report-target">
          ${others.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
        </select>
        <select id="report-taboo">
          ${fullDeck.map((t) => `<option value="${esc(t.id)}">${esc(t.text)}</option>`).join('')}
        </select>
        <button class="btn btn-block" id="report-submit" ${others.length ? '' : 'disabled'}>Signaler</button>
      </div>

      <div class="card">
        <h3 style="margin-bottom:10px;">Historique</h3>
        <div class="history-list">
          ${me.missionHistory.length === 0 ? '<p class="muted small">Rien encore. Ça va venir.</p>' : ''}
          ${me.missionHistory.slice().reverse().map((h) => `
            <div class="history-row">
              ${h.level ? levelTag(h.level) : ''}
              <div style="flex:1;">
                <div>${esc(h.text || '')}</div>
                ${h.validatedBy?.length ? `<div class="muted small">Validée par ${esc(h.validatedBy.join(', '))}</div>` : ''}
              </div>
              <span class="status status-${h.status}">${STATUS_LABEL[h.status] || h.status}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:10px;">Tabous et signalements</h3>
        <div class="history-list">
          ${incidents.length === 0 && reports.length === 0 ? '<p class="muted small">Rien à signaler pour l\'instant.</p>' : ''}
          ${incidents.slice().reverse().map((inc) => `
            <div class="history-row">
              <div style="flex:1;">${esc(tabooText(inc.tabooId))}</div>
              <span class="status status-expired">${inc.type === 'self' ? 'Auto-déclaré' : 'Signalé'}</span>
            </div>
          `).join('')}
          ${reports.slice().reverse().map((r) => `
            <div class="history-row">
              <div style="flex:1;">
                <div class="muted small">Toi → ${esc(r.targetName)}</div>
                <div>${esc(tabooText(r.tabooId))}</div>
              </div>
              <span class="status status-${r.status === 'confirmed' ? 'validated' : r.status === 'rejected' ? 'expired' : 'skipped'}">${REPORT_STATUS_LABEL[r.status] || r.status}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="bottom-nav">
        <button class="btn" id="nav-terrain">Terrain</button>
        <button class="btn active" id="nav-dossier">Dossier</button>
      </div>
    </div>
  `);

  el.querySelectorAll('[data-self]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.actions.tabooSelf(btn.dataset.self));
  });

  el.querySelector('#report-submit')?.addEventListener('click', () => {
    const targetId = el.querySelector('#report-target').value;
    const tabooId = el.querySelector('#report-taboo').value;
    if (targetId && tabooId) ctx.actions.tabooReport(targetId, tabooId);
  });

  el.querySelector('#nav-terrain').addEventListener('click', () => ctx.setUI({ view: 'terrain' }));

  root.replaceChildren(el);
}
