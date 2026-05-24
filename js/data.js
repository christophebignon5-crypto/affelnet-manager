/* =====================================================
   data.js — Gestion des données (LocalStorage)
   ===================================================== */

const DB = {
  KEYS: {
    SETTINGS:   'affelnet_settings',
    STUDENTS:   'affelnet_students',
    ACTIVITY:   'affelnet_activity',
    FORMATIONS: 'affelnet_formations',
    CLASSES:    'affelnet_classes',
    SESSION:    'affelnet_session',
  },

  init() {
    if (!this.getSettings()) {
      this.saveSettings({
        annee: '2025-2026',
        etablissement: 'LPO Léopold Elfort',
        ville: 'Mana, Guyane',
        periodes: {
          preTour:     { debut: '', fin: '' },
          premierTour: { debut: '', fin: '' },
          secondTour:  { debut: '', fin: '' },
        },
        users: [
          { id: 'u1', nom: 'Direction',    prenom: 'Proviseur',  role: 'proviseur',  login: 'proviseur',  password: 'proviseur2025' },
          { id: 'u2', nom: 'Secrétariat',  prenom: 'Secrétaire', role: 'secretaire', login: 'secretaire', password: 'secr2025' },
          { id: 'u3', nom: 'Accueil',      prenom: 'AED',        role: 'aed',        login: 'aed',        password: 'aed2025' },
        ]
      });
    }
    if (!this.getFormations()) {
      this.saveFormations(DEFAULT_FORMATIONS);
    }
    if (!this.getClasses()) {
      this.saveClasses(this._buildDefaultClasses());
    }
    if (!localStorage.getItem(this.KEYS.STUDENTS)) {
      localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.KEYS.ACTIVITY)) {
      localStorage.setItem(this.KEYS.ACTIVITY, JSON.stringify([]));
    }
  },

  _buildDefaultClasses() {
    const cls = {};
    DEFAULT_FORMATIONS.forEach(f => {
      if (!cls[f.classeAffectee]) {
        cls[f.classeAffectee] = { capacite: 0, filiere: f.filiere || '', libelle: '' };
      }
    });
    return cls;
  },

  // ── Paramètres ─────────────────────────────────────
  getSettings()    { return JSON.parse(localStorage.getItem(this.KEYS.SETTINGS)); },
  saveSettings(s)  { localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(s)); },

  // ── Formations (libellé AFFELNET → classe) ──────────
  getFormations()   { return JSON.parse(localStorage.getItem(this.KEYS.FORMATIONS)); },
  saveFormations(f) { localStorage.setItem(this.KEYS.FORMATIONS, JSON.stringify(f)); },

  upsertFormation(libelleAffelnet, classeAffectee) {
    const arr = this.getFormations() || [];
    const idx = arr.findIndex(f => f.libelleAffelnet === libelleAffelnet);
    if (idx >= 0) arr[idx].classeAffectee = classeAffectee;
    else arr.push({ libelleAffelnet, classeAffectee });
    this.saveFormations(arr);
  },

  deleteFormation(libelleAffelnet) {
    const arr = (this.getFormations() || []).filter(f => f.libelleAffelnet !== libelleAffelnet);
    this.saveFormations(arr);
  },

  // ── Classes (code → capacité, filière) ─────────────
  getClasses()   { return JSON.parse(localStorage.getItem(this.KEYS.CLASSES)) || {}; },
  saveClasses(c) { localStorage.setItem(this.KEYS.CLASSES, JSON.stringify(c)); },

  getClass(code) {
    return (this.getClasses())[code] || { capacite: 0, filiere: '', libelle: '' };
  },

  upsertClass(code, props) {
    const cls = this.getClasses();
    cls[code] = { ...(cls[code] || { capacite: 0, filiere: '', libelle: '' }), ...props };
    this.saveClasses(cls);
  },

  deleteClass(code) {
    const cls = this.getClasses();
    delete cls[code];
    this.saveClasses(cls);
    const arr = (this.getFormations() || []).filter(f => f.classeAffectee !== code);
    this.saveFormations(arr);
  },

  // ── Élèves ─────────────────────────────────────────
  getStudents()     { return JSON.parse(localStorage.getItem(this.KEYS.STUDENTS)) || []; },
  saveStudents(arr) { localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify(arr)); },

  getStudent(ine) {
    return this.getStudents().find(s => s.ine === ine);
  },

  upsertStudent(student) {
    const arr = this.getStudents();
    const idx = arr.findIndex(s => s.ine === student.ine);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...student };
    else arr.push(student);
    this.saveStudents(arr);
  },

  updateStudentStatus(ine, patch) {
    const arr = this.getStudents();
    const idx = arr.findIndex(s => s.ine === ine);
    if (idx >= 0) {
      arr[idx] = { ...arr[idx], ...patch };
      this.saveStudents(arr);
      return arr[idx];
    }
    return null;
  },

  // ── Session ─────────────────────────────────────────
  getSession()    { return JSON.parse(sessionStorage.getItem(this.KEYS.SESSION)); },
  saveSession(u)  { sessionStorage.setItem(this.KEYS.SESSION, JSON.stringify(u)); },
  clearSession()  { sessionStorage.removeItem(this.KEYS.SESSION); },

  // ── Authentification ────────────────────────────────
  authenticate(login, password) {
    const settings = this.getSettings();
    return settings.users.find(u => u.login === login && u.password === password) || null;
  },

  // ── Journal ─────────────────────────────────────────
  getActivity()  { return JSON.parse(localStorage.getItem(this.KEYS.ACTIVITY)) || []; },
  addActivity(entry) {
    const arr = this.getActivity();
    arr.unshift({ ...entry, id: Date.now(), ts: new Date().toISOString() });
    if (arr.length > 500) arr.pop();
    localStorage.setItem(this.KEYS.ACTIVITY, JSON.stringify(arr));
  },

  // ── Statistiques globales ───────────────────────────
  getStats() {
    const students  = this.getStudents();
    const classes   = this.getClasses();

    const total           = students.length;
    const inscrits        = students.filter(s => s.statut === 'inscrit' || s.statut === 'hors_periode').length;
    const attente         = students.filter(s => s.statut === 'derogation_attente').length;
    const refuses         = students.filter(s => s.statut === 'derogation_refuse').length;
    const nonInscrits     = total - inscrits - attente - refuses;
    const redoublantsSansClasse = students.filter(s => s.redoublant && !s.classeAffectee).length;

    // Par classe
    const byClasse = {};
    students.forEach(s => {
      const cl = s.classeAffectee || 'Non défini';
      if (!byClasse[cl]) {
        const cfg = classes[cl] || {};
        byClasse[cl] = {
          total: 0, inscrits: 0, attente: 0,
          capacite: cfg.capacite || 0,
          filiere:  cfg.filiere  || '',
          libelle:  cfg.libelle  || '',
        };
      }
      byClasse[cl].total++;
      if (s.statut === 'inscrit' || s.statut === 'hors_periode') byClasse[cl].inscrits++;
      if (s.statut === 'derogation_attente') byClasse[cl].attente++;
    });

    // Ajouter les classes configurées sans élèves
    Object.entries(classes).forEach(([code, cfg]) => {
      if (!byClasse[code] && cfg.capacite > 0) {
        byClasse[code] = {
          total: 0, inscrits: 0, attente: 0,
          capacite: cfg.capacite || 0,
          filiere:  cfg.filiere  || '',
          libelle:  cfg.libelle  || '',
        };
      }
    });

    // Par jour (7 derniers jours)
    const byDay = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      byDay[d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })] = 0;
    }
    students.filter(s => s.dateInscription).forEach(s => {
      const d = new Date(s.dateInscription);
      const key = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
      if (key in byDay) byDay[key]++;
    });

    return { total, inscrits, attente, refuses, nonInscrits, redoublantsSansClasse, byClasse, byDay };
  },

  // ── Période active ──────────────────────────────────
  getPeriodeActive() {
    const { periodes } = this.getSettings();
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const check = (p, name) => {
      if (!p.debut || !p.fin) return false;
      const d = new Date(p.debut); d.setHours(0,0,0,0);
      const f = new Date(p.fin);   f.setHours(23,59,59,999);
      return now >= d && now <= f ? name : false;
    };
    return check(periodes.preTour, 'preTour')
        || check(periodes.premierTour, 'premierTour')
        || check(periodes.secondTour, 'secondTour')
        || null;
  },

  canEnrollNow(role) {
    if (role === 'proviseur' || role === 'secretaire') return true;
    return this.getPeriodeActive() !== null;
  },

  // ── Export / Import JSON complet ────────────────────
  exportAll() {
    return {
      settings:   this.getSettings(),
      students:   this.getStudents(),
      formations: this.getFormations(),
      classes:    this.getClasses(),
      activity:   this.getActivity().slice(0, 200),
      exportedAt: new Date().toISOString(),
      version:    '2.0',
    };
  },

  importAll(data) {
    if (data.settings)   this.saveSettings(data.settings);
    if (data.students)   this.saveStudents(data.students);
    if (data.formations) this.saveFormations(data.formations);
    if (data.classes)    this.saveClasses(data.classes);
  },

  // ── Reset pour nouvelle année ───────────────────────
  resetStudents() {
    this.saveStudents([]);
    localStorage.setItem(this.KEYS.ACTIVITY, JSON.stringify([]));
  }
};

