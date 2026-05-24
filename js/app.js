/* =====================================================
   app.js — Contrôleur principal AFFELNET-Manager
   ===================================================== */

/* ── État global ────────────────────────────────────── */
let currentUser   = null;
let currentView   = null;
let studentFilter = { search: '', classe: '', statut: '' };
let deroFilter    = 'attente';

/* ── Init ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  DB.init();
  const session = DB.getSession();
  if (session) {
    currentUser = session;
    // En mode Firebase : recharger les données si possible
    if (typeof FB_MODE !== 'undefined' && FB_MODE) {
      fbLoadAll().then(() => fbListenStudents()).catch(console.error);
    }
    showApp();
  } else {
    showLogin();
  }

  // Valider le formulaire de connexion avec Entrée
  document.getElementById('pwd-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('login-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('pwd-input').focus();
  });
});

/* ═══════════════════════════════════════════════════
   AUTHENTIFICATION
═══════════════════════════════════════════════════ */
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  updateLoginYearDisplay();
}

function updateLoginYearDisplay() {
  const s = DB.getSettings();
  const el = document.getElementById('login-annee');
  if (el && s) el.textContent = s.annee;
}

async function doLogin() {
  const login = document.getElementById('login-input').value.trim();
  const pwd   = document.getElementById('pwd-input').value;
  const errEl = document.getElementById('login-error');
  const btn   = document.querySelector('.btn-login');

  // Vérification locale d'abord (rôle, mot de passe)
  const user = DB.authenticate(login, pwd);
  if (!user) {
    errEl.textContent = 'Identifiant ou mot de passe incorrect.';
    errEl.style.display = 'block';
    document.getElementById('pwd-input').value = '';
    return;
  }

  errEl.style.display = 'none';
  btn.textContent = 'Connexion…';
  btn.disabled = true;

  // Si Firebase configuré : authentification + chargement Firestore
  if (typeof FB_MODE !== 'undefined' && FB_MODE) {
    try {
      await fbLogin(login, pwd);
    } catch (err) {
      // Mot de passe Firebase incorrect → bloquer (l'utilisateur doit corriger)
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        btn.textContent = 'Se connecter →';
        btn.disabled = false;
        errEl.textContent = 'Mot de passe incorrect.';
        errEl.style.display = 'block';
        return;
      }
      if (err.code === 'auth/too-many-requests') {
        btn.textContent = 'Se connecter →';
        btn.disabled = false;
        errEl.textContent = 'Trop de tentatives. Réessayez dans quelques minutes.';
        errEl.style.display = 'block';
        return;
      }
      // Domaine non autorisé, réseau absent, etc. → mode local avec avertissement
      console.warn('[Firebase] Connexion impossible, mode local activé :', err.code || err.message);
    }
  }

  btn.textContent = 'Se connecter →';
  btn.disabled = false;
  currentUser = user;
  DB.saveSession(user);
  showApp();
}

async function doLogout() {
  currentUser = null;
  DB.clearSession();
  if (typeof FB_MODE !== 'undefined' && FB_MODE) {
    await fbLogout();
  }
  showLogin();
}

/* ═══════════════════════════════════════════════════
   LAYOUT APP
═══════════════════════════════════════════════════ */
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  renderSidebar();
  renderTopHeader();
  navigateTo('dashboard');
}

function renderSidebar() {
  const s = DB.getSettings();
  document.getElementById('sb-year').textContent = s.annee;

  const initials = (currentUser.prenom[0] || '') + (currentUser.nom[0] || '');
  document.getElementById('sb-user-avatar').textContent = initials.toUpperCase();
  document.getElementById('sb-user-name').textContent = `${currentUser.prenom} ${currentUser.nom}`;
  document.getElementById('sb-user-role').textContent = roleFr(currentUser.role);

  const stats = DB.getStats();
  const deroCount = DB.getStudents().filter(s => s.statut === 'derogation_attente').length;

  const badge = n => n > 0 ? `<span class="nav-badge">${n}</span>` : '';
  const badgeR = n => n > 0 ? `<span class="nav-badge red">${n}</span>` : '';

  const isProvis = currentUser.role === 'proviseur';
  const isPriv   = currentUser.role === 'proviseur' || currentUser.role === 'secretaire';

  document.getElementById('nav-items').innerHTML = `
    <div class="nav-section">Tableau de bord</div>
    <div class="nav-item" data-view="dashboard" onclick="navigateTo('dashboard')">
      <span class="nav-icon">📊</span> Tableau de bord
    </div>

    <div class="nav-section">Inscriptions</div>
    <div class="nav-item" data-view="students" onclick="navigateTo('students')">
      <span class="nav-icon">👥</span> Liste des élèves ${badge(stats.total)}
    </div>
    <div class="nav-item" data-view="derogations" onclick="navigateTo('derogations')">
      <span class="nav-icon">⚠️</span> Dérogations ${badgeR(deroCount)}
    </div>

    <div class="nav-section">Données</div>
    <div class="nav-item" data-view="import" onclick="navigateTo('import')">
      <span class="nav-icon">📥</span> Import AFFELNET
    </div>
    ${isPriv ? `
    <div class="nav-item" data-view="activity" onclick="navigateTo('activity')">
      <span class="nav-icon">📋</span> Journal d'activité
    </div>` : ''}

    ${isProvis ? `
    <div class="nav-section">Administration</div>
    <div class="nav-item" data-view="settings" onclick="navigateTo('settings')">
      <span class="nav-icon">⚙️</span> Paramètres
    </div>` : ''}
  `;
  highlightNav(currentView);
}

function highlightNav(view) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
}

function renderTopHeader() {
  const periode = DB.getPeriodeActive();
  const s = DB.getSettings();
  const now = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  let periodBadge = '';
  if (periode === 'preTour')     periodBadge = `<span class="period-indicator pre-tour">🔵 Pré-Tour</span>`;
  else if (periode === 'premierTour') periodBadge = `<span class="period-indicator premier-tour">🟣 1er Tour</span>`;
  else if (periode === 'secondTour')  periodBadge = `<span class="period-indicator second-tour">🔴 2nd Tour</span>`;
  else                               periodBadge = `<span class="period-indicator hors-periode">⚫ Hors période</span>`;

  document.getElementById('header-period').innerHTML = periodBadge;
  document.getElementById('header-date').textContent = now;
}

/* ═══════════════════════════════════════════════════
   ROUTEUR
═══════════════════════════════════════════════════ */
function navigateTo(view, params = {}) {
  currentView = view;
  highlightNav(view);
  renderTopHeader();
  renderSidebar();

  const titles = {
    dashboard:   '📊 Tableau de bord',
    students:    '👥 Liste des élèves',
    student:     '🎓 Fiche élève',
    derogations: '⚠️ Dérogations',
    import:      '📥 Import AFFELNET',
    activity:    '📋 Journal d\'activité',
    settings:    '⚙️ Paramètres',
    print:       '🖨️ Fiche d\'inscription',
  };
  document.getElementById('page-title').textContent = titles[view] || view;

  const content = document.getElementById('page-content');
  content.innerHTML = '';

  switch(view) {
    case 'dashboard':   renderDashboard(content); break;
    case 'students':    renderStudents(content); break;
    case 'student':     renderStudentDetail(content, params.ine); break;
    case 'derogations': renderDerogations(content); break;
    case 'import':      renderImport(content); break;
    case 'activity':    renderActivity(content); break;
    case 'settings':    renderSettings(content); break;
    case 'print':       renderPrint(content, params.ine); break;
  }
}

