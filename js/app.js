/* =====================================================
   app.js — Contrôleur principal AFFELNET-Manager v2
   ===================================================== */

let currentUser   = null;
let currentView   = null;
let studentFilter = { search: '', classe: '', statut: '', redoublant: false, source: '' };
let deroFilter    = 'attente';
let formationFilter = '';

document.addEventListener('DOMContentLoaded', () => {
  DB.init();
  const session = DB.getSession();
  if (session) {
    currentUser = session;
    if (typeof FB_MODE !== 'undefined' && FB_MODE) {
      fbLoadAll().then(() => fbListenStudents()).catch(console.error);
    }
    showApp();
  } else {
    showLogin();
  }
  document.getElementById('pwd-input').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('login-input').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('pwd-input').focus(); });
});

/* ═══════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════ */
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  const s = DB.getSettings();
  const el = document.getElementById('login-annee');
  if (el && s) el.textContent = s.annee;
}

async function doLogin() {
  const login = document.getElementById('login-input').value.trim();
  const pwd   = document.getElementById('pwd-input').value;
  const errEl = document.getElementById('login-error');
  const btn   = document.querySelector('.btn-login');
  const user  = DB.authenticate(login, pwd);
  if (!user) {
    errEl.textContent = 'Identifiant ou mot de passe incorrect.';
    errEl.style.display = 'block';
    document.getElementById('pwd-input').value = '';
    return;
  }
  errEl.style.display = 'none';
  btn.textContent = 'Connexion…'; btn.disabled = true;
  if (typeof FB_MODE !== 'undefined' && FB_MODE) {
    try { await fbLogin(login, pwd); } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        btn.textContent = 'Se connecter →'; btn.disabled = false;
        errEl.textContent = 'Mot de passe incorrect.'; errEl.style.display = 'block'; return;
      }
      // Autre erreur Firebase (réseau, etc.) : continuer en mode local
      console.warn('[Firebase] Connexion Firebase impossible, mode local activé :', err.message);
    }
  }
  btn.textContent = 'Se connecter →'; btn.disabled = false;
  currentUser = user; DB.saveSession(user); showApp();
}

async function doLogout() {
  currentUser = null; DB.clearSession();
  if (typeof FB_MODE !== 'undefined' && FB_MODE) await fbLogout();
  showLogin();
}

/* ═══════════════════════════════════════════════════
   LAYOUT
═══════════════════════════════════════════════════ */
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  renderSidebar(); renderTopHeader(); navigateTo('dashboard');
}

function renderSidebar() {
  const s     = DB.getSettings();
  const stats = DB.getStats();
  const deroCount = DB.getStudents().filter(s => s.statut === 'derogation_attente').length;
  document.getElementById('sb-year').textContent = s.annee;
  const initials = (currentUser.prenom[0] || '') + (currentUser.nom[0] || '');
  document.getElementById('sb-user-avatar').textContent = initials.toUpperCase();
  document.getElementById('sb-user-name').textContent   = `${currentUser.prenom} ${currentUser.nom}`;
  document.getElementById('sb-user-role').textContent   = roleFr(currentUser.role);

  const badge  = n => n > 0 ? `<span class="nav-badge">${n}</span>` : '';
  const badgeR = n => n > 0 ? `<span class="nav-badge red">${n}</span>` : '';
  const isPriv  = currentUser.role !== 'aed';
  const isAdmin = currentUser.role === 'proviseur';

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
    ${isAdmin ? `
    <div class="nav-item" data-view="import" onclick="navigateTo('import')">
      <span class="nav-icon">📥</span> Import Fichiers élèves
    </div>` : ''}
    ${isPriv ? `
    <div class="nav-item" data-view="listes" onclick="navigateTo('listes')">
      <span class="nav-icon">🖨️</span> Listes par classe
    </div>
    <div class="nav-item" data-view="formations" onclick="navigateTo('formations')">
      <span class="nav-icon">🏫</span> Classes & Formations
    </div>
    <div class="nav-item" data-view="activity" onclick="navigateTo('activity')">
      <span class="nav-icon">📋</span> Journal d'activité
    </div>` : ''}
    ${isAdmin ? `
    <div class="nav-section">Administration</div>
    <div class="nav-item" data-view="settings" onclick="navigateTo('settings')">
      <span class="nav-icon">⚙️</span> Paramètres
    </div>` : ''}
  `;
  highlightNav(currentView);
}

function highlightNav(view) {
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.view === view));
}

function renderTopHeader() {
  const periode = DB.getPeriodeActive();
  const now = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  let pb = '';
  if (periode === 'preTour')      pb = `<span class="period-indicator pre-tour">🔵 Pré-Tour</span>`;
  else if (periode === 'premierTour') pb = `<span class="period-indicator premier-tour">🟣 1er Tour</span>`;
  else if (periode === 'secondTour')  pb = `<span class="period-indicator second-tour">🔴 2nd Tour</span>`;
  else                                pb = `<span class="period-indicator hors-periode">⚫ Hors période</span>`;
  document.getElementById('header-period').innerHTML = pb;
  document.getElementById('header-date').textContent = now;
}

/* ═══════════════════════════════════════════════════
   ROUTEUR
═══════════════════════════════════════════════════ */
function navigateTo(view, params = {}) {
  currentView = view; highlightNav(view); renderTopHeader(); renderSidebar();
  const titles = {
    dashboard:'📊 Tableau de bord', students:'👥 Liste des élèves',
    student:'🎓 Fiche élève', derogations:'⚠️ Dérogations',
    import:'📥 Import Fichiers élèves', formations:'🏫 Classes & Formations',
    listes:'🖨️ Listes par classe',
    activity:'📋 Journal d\'activité', settings:'⚙️ Paramètres', print:'🖨️ Fiche d\'inscription',
  };
  document.getElementById('page-title').textContent = titles[view] || view;
  const content = document.getElementById('page-content');
  content.innerHTML = '';
  switch(view) {
    case 'dashboard':   renderDashboard(content);              break;
    case 'students':    renderStudents(content);               break;
    case 'student':     renderStudentDetail(content, params.ine); break;
    case 'derogations': renderDerogations(content);            break;
    case 'import':
      if (currentUser.role !== 'proviseur') {
        content.innerHTML = `<div class="empty-state"><span class="empty-icon">🔒</span><p>Accès réservé au Proviseur</p></div>`;
      } else { renderImport(content); }
      break;
    case 'listes':
      if (currentUser.role !== 'proviseur' && currentUser.role !== 'secretaire') {
        content.innerHTML = `<div class="empty-state"><span class="empty-icon">🔒</span><p>Accès réservé au Proviseur et au Secrétariat</p></div>`;
      } else { renderClassLists(content); }
      break;
    case 'formations':  renderFormations(content);             break;
    case 'activity':    renderActivity(content);               break;
    case 'settings':    renderSettings(content);               break;
    case 'print':       renderPrint(content, params.ine);      break;
  }
}

/* ═══════════════════════════════════════════════════
   TABLEAU DE BORD
═══════════════════════════════════════════════════ */
function renderDashboard(el) {
  const stats  = DB.getStats();
  const s      = DB.getSettings();
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
      ${stats.redoublantsSansClasse > 0 ? `
      <div class="stat-card" style="border-left-color:#E65100;cursor:pointer" onclick="studentFilter.redoublant=true;studentFilter.search='';studentFilter.classe='';studentFilter.statut='';navigateTo('students')" title="Voir les redoublants sans classe">
        <span class="stat-icon">🔄</span>
        <div class="stat-value" style="color:#E65100">${stats.redoublantsSansClasse}</div>
        <div class="stat-label">Redoublant(s)</div>
        <div class="stat-sub">Classe à affecter</div>
      </div>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 340px;gap:1.5rem">
      <div>
        <div class="panel">
          <div class="panel-header">
            <h3>📋 Suivi des inscriptions par classe</h3>
            <button class="btn btn-outline btn-sm" onclick="navigateTo('students')">Voir tous les élèves</button>
          </div>
          <div style="overflow-x:auto">
            <table class="data-table" id="dashboard-table">
              <thead><tr>
                <th>Classe</th><th>Filière</th>
                <th style="text-align:center">Capacité</th>
                <th style="text-align:center">Inscrits</th>
                <th style="text-align:center">Déroga.</th>
                <th style="text-align:center">Restants</th>
                <th style="min-width:140px">Progression</th>
                <th style="text-align:center">%</th>
                <th></th>
              </tr></thead>
              <tbody id="dashboard-tbody"></tbody>
              <tfoot id="dashboard-tfoot"></tfoot>
            </table>
          </div>
        </div>
        <div class="panel mt-md">
          <div class="panel-header"><h3>📊 Inscriptions — 7 derniers jours</h3></div>
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
    </div>`;

  // Tableau par classe
  const tbody = document.getElementById('dashboard-tbody');
  const tfoot = document.getElementById('dashboard-tfoot');
  const byClasse = stats.byClasse;

  if (Object.keys(byClasse).length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><span class="empty-icon">📂</span><p>Aucune donnée. Importez le fichier AFFELNET.</p></div></td></tr>`;
  } else {
    const sorted = Object.entries(byClasse).sort((a, b) => {
      const fa = a[1].filiere || 'z'; const fb = b[1].filiere || 'z';
      return fa.localeCompare(fb) || a[0].localeCompare(b[0]);
    });
    tbody.innerHTML = sorted.map(([cl, d]) => {
      const ref   = d.capacite > 0 ? d.capacite : d.total;
      const pctCl = ref > 0 ? Math.round(d.inscrits / ref * 100) : 0;
      const nonInsc = d.total - d.inscrits - d.attente;
      const places  = d.capacite > 0 ? d.capacite - d.inscrits : '—';
      const placesColor = d.capacite > 0 && d.inscrits >= d.capacite ? '#B71C1C' : '#2D6A4F';
      const barColor = pctCl >= 80 ? '#B71C1C' : pctCl >= 50 ? '#40916C' : '#74C69D';
      return `
        <tr style="cursor:pointer" onclick="filterByClasse('${cl}')" title="Voir les élèves de ${cl}">
          <td><strong style="color:var(--green-900)">${esc(cl)}</strong></td>
          <td><span style="font-size:.75rem;background:#E8F5E9;color:#2D6A4F;padding:.15rem .5rem;border-radius:50px">${esc(d.filiere||'—')}</span></td>
          <td style="text-align:center;color:#777">${d.capacite > 0 ? d.capacite : '<span style="color:#CCC">—</span>'}</td>
          <td style="text-align:center"><span style="font-weight:700;color:var(--green-700)">${d.inscrits}</span></td>
          <td style="text-align:center">${d.attente > 0 ? `<span style="color:var(--status-attente);font-weight:700">${d.attente}</span>` : '<span style="color:#CCC">—</span>'}</td>
          <td style="text-align:center"><span style="color:${placesColor};font-weight:700">${places}</span></td>
          <td>
            <div style="background:#F0F7F2;border-radius:50px;height:10px;min-width:100px;overflow:hidden">
              <div style="width:${Math.min(pctCl,100)}%;height:100%;background:${barColor};border-radius:50px;transition:width .4s"></div>
            </div>
          </td>
          <td style="text-align:center;font-weight:700;color:${barColor}">${pctCl}%</td>
          <td><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();filterByClasse('${cl}')">→</button></td>
        </tr>`;
    }).join('');

    const totCap  = Object.values(byClasse).reduce((s, d) => s + (d.capacite||0), 0);
    const totInsc = Object.values(byClasse).reduce((s, d) => s + d.inscrits, 0);
    const totAtt  = Object.values(byClasse).reduce((s, d) => s + d.attente, 0);
    const totTot  = Object.values(byClasse).reduce((s, d) => s + d.total, 0);
    const totRef  = totCap > 0 ? totCap - totInsc : '—';
    const totPct  = totTot > 0 ? Math.round(totInsc / totTot * 100) : 0;
    tfoot.innerHTML = `
      <tr style="background:var(--green-50);font-weight:700;border-top:2px solid #D0E8D8">
        <td style="padding:.7rem 1rem">TOTAL</td><td></td>
        <td style="text-align:center;padding:.7rem">${totCap > 0 ? totCap : '—'}</td>
        <td style="text-align:center;padding:.7rem;color:var(--green-700)">${totInsc}</td>
        <td style="text-align:center;padding:.7rem;color:var(--status-attente)">${totAtt || '—'}</td>
        <td style="text-align:center;padding:.7rem">${totRef}</td>
        <td style="padding:.7rem">
          <div style="background:#F0F7F2;border-radius:50px;height:10px;overflow:hidden">
            <div style="width:${totPct}%;height:100%;background:var(--green-700);border-radius:50px"></div>
          </div>
        </td>
        <td style="text-align:center;padding:.7rem;color:var(--green-700)">${totPct}%</td><td></td>
      </tr>`;
  }

  // Périodes
  const pp = document.getElementById('periods-panel');
  const { periodes } = s;
  const fd = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
  const pRow = (label, color, p, key) => {
    const isAct = periode === key;
    return `<div style="padding:.6rem 0;border-bottom:1px solid #F0F7F2;display:flex;align-items:center;gap:.7rem">
      <span style="width:12px;height:12px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:${isAct?'0 0 0 3px '+color+'55':'none'}"></span>
      <div style="flex:1">
        <div style="font-weight:600;font-size:.85rem;color:${color}">${label} ${isAct?`<span style="font-size:.72rem;background:${color};color:#fff;padding:.1rem .4rem;border-radius:50px">EN COURS</span>`:''}
        </div>
        <div style="font-size:.78rem;color:#777;margin-top:.1rem">${fd(p.debut)} → ${fd(p.fin)}</div>
      </div></div>`;
  };
  pp.innerHTML = `
    ${pRow('Pré-Tour','#1565C0',periodes.preTour,'preTour')}
    ${pRow('1er Tour','#6A1B9A',periodes.premierTour,'premierTour')}
    ${pRow('2nd Tour','#880E4F',periodes.secondTour,'secondTour')}
    ${currentUser.role==='proviseur'?`<div style="margin-top:.8rem"><button class="btn btn-outline btn-sm w-full" onclick="navigateTo('settings')">⚙️ Configurer les périodes</button></div>`:''}`;

  // Timeline
  const tl = document.getElementById('timeline-recent');
  const activity = DB.getActivity().slice(0, 8);
  tl.innerHTML = !activity.length
    ? `<div class="empty-state" style="padding:1.5rem 0"><span>Aucune activité récente.</span></div>`
    : activity.map(a => `<div class="timeline-item">
        <div class="timeline-dot">${activityIcon(a.type)}</div>
        <div class="timeline-content"><h4>${a.label}</h4><p>${a.detail||''}</p></div>
        <span class="timeline-time">${timeAgo(a.ts)}</span>
      </div>`).join('');

  // Graphique
  const vals = Object.values(stats.byDay);
  const keys = Object.keys(stats.byDay);
  const maxV = Math.max(...vals, 1);
  document.getElementById('day-bars').innerHTML = vals.map((v,i) =>
    `<div class="day-bar" style="height:${Math.max(8,Math.round(v/maxV*72))}px" title="${keys[i]}: ${v}"></div>`).join('');
  document.getElementById('day-labels').innerHTML = keys.map(k =>
    `<span style="flex:1;text-align:center">${k}</span>`).join('');
}