// ── Données de référence par défaut ────────────────────────
const DEFAULT_FORMATIONS = [
  // ─── CAP 1ère année ───
  { libelleAffelnet: '1CAP2  BOUCHER',                            classeAffectee: '1CAP BOU',  filiere: 'CAP' },
  { libelleAffelnet: '1CAP2 BOUCHER CODE PRI',                    classeAffectee: '1CAP BOU',  filiere: 'CAP' },
  { libelleAffelnet: '1CAP2  EQUIPIER POLYVALENT DU COMMERCE',    classeAffectee: '1CAP EPC',  filiere: 'CAP' },
  { libelleAffelnet: '1CAP2 EQUIPIER POL COM MULTI CODE PRIORI',  classeAffectee: '1CAP EPC',  filiere: 'CAP' },
  { libelleAffelnet: '1CAP2  METIERS DE LA MODE- VÊT. TAILLEUR',  classeAffectee: '1CAP MVT',  filiere: 'CAP' },
  { libelleAffelnet: '1CAP2 MET MODE- VÊT. TAILLEUR CODE PRIO',   classeAffectee: '1CAP MVT',  filiere: 'CAP' },
  { libelleAffelnet: '1CAP2  METIERS DE LA MODE-VÊTEMENT FLOU',   classeAffectee: '1CAP MVF',  filiere: 'CAP' },
  { libelleAffelnet: '1CAP2 MET DE LA MODE-VÊT FLOU CODE PRIO',   classeAffectee: '1CAP MVF',  filiere: 'CAP' },
  { libelleAffelnet: '1CAP2  POISSONNIER ECAILLER',               classeAffectee: '1CAP POI',  filiere: 'CAP' },
  { libelleAffelnet: '1CAP2 POISSONNIER CODE PRIORITAIRE',        classeAffectee: '1CAP POI',  filiere: 'CAP' },
  { libelleAffelnet: '1CAP2 ADAL : TOURISME',                     classeAffectee: '1CAP TOUR', filiere: 'CAP' },
  { libelleAffelnet: '1CAP2 ADAL : TOURISME CODE PRIO',           classeAffectee: '1CAP TOUR', filiere: 'CAP' },
  { libelleAffelnet: '1CAP2 DEVLPT: ACT.FAMIL.ARTIS.TOUR.-TOM',  classeAffectee: '1CAP AFAT', filiere: 'CAP' },
  { libelleAffelnet: '1CAP2 DEVLPT ACT.FAMIL.ARTIS.TOUR.PRIO',   classeAffectee: '1CAP AFAT', filiere: 'CAP' },
  // ─── CAP 2ème année (Terminale CAP) ───
  { libelleAffelnet: '2CAP2  BOUCHER',                            classeAffectee: 'TCAP BOU',  filiere: 'CAP' },
  { libelleAffelnet: '2CAP2  POISSONNIER ECAILLER',               classeAffectee: 'TCAP POI',  filiere: 'CAP' },
  { libelleAffelnet: '2CAP2  METIERS DE LA MODE- VÊT. TAILLEUR',  classeAffectee: 'TCAP MVT',  filiere: 'CAP' },
  { libelleAffelnet: '2CAP2  METIERS DE LA MODE-VÊTEMENT FLOU',   classeAffectee: 'TCAP MVF',  filiere: 'CAP' },
  { libelleAffelnet: '2CAP2 ADAL : TOURISME',                     classeAffectee: 'TCAP TOUR', filiere: 'CAP' },
  { libelleAffelnet: '2CAP2 DEVLPT: ACT.FAMIL.ARTIS.TOUR.-TOM',  classeAffectee: 'TCAP AFAT', filiere: 'CAP' },
  { libelleAffelnet: '2CAP2  EQUIPIER POLYVALENT DU COMMERCE',    classeAffectee: 'TCAP EPC',  filiere: 'CAP' },
  // ─── Bac Pro 2nde commune ───
  { libelleAffelnet: '2NDPRO MET. DE L\'ALIMENTAT. 2NDE COMMUNE', classeAffectee: '2BP ALIM',  filiere: 'Bac Pro' },
  { libelleAffelnet: '2NDPRO MET. RELATION CLIENT 2NDE COMMUNE',  classeAffectee: '2BP MRC',   filiere: 'Bac Pro' },
  { libelleAffelnet: '2NDPRO MET.ENTRETIEN TEXT. 2NDE COMMUNE',   classeAffectee: '2BP MET',   filiere: 'Bac Pro' },
  { libelleAffelnet: '2NDPRO METIERS DE COUTURE ET DE CONFECT.',  classeAffectee: '2BP MCC',   filiere: 'Bac Pro' },
  // ─── Bac Pro 1ère année ───
  { libelleAffelnet: '1ERPRO BOUCHER-CHARCUTIER-TRAITEUR',        classeAffectee: '1BP BOU',   filiere: 'Bac Pro' },
  { libelleAffelnet: '1ERPRO POISSONNIER-ECAILLER-TRAITEUR',      classeAffectee: '1BP POI',   filiere: 'Bac Pro' },
  { libelleAffelnet: '1ERPRO MET.ENTRET.TEXT.OPT.A BLANCHISS.',   classeAffectee: '1BP MET',   filiere: 'Bac Pro' },
  { libelleAffelnet: '1ERPRO METIERS DE COUTURE ET DE CONFECT.',  classeAffectee: '1BP MCC',   filiere: 'Bac Pro' },
  { libelleAffelnet: '1ERPRO MET.COM.VEN.OP.A ANI.GES.ESP.COM.',  classeAffectee: '1BP MCV',   filiere: 'Bac Pro' },
  { libelleAffelnet: '1ERPRO MET.COM.VEN.OP.B PR.CL.VA.OF.COM.', classeAffectee: '1BP MCV',   filiere: 'Bac Pro' },
  { libelleAffelnet: '1ERPRO METIERS DE L\'ACCUEIL',              classeAffectee: '1BP MA',    filiere: 'Bac Pro' },
  // ─── Bac Pro Terminale ───
  { libelleAffelnet: 'TLEPRO BOUCHER-CHARCUTIER-TRAITEUR',        classeAffectee: 'TBP BOU',   filiere: 'Bac Pro' },
  { libelleAffelnet: 'TLEPRO POISSONNIER-ECAILLER-TRAITEUR',      classeAffectee: 'TBP POI',   filiere: 'Bac Pro' },
  { libelleAffelnet: 'TLEPRO MET.ENTRET.TEXT.OPT.A BLANCHISS.',   classeAffectee: 'TBP MET',   filiere: 'Bac Pro' },
  { libelleAffelnet: 'TLEPRO METIERS DE LA MODE - VÊTEMENT',      classeAffectee: 'TBP MMV',   filiere: 'Bac Pro' },
  { libelleAffelnet: 'TLEPRO METIERS DE L\'ACCUEIL',              classeAffectee: 'TBP MA',    filiere: 'Bac Pro' },
  { libelleAffelnet: 'TLEPRO MET.COM.VEN.OP.A ANI.GES.ESP.COM.',  classeAffectee: 'TBP MCV',   filiere: 'Bac Pro' },
  { libelleAffelnet: 'TLEPRO MET.COM.VEN.OP.B PR.CL.VA.OF.COM.', classeAffectee: 'TBP MCV',   filiere: 'Bac Pro' },
  // ─── GT / STMG ───
  { libelleAffelnet: '2NDE GENERALE ET TECHNOLOGIQUE',            classeAffectee: '2nde GT',   filiere: 'LGT' },
  { libelleAffelnet: '1-STMG SC. & TECHNO. MANAGEMENT GESTION',  classeAffectee: '1 STMG',    filiere: 'LGT' },
  { libelleAffelnet: '1-STMG SC.& TECHNO. MANAGEMENT GESTION',   classeAffectee: '1 STMG',    filiere: 'LGT' },
  { libelleAffelnet: 'TERMINALE GENERALE',                        classeAffectee: 'TG',        filiere: 'LGT' },
  { libelleAffelnet: 'T-STMG SYSTEMES D\'INFORMATION DE GESTION', classeAffectee: 'TSTMG',     filiere: 'LGT' },
  { libelleAffelnet: 'T-STMG MERCATIQUE (MARKETING)',             classeAffectee: 'TSTMG',     filiere: 'LGT' },
  { libelleAffelnet: 'T-STMG GESTION ET FINANCE',                 classeAffectee: 'TSTMG',     filiere: 'LGT' },
];

// ── Résolution libellé → classe ─────────────────────────────
function resolveClasse(libelleFormation, formations) {
  if (!libelleFormation || !formations || !formations.length) return '';
  const clean = s => s.trim().toUpperCase().replace(/\s+/g, ' ');
  const lf = clean(libelleFormation);
  // 1. Correspondance exacte (insensible à la casse et aux espaces multiples)
  const exact = formations.find(f => clean(f.libelleAffelnet) === lf);
  if (exact) return exact.classeAffectee;
  // 2. Correspondance partielle : le libellé configuré est contenu dans le libellé fourni
  const partial = formations.find(f => lf.includes(clean(f.libelleAffelnet)) || clean(f.libelleAffelnet).includes(lf));
  if (partial) return partial.classeAffectee;
  // Aucune correspondance → classe non résolue (ne pas retourner le libellé brut)
  return '';
}