/* ═══════════════════════════════════════════════════
   VUE : TABLEAU DE BORD
═══════════════════════════════════════════════════ */
function renderDashboard(el) {
  const stats = DB.getStats();
  const s = DB.getSettings();
  const periode = DB.getPeriodeActive();

  const pct = stats.total > 0 ? Math.round(stats.inscrits / stats.total * 100) : 0;

  el.innerHTML = `
    <div class="cards-row">
      <div class="stat-card">
        <span class="stat-icon">👥</span>
        <div class="stat-value">${stats.total}</div>
        <div class="stat-label">Élèves affectés</div>
        <div class="stat-sub">Importés via AFFELNET</div>
      </div>
      <div class="stat-card gold">
        <span class="stat-icon">✅</span>
        <div class="stat-value">${stats.inscrits}</div>
        <div class="stat-label">Inscrits</div>
        <div class="stat-sub">${pct}% du total</div>
      </div>
      <div class="stat-card blue">
        <span class="stat-icon">⏳</span>
        <div class="stat-value">${stats.attente}</div>
        <div class="stat-label">Dérogations en attente</div>
        <div class="stat-sub">À traiter</div>
      </div>
      <div class="stat-card" style="border-left-color:#757575">
        <span class="stat-icon">📋</span>
        <div class="stat-value">${stats.nonInscrits}</div>
        <div class="stat-label">Non inscrits</div>
        <div class="stat-sub">Restant à traiter</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 340px;gap:1.5rem">

      <div>
        <!-- Tableau détaillé par classe -->
        <div class="panel">
          <div class="panel-header">
            <h3>📋 Suivi des inscriptions par classe</h3>
            <button class="btn btn-outline btn-sm" onclick="navigateTo('students')">Voir tous les élèves</button>
          </div>
          <div style="overflow-x:auto">
            <table class="data-table" id="dashboard-table">
              <thead>
                <tr>
                  <th>Classe</th>
                  <th style="text-align:center">Capacité</th>
                  <th style="text-align:center">Inscrits</th>
                  <th style="text-align:center">Dérogation</th>
                  <th style="text-align:center">Non inscrits</th>
                  <th style="min-width:160px">Progression</th>
                  <th style="text-align:center">%</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="dashboard-tbody"></tbody>
              <tfoot id="dashboard-tfoot"></tfoot>
            </table>
          </div>
        </div>

        <!-- Graphique 7 jours -->
        <div class="panel mt-md">
          <div class="panel-header">
            <h3>📊 Inscriptions — 7 derniers jours</h3>
          </div>
          <div class="panel-body">
            <div class="day-bars" id="day-bars"></div>
            <div id="day-labels" style="margin-top:.4rem;font-size:.72rem;color:#999;display:flex;gap:4px"></div>
          </div>
        </div>
      </div>

      <div>
        <div class="panel" style="margin-bottom:1.5rem">
          <div class="panel-header"><h3>📅 Périodes d'inscription</h3></div>
          <div class="panel-body" id="periods-panel"></div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <h3>🕐 Activité récente</h3>
            ${currentUser.role !== 'aed' ? `<button class="btn btn-outline btn-sm" onclick="navigateTo('activity')">Tout voir</button>` : ''}
          </div>
          <div class="panel-body" style="padding:0 1.5rem">
            <div class="timeline" id="timeline-recent"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── Tableau par classe ───────────────────────────────
  const tbody = document.getElementById('dashboard-tbody');
  const tfoot = document.getElementById('dashboard-tfoot');
  const byClasse = stats.byClasse;

  if (Object.keys(byClasse).length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="empty-icon">📂</span><p>Aucune donnée. Importez le fichier AFFELNET.</p></div></td></tr>`;
  } else {
    const sorted = Object.entries(byClasse).sort((a, b) => a[0].localeCompare(b[0]));
    tbody.innerHTML = sorted.map(([cl, d]) => {
      const pctCl   = d.total > 0 ? Math.round(d.inscrits / d.total * 100) : 0;
      const nonInsc = d.total - d.inscrits - d.attente;
      const barColor = pctCl >= 80 ? '#2D6A4F' : pctCl >= 50 ? '#40916C' : '#74C69D';
      return `
        <tr style="cursor:pointer" onclick="filterByClasse('${cl}')" title="Voir les élèves de ${cl}">
          <td><strong style="color:var(--green-900)">${esc(cl)}</strong></td>
          <td style="text-align:center;color:#777">${d.total}</td>
          <td style="text-align:center"><span style="font-weight:700;color:var(--green-700)">${d.inscrits}</span></td>
          <td style="text-align:center">${d.attente > 0 ? `<span style="color:var(--status-attente);font-weight:700">${d.attente}</span>` : '<span style="color:#CCC">—</span>'}</td>
          <td style="text-align:center"><span style="color:${nonInsc>0?'#B71C1C':'#999'};font-weight:${nonInsc>0?'700':'400'}">${nonInsc > 0 ? nonInsc : '—'}</span></td>
          <td>
            <div style="background:#F0F7F2;border-radius:50px;height:10px;min-width:120px;overflow:hidden">
              <div style="width:${pctCl}%;height:100%;background:${barColor};border-radius:50px;transition:width .4s"></div>
            </div>
          </td>
          <td style="text-align:center;font-weight:700;color:${barColor}">${pctCl}%</td>
          <td><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();filterByClasse('${cl}')">→</button></td>
        </tr>`;
    }).join('');

    // Ligne total
    const totInscrits = Object.values(byClasse).reduce((s, d) => s + d.inscrits, 0);
    const totAttente  = Object.values(byClasse).reduce((s, d) => s + d.attente, 0);
    const totTotal    = Object.values(byClasse).reduce((s, d) => s + d.total, 0);
    const totNon      = totTotal - totInscrits - totAttente;
    const totPct      = totTotal > 0 ? Math.round(totInscrits / totTotal * 100) : 0;
    tfoot.innerHTML = `
      <tr style="background:var(--green-50);font-weight:700;border-top:2px solid #D0E8D8">
        <td style="padding:.7rem 1rem">TOTAL</td>
        <td style="text-align:center;padding:.7rem 1rem">${totTotal}</td>
        <td style="text-align:center;padding:.7rem 1rem;color:var(--green-700)">${totInscrits}</td>
        <td style="text-align:center;padding:.7rem 1rem;color:var(--status-attente)">${totAttente || '—'}</td>
        <td style="text-align:center;padding:.7rem 1rem;color:${totNon>0?'#B71C1C':'#999'}">${totNon || '—'}</td>
        <td style="padding:.7rem 1rem">
          <div style="background:#F0F7F2;border-radius:50px;height:10px;overflow:hidden">
            <div style="width:${totPct}%;height:100%;background:var(--green-700);border-radius:50px"></div>
          </div>
        </td>
        <td style="text-align:center;padding:.7rem 1rem;color:var(--green-700)">${totPct}%</td>
        <td></td>
      </tr>`;
  }

  // Périodes
  const pp = document.getElementById('periods-panel');
  const { periodes } = s;
  const formatDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

  const periodRow = (label, color, p, key) => {
    const isActive = periode === key;
    return `
      <div style="padding:.6rem 0;border-bottom:1px solid #F0F7F2;display:flex;align-items:center;gap:.7rem">
        <span style="width:12px;height:12px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:${isActive?'0 0 0 3px '+color+'55':'none'}"></span>
        <div style="flex:1">
          <div style="font-weight:600;font-size:.85rem;color:${color}">${label} ${isActive ? '<span style="font-size:.72rem;background:'+color+';color:#fff;padding:.1rem .4rem;border-radius:50px">EN COURS</span>' : ''}</div>
          <div style="font-size:.78rem;color:#777;margin-top:.1rem">${formatDate(p.debut)} → ${formatDate(p.fin)}</div>
        </div>
      </div>`;
  };
  pp.innerHTML = `
    ${periodRow('Pré-Tour', '#1565C0', periodes.preTour, 'preTour')}
    ${periodRow('1er Tour', '#6A1B9A', periodes.premierTour, 'premierTour')}
    ${periodRow('2nd Tour', '#880E4F', periodes.secondTour, 'secondTour')}
    ${currentUser.role === 'proviseur' ? `<div style="margin-top:.8rem"><button class="btn btn-outline btn-sm w-full" onclick="navigateTo('settings')">⚙️ Configurer les périodes</button></div>` : ''}
  `;

  // Timeline
  const tl = document.getElementById('timeline-recent');
  const activity = DB.getActivity().slice(0, 8);
  if (!activity.length) {
    tl.innerHTML = `<div class="empty-state" style="padding:1.5rem 0"><span>Aucune activité récente.</span></div>`;
  } else {
    tl.innerHTML = activity.map(a => `
      <div class="timeline-item">
        <div class="timeline-dot">${activityIcon(a.type)}</div>
        <div class="timeline-content">
          <h4>${a.label}</h4>
          <p>${a.detail || ''}</p>
        </div>
        <span class="timeline-time">${timeAgo(a.ts)}</span>
      </div>`).join('');
  }

  // Graphique jours
  const byDay = stats.byDay;
  const keys = Object.keys(byDay);
  const vals = Object.values(byDay);
  const maxV = Math.max(...vals, 1);
  const bars = document.getElementById('day-bars');
  const labs = document.getElementById('day-labels');
  bars.innerHTML = vals.map((v, i) => `
    <div class="day-bar" style="height:${Math.max(8, Math.round(v/maxV*72))}px" title="${keys[i]}: ${v} inscription(s)">
    </div>`).join('');
  labs.innerHTML = keys.map(k => `<span style="flex:1;text-align:center">${k}</span>`).join('');
}