function filterByClasse(cl) {
  studentFilter.classe = cl; studentFilter.search = ''; studentFilter.statut = '';
  navigateTo('students');
}

/* ═══════════════════════════════════════════════════
   LISTE ÉLÈVES
═══════════════════════════════════════════════════ */
function renderStudents(el) {
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
        <select class="filter-select" onchange="studentFilter.statut=this.value;studentFilter.redoublant=false;renderStudentTable()">
          <option value="">Tous les statuts</option>
          <option value="non_inscrit"        ${studentFilter.statut==='non_inscrit'?'selected':''}>Non inscrit</option>
          <option value="inscrit"            ${studentFilter.statut==='inscrit'?'selected':''}>Inscrit</option>
          <option value="hors_periode"       ${studentFilter.statut==='hors_periode'?'selected':''}>Inscrit hors période</option>
          <option value="derogation_attente" ${studentFilter.statut==='derogation_attente'?'selected':''}>Dérogation en attente</option>
          <option value="derogation_valide"  ${studentFilter.statut==='derogation_valide'?'selected':''}>Dérogation validée</option>
          <option value="derogation_refuse"  ${studentFilter.statut==='derogation_refuse'?'selected':''}>Dérogation refusée</option>
        </select>
        <button class="btn btn-sm ${studentFilter.source==='preTour' ? 'btn-primary' : 'btn-outline'}"
          onclick="studentFilter.source=studentFilter.source==='preTour'?'':'preTour';studentFilter.redoublant=false;renderStudentTable()"
          style="white-space:nowrap;background:${studentFilter.source==='preTour'?'#1565C0':''}">
          🔵 Pré-Tour${studentFilter.source==='preTour' ? ' ✕' : ''}
        </button>
        <button class="btn btn-sm ${studentFilter.source==='premierTour' ? 'btn-primary' : 'btn-outline'}"
          onclick="studentFilter.source=studentFilter.source==='premierTour'?'':'premierTour';studentFilter.redoublant=false;renderStudentTable()"
          style="white-space:nowrap;background:${studentFilter.source==='premierTour'?'#6A1B9A':''}">
          🟣 Tour 1${studentFilter.source==='premierTour' ? ' ✕' : ''}
        </button>
        <button class="btn btn-sm ${studentFilter.source==='secondTour' ? 'btn-primary' : 'btn-outline'}"
          onclick="studentFilter.source=studentFilter.source==='secondTour'?'':'secondTour';studentFilter.redoublant=false;renderStudentTable()"
          style="white-space:nowrap;background:${studentFilter.source==='secondTour'?'#B71C1C':''}">
          🔴 Tour 2${studentFilter.source==='secondTour' ? ' ✕' : ''}
        </button>
        <button class="btn btn-sm ${studentFilter.source==='orientation' ? 'btn-primary' : 'btn-outline'}"
          onclick="studentFilter.source=studentFilter.source==='orientation'?'':'orientation';studentFilter.redoublant=false;renderStudentTable()"
          style="white-space:nowrap">
          🎓 Orientation${studentFilter.source==='orientation' ? ' ✕' : ''}
        </button>
        <button class="btn btn-sm ${studentFilter.redoublant ? 'btn-primary' : 'btn-outline'}"
          onclick="studentFilter.redoublant=!studentFilter.redoublant;studentFilter.statut='';renderStudentTable()"
          style="white-space:nowrap">
          🔄 Redoublants${studentFilter.redoublant ? ' ✕' : ''}
        </button>
        <div style="flex:1"></div>
        <span id="student-count" style="font-size:.82rem;color:#777"></span>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr>
            <th>Nom</th><th>Prénom</th><th>INE</th>
            <th>Classe affectée</th><th>LV1</th><th>Statut</th>
            <th>Date inscription</th><th>Actions</th>
          </tr></thead>
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
    const matchS = !q || (s.nom||'').toLowerCase().includes(q) || (s.prenom||'').toLowerCase().includes(q) || (s.ine||'').toLowerCase().includes(q);
    const matchC = !studentFilter.classe || s.classeAffectee === studentFilter.classe;
    const matchT = !studentFilter.statut || s.statut === studentFilter.statut;
    const matchR = !studentFilter.redoublant || (s.redoublant && !s.classeAffectee);
    const matchSrc = !studentFilter.source || (() => {
      if (studentFilter.source === 'orientation') return s.source === 'orientation';
      // Filtre par période AFFELNET
      const ps = s.periodesSource || (s.periodeSource ? [s.periodeSource] : []);
      return ps.includes(studentFilter.source);
    })();
    return matchS && matchC && matchT && matchR && matchSrc;
  }).sort((a,b) => {
    // Redoublants sans classe en premier
    const ra = (a.redoublant && !a.classeAffectee) ? 0 : 1;
    const rb = (b.redoublant && !b.classeAffectee) ? 0 : 1;
    return ra - rb || (a.nom||'').localeCompare(b.nom||'');
  });

  const count = document.getElementById('student-count');
  if (count) count.textContent = `${filtered.length} / ${all.length} élève(s)`;
  const tbody = document.getElementById('students-tbody');
  if (!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="empty-icon">🔍</span><p>Aucun élève trouvé</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(s => {
    const isRedoSansClasse = s.redoublant && !s.classeAffectee;
    return `
    <tr style="${isRedoSansClasse ? 'background:#FFF3E0' : ''}">
      <td class="col-nom">
        ${esc(s.nom)}
        ${s.source === 'affelnet'    ? periodeBadgeInline(s.periodeSource) : ''}
        ${s.source === 'orientation' ? `<span style="display:inline-block;margin-left:.4rem;font-size:.7rem;background:#2D6A4F;color:#fff;padding:.1rem .4rem;border-radius:50px;vertical-align:middle">🎓 Orientation</span>` : ''}
        ${s.redoublant ? `<span style="display:inline-block;margin-left:.4rem;font-size:.7rem;background:#E65100;color:#fff;padding:.1rem .4rem;border-radius:50px;vertical-align:middle">🔄 Redoublant</span>` : ''}
      </td>
      <td>${esc(s.prenom)}</td>
      <td style="font-family:monospace;font-size:.78rem;color:#888">${esc(s.ine)}</td>
      <td>
        ${isRedoSansClasse
          ? `<span style="color:#E65100;font-weight:700">⚠️ À affecter</span>`
          : `<strong>${esc(s.classeAffectee||'—')}</strong>`}
      </td>
      <td style="font-size:.82rem">${esc(s.lv1||'—')}</td>
      <td>${statusBadge(s.statut)}</td>
      <td style="font-size:.82rem;color:#777">${s.dateInscription ? new Date(s.dateInscription).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
      <td>
        <div class="flex gap-sm">
          <button class="btn btn-outline btn-sm" onclick="navigateTo('student',{ine:'${s.ine}'})">Voir</button>
          ${isRedoSansClasse && currentUser.role === 'proviseur'
            ? `<button class="btn btn-sm" style="background:#E65100;color:#fff" onclick="openEditStudentModal('${s.ine}')">Affecter classe</button>`
            : canEnrollStudent(s) ? `<button class="btn btn-primary btn-sm" onclick="openEnrollModal('${s.ine}')">Inscrire</button>` : ''}
          ${s.statut === 'non_inscrit' && currentUser.role === 'aed' && s.source !== 'orientation' && !canEnrollStudent(s) ? `<button class="btn btn-sm" style="background:#FFF3E0;color:#E65100" onclick="openDeroModal('${s.ine}')">Dérogation</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════
   FICHE ÉLÈVE
═══════════════════════════════════════════════════ */
function renderStudentDetail(el, ine) {
  const s = DB.getStudent(ine);
  if (!s) { el.innerHTML = `<div class="empty-state"><span class="empty-icon">❌</span><p>Élève introuvable</p></div>`; return; }
  const canEnroll = canEnrollStudent(s);
  const isPriv    = currentUser.role !== 'aed';
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
          <div style="margin-left:auto;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
            ${s.source === 'orientation' ? `<span class="badge" style="background:#E8F5E9;color:#2D6A4F;border:1px solid #A8D5B5">🎓 Élève orientation</span>` : ''}
            ${s.source === 'affelnet' ? periodeBadgeInline(s.periodeSource) : ''}
            ${statusBadge(s.statut)} ${periodeBadge(s.periode)}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
          <div>
            <div class="panel-header" style="border-radius:8px 8px 0 0;margin-bottom:0"><h3>Identification</h3></div>
            <div class="info-grid" style="border:1px solid #E0EDE5;border-top:none;border-radius:0 0 8px 8px;padding:1rem">
              <div class="info-item"><div class="info-label">Nom</div><div class="info-value">${esc(s.nom)}</div></div>
              <div class="info-item"><div class="info-label">Prénom</div><div class="info-value">${esc(s.prenom)}</div></div>
              <div class="info-item"><div class="info-label">INE</div><div class="info-value" style="font-family:monospace">${esc(s.ine)}</div></div>
            </div>
          </div>
          <div>
            <div class="panel-header" style="border-radius:8px 8px 0 0;margin-bottom:0"><h3>Affectation AFFELNET</h3></div>
            <div class="info-grid" style="border:1px solid #E0EDE5;border-top:none;border-radius:0 0 8px 8px;padding:1rem">
              <div class="info-item"><div class="info-label">Formation</div><div class="info-value">${esc(s.libelleFormation||'—')}</div></div>
              <div class="info-item"><div class="info-label">Classe affectée</div><div class="info-value"><strong>${esc(s.classeAffectee||'—')}</strong></div></div>
              ${s.source === 'affelnet' ? `
              <div class="info-item" style="grid-column:1/-1"><div class="info-label">Période(s) d'inscription</div><div class="info-value">${
                (() => {
                  const ps = s.periodesSource || (s.periodeSource ? [s.periodeSource] : []);
                  const bgMap = { preTour:'#BBDEFB:#1565C0:🔵 Pré-Tour', premierTour:'#E1BEE7:#6A1B9A:🟣 Tour 1', secondTour:'#FFCDD2:#B71C1C:🔴 Tour 2' };
                  if (!ps.length) return '<span style="color:#999">—</span>';
                  return ps.map(p => {
                    const [bg,col,lbl] = (bgMap[p]||'#EEE:#555:'+p).split(':');
                    return `<span style="display:inline-block;background:${bg};color:${col};border:1px solid ${col};padding:.15rem .6rem;border-radius:50px;font-size:.8rem;font-weight:600;margin:.1rem">${lbl}</span>`;
                  }).join(' ');
                })()
              }</div></div>` : ''}
              <div class="info-item"><div class="info-label">LV1</div><div class="info-value">${esc(s.lv1||'—')}</div></div>
              <div class="info-item"><div class="info-label">LV2</div><div class="info-value">${esc(s.lv2||'—')}</div></div>
              <div class="info-item"><div class="info-label">Étab. d'origine</div><div class="info-value">${esc(s.etablissementOrigine||'—')}</div></div>
              <div class="info-item"><div class="info-label">Rang</div><div class="info-value">${s.rang||'—'}</div></div>
            </div>
          </div>
        </div>
        ${(s.redoublant && !s.classeAffectee) ? `
        <div style="margin-top:1rem;background:#FFF3E0;border:2px solid #E65100;border-radius:var(--radius);padding:1rem;display:flex;align-items:center;gap:1rem">
          <span style="font-size:2rem">🔄</span>
          <div style="flex:1">
            <div style="font-weight:700;color:#E65100;font-size:1rem">Redoublant — classe de redoublement à affecter</div>
            <div style="font-size:.85rem;color:#555;margin-top:.2rem">Cet élève redouble. Le Proviseur doit sélectionner manuellement la classe où il sera affecté.</div>
          </div>
          ${isAdmin ? `<button class="btn btn-sm" style="background:#E65100;color:#fff;white-space:nowrap" onclick="openEditStudentModal('${s.ine}')">Affecter la classe →</button>` : ''}
        </div>` : ''}
        ${(s.classeActuelle || s.formationSouhaitee || s.sexe || (s.specialites && s.specialites.length)) ? `
        <div style="margin-top:1rem;background:#F3E5F5;border:1px solid #E1BEE7;border-radius:var(--radius);padding:1rem">
          <div style="font-weight:700;color:#6A1B9A;margin-bottom:.6rem">🎓 Données d'orientation</div>
          <div class="info-grid">
            ${s.sexe ? `<div class="info-item"><div class="info-label">Sexe</div><div class="info-value">${esc(s.sexe)}</div></div>` : ''}
            ${s.redoublant ? `<div class="info-item"><div class="info-label">Redoublant</div><div class="info-value"><span style="color:#E65100;font-weight:600">Oui</span></div></div>` : ''}
            ${s.classeActuelle ? `<div class="info-item"><div class="info-label">Classe actuelle</div><div class="info-value">${esc(s.classeActuelle)}</div></div>` : ''}
            ${s.formationSouhaitee ? `<div class="info-item"><div class="info-label">Orientation souhaitée</div><div class="info-value">${esc(s.formationSouhaitee)}</div></div>` : ''}
            ${s.classeAffecteeOrientation ? `<div class="info-item"><div class="info-label">Classe cible orientation</div><div class="info-value"><strong>${esc(s.classeAffecteeOrientation)}</strong></div></div>` : ''}
            ${(s.specialites && s.specialites.length) ? `<div class="info-item" style="grid-column:1/-1"><div class="info-label">Spécialités</div><div class="info-value">${s.specialites.map(sp => `<span style="display:inline-block;background:#EDE7F6;color:#6A1B9A;padding:.15rem .5rem;border-radius:50px;font-size:.8rem;margin:.1rem">${esc(sp)}</span>`).join(' ')}</div></div>` : ''}
          </div>
        </div>` : ''}
        ${s.statut === 'inscrit' || s.statut === 'hors_periode' ? `
        <div style="margin-top:1rem;background:var(--green-50);border:1px solid #D0E8D8;border-radius:var(--radius);padding:1rem">
          <div style="font-weight:700;color:var(--green-800);margin-bottom:.5rem">✅ Inscription enregistrée</div>
          <div class="info-grid">
            <div class="info-item"><div class="info-label">Date et heure</div><div class="info-value">${s.dateInscription?new Date(s.dateInscription).toLocaleString('fr-FR'):'—'}</div></div>
            <div class="info-item"><div class="info-label">Enregistré par</div><div class="info-value">${esc(s.inscritPar||'—')}</div></div>
            <div class="info-item"><div class="info-label">Période</div><div class="info-value">${periodeFr(s.periode)}</div></div>
          </div>
        </div>` : ''}
        ${s.statut==='derogation_attente' ? `<div style="margin-top:1rem;background:#FFF8E1;border:1px solid #FFE082;border-radius:var(--radius);padding:1rem"><div style="font-weight:700;color:#E65100;margin-bottom:.3rem">⚠️ Dérogation en attente</div><div style="font-size:.88rem;color:#555">Demandée par : ${esc(s.deroDemandeePar||'—')} le ${s.deroDate?new Date(s.deroDate).toLocaleDateString('fr-FR'):'—'}</div></div>` : ''}
        ${s.statut==='derogation_refuse' ? `<div style="margin-top:1rem;background:#FFEBEE;border:1px solid #FFCDD2;border-radius:var(--radius);padding:1rem"><div style="font-weight:700;color:#B71C1C;margin-bottom:.3rem">❌ Dérogation refusée</div><div style="font-size:.88rem;color:#555">Motif : ${esc(s.deroRefusMotif||'—')}</div></div>` : ''}
        <div class="action-bar no-print">
          ${canEnroll ? `<button class="btn btn-primary btn-lg" onclick="openEnrollModal('${s.ine}')">✅ Inscrire l'élève</button>` : ''}
          ${s.statut==='non_inscrit' && !DB.getPeriodeActive() && currentUser.role==='aed' && s.source!=='orientation' ? `<button class="btn btn-lg" style="background:#FFF3E0;color:#E65100" onclick="openDeroModal('${s.ine}')">⚠️ Demander dérogation</button>` : ''}
          ${s.statut==='derogation_attente' && isPriv ? `
            <button class="btn btn-primary btn-lg" onclick="validateDero('${s.ine}')">✅ Valider la dérogation</button>
            <button class="btn btn-red btn-lg" onclick="openRefuseDeroModal('${s.ine}')">❌ Refuser</button>` : ''}
          ${(s.statut==='inscrit'||s.statut==='hors_periode') ? `<button class="btn btn-gold btn-lg" onclick="navigateTo('print',{ine:'${s.ine}'})">🖨️ Imprimer fiche</button>` : ''}
          ${isPriv ? `<button class="btn btn-outline btn-sm" onclick="openEditStudentModal('${s.ine}')">✏️ Modifier</button>` : ''}
          ${isAdmin && s.statut !== 'non_inscrit' ? `<button class="btn btn-outline btn-sm" onclick="annulerInscription('${s.ine}')">↩️ Annuler inscription</button>` : ''}
        </div>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════
   DÉROGATIONS
═══════════════════════════════════════════════════ */
function renderDerogations(el) {
  const all    = DB.getStudents().filter(s => ['derogation_attente','derogation_valide','derogation_refuse'].includes(s.statut));
  const isPriv = currentUser.role !== 'aed';
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

  const filtered = all.filter(s => deroFilter === 'tout' || s.statut === 'derogation_' + deroFilter);
  const dl = document.getElementById('dero-list');
  if (!filtered.length) { dl.innerHTML = `<div class="empty-state"><span class="empty-icon">✅</span><p>Aucune dérogation dans cette catégorie</p></div>`; return; }
  dl.innerHTML = filtered.map(s => {
    const cc = s.statut === 'derogation_valide' ? 'validated' : s.statut === 'derogation_refuse' ? 'refused' : '';
    return `<div class="dero-card ${cc}">
      <div class="dero-header">
        <div><div class="dero-name">${esc(s.nom)} ${esc(s.prenom)}</div><div class="dero-class">${esc(s.classeAffectee||'')} — INE: ${esc(s.ine)}</div></div>
        <div>${statusBadge(s.statut)}</div>
      </div>
      <div style="font-size:.82rem;color:#666">Demandée le ${s.deroDate?new Date(s.deroDate).toLocaleDateString('fr-FR'):'—'} par ${esc(s.deroDemandeePar||'—')}</div>
      ${s.deroRefusMotif?`<div style="margin-top:.4rem;font-size:.82rem;color:#B71C1C">Motif refus : ${esc(s.deroRefusMotif)}</div>`:''}
      <div class="dero-footer">
        <button class="btn btn-outline btn-sm" onclick="navigateTo('student',{ine:'${s.ine}'})">Voir fiche</button>
        ${s.statut==='derogation_attente' && isPriv ? `
          <button class="btn btn-primary btn-sm" onclick="validateDero('${s.ine}')">✅ Valider</button>
          <button class="btn btn-red btn-sm" onclick="openRefuseDeroModal('${s.ine}')">❌ Refuser</button>` : ''}
        ${s.statut==='derogation_valide' ? `<button class="btn btn-gold btn-sm" onclick="enrollFromDero('${s.ine}')">✅ Inscrire maintenant</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════
   LISTES PAR CLASSE (impression)
═══════════════════════════════════════════════════ */
function renderClassLists(el) {
  const students  = DB.getStudents();
  const classes   = DB.getClasses();
  const settings  = DB.getSettings();
  const printDate = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Grouper les élèves par classe affectée, trier par nom
  const byClasse = {};
  students.forEach(s => {
    const cl = s.classeAffectee || '__inconnu__';
    if (!byClasse[cl]) byClasse[cl] = [];
    byClasse[cl].push(s);
  });
  Object.values(byClasse).forEach(arr => arr.sort((a, b) => (a.nom||'').localeCompare(b.nom||'')));

  // Trier les classes (filière puis code)
  const sorted = Object.entries(byClasse)
    .filter(([cl]) => cl !== '__inconnu__')
    .sort(([a], [b]) => {
      const fa = (classes[a] || {}).filiere || 'z';
      const fb = (classes[b] || {}).filiere || 'z';
      return fa.localeCompare(fb) || a.localeCompare(b);
    });

  // Élèves sans classe (si existants)
  const sansClasse = byClasse['__inconnu__'] || [];

  // Liste des classes pour le filtre
  const classeOptions = sorted.map(([cl]) => `<option value="${esc(cl)}">${esc(cl)}</option>`).join('');

  const periodeColors = { preTour:'#1565C0', premierTour:'#6A1B9A', secondTour:'#B71C1C' };
  const periodeLabels = { preTour:'Pré-Tour', premierTour:'Tour 1', secondTour:'Tour 2', orientation:'Orien.' };

  // Génère le bloc imprimable pour une classe
  const classBlock = (code, eleves, first) => {
    const cfg      = classes[code] || {};
    const total    = eleves.length;
    const inscrits = eleves.filter(s => s.statut === 'inscrit' || s.statut === 'hors_periode').length;
    const attente  = eleves.filter(s => s.statut === 'derogation_attente').length;
    const nonInsc  = total - inscrits - attente;
    const pct      = total > 0 ? Math.round(inscrits / total * 100) : 0;
    const capacite = cfg.capacite || 0;
    const places   = capacite > 0 ? capacite - inscrits : '—';

    const rows = eleves.map((s, i) => {
      const isInscrit = s.statut === 'inscrit' || s.statut === 'hors_periode';
      const isHors    = s.statut === 'hors_periode';
      const isAttente = s.statut === 'derogation_attente';
      const isRefuse  = s.statut === 'derogation_refuse';

      const statutIcon = isInscrit
        ? `<span style="color:#1B5E20;font-weight:700">✅ Inscrit${isHors ? ' *' : ''}</span>`
        : isAttente ? `<span style="color:#E65100;font-weight:700">⏳ Déroga.</span>`
        : isRefuse  ? `<span style="color:#B71C1C;font-weight:700">❌ Refusé</span>`
        : `<span style="color:#555">☐ Non inscrit</span>`;

      const periodeLabel = s.source === 'affelnet'
        ? (periodeLabels[s.periodeSource] || 'AFFELNET')
        : s.source === 'orientation' ? 'Orien.' : '—';
      const periodeColor = s.source === 'affelnet'
        ? (periodeColors[s.periodeSource] || '#455A64')
        : '#2D6A4F';

      const dateInsc = s.dateInscription
        ? new Date(s.dateInscription).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' })
        : '—';

      const bg = isInscrit ? '#F1F8F3' : isAttente ? '#FFF8F0' : isRefuse ? '#FFF0F0' : '#fff';
      return `
        <tr style="background:${bg}">
          <td style="text-align:center;color:#999;font-size:.75rem">${i + 1}</td>
          <td style="font-weight:600">${esc(s.nom)}</td>
          <td>${esc(s.prenom)}</td>
          <td style="font-family:monospace;font-size:.75rem;color:#888">${esc(s.ine || '—')}</td>
          <td style="text-align:center">
            <span style="display:inline-block;background:${periodeColor};color:#fff;padding:.05rem .35rem;border-radius:50px;font-size:.68rem;font-weight:600">${periodeLabel}</span>
          </td>
          <td>${statutIcon}</td>
          <td style="color:#777;font-size:.75rem">${dateInsc}</td>
          <td style="font-size:.75rem;color:#888">${esc(s.etablissementOrigine || s.classeActuelle || '—')}</td>
        </tr>`;
    }).join('');

    return `
    <div class="classe-print-block${first ? ' first-block' : ''}" data-classe="${esc(code)}">
      <!-- En-tête de classe -->
      <div class="liste-header">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.5rem">
          <div>
            <div class="liste-school">${esc(settings.etablissement || '')} — ${esc(settings.ville || '')}</div>
            <div class="liste-title">${esc(code)}${cfg.libelle ? ` — ${esc(cfg.libelle)}` : ''}</div>
            <div class="liste-sub">${cfg.filiere ? `Filière : ${esc(cfg.filiere)}` : ''} ${cfg.capacite ? `· Capacité : ${cfg.capacite}` : ''}</div>
          </div>
          <div style="text-align:right">
            <div class="liste-annee">Année scolaire ${esc(settings.annee || '')}</div>
            <div class="liste-date">Édité le ${printDate}</div>
          </div>
        </div>
        <!-- Bande de stats -->
        <div class="liste-stats-bar">
          <div class="liste-stat"><span class="lst-n">${total}</span><span class="lst-l">Élèves</span></div>
          <div class="liste-stat ok"><span class="lst-n">${inscrits}</span><span class="lst-l">Inscrits</span></div>
          <div class="liste-stat warn"><span class="lst-n">${nonInsc}</span><span class="lst-l">Non inscrits</span></div>
          ${attente > 0 ? `<div class="liste-stat att"><span class="lst-n">${attente}</span><span class="lst-l">Dérogations</span></div>` : ''}
          ${capacite > 0 ? `<div class="liste-stat cap"><span class="lst-n">${places}</span><span class="lst-l">Places libres</span></div>` : ''}
          <div class="liste-stat pct"><span class="lst-n">${pct}%</span><span class="lst-l">Taux inscription</span></div>
        </div>
      </div>

      <!-- Tableau élèves -->
      <table class="liste-table">
        <thead>
          <tr>
            <th style="width:2rem">N°</th>
            <th>Nom</th>
            <th>Prénom</th>
            <th>INE</th>
            <th style="text-align:center;width:3.5rem">Période</th>
            <th style="width:7rem">Statut</th>
            <th style="width:4.5rem">Date inscr.</th>
            <th>Établ. origine / Classe actuelle</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <!-- Pied de page -->
      <div class="liste-footer">
        <span>${inscrits} inscrit(s) sur ${total} élève(s)${capacite > 0 ? ` — Capacité : ${capacite}` : ''}${eleves.some(s => s.statut === 'hors_periode') ? ' · * Hors période' : ''}</span>
        <span>Page <span class="page-num"></span></span>
      </div>
    </div>`;
  };

  // Rendu complet
  if (sorted.length === 0 && sansClasse.length === 0) {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">📂</span><p>Aucun élève importé. Importez d'abord un fichier AFFELNET ou Orientation.</p></div>`;
    return;
  }

  el.innerHTML = `
    <!-- Barre d'actions (hors impression) -->
    <div class="no-print" style="display:flex;gap:.75rem;align-items:center;margin-bottom:1.2rem;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="window.print()" style="display:flex;align-items:center;gap:.4rem">
        🖨️ Imprimer toutes les classes
      </button>
      <select id="print-classe-select" class="filter-select" onchange="filterListeImpression(this.value)" style="min-width:180px">
        <option value="">Toutes les classes</option>
        ${classeOptions}
      </select>
      <button class="btn btn-outline" onclick="filterListeImpression('')">Réinitialiser</button>
      <span style="font-size:.82rem;color:#777;margin-left:.5rem">${sorted.length} classe(s) · ${students.length} élève(s)</span>
    </div>

    <!-- Styles dédiés impression -->
    <style>
      .classe-print-block { margin-bottom: 0; }
      .first-block { page-break-before: auto !important; }
      @media print {
        #sidebar, #top-header, .no-print { display: none !important; }
        #main-content { margin: 0 !important; padding: 0 !important; }
        #page-content { padding: 0 !important; }
        body { background: #fff !important; }
        .classe-print-block {
          page-break-before: always;
          page-break-inside: avoid;
          break-before: page;
          break-inside: avoid;
          padding: .4cm .6cm .3cm;
          box-sizing: border-box;
        }
        .first-block { page-break-before: auto !important; break-before: auto !important; }
        .classe-print-block.hidden-for-print { display: none !important; }
      }
      @media screen {
        .classe-print-block {
          background: #fff;
          border: 1px solid #D0E8D8;
          border-radius: 10px;
          padding: 1.2rem 1.4rem 1rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 2px 8px rgba(0,0,0,.06);
        }
      }
      .liste-header { margin-bottom: .6rem; }
      .liste-school { font-size: .78rem; color: #555; text-transform: uppercase; letter-spacing: .03em; }
      .liste-title  { font-size: 1.15rem; font-weight: 800; color: #1B4332; margin: .15rem 0; }
      .liste-sub    { font-size: .8rem; color: #666; }
      .liste-annee  { font-size: .82rem; font-weight: 600; color: #2D6A4F; }
      .liste-date   { font-size: .74rem; color: #999; }
      .liste-stats-bar {
        display: flex; gap: .8rem; flex-wrap: wrap;
        background: #F0F7F2; border-radius: 6px;
        padding: .4rem .8rem; margin: .5rem 0;
      }
      .liste-stat   { display: flex; flex-direction: column; align-items: center; min-width: 3.5rem; }
      .lst-n        { font-size: 1rem; font-weight: 800; color: #1B4332; line-height: 1; }
      .lst-l        { font-size: .65rem; color: #666; text-transform: uppercase; letter-spacing: .02em; }
      .liste-stat.ok  .lst-n { color: #1B5E20; }
      .liste-stat.warn .lst-n { color: #555; }
      .liste-stat.att .lst-n { color: #E65100; }
      .liste-stat.cap .lst-n { color: #1565C0; }
      .liste-stat.pct .lst-n { color: #6A1B9A; }
      .liste-table {
        width: 100%; border-collapse: collapse;
        font-size: .78rem; margin-bottom: .4rem;
      }
      .liste-table th {
        background: #1B4332; color: #fff;
        padding: .25rem .4rem; text-align: left;
        font-size: .72rem; font-weight: 600;
        border: none;
      }
      .liste-table td {
        padding: .22rem .4rem;
        border-bottom: 1px solid #E8F0EA;
        vertical-align: middle;
      }
      .liste-table tbody tr:last-child td { border-bottom: none; }
      .liste-footer {
        display: flex; justify-content: space-between;
        font-size: .7rem; color: #999;
        border-top: 1px solid #D0E8D8;
        padding-top: .3rem; margin-top: .3rem;
      }
    </style>

    <!-- Blocs par classe -->
    <div id="liste-blocks">
      ${sorted.map(([cl, eleves], i) => classBlock(cl, eleves, i === 0)).join('')}
    </div>
  `;
}

// Filtre pour n'afficher / imprimer qu'une seule classe
function filterListeImpression(code) {
  document.querySelectorAll('.classe-print-block').forEach(block => {
    if (!code || block.dataset.classe === code) {
      block.classList.remove('hidden-for-print');
      block.style.display = '';
    } else {
      block.classList.add('hidden-for-print');
      block.style.display = 'none';
    }
  });
  const sel = document.getElementById('print-classe-select');
  if (sel && sel.value !== code) sel.value = code;
}

/* ═══════════════════════════════════════════════════
   CLASSES & FORMATIONS
═══════════════════════════════════════════════════ */
function renderFormations(el) {
  if (currentUser.role === 'aed') {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">🔒</span><p>Accès réservé à la Direction et au Secrétariat</p></div>`;
    return;
  }

  const formations = DB.getFormations() || [];
  const classes    = DB.getClasses();
  const isAdmin    = currentUser.role === 'proviseur';

  // Grouper les libellés par classe cible
  const grouped = {};
  formations.forEach(f => {
    if (!grouped[f.classeAffectee]) grouped[f.classeAffectee] = [];
    grouped[f.classeAffectee].push(f.libelleAffelnet);
  });
  // Ajouter classes sans libellé
  Object.keys(classes).forEach(code => { if (!grouped[code]) grouped[code] = []; });

  const filieres = [...new Set(Object.values(classes).map(c => c.filiere).filter(Boolean))].sort();

  el.innerHTML = `
    <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center">
      <div class="search-box" style="flex:1;min-width:200px">
        <span class="icon">🔍</span>
        <input type="text" placeholder="Rechercher une classe…"
          oninput="formationFilter=this.value;renderFormationTable()"
          value="${formationFilter}">
      </div>
      ${isAdmin ? `
      <button class="btn btn-primary" onclick="openClassModal(null)">+ Ajouter une classe</button>
      <button class="btn btn-outline" onclick="openAddFormationModal()">+ Ajouter un libellé</button>` : ''}
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>🏫 Tableau des classes</h3>
        <span style="font-size:.82rem;color:#777">${Object.keys(grouped).length} classe(s) — ${formations.length} libellé(s)</span>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table" id="formation-table">
          <thead><tr>
            <th>Code classe</th>
            <th>Libellé / Description</th>
            <th>Filière</th>
            <th style="text-align:center">Capacité</th>
            <th>Libellés AFFELNET associés</th>
            ${isAdmin ? '<th>Actions</th>' : ''}
          </tr></thead>
          <tbody id="formation-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="panel mt-md">
      <div class="panel-header"><h3>ℹ️ À propos des formations</h3></div>
      <div class="panel-body" style="font-size:.85rem;color:#555;line-height:1.6">
        <p>• <strong>Code classe</strong> : identifiant court utilisé dans l'application (ex : <code>1CAP BOU</code>).</p>
        <p>• <strong>Libellés AFFELNET</strong> : termes exacts du fichier d'affectation ministériel. Un même code peut avoir plusieurs libellés (ex. avec/sans priorité).</p>
        <p>• <strong>Capacité</strong> : nombre maximum de places. Apparaît dans le tableau de bord pour mesurer le taux de remplissage.</p>
        <p style="margin-top:.5rem">Pour importer en masse, utilisez la page <a href="#" onclick="navigateTo('import');return false">Import Fichiers élèves</a>.</p>
      </div>
    </div>`;

  renderFormationTable();
}

function renderFormationTable() {
  const formations = DB.getFormations() || [];
  const classes    = DB.getClasses();
  const isAdmin    = currentUser.role === 'proviseur';
  const q          = (formationFilter || '').toLowerCase();

  const grouped = {};
  formations.forEach(f => {
    if (!grouped[f.classeAffectee]) grouped[f.classeAffectee] = [];
    grouped[f.classeAffectee].push(f.libelleAffelnet);
  });
  Object.keys(classes).forEach(code => { if (!grouped[code]) grouped[code] = []; });

  const sorted = Object.keys(grouped).filter(code =>
    !q || code.toLowerCase().includes(q) ||
    (classes[code]?.libelle||'').toLowerCase().includes(q) ||
    (classes[code]?.filiere||'').toLowerCase().includes(q)
  ).sort((a,b) => {
    const fa = classes[a]?.filiere || 'z';
    const fb = classes[b]?.filiere || 'z';
    return fa.localeCompare(fb) || a.localeCompare(b);
  });

  const tbody = document.getElementById('formation-tbody');
  if (!tbody) return;
  if (!sorted.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><span class="empty-icon">🔍</span><p>Aucune classe trouvée</p></div></td></tr>`; return; }

  tbody.innerHTML = sorted.map(code => {
    const cfg      = classes[code] || {};
    const libelles = grouped[code] || [];
    return `<tr>
      <td><strong style="color:var(--green-900)">${esc(code)}</strong></td>
      <td style="color:#555">${esc(cfg.libelle||'—')}</td>
      <td>${cfg.filiere ? `<span style="font-size:.75rem;background:#E8F5E9;color:#2D6A4F;padding:.15rem .5rem;border-radius:50px">${esc(cfg.filiere)}</span>` : '<span style="color:#CCC">—</span>'}</td>
      <td style="text-align:center">
        ${cfg.capacite > 0
          ? `<span style="font-weight:700;color:var(--green-700)">${cfg.capacite}</span>`
          : `<span style="color:#CCC">Non définie</span>`}
      </td>
      <td>
        ${libelles.length
          ? libelles.map(l => `<span style="display:inline-block;font-size:.72rem;background:#F0F7F2;border:1px solid #D0E8D8;border-radius:4px;padding:.1rem .4rem;margin:.1rem">${esc(l)}</span>`).join(' ')
          : '<span style="color:#CCC;font-size:.82rem">Aucun libellé associé</span>'}
      </td>
      ${isAdmin ? `<td>
        <div class="flex gap-sm">
          <button class="btn btn-outline btn-sm" onclick="openClassModal('${esc(code)}')">✏️</button>
          <button class="btn btn-red btn-sm" onclick="confirmDeleteClass('${esc(code)}')">🗑️</button>
        </div>
      </td>` : ''}
    </tr>`;
  }).join('');
}

function openClassModal(code) {
  const classes = DB.getClasses();
  const cfg     = code ? (classes[code] || {}) : {};
  const isEdit  = !!code;
  const filieres = ['Bac Pro', 'CAP', 'LGT', 'BTS', 'Autre'];

  openModal(`
    <div class="modal-header">
      <h3>${isEdit ? '✏️ Modifier la classe' : '➕ Nouvelle classe'}</h3>
      <button class="btn-close-modal" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Code classe <span style="color:var(--red)">*</span></label>
        <input type="text" id="cls-code" value="${esc(code||'')}" placeholder="Ex : 1CAP BOU" ${isEdit?'readonly style="background:#F5F5F5"':''}>
        ${isEdit ? '<p style="font-size:.78rem;color:#999;margin-top:.3rem">Le code ne peut pas être modifié. Supprimez et recréez si nécessaire.</p>' : ''}
      </div>
      <div class="form-group">
        <label>Libellé / Description</label>
        <input type="text" id="cls-libelle" value="${esc(cfg.libelle||'')}" placeholder="Ex : CAP Boucher 1ère année">
      </div>
      <div class="form-group">
        <label>Filière</label>
        <select id="cls-filiere">
          <option value="">— Sélectionner —</option>
          ${filieres.map(f => `<option value="${f}" ${cfg.filiere===f?'selected':''}>${f}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Capacité (nombre de places)</label>
        <input type="number" id="cls-capacite" value="${cfg.capacite||0}" min="0" max="999">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveClassModal('${esc(code||'')}')">💾 Enregistrer</button>
    </div>`);
}

function saveClassModal(oldCode) {
  const code     = document.getElementById('cls-code').value.trim();
  const libelle  = document.getElementById('cls-libelle').value.trim();
  const filiere  = document.getElementById('cls-filiere').value;
  const capacite = parseInt(document.getElementById('cls-capacite').value) || 0;
  if (!code) { showToast('Le code classe est obligatoire.', 'error'); return; }

  DB.upsertClass(code, { libelle, filiere, capacite });

  // Mettre à jour les formations si code changé (nouvelle classe sans libellé)
  DB.addActivity({ type: 'param', label: `Classe ${oldCode ? 'modifiée' : 'créée'} : ${code}`, detail: `Capacité : ${capacite}` });
  closeModal();
  showToast(`Classe ${code} enregistrée.`, 'success');
  renderFormations(document.getElementById('page-content'));
}

function confirmDeleteClass(code) {
  openModal(`
    <div class="modal-header"><h3>🗑️ Supprimer la classe</h3><button class="btn-close-modal" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <p>Supprimer la classe <strong>${esc(code)}</strong> et tous ses libellés AFFELNET associés ?</p>
      <p style="margin-top:.7rem;font-size:.85rem;color:#B71C1C">⚠️ Les élèves affectés à cette classe ne seront pas supprimés, mais leur classe ne sera plus reconnue.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-red" onclick="deleteClassConfirmed('${esc(code)}')">🗑️ Supprimer</button>
    </div>`);
}

function deleteClassConfirmed(code) {
  DB.deleteClass(code);
  DB.addActivity({ type: 'param', label: `Classe supprimée : ${code}` });
  closeModal();
  showToast(`Classe ${code} supprimée.`, 'success');
  renderFormations(document.getElementById('page-content'));
}

function openAddFormationModal() {
  const classes = DB.getClasses();
  const codes   = Object.keys(classes).sort();
  openModal(`
    <div class="modal-header">
      <h3>➕ Ajouter un libellé AFFELNET</h3>
      <button class="btn-close-modal" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Libellé AFFELNET (exactement comme dans le fichier) <span style="color:var(--red)">*</span></label>
        <input type="text" id="form-libelle" placeholder="Ex : 1CAP2  BOUCHER">
      </div>
      <div class="form-group">
        <label>Classe cible <span style="color:var(--red)">*</span></label>
        <select id="form-classe">
          <option value="">— Sélectionner —</option>
          ${codes.map(c => `<option value="${c}">${c}${classes[c].libelle ? ' — '+classes[c].libelle : ''}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveFormationModal()">💾 Enregistrer</button>
    </div>`);
}

function saveFormationModal() {
  const libelle = document.getElementById('form-libelle').value.trim();
  const classe  = document.getElementById('form-classe').value;
  if (!libelle || !classe) { showToast('Libellé et classe cible sont obligatoires.', 'error'); return; }
  DB.upsertFormation(libelle, classe);
  closeModal();
  showToast('Libellé ajouté.', 'success');
  renderFormations(document.getElementById('page-content'));
}

/* ═══════════════════════════════════════════════════
   IMPORT AFFELNET
═══════════════════════════════════════════════════ */
function renderImport(el) {
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 360px;gap:1.5rem">
      <div>

        <!-- ── 1. Fichier AFFELNET ──────────────────────── -->
        <div class="panel">
          <div class="panel-header">
            <h3>📥 Importer le fichier AFFELNET (XLSX)</h3>
            <span style="font-size:.78rem;color:#777;background:#F0F7F2;padding:.2rem .6rem;border-radius:50px">Étape 1</span>
          </div>
          <div class="panel-body">
            <p style="font-size:.83rem;color:#666;margin-bottom:.8rem">
              Fichier officiel des élèves affectés : <code>affectesEtablissementAccueil_XXXXX.xlsx</code>
            </p>

            <!-- Sélecteur de période — obligatoire avant import -->
            <div style="background:#FFF8E1;border:2px solid #FFE082;border-radius:10px;padding:1rem 1.2rem;margin-bottom:1rem">
              <div style="font-weight:700;color:#E65100;margin-bottom:.7rem;font-size:.9rem">
                📅 Période de rattachement <span style="color:#B71C1C">*</span> <span style="font-weight:400;font-size:.8rem">(obligatoire avant d'importer)</span>
              </div>
              <div style="display:flex;gap:.75rem;flex-wrap:wrap">
                <label id="label-preTour" style="display:flex;align-items:center;gap:.5rem;cursor:pointer;padding:.5rem 1rem;border-radius:8px;border:2px solid #BDBDBD;background:#fff;font-weight:600;font-size:.88rem;transition:all .15s">
                  <input type="radio" name="affelnet-periode" value="preTour" onchange="updateAffelnetDropZone()" style="accent-color:#1565C0">
                  🔵 Pré-Tour
                </label>
                <label id="label-premierTour" style="display:flex;align-items:center;gap:.5rem;cursor:pointer;padding:.5rem 1rem;border-radius:8px;border:2px solid #BDBDBD;background:#fff;font-weight:600;font-size:.88rem;transition:all .15s">
                  <input type="radio" name="affelnet-periode" value="premierTour" onchange="updateAffelnetDropZone()" style="accent-color:#6A1B9A">
                  🟣 1er Tour
                </label>
                <label id="label-secondTour" style="display:flex;align-items:center;gap:.5rem;cursor:pointer;padding:.5rem 1rem;border-radius:8px;border:2px solid #BDBDBD;background:#fff;font-weight:600;font-size:.88rem;transition:all .15s">
                  <input type="radio" name="affelnet-periode" value="secondTour" onchange="updateAffelnetDropZone()" style="accent-color:#B71C1C">
                  🔴 2nd Tour
                </label>
              </div>
            </div>

            <div id="dz-periode-hint" style="font-size:.82rem;color:#E65100;margin-bottom:.5rem;display:flex;align-items:center;gap:.4rem">
              ⬆️ Sélectionnez une période ci-dessus pour activer l'import.
            </div>
            <div class="drop-zone" id="drop-zone" style="opacity:.45;pointer-events:none"
              ondragover="event.preventDefault();this.classList.add('dragging')"
              ondragleave="this.classList.remove('dragging')"
              ondrop="handleDrop(event)">
              <span class="dz-icon">📂</span>
              <h4>Glisser-déposer le fichier XLSX ici</h4>
              <p>ou cliquer pour sélectionner</p>
            </div>
            <input type="file" id="file-input" accept=".xlsx,.xls" style="display:none" onchange="handleFileSelect(event)">
            <div class="import-progress" id="import-progress">
              <div style="font-weight:600;color:var(--green-800);margin-bottom:.7rem">📊 Résultat de l'import</div>
              <div class="import-log" id="import-log"></div>
              <div style="margin-top:1rem;display:flex;gap:.7rem" id="import-actions"></div>
            </div>
          </div>
        </div>

        <!-- ── 2. Fichier orientation ──────────────────── -->
        <div class="panel mt-md">
          <div class="panel-header">
            <h3>🎓 Importer le fichier orientation (XLSX)</h3>
            <span style="font-size:.78rem;color:#777;background:#F0F7F2;padding:.2rem .6rem;border-radius:50px">Étape 2</span>
          </div>
          <div class="panel-body">
            <p style="font-size:.83rem;color:#666;margin-bottom:.8rem">
              Fichier de suivi des vœux et décisions d'orientation de vos élèves actuels.
              Enrichit les fiches élèves avec leur classe actuelle, leurs vœux et la décision finale.
            </p>
            <div class="drop-zone" id="drop-zone-orientation" onclick="document.getElementById('file-orientation').click()"
              ondragover="event.preventDefault();this.classList.add('dragging')"
              ondragleave="this.classList.remove('dragging')"
              ondrop="handleDropOrientation(event)">
              <span class="dz-icon">🎓</span>
              <h4>Glisser-déposer le fichier orientation ici</h4>
              <p>Colonnes attendues : <code>Élèves</code> · <code>Numéro nationnal</code> · <code>Classe</code> · <code>LV1</code> · <code>LV2</code> · <code>Orientation</code> · <code>Spécialité 1…5</code></p>
            </div>
            <input type="file" id="file-orientation" accept=".xlsx,.xls" style="display:none" onchange="handleOrientationSelect(event)">
            <div id="orientation-log" style="margin-top:1rem"></div>
          </div>
        </div>

        <!-- ── 3. Fichier Libellés Formations ─────────── -->
        <div class="panel mt-md">
          <div class="panel-header">
            <h3>📋 Importer le fichier Libellés Formations (XLSX)</h3>
            <span style="font-size:.78rem;color:#777;background:#F0F7F2;padding:.2rem .6rem;border-radius:50px">Étape 3</span>
          </div>
          <div class="panel-body">
            <p style="font-size:.83rem;color:#666;margin-bottom:.8rem">
              Configure les correspondances entre les libellés AFFELNET et les codes de classes de l'établissement.
            </p>
            <div class="drop-zone" id="drop-zone-formations" onclick="document.getElementById('file-formations').click()"
              ondragover="event.preventDefault();this.classList.add('dragging')"
              ondragleave="this.classList.remove('dragging')"
              ondrop="handleDropFormations(event)">
              <span class="dz-icon">📋</span>
              <h4>Glisser-déposer le fichier Libellés Formations</h4>
              <p>Colonnes attendues : <code>Libellé formation</code> · <code>classe affectée</code> · <code>Capacité</code> · <code>Filière</code></p>
            </div>
            <input type="file" id="file-formations" accept=".xlsx,.xls" style="display:none" onchange="handleFormationsSelect(event)">
            <div id="formations-log" style="margin-top:1rem"></div>
          </div>
        </div>

      </div>

      <div>
        <!-- ── Modèles ──────────────────────────────────── -->
        <div class="panel">
          <div class="panel-header"><h3>📄 Modèles de fichiers</h3></div>
          <div class="panel-body">
            <p style="font-size:.85rem;color:#666;margin-bottom:1rem">Téléchargez les modèles pour préparer vos fichiers d'import.</p>

            <button class="btn btn-primary w-full" onclick="downloadTemplate('affelnet')" style="margin-bottom:.6rem">
              📥 Modèle élèves AFFELNET
            </button>
            <button class="btn btn-outline w-full" onclick="downloadTemplate('orientation')" style="margin-bottom:.6rem">
              🎓 Modèle fichier orientation
            </button>
            <button class="btn btn-secondary w-full" onclick="downloadTemplate('formations')">
              📥 Modèle Libellés Formations
            </button>

            <div style="margin-top:1.2rem;font-size:.78rem;color:#999;line-height:1.7">
              <strong>Modèle AFFELNET :</strong> format officiel du ministère (affectés établissement).<br><br>
              <strong>Modèle orientation :</strong> fiche de suivi vœux & décisions pour vos élèves actuels.<br><br>
              <strong>Modèle formations :</strong> correspondances libellé AFFELNET ↔ code classe + capacités.
            </div>
          </div>
        </div>

        <!-- ── Sauvegarde ───────────────────────────────── -->
        <div class="panel mt-md">
          <div class="panel-header"><h3>💾 Sauvegarde & Restauration</h3></div>
          <div class="panel-body">
            <p style="font-size:.85rem;color:#666;margin-bottom:1rem">Exportez toutes les données pour sauvegarde ou migration vers un autre poste.</p>
            <button class="btn btn-primary w-full" onclick="exportData()" style="margin-bottom:.7rem">📤 Exporter toutes les données (JSON)</button>
            <button class="btn btn-secondary w-full" onclick="document.getElementById('import-json').click()">📥 Restaurer depuis JSON</button>
            <input type="file" id="import-json" accept=".json" style="display:none" onchange="importData(event)">
          </div>
        </div>

        <!-- ── État données ──────────────────────────────── -->
        <div class="panel mt-md">
          <div class="panel-header"><h3>📊 État des données</h3></div>
          <div class="panel-body">
            ${(() => {
              const stats = DB.getStats();
              const f = DB.getFormations() || [];
              const c = DB.getClasses();
              const orientés = DB.getStudents().filter(s => s.classeActuelle).length;
              return `<div style="display:grid;gap:.6rem">
                <div class="flex justify-between" style="font-size:.88rem"><span>Élèves chargés</span><strong>${stats.total}</strong></div>
                <div class="flex justify-between" style="font-size:.88rem"><span>Inscrits</span><strong style="color:var(--green-700)">${stats.inscrits}</strong></div>
                <div class="flex justify-between" style="font-size:.88rem"><span>Avec données orientation</span><strong style="color:#6A1B9A">${orientés}</strong></div>
                <div class="flex justify-between" style="font-size:.88rem"><span>Classes configurées</span><strong>${Object.keys(c).length}</strong></div>
                <div class="flex justify-between" style="font-size:.88rem"><span>Libellés formations</span><strong>${f.length}</strong></div>
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
   TÉLÉCHARGEMENT MODÈLES XLSX
═══════════════════════════════════════════════════ */
function downloadTemplate(type) {
  const wb = XLSX.utils.book_new();

  if (type === 'affelnet') {
    const headers = ['INE','Nom','Prénom 1','Libellé formation','Libellé  LV1','Libellé  LV2','Den. comp. étab. origine','Rang'];
    const example = [
      ['1234567890A','DUPONT','Marie','1CAP2  BOUCHER','ANGLAIS LV1','ESPAGNOL LV2','Collège Victor Hugo - MANA','1'],
      ['9876543210B','MARTIN','Jean','2NDPRO MET. RELATION CLIENT 2NDE COMMUNE','ANGLAIS LV1','PORTUGAIS LV2','Collège du Maroni - SAINT-LAURENT-DU-MARONI','3'],
      ['1111111111C','PETIT','Sarah','1-STMG SC. & TECHNO. MANAGEMENT GESTION','ANGLAIS LV1','ESPAGNOL LV2','Lycée Bertène Juminer - SAINT-LAURENT-DU-MARONI','2'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
    ws['!cols'] = [12,14,12,45,18,18,40,6].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'AFFELNET_ELEVES');

    const infoHeaders = ['INFORMATION',''];
    const infoData = [
      ['Ce fichier correspond au format du fichier officiel AFFELNET',''],
      ['(affectesEtablissementAccueil_XXXXX.xlsx).',''],
      ['',''],
      ['Colonne','Description'],
      ['INE','Numéro identifiant élève (obligatoire)'],
      ['Nom','Nom de famille en majuscules'],
      ['Prénom 1','Premier prénom'],
      ['Libellé formation','Libellé exact de la formation AFFELNET'],
      ['Libellé  LV1','Langue vivante 1 (2 espaces avant LV1)'],
      ['Libellé  LV2','Langue vivante 2 (2 espaces avant LV2)'],
      ['Den. comp. étab. origine','Nom complet établissement d\'origine'],
      ['Rang','Rang d\'affectation AFFELNET'],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet([infoHeaders, ...infoData]);
    wsInfo['!cols'] = [{ wch: 50 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'NOTICE');

  } else if (type === 'orientation') {
    // Colonnes identiques au fichier réel utilisé par l'établissement
    const headers = ['Élèves','Sexe','Redoublant','Numéro nationnal','Classe','LV1','LV2','Orientation','Spécialité 1','Spécialité 2','Spécialité 3','Spécialité 4','Spécialité 5'];
    const example = [
      ['DUPONT Marie',   'Féminin',  '',  '1234567890A', '2P MET',  'ANGLAIS LV1', '',             '1ERPRO METIERS DE L\'ACCUEIL',                   '', '', '', '', ''],
      ['MARTIN Jean',    'Masculin', '',  '9876543210B', '2P MRC1', 'ANGLAIS LV1', 'ESPAGNOL LV2', '1ERPRO MET.COM.VEN.OP.A ANI.GES.ESP.COM.',       '', '', '', '', ''],
      ['PETIT Sarah',    'Féminin',  '',  '1111111111C', '2 GT1',   'ANGLAIS LV1', 'ESPAGNOL LV2', 'PREMIERE GENERALE',                              'Mathématiques', 'Sciences de la vie et de la Terre', 'Physique-Chimie', '', ''],
      ['LEBRUN Paul',    'Masculin', 'X', '2222222222D', '1 STMG',  'ANGLAIS LV1', 'PORTUGAIS LV2','T-STMG SYSTEMES D\'INFORMATION DE GESTION',      '', '', '', '', ''],
      ['ABISOINA Sandrine','Féminin','',  '3333333333E', '2P ALIM', 'ANGLAIS LV1', '',             '1ERPRO POISSONNIER-ECAILLER-TRAITEUR',            '', '', '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
    ws['!cols'] = [22,10,10,18,10,16,16,46,20,20,20,20,20].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'ORIENTATION');

    const notice = [
      ['NOTICE — Fichier orientation',''],
      ['',''],
      ['Ce fichier correspond au format utilisé par l\'établissement pour le suivi des orientations.',''],
      ['Il peut être importé avant ou après le fichier AFFELNET officiel.',''],
      ['',''],
      ['Colonne','Description'],
      ['Élèves','NOM Prénom : le(s) mot(s) en MAJUSCULES = Nom de famille, le reste = Prénom'],
      ['Sexe','Masculin ou Féminin'],
      ['Redoublant','Laisser vide si non redoublant, mettre une valeur (ex: X) si redoublant'],
      ['Numéro nationnal','INE — Identifiant Élève National (clé de correspondance avec le fichier AFFELNET)'],
      ['Classe','Classe actuelle de l\'élève dans l\'établissement (ex : 2P MET, 2 GT1, 1P MRC1)'],
      ['LV1','Langue vivante 1 (ex : ANGLAIS LV1)'],
      ['LV2','Langue vivante 2 — peut être vide'],
      ['Orientation','Formation demandée : libellé AFFELNET ou intitulé de la formation souhaitée'],
      ['Spécialité 1 à 5','Spécialités choisies (Bac Général uniquement) — laisser vide pour les autres filières'],
      ['',''],
      ['IMPORTANT',''],
      ['La colonne « Orientation » est utilisée pour pré-remplir la classe cible si le libellé',''],
      ['correspond à une formation configurée dans l\'application (Classes & Formations).',''],
    ];
    const wsN = XLSX.utils.aoa_to_sheet(notice);
    wsN['!cols'] = [{ wch: 60 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, wsN, 'NOTICE');

  } else {
    const headers = ['Libellé formation','classe affectée','Capacité','Filière'];
    const example = (DB.getFormations() || []).slice(0, 20).map(f => {
      const cfg = DB.getClass(f.classeAffectee);
      return [f.libelleAffelnet, f.classeAffectee, cfg.capacite || 0, cfg.filiere || ''];
    });
    if (example.length === 0) {
      example.push(
        ['1CAP2  BOUCHER','1CAP BOU',12,'CAP'],
        ['1CAP2 BOUCHER CODE PRI','1CAP BOU',12,'CAP'],
        ['2NDPRO MET. RELATION CLIENT 2NDE COMMUNE','2BP MRC',30,'Bac Pro'],
        ['2NDE GENERALE ET TECHNOLOGIQUE','2nde GT',32,'LGT']
      );
    }
    const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
    ws['!cols'] = [{ wch: 50 }, { wch: 15 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'FORMATIONS');

    const notice = [
      ['NOTICE',''],
      ['Ce fichier permet de configurer les correspondances entre',''],
      ['les libellés AFFELNET et les codes classes de l\'application.',''],
      ['',''],
      ['Colonne','Description'],
      ['Libellé formation','Libellé EXACT du fichier AFFELNET (sensible à la casse et aux espaces)'],
      ['classe affectée','Code court de la classe dans l\'application (ex: 1CAP BOU)'],
      ['Capacité','Nombre de places disponibles dans la classe (0 = non définie)'],
      ['Filière','Filière : Bac Pro, CAP, LGT, BTS, Autre'],
    ];
    const wsN = XLSX.utils.aoa_to_sheet(notice);
    wsN['!cols'] = [{ wch: 55 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, wsN, 'NOTICE');
  }

  const name = type === 'affelnet' ? 'modele_import_AFFELNET.xlsx' : type === 'orientation' ? 'modele_orientation.xlsx' : 'modele_formations.xlsx';
  XLSX.writeFile(wb, name);
  showToast(`Modèle téléchargé : ${name}`, 'success');
}

/* ═══════════════════════════════════════════════════
   JOURNAL
═══════════════════════════════════════════════════ */
function renderActivity(el) {
  const activity = DB.getActivity();
  el.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <h3>📋 Journal d'activité</h3>
        <span style="font-size:.82rem;color:#777">${activity.length} entrées</span>
      </div>
      <div class="panel-body" style="padding:0 1.5rem">
        ${!activity.length
          ? `<div class="empty-state"><span class="empty-icon">📋</span><p>Aucune activité enregistrée</p></div>`
          : `<div class="timeline">${activity.map(a => `
              <div class="timeline-item">
                <div class="timeline-dot">${activityIcon(a.type)}</div>
                <div class="timeline-content"><h4>${a.label}</h4><p>${a.detail||''}</p></div>
                <span class="timeline-time">${new Date(a.ts).toLocaleString('fr-FR')}</span>
              </div>`).join('')}
            </div>`}
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════
   PARAMÈTRES
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
              <label>Ville / Localisation</label>
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

    <div class="settings-panel" id="tab-periodes">
      <div class="panel">
        <div class="panel-header"><h3>📅 Calendrier des inscriptions</h3></div>
        <div class="panel-body">
          <p style="font-size:.85rem;color:#666;margin-bottom:1.2rem">
            Définissez les dates de chaque période. En dehors de ces périodes, seuls la Direction et la Secrétaire peuvent inscrire.
          </p>
          <div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:1rem 1.5rem;align-items:center;margin-bottom:.5rem">
            <div style="font-size:.78rem;font-weight:700;color:#999;text-transform:uppercase">Période</div>
            <div style="font-size:.78rem;font-weight:700;color:#999;text-transform:uppercase">Début</div>
            <div style="font-size:.78rem;font-weight:700;color:#999;text-transform:uppercase">Fin</div>
          </div>
          ${periodRow('🔵 Pré-Tour','#1565C0',s.periodes.preTour,'preTour')}
          ${periodRow('🟣 1er Tour','#6A1B9A',s.periodes.premierTour,'premierTour')}
          ${periodRow('🔴 2nd Tour','#880E4F',s.periodes.secondTour,'secondTour')}
          <button class="btn btn-primary mt-md" onclick="savePeriodes()">💾 Enregistrer les périodes</button>
        </div>
      </div>
    </div>

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
                  <td><div class="flex gap-sm">
                    <button class="btn btn-outline btn-sm" onclick="openEditUserModal('${u.id}')">✏️ Modifier</button>
                    ${u.id !== currentUser.id ? `<button class="btn btn-red btn-sm" onclick="deleteUser('${u.id}')">🗑️</button>` : ''}
                  </div></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function periodRow(label, color, p, key) {
  return `<div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:1rem 1.5rem;align-items:center;padding:.8rem 0;border-bottom:1px solid #F0F7F2">
    <div style="display:flex;align-items:center;gap:.6rem;font-weight:600;font-size:.9rem;min-width:160px">
      <span style="width:14px;height:14px;border-radius:50%;background:${color};flex-shrink:0"></span>${label}
    </div>
    <input type="date" id="p-${key}-debut" value="${p.debut||''}" style="max-width:200px">
    <input type="date" id="p-${key}-fin"   value="${p.fin||''}"   style="max-width:200px">
  </div>`;
}

function switchSettingsTab(id, btn) {
  document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.settings-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}

/* ═══════════════════════════════════════════════════
   FICHE IMPRESSION
═══════════════════════════════════════════════════ */
function renderPrint(el, ine) {
  const s  = DB.getStudent(ine);
  if (!s) return;
  const st = DB.getSettings();
  const now = new Date();
  const dateStr  = now.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
  const heureStr = now.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});

  const bloc = titre => `
    <div class="fiche-bloc">
      <div class="fiche-header">
        <span class="fiche-logo">🏫</span>
        <h1>${esc(st.etablissement)} — ${esc(st.ville)}</h1>
        <p>FICHE D'ACCUEIL — INSCRIPTION AU LYCÉE — Année ${esc(st.annee)} &nbsp;|&nbsp; <em>${titre}</em></p>
      </div>
      <div class="fiche-section">
        <h2>Identification de l'élève</h2>
        <table class="fiche-table">
          <tr><td>Nom / Prénom</td><td><strong>${esc(s.nom)} ${esc(s.prenom)}</strong></td><td>INE</td><td style="font-family:monospace">${esc(s.ine)}</td></tr>
          <tr><td>Classe affectée</td><td><strong>${esc(s.classeAffectee||'—')}</strong></td><td>Formation</td><td>${esc(s.libelleFormation||'—')}</td></tr>
          <tr><td>Étab. d'origine</td><td>${esc(s.etablissementOrigine||'—')}</td><td>LV1 / LV2</td><td>${esc(s.lv1||'—')} / ${esc(s.lv2||'—')}</td></tr>
          <tr><td>Notification AFFELNET</td><td colspan="3">☑ OUI</td></tr>
        </table>
      </div>
      <div class="fiche-section">
        <h2>Vérifications — Agent d'accueil</h2>
        <table class="fiche-table">
          <tr><td style="width:35%">Élève accepté ?</td><td>
            <span class="fiche-stamp ${s.statut==='inscrit'||s.statut==='hors_periode'?'stamp-ok':''}">
              ${s.statut==='inscrit'||s.statut==='hors_periode'?'☑ OUI — Dossier validé':'☐ OUI  &nbsp; ☐ NON'}
            </span></td></tr>
          <tr><td>Date d'inscription conforme ?</td><td>
            ${s.periode && s.periode!=='hors_periode'?`☑ OUI — Période : ${periodeFr(s.periode)}`:s.statut==='hors_periode'?`<span class="fiche-stamp stamp-dero">Dérogation validée — Hors période</span>`:'☐ OUI  &nbsp; ☐ NON — Dérogation nécessaire'}
          </td></tr>
          <tr><td>Observations</td><td>&nbsp;</td></tr>
        </table>
      </div>
      <div class="fiche-section">
        <h2>Date, heure et signatures</h2>
        <div style="font-size:9pt;margin-bottom:.4rem">Accueil le <strong>${dateStr}</strong> à <strong>${heureStr}</strong></div>
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
      <div class="fiche-divider"><span>✂&nbsp;&nbsp;Découper ici — remettre l'exemplaire ci-dessous à la famille&nbsp;&nbsp;✂</span></div>
      ${bloc('Exemplaire Famille')}
    </div>`;
}

/* ═══════════════════════════════════════════════════
   MODALES
═══════════════════════════════════════════════════ */
function openModal(content) {
  document.getElementById('modal-body-content').innerHTML = content;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

// ── Modal : Inscription ──────────────────────────────
function openEnrollModal(ine) {
  const s = DB.getStudent(ine);
  if (!s) { showToast('Élève introuvable — veuillez recharger la page.', 'error'); return; }
  const isOrientation = s.source === 'orientation';
  const isDeroValide  = s.statut === 'derogation_valide';
  const isAdmin       = currentUser.role === 'proviseur' || currentUser.role === 'secretaire';
  const periode       = DB.getPeriodeActive();

  // Blocage AED uniquement pour les élèves AFFELNET
  if (!isOrientation && !isDeroValide && !isAdmin) {
    if (!periode) {
      showToast('Inscription impossible : aucune période active. Demandez une dérogation.', 'error');
      return;
    }
    const periodesSource = s.periodesSource || (s.periodeSource ? [s.periodeSource] : []);
    if (periodesSource.length > 0 && !periodesSource.includes(periode)) {
      const labels = { preTour:'Pré-Tour', premierTour:'1er Tour', secondTour:'2nd Tour' };
      const periodesFr = periodesSource.map(p => labels[p] || p).join(', ');
      showToast(`Élève rattaché au ${periodesFr} — pas à la période en cours. Demandez une dérogation.`, 'error');
      return;
    }
  }

  const isHors = !isOrientation && !isDeroValide && !periode && isAdmin;

  // Texte informatif selon le contexte
  let infoBlock;
  if (isOrientation) {
    infoBlock = `<div style="background:#E8F5E9;border-radius:8px;padding:.7rem;font-size:.85rem;color:var(--green-800)">🎓 Élève orientation — inscription libre (hors période).</div>`;
  } else if (isDeroValide) {
    infoBlock = `<div style="background:#E8F5E9;border-radius:8px;padding:.7rem;font-size:.85rem;color:var(--green-800)">✔️ Dérogation validée — inscription autorisée.</div>`;
  } else if (isHors) {
    const ps = s.periodesSource || (s.periodeSource ? [s.periodeSource] : []);
    const labels = { preTour:'🔵 Pré-Tour', premierTour:'🟣 1er Tour', secondTour:'🔴 2nd Tour' };
    const periodeInfo = ps.length > 0 ? `<div style="font-size:.8rem;margin-top:.3rem">Rattaché : ${ps.map(p=>labels[p]||p).join(', ')}</div>` : '';
    infoBlock = `<div style="background:#FFF8E1;border:1px solid #FFE082;border-radius:8px;padding:.8rem;font-size:.85rem;color:#E65100">⚠️ Inscription hors période — sera marquée comme exception autorisée.${periodeInfo}</div>`;
  } else {
    const ps = s.periodesSource || (s.periodeSource ? [s.periodeSource] : []);
    const labels = { preTour:'🔵 Pré-Tour', premierTour:'🟣 1er Tour', secondTour:'🔴 2nd Tour' };
    infoBlock = `<div style="background:#E8F5E9;border-radius:8px;padding:.7rem;font-size:.85rem;color:var(--green-800)">📅 Période : <strong>${periodeFr(periode)}</strong>${ps.length > 0 ? ` — Rattaché : ${ps.map(p=>labels[p]||p).join(', ')}` : ''}</div>`;
  }

  openModal(`
    <div class="modal-header"><h3>✅ Inscrire l'élève</h3><button class="btn-close-modal" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div style="background:var(--green-50);border-radius:8px;padding:1rem;margin-bottom:1rem">
        <div style="font-size:1.1rem;font-weight:800;color:var(--green-900)">${esc(s.nom)} ${esc(s.prenom)}</div>
        <div style="font-size:.85rem;color:#666">${esc(s.classeAffectee||'—')} ${esc(s.libelleFormation||'')}</div>
        <div style="font-size:.78rem;color:#999;margin-top:.2rem">INE : ${esc(s.ine)}</div>
      </div>
      ${infoBlock}
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="confirmEnroll('${ine}')">✅ Confirmer l'inscription</button>
    </div>`);
}

function confirmEnroll(ine) {
  const s       = DB.getStudent(ine);
  if (!s) { showToast('Élève introuvable — veuillez recharger la page.', 'error'); return; }
  const periode      = DB.getPeriodeActive();
  const isOrientation = s.source === 'orientation';
  const isDeroValide  = s.statut === 'derogation_valide';
  // hors_periode uniquement pour proviseur/secrétaire, hors période active, hors orientation et hors dérogation validée
  const isHors = !isOrientation && !isDeroValide && !periode &&
                 (currentUser.role === 'proviseur' || currentUser.role === 'secretaire');
  const updated = DB.updateStudentStatus(ine, {
    statut: isHors ? 'hors_periode' : 'inscrit',
    dateInscription: new Date().toISOString(),
    inscritPar: `${currentUser.prenom} ${currentUser.nom}`,
    periode: isOrientation ? 'orientation' : isDeroValide ? 'derogation' : (periode || 'hors_periode'),
  });
  if (!updated) { showToast('Erreur lors de l\'enregistrement — veuillez recharger la page.', 'error'); return; }
  DB.addActivity({ type:'inscription', label:`Inscription : ${updated.nom} ${updated.prenom}`, detail:`${updated.classeAffectee} — par ${currentUser.prenom} ${currentUser.nom}${isHors?' (hors période)':''}` });
  closeModal(); showToast(`${updated.nom} ${updated.prenom} inscrit(e) avec succès !`, 'success');
  renderSidebar();
  if (currentView === 'student') navigateTo('student', { ine });
  else if (currentView === 'students') renderStudentTable();
  else if (currentView === 'dashboard') navigateTo('dashboard');
}

// ── Modal : Modification élève ───────────────────────
function openEditStudentModal(ine) {
  const s = DB.getStudent(ine);
  if (!s) return;
  const classes  = DB.getClasses();
  const allCodes = [...new Set([...Object.keys(classes), ...(DB.getStudents().map(x => x.classeAffectee).filter(Boolean))])].sort();

  const isRedo = !!s.redoublant;
  // Pour les redoublants sans classe, pré-sélectionner la classe actuelle si elle correspond à un code connu
  const classeParDefaut = s.classeAffectee || (isRedo && allCodes.includes(s.classeActuelle) ? s.classeActuelle : '');
  openModal(`
    <div class="modal-header"><h3>✏️ Modifier la fiche élève</h3><button class="btn-close-modal" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      ${isRedo && !s.classeAffectee ? `
      <div style="background:#FFF3E0;border:1px solid #E65100;border-radius:8px;padding:.8rem;margin-bottom:1rem;font-size:.88rem;color:#E65100;font-weight:600">
        🔄 Redoublant — sélectionnez la classe de redoublement ci-dessous
        ${classeParDefaut ? `<div style="font-weight:400;margin-top:.3rem">Classe actuelle suggérée : <strong>${esc(classeParDefaut)}</strong></div>` : ''}
      </div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div class="form-group"><label>Nom</label><input type="text" id="ed-nom" value="${esc(s.nom||'')}"></div>
        <div class="form-group"><label>Prénom</label><input type="text" id="ed-prenom" value="${esc(s.prenom||'')}"></div>
        <div class="form-group"><label>INE</label><input type="text" id="ed-ine" value="${esc(s.ine||'')}" readonly style="background:#F5F5F5"></div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:.5rem">
            <input type="checkbox" id="ed-redoublant" ${isRedo ? 'checked' : ''}
              onchange="document.getElementById('ed-classe-label').textContent=this.checked?'Classe de redoublement':'Classe affectée'">
            Redoublant
          </label>
          <div style="margin-top:.5rem">
            <label id="ed-classe-label" style="${isRedo?'color:#E65100;font-weight:700':''}">${isRedo ? 'Classe de redoublement' : 'Classe affectée'}</label>
            <select id="ed-classe" style="${isRedo && !s.classeAffectee ? 'border:2px solid #E65100' : ''}">
              <option value="">— Sélectionner —</option>
              ${allCodes.map(c => `<option value="${c}" ${classeParDefaut===c?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group"><label>LV1</label><input type="text" id="ed-lv1" value="${esc(s.lv1||'')}"></div>
        <div class="form-group"><label>LV2</label><input type="text" id="ed-lv2" value="${esc(s.lv2||'')}"></div>
        <div class="form-group" style="grid-column:1/-1"><label>Formation (libellé AFFELNET)</label><input type="text" id="ed-formation" value="${esc(s.libelleFormation||'')}"></div>
        <div class="form-group" style="grid-column:1/-1"><label>Établissement d'origine</label><input type="text" id="ed-etab" value="${esc(s.etablissementOrigine||'')}"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveEditStudent('${ine}')">💾 Enregistrer</button>
    </div>`);
}

function saveEditStudent(ine) {
  const nom        = document.getElementById('ed-nom').value.trim().toUpperCase();
  const prenom     = document.getElementById('ed-prenom').value.trim();
  const classe     = document.getElementById('ed-classe').value;
  const redoublant = document.getElementById('ed-redoublant').checked;
  const lv1        = document.getElementById('ed-lv1').value.trim();
  const lv2        = document.getElementById('ed-lv2').value.trim();
  const formation  = document.getElementById('ed-formation').value.trim();
  const etab       = document.getElementById('ed-etab').value.trim();

  if (!nom) { showToast('Le nom est obligatoire.', 'error'); return; }
  if (redoublant && !classe) { showToast('Veuillez sélectionner la classe de redoublement.', 'error'); return; }

  DB.upsertStudent({ ine, nom, prenom, classeAffectee: classe, redoublant, lv1, lv2, libelleFormation: formation, etablissementOrigine: etab });
  const detail = redoublant && classe
    ? `Redoublant affecté en ${classe} — par ${currentUser.prenom} ${currentUser.nom}`
    : `Par ${currentUser.prenom} ${currentUser.nom}`;
  DB.addActivity({ type:'modif', label:`Fiche modifiée : ${nom} ${prenom}`, detail });
  closeModal();
  showToast(redoublant && classe ? `${nom} ${prenom} affecté(e) en ${classe}.` : 'Fiche élève mise à jour.', 'success');
  renderSidebar();
  navigateTo('student', { ine });
}

// ── Modal : Dérogation ───────────────────────────────
function openDeroModal(ine) {
  const s = DB.getStudent(ine);
  if (!s) return;
  openModal(`
    <div class="modal-header"><h3>⚠️ Demander une dérogation</h3><button class="btn-close-modal" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <p style="font-size:.85rem;color:#666;margin-bottom:1rem">Période d'inscription fermée. Vous allez enregistrer une demande pour :<br><strong>${esc(s.nom)} ${esc(s.prenom)}</strong> — ${esc(s.classeAffectee)}</p>
      <p style="font-size:.85rem;color:#E65100">La demande sera soumise à la Direction pour validation.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-gold" onclick="confirmDero('${ine}')">⚠️ Enregistrer la demande</button>
    </div>`);
}

function confirmDero(ine) {
  const updated = DB.updateStudentStatus(ine, { statut:'derogation_attente', deroDate:new Date().toISOString(), deroDemandeePar:`${currentUser.prenom} ${currentUser.nom}` });
  DB.addActivity({ type:'derogation', label:`Dérogation demandée : ${updated.nom} ${updated.prenom}`, detail:`Par ${currentUser.prenom} ${currentUser.nom}` });
  closeModal(); showToast('Demande de dérogation enregistrée.', 'warning');
  renderSidebar();
  if (currentView === 'student') navigateTo('student', { ine });
  else renderStudentTable && renderStudentTable();
}

function validateDero(ine) {
  const updated = DB.updateStudentStatus(ine, { statut:'derogation_valide', deroValidePar:`${currentUser.prenom} ${currentUser.nom}` });
  DB.addActivity({ type:'dero_valide', label:`Dérogation validée : ${updated.nom} ${updated.prenom}`, detail:`Par ${currentUser.prenom} ${currentUser.nom}` });
  showToast('Dérogation validée.', 'success'); renderSidebar();
  if (currentView === 'student') navigateTo('student', { ine });
  else if (currentView === 'derogations') renderDerogations(document.getElementById('page-content'));
}

function enrollFromDero(ine) {
  const updated = DB.updateStudentStatus(ine, { statut:'hors_periode', dateInscription:new Date().toISOString(), inscritPar:`${currentUser.prenom} ${currentUser.nom}`, periode:'hors_periode' });
  DB.addActivity({ type:'inscription', label:`Inscription après dérogation : ${updated.nom} ${updated.prenom}`, detail:`${updated.classeAffectee} — par ${currentUser.prenom} ${currentUser.nom}` });
  showToast(`${updated.nom} ${updated.prenom} inscrit(e) !`, 'success'); renderSidebar();
  if (currentView === 'derogations') renderDerogations(document.getElementById('page-content'));
}

function openRefuseDeroModal(ine) {
  const s = DB.getStudent(ine);
  openModal(`
    <div class="modal-header"><h3>❌ Refuser la dérogation</h3><button class="btn-close-modal" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <p style="font-size:.85rem;color:#666;margin-bottom:1rem">Refuser pour <strong>${esc(s.nom)} ${esc(s.prenom)}</strong>.</p>
      <label style="font-size:.85rem;font-weight:600;display:block;margin-bottom:.5rem">Motif du refus <span style="color:var(--red)">*</span></label>
      <textarea id="refuse-motif" class="form-ctrl" placeholder="Indiquez le motif (obligatoire)…"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-red" onclick="confirmRefuseDero('${ine}')">❌ Confirmer le refus</button>
    </div>`);
}

function confirmRefuseDero(ine) {
  const motif = document.getElementById('refuse-motif').value.trim();
  if (!motif) { showToast('Le motif est obligatoire.', 'error'); return; }
  const s = DB.getStudent(ine);
  DB.updateStudentStatus(ine, { statut:'derogation_refuse', deroRefusMotif:motif, deroValidePar:`${currentUser.prenom} ${currentUser.nom}` });
  DB.addActivity({ type:'dero_refuse', label:`Dérogation refusée : ${s.nom} ${s.prenom}`, detail:`Motif : ${motif} — Par ${currentUser.prenom} ${currentUser.nom}` });
  closeModal(); showToast('Dérogation refusée.', 'error'); renderSidebar();
  if (currentView === 'student') navigateTo('student', { ine });
  else if (currentView === 'derogations') renderDerogations(document.getElementById('page-content'));
}

// ── Modal : Utilisateur ──────────────────────────────
function openAddUserModal()     { openUserModal(null); }
function openEditUserModal(id)  { openUserModal(DB.getSettings().users.find(u => u.id === id)); }

function openUserModal(u) {
  openModal(`
    <div class="modal-header"><h3>${u?'✏️ Modifier l\'utilisateur':'➕ Nouvel utilisateur'}</h3><button class="btn-close-modal" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-group"><label>Prénom</label><input type="text" id="u-prenom" value="${u?esc(u.prenom):''}"></div>
      <div class="form-group"><label>Nom</label><input type="text" id="u-nom" value="${u?esc(u.nom):''}"></div>
      <div class="form-group"><label>Login</label><input type="text" id="u-login" value="${u?esc(u.login):''}"></div>
      <div class="form-group"><label>Mot de passe ${u?'(vide = inchangé)':''}</label><input type="password" id="u-password" placeholder="${u?'••••••••':'Mot de passe'}"></div>
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
    if (idx >= 0) s.users[idx] = { ...s.users[idx], prenom, nom, login, role, ...(pwd?{password:pwd}:{}) };
  } else {
    if (!pwd) { showToast('Le mot de passe est obligatoire pour un nouvel utilisateur.', 'error'); return; }
    s.users.push({ id:'u'+Date.now(), prenom, nom, login, role, password:pwd });
  }
  DB.saveSettings(s); closeModal(); showToast('Utilisateur enregistré.', 'success');
  renderSettings(document.getElementById('page-content'));
}

function deleteUser(id) {
  if (!confirm('Supprimer cet utilisateur ?')) return;
  const s = DB.getSettings();
  s.users = s.users.filter(u => u.id !== id);
  DB.saveSettings(s); showToast('Utilisateur supprimé.', 'success');
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
  renderSidebar(); renderTopHeader();
}

function savePeriodes() {
  const s = DB.getSettings();
  s.periodes.preTour.debut     = document.getElementById('p-preTour-debut').value;
  s.periodes.preTour.fin       = document.getElementById('p-preTour-fin').value;
  s.periodes.premierTour.debut = document.getElementById('p-premierTour-debut').value;
  s.periodes.premierTour.fin   = document.getElementById('p-premierTour-fin').value;
  s.periodes.secondTour.debut  = document.getElementById('p-secondTour-debut').value;
  s.periodes.secondTour.fin    = document.getElementById('p-secondTour-fin').value;
  DB.saveSettings(s); showToast('Périodes enregistrées.', 'success'); renderTopHeader();
}

/* ═══════════════════════════════════════════════════
   IMPORT FICHIERS
═══════════════════════════════════════════════════ */
function getSelectedAffelnetPeriode() {
  const el = document.querySelector('input[name="affelnet-periode"]:checked');
  return el ? el.value : null;
}

function updateAffelnetDropZone() {
  const periode = getSelectedAffelnetPeriode();
  const dz   = document.getElementById('drop-zone');
  const hint = document.getElementById('dz-periode-hint');
  const colors = { preTour: '#1565C0', premierTour: '#6A1B9A', secondTour: '#B71C1C' };
  const labels = { preTour: ['label-preTour','#BBDEFB','#1565C0'], premierTour: ['label-premierTour','#E1BEE7','#6A1B9A'], secondTour: ['label-secondTour','#FFCDD2','#B71C1C'] };

  // Reset all labels
  ['preTour','premierTour','secondTour'].forEach(p => {
    const [id, bg, border] = labels[p];
    const el = document.getElementById(id);
    if (el) el.style.cssText = el.style.cssText.replace(/border:[^;]+;/g,'').replace(/background:[^;]+;/g,'') + (p === periode ? `border:2px solid ${border};background:${bg};` : 'border:2px solid #BDBDBD;background:#fff;');
  });

  if (dz) {
    if (periode) {
      dz.style.opacity = '1';
      dz.style.pointerEvents = 'auto';
      dz.style.borderColor = colors[periode];
      dz.onclick = () => document.getElementById('file-input').click();
      if (hint) hint.style.display = 'none';
    } else {
      dz.style.opacity = '.45';
      dz.style.pointerEvents = 'none';
      dz.style.borderColor = '';
      dz.onclick = null;
      if (hint) hint.style.display = 'flex';
    }
  }
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('dragging');
  const periode = getSelectedAffelnetPeriode();
  if (!periode) { showToast('Sélectionnez une période avant d\'importer.', 'error'); return; }
  const f = e.dataTransfer.files[0];
  if (f) processAffelnetFile(f, periode);
}
function handleFileSelect(e) {
  const periode = getSelectedAffelnetPeriode();
  if (!periode) { showToast('Sélectionnez une période avant d\'importer.', 'error'); e.target.value = ''; return; }
  const f = e.target.files[0];
  if (f) processAffelnetFile(f, periode);
  e.target.value = '';
}
function handleDropOrientation(e) { e.preventDefault(); document.getElementById('drop-zone-orientation').classList.remove('dragging'); const f = e.dataTransfer.files[0]; if (f) processOrientationFile(f); }
function handleOrientationSelect(e) { const f = e.target.files[0]; if (f) processOrientationFile(f); e.target.value = ''; }
function handleDropFormations(e) { e.preventDefault(); document.getElementById('drop-zone-formations').classList.remove('dragging'); const f = e.dataTransfer.files[0]; if (f) processFormationsFile(f); }
function handleFormationsSelect(e) { const f = e.target.files[0]; if (f) processFormationsFile(f); e.target.value = ''; }

function processAffelnetFile(file, periode) {
  if (!periode) { showToast('Période de rattachement manquante.', 'error'); return; }
  const prog = document.getElementById('import-progress');
  const log  = document.getElementById('import-log');
  prog.style.display = 'block';
  const periodeLabel = { preTour:'Pré-Tour', premierTour:'1er Tour', secondTour:'2nd Tour' }[periode] || periode;
  log.innerHTML = `<span class="log-info">📂 Lecture : ${esc(file.name)} — période : ${periodeLabel}…</span><br>`;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb    = XLSX.read(e.target.result, { type: 'array' });
      const sheet = wb.SheetNames[0];
      const rows  = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' });
      log.innerHTML += `<span class="log-info">📊 Feuille : « ${sheet} » — ${rows.length} lignes</span><br>`;

      const formations = DB.getFormations() || [];
      const existing   = DB.getStudents();
      let added = 0, updated = 0, skipped = 0;

      rows.forEach(row => {
        const ine = String(row['INE'] || '').trim();
        if (!ine) { skipped++; return; }
        const libelleFormation = String(row['Libellé formation'] || '').trim();
        const classeAffectee   = resolveClasse(libelleFormation, formations) || '';
        const ex = existing.find(s => s.ine === ine);

        // Cumul des périodes : on garde les précédentes et on ajoute celle-ci si nouvelle
        const exPeriodes = ex ? (ex.periodesSource || (ex.periodeSource ? [ex.periodeSource] : [])) : [];
        const periodesSource = exPeriodes.includes(periode) ? exPeriodes : [...exPeriodes, periode];

        const student = {
          ine,
          nom:    String(row['Nom'] || '').trim().toUpperCase(),
          prenom: String(row['Prénom 1'] || row['Prenom 1'] || '').trim(),
          libelleFormation, classeAffectee,
          lv1:  String(row['Libellé  LV1'] || row['Libellé LV1'] || '').trim(),
          lv2:  String(row['Libellé  LV2'] || row['Libellé LV2'] || '').trim(),
          etablissementOrigine: String(row['Den. comp. étab. origine'] || '').trim(),
          rang: String(row['Rang'] || '').trim(),
          statut: 'non_inscrit',
          source: 'affelnet',
          periodeSource: periode,      // Période du dernier import
          periodesSource,              // Toutes les périodes où l'élève apparaît
        };
        if (ex) {
          // Ne conserver que les champs définis (undefined interdit par Firestore)
          const keepDefined = (src, keys) => Object.fromEntries(
            keys.filter(k => src[k] !== undefined && src[k] !== null).map(k => [k, src[k]])
          );
          DB.upsertStudent({
            ...student,
            ...keepDefined(ex, ['statut','dateInscription','inscritPar','periode',
                                 'deroDate','deroDemandeePar','deroValidePar','deroRefusMotif']),
          });
          updated++;
        } else { DB.upsertStudent(student); added++; }
      });

      log.innerHTML += `<span class="log-ok">✅ ${added} élèves ajoutés (${periodeLabel})</span><br>`;
      if (updated) log.innerHTML += `<span class="log-info">🔄 ${updated} élèves mis à jour (période ajoutée si nouvelle)</span><br>`;
      if (skipped) log.innerHTML += `<span class="log-warn">⚠️ ${skipped} lignes ignorées (pas d'INE)</span><br>`;
      log.innerHTML += `<span class="log-ok">✅ Import terminé — Total : ${DB.getStudents().length} élèves</span>`;
      DB.addActivity({ type:'import', label:`Import AFFELNET ${periodeLabel} : ${rows.length} élèves`, detail:`${added} ajoutés, ${updated} mis à jour — ${file.name}` });
      document.getElementById('import-actions').innerHTML = `
        <button class="btn btn-primary" onclick="navigateTo('students')">👥 Voir les élèves</button>
        <button class="btn btn-secondary" onclick="navigateTo('dashboard')">📊 Tableau de bord</button>`;
      renderSidebar(); showToast(`Import réussi : ${added + updated} élèves traités`, 'success');
    } catch(err) { log.innerHTML += `<span style="color:red">❌ Erreur : ${err.message}</span>`; }
  };
  reader.readAsArrayBuffer(file);
}

function processOrientationFile(file) {
  const log = document.getElementById('orientation-log');
  log.innerHTML = `<div class="import-log"><span class="log-info">📂 Lecture : ${esc(file.name)}…</span></div>`;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const formations = DB.getFormations() || [];
      let created = 0, updated = 0, skipped = 0;

      // Sépare "NOM Prénom" : les mots tout en majuscules = nom, le reste = prénom
      const splitEleve = str => {
        const parts = String(str).trim().split(/\s+/);
        const nomP = [], prenomP = [];
        let prenomStarted = false;
        parts.forEach(p => {
          if (!prenomStarted && p === p.toUpperCase() && /[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ]/.test(p)) {
            nomP.push(p);
          } else { prenomStarted = true; prenomP.push(p); }
        });
        return { nom: nomP.join(' '), prenom: prenomP.join(' ') };
      };

      rows.forEach(row => {
        // Colonne INE : « Numéro nationnal » (avec la faute du fichier source)
        const ine = String(
          row['Numéro nationnal'] || row['Numéro national'] || row['INE'] || row['ine'] || ''
        ).trim();

        // Nom / Prénom depuis la colonne « Élèves »
        const eleve = String(row['Élèves'] || row['Eleves'] || '').trim();
        const { nom, prenom } = eleve ? splitEleve(eleve)
          : { nom: String(row['Nom']||'').trim().toUpperCase(), prenom: String(row['Prénom']||'').trim() };

        if (!ine && !(nom && prenom)) { skipped++; return; }

        const classeActuelle   = String(row['Classe'] || row['Classe actuelle'] || '').trim();
        const formationSouhait = String(row['Orientation'] || row['Formation souhaitée'] || '').trim();
        const lv1              = String(row['LV1'] || row['Libellé  LV1'] || '').trim();
        const lv2              = String(row['LV2'] || row['Libellé  LV2'] || '').trim();
        const sexe             = String(row['Sexe'] || '').trim();
        const redoublant       = String(row['Redoublant'] || '').trim() !== '';

        // Spécialités (Bac Général) : regrouper les colonnes non vides
        const specialites = ['Spécialité 1','Spécialité 2','Spécialité 3','Spécialité 4','Spécialité 5']
          .map(k => String(row[k] || '').trim()).filter(Boolean);

        // Résoudre la classe cible depuis l'orientation
        const classeAffecteeOri = formationSouhait ? resolveClasse(formationSouhait, formations) : '';

        const patch = {
          ...(nom              ? { nom }                                          : {}),
          ...(prenom           ? { prenom }                                       : {}),
          ...(sexe             ? { sexe }                                         : {}),
          redoublant: redoublant,   // toujours mis à jour (true ou false)
          ...(classeActuelle   ? { classeActuelle }                               : {}),
          ...(formationSouhait ? { formationSouhaitee: formationSouhait }         : {}),
          // Redoublants : pas d'affectation automatique — le proviseur choisit la classe de redoublement
          // Non-redoublants : la classe est résolue depuis l'orientation
          ...(!redoublant && classeAffecteeOri
            ? { classeAffectee: classeAffecteeOri, classeAffecteeOrientation: classeAffecteeOri }
            : (classeAffecteeOri ? { classeAffecteeOrientation: classeAffecteeOri } : {})
          ),
          ...(specialites.length? { specialites }                                 : {}),
          ...(lv1              ? { lv1 }                                          : {}),
          ...(lv2              ? { lv2 }                                          : {}),
        };

        if (ine) {
          const existing = DB.getStudents().find(s => s.ine === ine);
          if (existing) { DB.upsertStudent({ ine, source: 'orientation', ...patch }); updated++; }
          else           { DB.upsertStudent({ ine, statut: 'non_inscrit', source: 'orientation', ...patch }); created++; }
        } else {
          // Fallback recherche par Nom+Prénom
          const existing = DB.getStudents().find(s =>
            s.nom === nom && s.prenom.toLowerCase() === prenom.toLowerCase()
          );
          if (existing) { DB.upsertStudent({ ine: existing.ine, source: 'orientation', ...patch }); updated++; }
          else { skipped++; }
        }
      });

      const allStudents    = DB.getStudents();
      const nbRedoublants  = allStudents.filter(s => s.redoublant && !s.classeAffectee).length;
      const nonResolus     = allStudents.filter(s => !s.redoublant && s.formationSouhaitee && !s.classeAffectee).length;
      const lines = [`<span class="log-ok">✅ ${updated} fiches enrichies — classe affectée mise à jour depuis l'orientation</span>`];
      if (created)       lines.push(`<span class="log-info">➕ ${created} nouvelles fiches créées (élèves non encore dans AFFELNET)</span>`);
      if (nbRedoublants) lines.push(`<span class="log-warn">🔄 ${nbRedoublants} redoublant(s) sans classe — le Proviseur doit les affecter manuellement</span>`);
      if (nonResolus)    lines.push(`<span class="log-warn">⚠️ ${nonResolus} élève(s) avec une orientation non reconnue — vérifiez Classes & Formations</span>`);
      if (skipped)       lines.push(`<span class="log-warn">⚠️ ${skipped} lignes ignorées (INE manquant, pas de correspondance Nom/Prénom)</span>`);
      log.innerHTML = `<div class="import-log">${lines.join('<br>')}</div>`;
      DB.addActivity({ type:'import', label:`Import orientation : ${updated + created} élèves`, detail:`${updated} mis à jour, ${created} créés — ${file.name}` });
      renderSidebar();
      showToast(`Orientation importée : ${updated + created} élèves traités.`, 'success');
    } catch(err) { log.innerHTML = `<div class="import-log"><span style="color:red">❌ Erreur : ${err.message}</span></div>`; }
  };
  reader.readAsArrayBuffer(file);
}

function processFormationsFile(file) {
  const log = document.getElementById('formations-log');
  log.innerHTML = `<span class="log-info">Lecture…</span>`;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const formations = rows
        .filter(r => r['Libellé formation'] && r['classe affectée'])
        .map(r => ({ libelleAffelnet: String(r['Libellé formation']).trim(), classeAffectee: String(r['classe affectée']).trim() }));
      DB.saveFormations(formations);

      // Mettre à jour les capacités/filières si présentes
      const classes = DB.getClasses();
      rows.forEach(r => {
        const code = String(r['classe affectée'] || '').trim();
        if (!code) return;
        const cap = parseInt(r['Capacité'] || r['Capacite'] || r['capacite'] || 0) || 0;
        const fil = String(r['Filière'] || r['Filiere'] || r['filiere'] || '').trim();
        if (cap > 0 || fil) DB.upsertClass(code, { ...(cap>0?{capacite:cap}:{}), ...(fil?{filiere:fil}:{}) });
      });

      log.innerHTML = `<div class="import-log"><span class="log-ok">✅ ${formations.length} libellés importés — classes mises à jour</span></div>`;
      showToast(`${formations.length} formations importées.`, 'success');
    } catch(err) { log.innerHTML = `<div style="color:red">❌ Erreur : ${err.message}</div>`; }
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
  a.href = url; a.download = `affelnet-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Export réussi.', 'success');
}

function importData(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!confirm(`Restaurer les données du ${data.exportedAt?new Date(data.exportedAt).toLocaleString('fr-FR'):'fichier sélectionné'} ? Les données actuelles seront remplacées.`)) return;
      DB.importAll(data); showToast('Données restaurées avec succès.', 'success');
      navigateTo('dashboard');
    } catch(err) { showToast('Erreur lors de la restauration : ' + err.message, 'error'); }
  };
  reader.readAsText(file); e.target.value = '';
}

function confirmReset() {
  if (!confirm('⚠️ Attention : cela supprimera TOUS les élèves et le journal d\'activité.\n\nConfirmer la réinitialisation ?')) return;
  const annee = prompt('Entrez la nouvelle année scolaire (ex: 2026-2027) :');
  if (!annee) return;
  DB.resetStudents();
  const s = DB.getSettings();
  s.annee = annee;
  s.periodes = { preTour:{debut:'',fin:''}, premierTour:{debut:'',fin:''}, secondTour:{debut:'',fin:''} };
  DB.saveSettings(s);
  showToast('Base réinitialisée pour ' + annee, 'success');
  navigateTo('dashboard');
}

function annulerInscription(ine) {
  if (!confirm('Annuler l\'inscription de cet élève ?')) return;
  const s = DB.getStudent(ine);
  DB.updateStudentStatus(ine, { statut:'non_inscrit', dateInscription:null, inscritPar:null, periode:null, deroDate:null, deroDemandeePar:null, deroValidePar:null, deroRefusMotif:null });
  DB.addActivity({ type:'annulation', label:`Inscription annulée : ${s.nom} ${s.prenom}`, detail:`Par ${currentUser.prenom} ${currentUser.nom}` });
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
  // Élèves orientation : inscription libre pour tous les rôles
  if (s.source === 'orientation') return true;
  // Proviseur et Secrétaire : toujours autorisés (peuvent inscrire hors période)
  if (currentUser.role === 'proviseur' || currentUser.role === 'secretaire') return true;
  // AED : la période active doit exister ET l'élève doit y être rattaché
  const activePeriode = DB.getPeriodeActive();
  if (!activePeriode) return false;
  const periodesSource = s.periodesSource || (s.periodeSource ? [s.periodeSource] : []);
  // Rétrocompatibilité : élève importé avant la gestion des périodes → autorisé si période active
  if (periodesSource.length === 0) return true;
  return periodesSource.includes(activePeriode);
}

function statusBadge(statut) {
  const map = {
    'non_inscrit':        ['badge-non',    '⚫', 'Non inscrit'],
    'inscrit':            ['badge-inscrit','✅', 'Inscrit'],
    'hors_periode':       ['badge-hors',   '🟣', 'Inscrit hors période'],
    'derogation_attente': ['badge-attente','⏳', 'Dérogation en attente'],
    'derogation_valide':  ['badge-valide', '✔️', 'Dérogation validée'],
    'derogation_refuse':  ['badge-refuse', '❌', 'Dérogation refusée'],
  };
  const [cls, icon, label] = map[statut] || ['badge-non','?',statut||'—'];
  return `<span class="badge ${cls}">${icon} ${label}</span>`;
}

function periodeBadge(periode) {
  if (!periode) return '';
  const map = { preTour:['badge-pre','🔵','Pré-Tour'], premierTour:['badge-premier','🟣','1er Tour'], secondTour:['badge-second','🔴','2nd Tour'], hors_periode:['badge-hors','⚫','Hors période'], orientation:['badge-inscrit','🎓','Orientation'], derogation:['badge-valide','✔️','Dérogation'] };
  const [cls, icon, label] = map[periode] || [];
  if (!cls) return '';
  return `<span class="badge ${cls}">${icon} ${label}</span>`;
}

// Badge inline période AFFELNET (dans colonne Nom de la liste élèves)
function periodeBadgeInline(periodeSource) {
  const map = {
    preTour:     ['#1565C0', '🔵 Pré-Tour'],
    premierTour: ['#6A1B9A', '🟣 Tour 1'],
    secondTour:  ['#B71C1C', '🔴 Tour 2'],
  };
  const [bg, label] = map[periodeSource] || ['#455A64', '📥 AFFELNET'];
  return `<span style="display:inline-block;margin-left:.4rem;font-size:.7rem;background:${bg};color:#fff;padding:.1rem .4rem;border-radius:50px;vertical-align:middle">${label}</span>`;
}

function roleFr(role) { return { proviseur:'Proviseur', secretaire:'Secrétaire', aed:'AED Accueil' }[role] || role; }
function periodeFr(p) { return { preTour:'Pré-Tour', premierTour:'1er Tour', secondTour:'2nd Tour', hors_periode:'Hors période', orientation:'Orientation', derogation:'Dérogation validée' }[p] || p || '—'; }
function activityIcon(type) { return { inscription:'✅', import:'📥', derogation:'⚠️', dero_valide:'✔️', dero_refuse:'❌', annulation:'↩️', param:'⚙️', modif:'✏️' }[type] || '📋'; }

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)   return 'à l\'instant';
  if (diff < 3600000) return Math.floor(diff/60000) + ' min';
  if (diff < 86400000)return Math.floor(diff/3600000) + 'h';
  return new Date(iso).toLocaleDateString('fr-FR');
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'success') {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.innerHTML = `<span>${icons[type]||'•'}</span>${esc(msg)}`;
  document.getElementById('toast-area').appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') doLogin();
  if (e.key === 'Escape') closeModal();
});