function filterByClasse(cl) {
  studentFilter.classe = cl;
  studentFilter.search = '';
  studentFilter.statut = '';
  navigateTo('students');
}

/* ═══════════════════════════════════════════════════
   VUE : LISTE ÉLÈVES
═══════════════════════════════════════════════════ */
function renderStudents(el) {
  const formations = DB.getFormations() || [];
  const allClasses = [...new Set(DB.getStudents().map(s => s.classeAffectee).filter(Boolean))].sort();

  el.innerHTML = `
    <div class="panel">
      <div class="table-toolbar">
        <div class="search-box">
          <span class="icon">🔍</span>
          <input id="search-input" type="text" placeholder="Rechercher nom, prénom, INE…"
            value="${studentFilter.search}"
            oninput="studentFilter.search=this.value;renderStudentTable()">
        </div>
        <select class="filter-select" onchange="studentFilter.classe=this.value;renderStudentTable()">
          <option value="">Toutes les classes</option>
          ${allClasses.map(c => `<option value="${c}" ${studentFilter.classe===c?'selected':''}>${c}</option>`).join('')}
        </select>
        <select class="filter-select" onchange="studentFilter.statut=this.value;renderStudentTable()">
          <option value="">Tous les statuts</option>
          <option value="non_inscrit"       ${studentFilter.statut==='non_inscrit'?'selected':''}>Non inscrit</option>
          <option value="inscrit"           ${studentFilter.statut==='inscrit'?'selected':''}>Inscrit</option>
          <option value="hors_periode"      ${studentFilter.statut==='hors_periode'?'selected':''}>Inscrit hors période</option>
          <option value="derogation_attente"${studentFilter.statut==='derogation_attente'?'selected':''}>Dérogation en attente</option>
          <option value="derogation_valide" ${studentFilter.statut==='derogation_valide'?'selected':''}>Dérogation validée</option>
          <option value="derogation_refuse" ${studentFilter.statut==='derogation_refuse'?'selected':''}>Dérogation refusée</option>
        </select>
        <div style="flex:1"></div>
        <span id="student-count" style="font-size:.82rem;color:#777"></span>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table" id="students-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Prénom</th>
              <th>INE</th>
              <th>Classe affectée</th>
              <th>LV1</th>
              <th>Statut</th>
              <th>Date inscription</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="students-tbody"></tbody>
        </table>
      </div>
    </div>`;

  renderStudentTable();
}

function renderStudentTable() {
  const all = DB.getStudents();
  const q   = studentFilter.search.toLowerCase();
  const filtered = all.filter(s => {
    const matchSearch = !q ||
      (s.nom||'').toLowerCase().includes(q) ||
      (s.prenom||'').toLowerCase().includes(q) ||
      (s.ine||'').toLowerCase().includes(q);
    const matchClasse = !studentFilter.classe || s.classeAffectee === studentFilter.classe;
    const matchStatut = !studentFilter.statut || s.statut === studentFilter.statut;
    return matchSearch && matchClasse && matchStatut;
  }).sort((a,b) => (a.nom||'').localeCompare(b.nom||''));

  const count = document.getElementById('student-count');
  if (count) count.textContent = `${filtered.length} / ${all.length} élève(s)`;

  const tbody = document.getElementById('students-tbody');
  if (!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="empty-icon">🔍</span><p>Aucun élève trouvé</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(s => `
    <tr>
      <td class="col-nom">${esc(s.nom)}</td>
      <td>${esc(s.prenom)}</td>
      <td style="font-family:monospace;font-size:.78rem;color:#888">${esc(s.ine)}</td>
      <td><strong>${esc(s.classeAffectee||'—')}</strong></td>
      <td style="font-size:.82rem">${esc(s.lv1||'—')}</td>
      <td>${statusBadge(s.statut)}</td>
      <td style="font-size:.82rem;color:#777">${s.dateInscription ? new Date(s.dateInscription).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
      <td>
        <div class="flex gap-sm">
          <button class="btn btn-outline btn-sm" onclick="navigateTo('student',{ine:'${s.ine}'})">Voir</button>
          ${canEnrollStudent(s) ? `<button class="btn btn-primary btn-sm" onclick="openEnrollModal('${s.ine}')">Inscrire</button>` : ''}
          ${s.statut === 'non_inscrit' && currentUser.role === 'aed' ? `<button class="btn btn-sm" style="background:#FFF3E0;color:#E65100" onclick="openDeroModal('${s.ine}')">Dérogation</button>` : ''}
        </div>
      </td>
    </tr>`).join('');
}

/* ═══════════════════════════════════════════════════
   VUE : FICHE ÉLÈVE
═══════════════════════════════════════════════════ */
function renderStudentDetail(el, ine) {
  const s = DB.getStudent(ine);
  if (!s) {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">❌</span><p>Élève introuvable</p></div>`;
    return;
  }

  const canEnroll = canEnrollStudent(s);
  const isPriv    = currentUser.role === 'proviseur' || currentUser.role === 'secretaire';
  const isAdmin   = currentUser.role === 'proviseur';

  el.innerHTML = `
    <button class="btn btn-secondary no-print" style="margin-bottom:1rem" onclick="navigateTo('students')">← Retour</button>

    <div class="panel">
      <div class="panel-body">
        <div class="student-header">
          <div class="student-avatar-lg">${(s.nom||'?')[0]}</div>
          <div>
            <div class="student-name">${esc(s.nom)} ${esc(s.prenom)}</div>
            <div class="student-sub">${esc(s.classeAffectee||'')} — ${esc(s.libelleFormation||'')}</div>
            <div class="student-ine">INE : ${esc(s.ine)}</div>
          </div>
          <div style="margin-left:auto;display:flex;gap:.5rem;flex-wrap:wrap">
            ${statusBadge(s.statut)}
            ${periodeBadge(s.periode)}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
          <div>
            <div class="panel-header" style="border-radius:8px 8px 0 0;margin-bottom:0"><h3>Identification</h3></div>
            <div class="info-grid" style="border:1px solid #E0EDE5;border-top:none;border-radius:0 0 8px 8px;padding:1rem">
              <div class="info-item"><div class="info-label">Nom</div><div class="info-value">${esc(s.nom)}</div></div>
              <div class="info-item"><div class="info-label">Prénom</div><div class="info-value">${esc(s.prenom)}</div></div>
              <div class="info-item"><div class="info-label">INE</div><div class="info-value" style="font-family:monospace">${esc(s.ine)}</div></div>
              <div class="info-item"><div class="info-label">Adresse</div><div class="info-value">${[s.adresse3, s.codePostal, s.ville].filter(Boolean).join(', ')||'—'}</div></div>
              <div class="info-item"><div class="info-label">Téléphone responsable</div><div class="info-value">${esc(s.tel1||s.tel2||'—')}</div></div>
            </div>
          </div>
          <div>
            <div class="panel-header" style="border-radius:8px 8px 0 0;margin-bottom:0"><h3>Affectation AFFELNET</h3></div>
            <div class="info-grid" style="border:1px solid #E0EDE5;border-top:none;border-radius:0 0 8px 8px;padding:1rem">
              <div class="info-item"><div class="info-label">Formation demandée</div><div class="info-value">${esc(s.libelleFormation||'—')}</div></div>
              <div class="info-item"><div class="info-label">Classe affectée</div><div class="info-value"><strong>${esc(s.classeAffectee||'—')}</strong></div></div>
              <div class="info-item"><div class="info-label">LV1</div><div class="info-value">${esc(s.lv1||'—')}</div></div>
              <div class="info-item"><div class="info-label">LV2</div><div class="info-value">${esc(s.lv2||'—')}</div></div>
              <div class="info-item"><div class="info-label">Établissement d'origine</div><div class="info-value">${esc(s.etablissementOrigine||'—')}</div></div>
              <div class="info-item"><div class="info-label">Rang</div><div class="info-value">${s.rang||'—'}</div></div>
            </div>
          </div>
        </div>

        ${s.statut === 'inscrit' || s.statut === 'hors_periode' ? `
        <div style="margin-top:1rem;background:var(--green-50);border:1px solid #D0E8D8;border-radius:var(--radius);padding:1rem">
          <div style="display:flex;align-items:center;gap:.5rem;font-weight:700;color:var(--green-800);margin-bottom:.5rem">
            ✅ Inscription enregistrée
          </div>
          <div class="info-grid">
            <div class="info-item"><div class="info-label">Date et heure</div><div class="info-value">${s.dateInscription ? new Date(s.dateInscription).toLocaleString('fr-FR') : '—'}</div></div>
            <div class="info-item"><div class="info-label">Enregistré par</div><div class="info-value">${esc(s.inscritPar||'—')}</div></div>
            <div class="info-item"><div class="info-label">Période</div><div class="info-value">${periodeFr(s.periode)}</div></div>
          </div>
        </div>` : ''}

        ${s.statut === 'derogation_attente' ? `
        <div style="margin-top:1rem;background:#FFF8E1;border:1px solid #FFE082;border-radius:var(--radius);padding:1rem">
          <div style="font-weight:700;color:#E65100;margin-bottom:.3rem">⚠️ Dérogation en attente de validation</div>
          <div style="font-size:.88rem;color:#555">Demandée par : ${esc(s.deroDemandeePar||'—')} le ${s.deroDate ? new Date(s.deroDate).toLocaleDateString('fr-FR') : '—'}</div>
        </div>` : ''}

        ${s.statut === 'derogation_refuse' ? `
        <div style="margin-top:1rem;background:#FFEBEE;border:1px solid #FFCDD2;border-radius:var(--radius);padding:1rem">
          <div style="font-weight:700;color:#B71C1C;margin-bottom:.3rem">❌ Dérogation refusée</div>
          <div style="font-size:.88rem;color:#555">Motif : ${esc(s.deroRefusMotif||'—')}</div>
          <div style="font-size:.78rem;color:#888">Refusée par : ${esc(s.deroValidePar||'—')}</div>
        </div>` : ''}

        <div class="action-bar no-print">
          ${canEnroll ? `<button class="btn btn-primary btn-lg" onclick="openEnrollModal('${s.ine}')">✅ Inscrire l'élève</button>` : ''}
          ${s.statut === 'non_inscrit' && !DB.getPeriodeActive() && currentUser.role === 'aed' ? `<button class="btn btn-lg" style="background:#FFF3E0;color:#E65100" onclick="openDeroModal('${s.ine}')">⚠️ Demander dérogation</button>` : ''}
          ${(s.statut === 'derogation_attente') && isPriv ? `
            <button class="btn btn-primary btn-lg" onclick="validateDero('${s.ine}')">✅ Valider la dérogation</button>
            <button class="btn btn-red btn-lg" onclick="openRefuseDeroModal('${s.ine}')">❌ Refuser</button>` : ''}
          ${(s.statut === 'inscrit' || s.statut === 'hors_periode') ? `
            <button class="btn btn-gold btn-lg" onclick="navigateTo('print',{ine:'${s.ine}'})">🖨️ Imprimer fiche</button>` : ''}
          ${isAdmin && s.statut !== 'non_inscrit' ? `
            <button class="btn btn-outline btn-sm" onclick="annulerInscription('${s.ine}')">↩️ Annuler inscription</button>` : ''}
        </div>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════
   VUE : DÉROGATIONS
═══════════════════════════════════════════════════ */
function renderDerogations(el) {
  const all = DB.getStudents().filter(s =>
    ['derogation_attente','derogation_valide','derogation_refuse'].includes(s.statut));
  const isPriv = currentUser.role === 'proviseur' || currentUser.role === 'secretaire';

  el.innerHTML = `
    <div class="flex gap-sm mb-md" style="flex-wrap:wrap">
      ${['attente','valide','refuse','tout'].map(f => `
        <button class="btn ${deroFilter===f?'btn-primary':'btn-secondary'}" onclick="deroFilter='${f}';renderDerogations(document.getElementById('page-content'))">
          ${f==='attente'?'⏳ En attente':f==='valide'?'✅ Validées':f==='refuse'?'❌ Refusées':'📋 Toutes'}
          <span class="nav-badge" style="background:rgba(255,255,255,.3);color:#fff;margin-left:.2rem">
            ${f==='tout'?all.length:all.filter(s=>s.statut==='derogation_'+f).length}
          </span>
        </button>`).join('')}
    </div>

    <div id="dero-list"></div>`;

  const deroList = document.getElementById('dero-list');
  const filtered = all.filter(s => {
    if (deroFilter === 'tout') return true;
    return s.statut === 'derogation_' + deroFilter;
  });

  if (!filtered.length) {
    deroList.innerHTML = `<div class="empty-state"><span class="empty-icon">✅</span><p>Aucune dérogation dans cette catégorie</p></div>`;
    return;
  }

  deroList.innerHTML = filtered.map(s => {
    const clsCard = s.statut === 'derogation_valide' ? 'validated' : s.statut === 'derogation_refuse' ? 'refused' : '';
    return `
      <div class="dero-card ${clsCard}">
        <div class="dero-header">
          <div>
            <div class="dero-name">${esc(s.nom)} ${esc(s.prenom)}</div>
            <div class="dero-class">${esc(s.classeAffectee||'')} — INE: ${esc(s.ine)}</div>
          </div>
          <div>${statusBadge(s.statut)}</div>
        </div>
        <div style="font-size:.82rem;color:#666">
          Demandée le ${s.deroDate ? new Date(s.deroDate).toLocaleDateString('fr-FR') : '—'} par ${esc(s.deroDemandeePar||'—')}
        </div>
        ${s.deroRefusMotif ? `<div style="margin-top:.4rem;font-size:.82rem;color:#B71C1C">Motif refus : ${esc(s.deroRefusMotif)}</div>` : ''}
        <div class="dero-footer">
          <button class="btn btn-outline btn-sm" onclick="navigateTo('student',{ine:'${s.ine}'})">Voir fiche</button>
          ${s.statut === 'derogation_attente' && isPriv ? `
            <button class="btn btn-primary btn-sm" onclick="validateDero('${s.ine}')">✅ Valider</button>
            <button class="btn btn-red btn-sm" onclick="openRefuseDeroModal('${s.ine}')">❌ Refuser</button>` : ''}
          ${s.statut === 'derogation_valide' && (s.statut==='derogation_valide') ? `
            <button class="btn btn-gold btn-sm" onclick="enrollFromDero('${s.ine}')">✅ Inscrire maintenant</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════
   VUE : IMPORT AFFELNET
═══════════════════════════════════════════════════ */
function renderImport(el) {
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 360px;gap:1.5rem">
      <div>
        <div class="panel">
          <div class="panel-header"><h3>📥 Importer le fichier AFFELNET (XLSX)</h3></div>
          <div class="panel-body">
            <div class="drop-zone" id="drop-zone" onclick="document.getElementById('file-input').click()"
              ondragover="event.preventDefault();this.classList.add('dragging')"
              ondragleave="this.classList.remove('dragging')"
              ondrop="handleDrop(event)">
              <span class="dz-icon">📂</span>
              <h4>Glisser-déposer le fichier XLSX ici</h4>
              <p>ou cliquer pour sélectionner le fichier AFFELNET</p>
              <p style="margin-top:.5rem;font-size:.78rem;color:#AAA">Format : fichier « affectesEtablissementAccueil_XXXXX.xlsx »</p>
            </div>
            <input type="file" id="file-input" accept=".xlsx,.xls" style="display:none" onchange="handleFileSelect(event)">

            <div class="import-progress" id="import-progress">
              <div style="font-weight:600;color:var(--green-800);margin-bottom:.7rem">📊 Résultat de l'import</div>
              <div class="import-log" id="import-log"></div>
              <div style="margin-top:1rem;display:flex;gap:.7rem" id="import-actions"></div>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header"><h3>📋 Importer le fichier Libellés Formation (XLSX)</h3></div>
          <div class="panel-body">
            <div class="drop-zone" id="drop-zone-formations" onclick="document.getElementById('file-formations').click()"
              ondragover="event.preventDefault();this.classList.add('dragging')"
              ondragleave="this.classList.remove('dragging')"
              ondrop="handleDropFormations(event)">
              <span class="dz-icon">📋</span>
              <h4>Glisser-déposer le fichier Libellés Formations</h4>
              <p>« LIBELLE FORMATION.xlsx »</p>
            </div>
            <input type="file" id="file-formations" accept=".xlsx,.xls" style="display:none" onchange="handleFormationsSelect(event)">
            <div id="formations-log" style="margin-top:1rem"></div>
          </div>
        </div>
      </div>

      <div>
        <div class="panel">
          <div class="panel-header"><h3>💾 Sauvegarde & Restauration</h3></div>
          <div class="panel-body">
            <p style="font-size:.85rem;color:#666;margin-bottom:1rem">Exportez toutes les données pour sauvegarde ou migration.</p>
            <button class="btn btn-primary w-full" onclick="exportData()" style="margin-bottom:.7rem">
              📤 Exporter toutes les données (JSON)
            </button>
            <button class="btn btn-secondary w-full" onclick="document.getElementById('import-json').click()">
              📥 Restaurer depuis JSON
            </button>
            <input type="file" id="import-json" accept=".json" style="display:none" onchange="importData(event)">
          </div>
        </div>

        <div class="panel mt-md">
          <div class="panel-header"><h3>📊 État des données</h3></div>
          <div class="panel-body">
            ${(() => {
              const stats = DB.getStats();
              const f = DB.getFormations() || [];
              return `
                <div style="display:grid;gap:.6rem">
                  <div class="flex justify-between" style="font-size:.88rem">
                    <span>Élèves chargés</span><strong>${stats.total}</strong>
                  </div>
                  <div class="flex justify-between" style="font-size:.88rem">
                    <span>Inscrits</span><strong style="color:var(--green-700)">${stats.inscrits}</strong>
                  </div>
                  <div class="flex justify-between" style="font-size:.88rem">
                    <span>Libellés formations</span><strong>${f.length}</strong>
                  </div>
                </div>`;
            })()}
            ${currentUser.role === 'proviseur' ? `
            <hr style="margin:1rem 0;border:none;border-top:1px solid #E0EDE5">
            <button class="btn btn-red w-full btn-sm" onclick="confirmReset()">🗑️ Réinitialiser pour nouvelle année</button>` : ''}
          </div>
        </div>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════
   VUE : JOURNAL D'ACTIVITÉ
═══════════════════════════════════════════════════ */
function renderActivity(el) {
  const activity = DB.getActivity();
  el.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <h3>📋 Journal d'activité complet</h3>
        <span style="font-size:.82rem;color:#777">${activity.length} entrées</span>
      </div>
      <div class="panel-body" style="padding:0 1.5rem">
        ${!activity.length
          ? `<div class="empty-state"><span class="empty-icon">📋</span><p>Aucune activité enregistrée</p></div>`
          : `<div class="timeline">${activity.map(a => `
              <div class="timeline-item">
                <div class="timeline-dot">${activityIcon(a.type)}</div>
                <div class="timeline-content">
                  <h4>${a.label}</h4>
                  <p>${a.detail||''}</p>
                </div>
                <span class="timeline-time">${new Date(a.ts).toLocaleString('fr-FR')}</span>
              </div>`).join('')}
            </div>`}
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════
   VUE : PARAMÈTRES
═══════════════════════════════════════════════════ */
function renderSettings(el) {
  if (currentUser.role !== 'proviseur') {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">🔒</span><p>Accès réservé au Proviseur</p></div>`;
    return;
  }
  const s = DB.getSettings();

  el.innerHTML = `
    <div class="settings-tabs">
      <button class="settings-tab active" onclick="switchSettingsTab('tab-etablissement',this)">🏫 Établissement</button>
      <button class="settings-tab" onclick="switchSettingsTab('tab-periodes',this)">📅 Périodes</button>
      <button class="settings-tab" onclick="switchSettingsTab('tab-users',this)">👤 Utilisateurs</button>
    </div>

    <!-- TAB : Établissement -->
    <div class="settings-panel active" id="tab-etablissement">
      <div class="panel">
        <div class="panel-header"><h3>🏫 Informations établissement</h3></div>
        <div class="panel-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="form-group">
              <label>Nom de l'établissement</label>
              <input type="text" id="set-etab" value="${esc(s.etablissement||'')}">
            </div>
            <div class="form-group">
              <label>Ville</label>
              <input type="text" id="set-ville" value="${esc(s.ville||'')}">
            </div>
            <div class="form-group">
              <label>Année scolaire</label>
              <input type="text" id="set-annee" value="${esc(s.annee||'')}">
            </div>
          </div>
          <button class="btn btn-primary mt-md" onclick="saveEtabSettings()">💾 Enregistrer</button>
        </div>
      </div>
    </div>

    <!-- TAB : Périodes -->
    <div class="settings-panel" id="tab-periodes">
      <div class="panel">
        <div class="panel-header"><h3>📅 Calendrier des inscriptions</h3></div>
        <div class="panel-body">
          <p style="font-size:.85rem;color:#666;margin-bottom:1.2rem">
            Définissez les dates de début et de fin de chaque période.
            En dehors de ces périodes, seuls la Direction et la Secrétaire peuvent inscrire un élève.
          </p>

          <div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:1rem 1.5rem;align-items:center;margin-bottom:.5rem">
            <div style="font-size:.78rem;font-weight:700;color:#999;text-transform:uppercase">Période</div>
            <div style="font-size:.78rem;font-weight:700;color:#999;text-transform:uppercase">Début</div>
            <div style="font-size:.78rem;font-weight:700;color:#999;text-transform:uppercase">Fin</div>
          </div>

          ${periodRow('🔵 Pré-Tour', '#1565C0', s.periodes.preTour, 'preTour')}
          ${periodRow('🟣 1er Tour', '#6A1B9A', s.periodes.premierTour, 'premierTour')}
          ${periodRow('🔴 2nd Tour', '#880E4F', s.periodes.secondTour, 'secondTour')}

          <button class="btn btn-primary mt-md" onclick="savePeriodes()">💾 Enregistrer les périodes</button>
        </div>
      </div>
    </div>

    <!-- TAB : Utilisateurs -->
    <div class="settings-panel" id="tab-users">
      <div class="panel">
        <div class="panel-header">
          <h3>👤 Gestion des utilisateurs</h3>
          <button class="btn btn-primary btn-sm" onclick="openAddUserModal()">+ Ajouter</button>
        </div>
        <div class="panel-body" style="padding:0">
          <table class="users-table">
            <thead><tr><th>Nom</th><th>Prénom</th><th>Login</th><th>Rôle</th><th>Actions</th></tr></thead>
            <tbody>
              ${s.users.map(u => `
                <tr>
                  <td><strong>${esc(u.nom)}</strong></td>
                  <td>${esc(u.prenom)}</td>
                  <td style="font-family:monospace;color:#666">${esc(u.login)}</td>
                  <td><span class="role-badge role-${u.role}">${roleFr(u.role)}</span></td>
                  <td>
                    <div class="flex gap-sm">
                      <button class="btn btn-outline btn-sm" onclick="openEditUserModal('${u.id}')">✏️ Modifier</button>
                      ${u.id !== currentUser.id ? `<button class="btn btn-red btn-sm" onclick="deleteUser('${u.id}')">🗑️</button>` : ''}
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function periodRow(label, color, p, key) {
  return `
    <div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:1rem 1.5rem;align-items:center;padding:.8rem 0;border-bottom:1px solid #F0F7F2">
      <div style="display:flex;align-items:center;gap:.6rem;font-weight:600;font-size:.9rem;min-width:160px">
        <span style="width:14px;height:14px;border-radius:50%;background:${color};flex-shrink:0"></span>
        ${label}
      </div>
      <input type="date" id="p-${key}-debut" value="${p.debut||''}" style="max-width:200px">
      <input type="date" id="p-${key}-fin" value="${p.fin||''}" style="max-width:200px">
    </div>`;
}

function switchSettingsTab(id, btn) {
  document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.settings-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}

/* ═══════════════════════════════════════════════════
   VUE : IMPRESSION FICHE
═══════════════════════════════════════════════════ */
function renderPrint(el, ine) {
  const s = DB.getStudent(ine);
  if (!s) return;
  const st = DB.getSettings();
  const now = new Date();

  const dateStr = now.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
  const heureStr = now.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });

  const bloc = (titre) => `
    <div class="fiche-bloc">
      <div class="fiche-header">
        <span class="fiche-logo">🏫</span>
        <h1>${esc(st.etablissement)} — ${esc(st.ville)}</h1>
        <p>FICHE D'ACCUEIL — INSCRIPTION AU LYCÉE — Année ${esc(st.annee)} &nbsp;|&nbsp; <em>${titre}</em></p>
      </div>

      <div class="fiche-section">
        <h2>Identification de l'élève</h2>
        <table class="fiche-table">
          <tr>
            <td>Nom / Prénom</td>
            <td><strong>${esc(s.nom)} ${esc(s.prenom)}</strong></td>
            <td>INE</td>
            <td style="font-family:monospace">${esc(s.ine)}</td>
          </tr>
          <tr>
            <td>Classe affectée</td>
            <td><strong>${esc(s.classeAffectee||'—')}</strong></td>
            <td>Formation</td>
            <td>${esc(s.libelleFormation||'—')}</td>
          </tr>
          <tr>
            <td>Étab. d'origine</td>
            <td>${esc(s.etablissementOrigine||'—')}</td>
            <td>LV1 / LV2</td>
            <td>${esc(s.lv1||'—')} / ${esc(s.lv2||'—')}</td>
          </tr>
          <tr>
            <td>Notification AFFELNET</td>
            <td colspan="3">☑ OUI</td>
          </tr>
        </table>
      </div>

      <div class="fiche-section">
        <h2>Vérifications — Agent d'accueil</h2>
        <table class="fiche-table">
          <tr>
            <td style="width:35%">Élève accepté ?</td>
            <td>
              <span class="fiche-stamp ${s.statut==='inscrit'||s.statut==='hors_periode'?'stamp-ok':''}">
                ${s.statut==='inscrit'||s.statut==='hors_periode' ? '☑ OUI — Dossier validé' : '☐ OUI  &nbsp; ☐ NON'}
              </span>
            </td>
          </tr>
          <tr>
            <td>Date d'inscription conforme ?</td>
            <td>
              ${s.periode && s.periode !== 'hors_periode'
                ? `☑ OUI — Période : ${periodeFr(s.periode)}`
                : s.statut === 'hors_periode'
                  ? `<span class="fiche-stamp stamp-dero">Dérogation validée — Hors période</span>`
                  : '☐ OUI  &nbsp; ☐ NON — Dérogation nécessaire'}
            </td>
          </tr>
          <tr><td>Observations</td><td>&nbsp;</td></tr>
        </table>
      </div>

      <div class="fiche-section">
        <h2>Date, heure et signatures</h2>
        <div style="font-size:9pt;margin-bottom:.4rem">
          Accueil le <strong>${dateStr}</strong> à <strong>${heureStr}</strong>
        </div>
        <div class="fiche-sigs">
          <div class="fiche-sig-box"><h4>Agent d'accueil</h4><p>Nom : _______________</p><p style="margin-top:.8rem">Signature :</p></div>
          <div class="fiche-sig-box"><h4>Parent / Représentant légal</h4><p>Nom : _______________</p><p style="margin-top:.8rem">Signature :</p></div>
          <div class="fiche-sig-box"><h4>Agent contrôle dossier</h4><p>Nom : _______________</p><p style="margin-top:.8rem">Signature :</p></div>
        </div>
      </div>
    </div>`;

  el.innerHTML = `
    <div class="flex gap-sm mb-md no-print" style="align-items:center">
      <button class="btn btn-secondary" onclick="navigateTo('student',{ine:'${ine}'})">← Retour</button>
      <button class="btn btn-primary btn-lg" onclick="window.print()">🖨️ Imprimer / Enregistrer PDF</button>
      <span style="font-size:.82rem;color:#777">Les 2 exemplaires tiennent sur 1 feuille A4</span>
    </div>
    <div class="print-fiche" style="display:block">
      ${bloc('Exemplaire Lycée')}
      <div class="fiche-divider"><span>✂&nbsp;&nbsp;Découper ici &mdash; remettre l'exemplaire ci-dessous à la famille&nbsp;&nbsp;✂</span></div>
      ${bloc('Exemplaire Famille')}
    </div>`;
}

/* ═══════════════════════════════════════════════════
   MODALES
═══════════════════════════════════════════════════ */
function openModal(content) {
  const overlay = document.getElementById('modal-overlay');
  const body    = document.getElementById('modal-body-content');
  body.innerHTML = content;
  overlay.classList.add('open');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ── Modal : Inscription ──────────────────────────────
function openEnrollModal(ine) {
  const s = DB.getStudent(ine);
  if (!s) return;
  const periode = DB.getPeriodeActive();
  const role    = currentUser.role;

  if (!DB.canEnrollNow(role)) {
    showToast('Inscription impossible : hors période. Demandez une dérogation.', 'error');
    return;
  }

  const isHors = !periode && (role === 'proviseur' || role === 'secretaire');

  openModal(`
    <div class="modal-header">
      <h3>✅ Inscrire l'élève</h3>
      <button class="btn-close-modal" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <p style="font-size:.9rem;color:#555;margin-bottom:1.2rem">Confirmer l'inscription de :</p>
      <div style="background:var(--green-50);border-radius:8px;padding:1rem;margin-bottom:1rem">
        <div style="font-size:1.1rem;font-weight:800;color:var(--green-900)">${esc(s.nom)} ${esc(s.prenom)}</div>
        <div style="font-size:.85rem;color:#666">${esc(s.classeAffectee)} — ${esc(s.libelleFormation||'')}</div>
        <div style="font-size:.78rem;color:#999;margin-top:.2rem">INE : ${esc(s.ine)}</div>
      </div>
      ${isHors ? `<div style="background:#FFF8E1;border:1px solid #FFE082;border-radius:8px;padding:.8rem;font-size:.85rem;color:#E65100;margin-bottom:1rem">
        ⚠️ Inscription hors période — sera marquée comme exception autorisée.
      </div>` : `<div style="background:#E8F5E9;border-radius:8px;padding:.7rem;font-size:.85rem;color:var(--green-800)">
        📅 Période : <strong>${periodeFr(periode)}</strong>
      </div>`}
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="confirmEnroll('${ine}')">✅ Confirmer l'inscription</button>
    </div>`);
}

function confirmEnroll(ine) {
  const periode = DB.getPeriodeActive();
  const role    = currentUser.role;
  const isHors  = !periode && (role === 'proviseur' || role === 'secretaire');

  const updated = DB.updateStudentStatus(ine, {
    statut: isHors ? 'hors_periode' : 'inscrit',
    dateInscription: new Date().toISOString(),
    inscritPar: `${currentUser.prenom} ${currentUser.nom}`,
    periode: periode || 'hors_periode',
  });

  DB.addActivity({
    type: 'inscription',
    label: `Inscription : ${updated.nom} ${updated.prenom}`,
    detail: `${updated.classeAffectee} — par ${currentUser.prenom} ${currentUser.nom}${isHors?' (hors période)':''}`,
  });

  closeModal();
  showToast(`${updated.nom} ${updated.prenom} inscrit(e) avec succès !`, 'success');
  renderSidebar();

  if (currentView === 'student') navigateTo('student', { ine });
  else if (currentView === 'students') renderStudentTable();
  else if (currentView === 'dashboard') navigateTo('dashboard');
}

// ── Modal : Dérogation ───────────────────────────────
function openDeroModal(ine) {
  const s = DB.getStudent(ine);
  if (!s) return;
  openModal(`
    <div class="modal-header">
      <h3>⚠️ Demander une dérogation</h3>
      <button class="btn-close-modal" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <p style="font-size:.85rem;color:#666;margin-bottom:1rem">
        La période d'inscription est fermée. Vous allez enregistrer une demande de dérogation pour :<br>
        <strong>${esc(s.nom)} ${esc(s.prenom)}</strong> — ${esc(s.classeAffectee)}
      </p>
      <p style="font-size:.85rem;color:#E65100">La demande sera soumise à la Direction ou à la Secrétaire pour validation.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-gold" onclick="confirmDero('${ine}')">⚠️ Enregistrer la demande</button>
    </div>`);
}

function confirmDero(ine) {
  const updated = DB.updateStudentStatus(ine, {
    statut: 'derogation_attente',
    deroDate: new Date().toISOString(),
    deroDemandeePar: `${currentUser.prenom} ${currentUser.nom}`,
  });
  DB.addActivity({
    type: 'derogation',
    label: `Dérogation demandée : ${updated.nom} ${updated.prenom}`,
    detail: `Par ${currentUser.prenom} ${currentUser.nom}`,
  });
  closeModal();
  showToast('Demande de dérogation enregistrée.', 'warning');
  renderSidebar();
  if (currentView === 'student') navigateTo('student', { ine });
  else renderStudentTable && renderStudentTable();
}

// ── Valider dérogation ───────────────────────────────
function validateDero(ine) {
  const updated = DB.updateStudentStatus(ine, {
    statut: 'derogation_valide',
    deroValidePar: `${currentUser.prenom} ${currentUser.nom}`,
  });
  DB.addActivity({
    type: 'dero_valide',
    label: `Dérogation validée : ${updated.nom} ${updated.prenom}`,
    detail: `Par ${currentUser.prenom} ${currentUser.nom}`,
  });
  showToast('Dérogation validée. L\'AED peut maintenant inscrire l\'élève.', 'success');
  renderSidebar();
  if (currentView === 'student') navigateTo('student', { ine });
  else if (currentView === 'derogations') renderDerogations(document.getElementById('page-content'));
}

function enrollFromDero(ine) {
  const updated = DB.updateStudentStatus(ine, {
    statut: 'hors_periode',
    dateInscription: new Date().toISOString(),
    inscritPar: `${currentUser.prenom} ${currentUser.nom}`,
    periode: 'hors_periode',
  });
  DB.addActivity({
    type: 'inscription',
    label: `Inscription après dérogation : ${updated.nom} ${updated.prenom}`,
    detail: `${updated.classeAffectee} — par ${currentUser.prenom} ${currentUser.nom}`,
  });
  showToast(`${updated.nom} ${updated.prenom} inscrit(e) avec succès !`, 'success');
  renderSidebar();
  if (currentView === 'derogations') renderDerogations(document.getElementById('page-content'));
}

// ── Modal : Refus dérogation ─────────────────────────
function openRefuseDeroModal(ine) {
  const s = DB.getStudent(ine);
  openModal(`
    <div class="modal-header">
      <h3>❌ Refuser la dérogation</h3>
      <button class="btn-close-modal" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <p style="font-size:.85rem;color:#666;margin-bottom:1rem">
        Refuser la demande de dérogation pour <strong>${esc(s.nom)} ${esc(s.prenom)}</strong>.
      </p>
      <label style="font-size:.85rem;font-weight:600;display:block;margin-bottom:.5rem">Motif du refus <span style="color:var(--red)">*</span></label>
      <textarea id="refuse-motif" class="form-ctrl" placeholder="Indiquez le motif du refus (obligatoire)…"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-red" onclick="confirmRefuseDero('${ine}')">❌ Confirmer le refus</button>
    </div>`);
}

function confirmRefuseDero(ine) {
  const motif = document.getElementById('refuse-motif').value.trim();
  if (!motif) { showToast('Le motif de refus est obligatoire.', 'error'); return; }
  const s = DB.getStudent(ine);
  DB.updateStudentStatus(ine, {
    statut: 'derogation_refuse',
    deroRefusMotif: motif,
    deroValidePar: `${currentUser.prenom} ${currentUser.nom}`,
  });
  DB.addActivity({
    type: 'dero_refuse',
    label: `Dérogation refusée : ${s.nom} ${s.prenom}`,
    detail: `Motif : ${motif} — Par ${currentUser.prenom} ${currentUser.nom}`,
  });
  closeModal();
  showToast('Dérogation refusée.', 'error');
  renderSidebar();
  if (currentView === 'student') navigateTo('student', { ine });
  else if (currentView === 'derogations') renderDerogations(document.getElementById('page-content'));
}

// ── Modal : Utilisateur ──────────────────────────────
function openAddUserModal() { openUserModal(null); }
function openEditUserModal(id) {
  const u = DB.getSettings().users.find(u => u.id === id);
  openUserModal(u);
}

function openUserModal(u) {
  openModal(`
    <div class="modal-header">
      <h3>${u ? '✏️ Modifier l\'utilisateur' : '➕ Nouvel utilisateur'}</h3>
      <button class="btn-close-modal" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label>Prénom</label>
        <input type="text" id="u-prenom" value="${u ? esc(u.prenom) : ''}">
      </div>
      <div class="form-group"><label>Nom</label>
        <input type="text" id="u-nom" value="${u ? esc(u.nom) : ''}">
      </div>
      <div class="form-group"><label>Login</label>
        <input type="text" id="u-login" value="${u ? esc(u.login) : ''}">
      </div>
      <div class="form-group"><label>Mot de passe ${u ? '(laisser vide pour ne pas changer)' : ''}</label>
        <input type="password" id="u-password" placeholder="${u ? '••••••••' : 'Mot de passe'}">
      </div>
      <div class="form-group"><label>Rôle</label>
        <select id="u-role">
          <option value="aed"        ${u?.role==='aed'?'selected':''}>AED — Agent d'accueil</option>
          <option value="secretaire" ${u?.role==='secretaire'?'selected':''}>Secrétaire de direction</option>
          <option value="proviseur"  ${u?.role==='proviseur'?'selected':''}>Proviseur</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveUser('${u?.id||''}')">💾 Enregistrer</button>
    </div>`);
}

function saveUser(id) {
  const prenom = document.getElementById('u-prenom').value.trim();
  const nom    = document.getElementById('u-nom').value.trim();
  const login  = document.getElementById('u-login').value.trim();
  const pwd    = document.getElementById('u-password').value;
  const role   = document.getElementById('u-role').value;

  if (!prenom || !nom || !login) { showToast('Prénom, nom et login sont obligatoires.', 'error'); return; }

  const s = DB.getSettings();
  if (id) {
    const idx = s.users.findIndex(u => u.id === id);
    if (idx >= 0) {
      s.users[idx] = { ...s.users[idx], prenom, nom, login, role, ...(pwd ? { password: pwd } : {}) };
    }
  } else {
    if (!pwd) { showToast('Le mot de passe est obligatoire pour un nouvel utilisateur.', 'error'); return; }
    s.users.push({ id: 'u' + Date.now(), prenom, nom, login, role, password: pwd });
  }
  DB.saveSettings(s);
  closeModal();
  showToast('Utilisateur enregistré.', 'success');
  renderSettings(document.getElementById('page-content'));
}

function deleteUser(id) {
  if (!confirm('Supprimer cet utilisateur ?')) return;
  const s = DB.getSettings();
  s.users = s.users.filter(u => u.id !== id);
  DB.saveSettings(s);
  showToast('Utilisateur supprimé.', 'success');
  renderSettings(document.getElementById('page-content'));
}

/* ═══════════════════════════════════════════════════
   SAUVEGARDE PARAMÈTRES
═══════════════════════════════════════════════════ */
function saveEtabSettings() {
  const s = DB.getSettings();
  s.etablissement = document.getElementById('set-etab').value.trim();
  s.ville         = document.getElementById('set-ville').value.trim();
  s.annee         = document.getElementById('set-annee').value.trim();
  DB.saveSettings(s);
  showToast('Paramètres enregistrés.', 'success');
  renderSidebar();
  renderTopHeader();
  document.getElementById('sb-year').textContent = s.annee;
}

function savePeriodes() {
  const s = DB.getSettings();
  s.periodes.preTour.debut      = document.getElementById('p-preTour-debut').value;
  s.periodes.preTour.fin        = document.getElementById('p-preTour-fin').value;
  s.periodes.premierTour.debut  = document.getElementById('p-premierTour-debut').value;
  s.periodes.premierTour.fin    = document.getElementById('p-premierTour-fin').value;
  s.periodes.secondTour.debut   = document.getElementById('p-secondTour-debut').value;
  s.periodes.secondTour.fin     = document.getElementById('p-secondTour-fin').value;
  DB.saveSettings(s);
  showToast('Périodes enregistrées.', 'success');
  renderTopHeader();
}

/* ═══════════════════════════════════════════════════
   IMPORT FICHIERS
═══════════════════════════════════════════════════ */
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file) processAffelnetFile(file);
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processAffelnetFile(file);
  e.target.value = '';
}
function handleDropFormations(e) {
  e.preventDefault();
  document.getElementById('drop-zone-formations').classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file) processFormationsFile(file);
}
function handleFormationsSelect(e) {
  const file = e.target.files[0];
  if (file) processFormationsFile(file);
  e.target.value = '';
}

function processAffelnetFile(file) {
  const prog = document.getElementById('import-progress');
  const log  = document.getElementById('import-log');
  prog.style.display = 'block';
  log.innerHTML = `<span class="log-info">📂 Lecture du fichier : ${esc(file.name)}…</span><br>`;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      log.innerHTML += `<span class="log-info">📊 Feuille : « ${sheetName} » — ${rows.length} lignes trouvées</span><br>`;

      const formations = DB.getFormations() || [];
      const existing   = DB.getStudents();
      let added = 0, updated = 0, skipped = 0;

      rows.forEach((row, i) => {
        const ine = String(row['INE'] || '').trim();
        if (!ine) { skipped++; return; }

        const libelleFormation = String(row['Libellé formation'] || '').trim();
        const classeAffectee   = resolveClasse(libelleFormation, formations);

        const student = {
          ine,
          nom:    String(row['Nom'] || '').trim().toUpperCase(),
          prenom: String(row['Prénom 1'] || row['Prenom 1'] || '').trim(),
          adresse3:   String(row['Adresse 3'] || '').trim(),
          codePostal: String(row['Code Postal'] || '').trim(),
          ville:      String(row['Ville'] || '').trim(),
          tel1:       String(row['Téléphone 1 (Responsable)'] || '').trim(),
          tel2:       String(row['Téléphone 2 (Responsable)'] || '').trim(),
          tel3:       String(row['Téléphone portable'] || '').trim(),
          emailResp:  String(row['Courriel responsable 1'] || '').trim(),
          libelleFormation,
          classeAffectee,
          lv1:        String(row['Libellé  LV1'] || row['Libellé LV1'] || '').trim(),
          lv2:        String(row['Libellé  LV2'] || row['Libellé LV2'] || '').trim(),
          mnemonique: String(row['Mnémonique'] || '').trim(),
          etablissementOrigine: String(row['Den. comp. étab. origine'] || '').trim(),
          rang: row['Rang'] || '',
          statut: 'non_inscrit',
        };

        const ex = existing.find(s => s.ine === ine);
        if (ex) {
          // Conserver le statut existant
          DB.upsertStudent({ ...student, statut: ex.statut, dateInscription: ex.dateInscription,
            inscritPar: ex.inscritPar, periode: ex.periode,
            deroDate: ex.deroDate, deroDemandeePar: ex.deroDemandeePar,
            deroValidePar: ex.deroValidePar, deroRefusMotif: ex.deroRefusMotif });
          updated++;
        } else {
          DB.upsertStudent(student);
          added++;
        }
      });

      log.innerHTML += `<span class="log-ok">✅ ${added} élèves ajoutés</span><br>`;
      if (updated) log.innerHTML += `<span class="log-info">🔄 ${updated} élèves mis à jour (statuts conservés)</span><br>`;
      if (skipped) log.innerHTML += `<span class="log-warn">⚠️ ${skipped} lignes ignorées (pas d'INE)</span><br>`;
      log.innerHTML += `<span class="log-ok">✅ Import terminé — Total : ${DB.getStudents().length} élèves</span>`;

      DB.addActivity({
        type: 'import',
        label: `Import AFFELNET : ${rows.length} élèves`,
        detail: `${added} ajoutés, ${updated} mis à jour — ${file.name}`,
      });

      document.getElementById('import-actions').innerHTML = `
        <button class="btn btn-primary" onclick="navigateTo('students')">👥 Voir les élèves</button>
        <button class="btn btn-secondary" onclick="navigateTo('dashboard')">📊 Tableau de bord</button>`;

      renderSidebar();
      showToast(`Import réussi : ${added + updated} élèves traités`, 'success');

    } catch(err) {
      log.innerHTML += `<span style="color:red">❌ Erreur : ${err.message}</span>`;
    }
  };
  reader.readAsArrayBuffer(file);
}

function processFormationsFile(file) {
  const log = document.getElementById('formations-log');
  log.innerHTML = `<span class="log-info">Lecture…</span>`;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const formations = rows
        .filter(r => r['Libellé formation'] && r['classe affectée'])
        .map(r => ({
          libelleAffelnet: String(r['Libellé formation']).trim(),
          classeAffectee:  String(r['classe affectée']).trim(),
        }));

      DB.saveFormations(formations);
      log.innerHTML = `<div class="import-log"><span class="log-ok">✅ ${formations.length} libellés de formations importés</span></div>`;
      showToast(`${formations.length} formations importées.`, 'success');
    } catch(err) {
      log.innerHTML = `<div style="color:red">❌ Erreur : ${err.message}</div>`;
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ═══════════════════════════════════════════════════
   EXPORT / IMPORT JSON
═══════════════════════════════════════════════════ */
function exportData() {
  const data = DB.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `affelnet-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export réussi.', 'success');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!confirm(`Restaurer les données du ${data.exportedAt ? new Date(data.exportedAt).toLocaleString('fr-FR') : 'fichier sélectionné'} ? Les données actuelles seront remplacées.`)) return;
      DB.importAll(data);
      showToast('Données restaurées avec succès.', 'success');
      navigateTo('dashboard');
    } catch(err) {
      showToast('Erreur lors de la restauration : ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function confirmReset() {
  if (!confirm('⚠️ Attention : cela supprimera TOUS les élèves et le journal d\'activité.\n\nConfirmer la réinitialisation pour la nouvelle année scolaire ?')) return;
  const annee = prompt('Entrez la nouvelle année scolaire (ex: 2026-2027) :');
  if (!annee) return;
  DB.resetStudents();
  const s = DB.getSettings();
  s.annee = annee;
  s.periodes = {
    preTour:     { debut: '', fin: '' },
    premierTour: { debut: '', fin: '' },
    secondTour:  { debut: '', fin: '' },
  };
  DB.saveSettings(s);
  showToast('Base réinitialisée pour ' + annee, 'success');
  navigateTo('dashboard');
}

function annulerInscription(ine) {
  if (!confirm('Annuler l\'inscription de cet élève ?')) return;
  const s = DB.getStudent(ine);
  DB.updateStudentStatus(ine, {
    statut: 'non_inscrit',
    dateInscription: null,
    inscritPar: null,
    periode: null,
    deroDate: null,
    deroDemandeePar: null,
    deroValidePar: null,
    deroRefusMotif: null,
  });
  DB.addActivity({
    type: 'annulation',
    label: `Inscription annulée : ${s.nom} ${s.prenom}`,
    detail: `Par ${currentUser.prenom} ${currentUser.nom}`,
  });
  showToast('Inscription annulée.', 'warning');
  navigateTo('student', { ine });
}

/* ═══════════════════════════════════════════════════
   UTILITAIRES
═══════════════════════════════════════════════════ */
function canEnrollStudent(s) {
  if (s.statut === 'inscrit' || s.statut === 'hors_periode') return false;
  if (s.statut === 'derogation_attente') return false;
  if (s.statut === 'derogation_valide') return true;
  return DB.canEnrollNow(currentUser.role);
}

function statusBadge(statut) {
  const map = {
    'non_inscrit':        ['badge-non',     '⚫', 'Non inscrit'],
    'inscrit':            ['badge-inscrit',  '✅', 'Inscrit'],
    'hors_periode':       ['badge-hors',     '🟣', 'Inscrit hors période'],
    'derogation_attente': ['badge-attente',  '⏳', 'Dérogation en attente'],
    'derogation_valide':  ['badge-valide',   '✔️', 'Dérogation validée'],
    'derogation_refuse':  ['badge-refuse',   '❌', 'Dérogation refusée'],
  };
  const [cls, icon, label] = map[statut] || ['badge-non', '?', statut||'—'];
  return `<span class="badge ${cls}">${icon} ${label}</span>`;
}

function periodeBadge(periode) {
  if (!periode) return '';
  const map = {
    'preTour':      ['badge-pre',     '🔵', 'Pré-Tour'],
    'premierTour':  ['badge-premier', '🟣', '1er Tour'],
    'secondTour':   ['badge-second',  '🔴', '2nd Tour'],
    'hors_periode': ['badge-hors',    '⚫', 'Hors période'],
  };
  const [cls, icon, label] = map[periode] || [];
  if (!cls) return '';
  return `<span class="badge ${cls}">${icon} ${label}</span>`;
}

function roleFr(role) {
  return { proviseur: 'Proviseur', secretaire: 'Secrétaire', aed: 'AED Accueil' }[role] || role;
}

function periodeFr(p) {
  return { preTour: 'Pré-Tour', premierTour: '1er Tour', secondTour: '2nd Tour', hors_periode: 'Hors période' }[p] || p || '—';
}

function activityIcon(type) {
  const m = { inscription:'✅', import:'📥', derogation:'⚠️', dero_valide:'✔️', dero_refuse:'❌', annulation:'↩️' };
  return m[type] || '📋';
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)      return 'à l\'instant';
  if (diff < 3600000)    return Math.floor(diff/60000) + ' min';
  if (diff < 86400000)   return Math.floor(diff/3600000) + 'h';
  return new Date(iso).toLocaleDateString('fr-FR');
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── Toast notifications ───────────────────────────── */
function showToast(msg, type = 'success') {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.innerHTML = `<span>${icons[type]||'•'}</span>${esc(msg)}`;
  document.getElementById('toast-area').appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

/* ─── Keyboard shortcuts ────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') {
    doLogin();
  }
  if (e.key === 'Escape') closeModal();
});
