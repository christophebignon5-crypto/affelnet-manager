/* =====================================================
   data.js — Gestion des données (LocalStorage)
   ===================================================== */

const DB = {
  // ── Clés localStorage ──────────────────────────────
  KEYS: {
    SETTINGS:  'affelnet_settings',
    STUDENTS:  'affelnet_students',
    ACTIVITY:  'affelnet_activity',
    FORMATIONS:'affelnet_formations',
    SESSION:   'affelnet_session',
  },

  // ── Initialisation par défaut ───────────────────────
  init() {
    if (!this.getSettings()) {
      this.saveSettings({
        annee: '2025-2026',
        etablissement: 'LPO Léopold Elfort',
        ville: 'Mana, Guyane',
        periodes: {
          preTour:     { debut: '', fin: '', actif: false },
          premierTour: { debut: '', fin: '', actif: false },
          secondTour:  { debut: '', fin: '', actif: false },
        },
        users: [
          { id: 'u1', nom: 'Direction', prenom: 'Proviseur', role: 'proviseur',  login: 'proviseur', password: 'proviseur2025' },
          { id: 'u2', nom: 'Secrétariat', prenom: 'Secrétaire', role: 'secretaire', login: 'secretaire', password: 'secr2025' },
          { id: 'u3', nom: 'Accueil', prenom: 'AED', role: 'aed', login: 'aed', password: 'aed2025' },
        ]
      });
    }
    if (!this.getFormations()) {
      this.saveFormations(DEFAULT_FORMATIONS);
    }
    if (!localStorage.getItem(this.KEYS.STUDENTS)) {
      localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.KEYS.ACTIVITY)) {
      localStorage.setItem(this.KEYS.ACTIVITY, JSON.stringify([]));
    }
  },

  // ── Paramètres ─────────────────────────────────────
  getSettings()      { return JSON.parse(localStorage.getItem(this.KEYS.SETTINGS)); },
  saveSettings(s)    { localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(s)); },

  // ── Formations ─────────────────────────────────────
  getFormations()    { return JSON.parse(localStorage.getItem(this.KEYS.FORMATIONS)); },
  saveFormations(f)  { localStorage.setItem(this.KEYS.FORMATIONS, JSON.stringify(f)); },

  // ── Élèves ─────────────────────────────────────────
  getStudents()      { return JSON.parse(localStorage.getItem(this.KEYS.STUDENTS)) || []; },
  saveStudents(arr)  { localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify(arr)); },

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

  // ── Session utilisateur ─────────────────────────────
  getSession()    { return JSON.parse(sessionStorage.getItem(this.KEYS.SESSION)); },
  saveSession(u)  { sessionStorage.setItem(this.KEYS.SESSION, JSON.stringify(u)); },
  clearSession()  { sessionStorage.removeItem(this.KEYS.SESSION); },

  // ── Authentification ────────────────────────────────
  authenticate(login, password) {
    const settings = this.getSettings();
    return settings.users.find(u => u.login === login && u.password === password) || null;
  },

  // ── Journal d'activité ──────────────────────────────
  getActivity()   { return JSON.parse(localStorage.getItem(this.KEYS.ACTIVITY)) || []; },
  addActivity(entry) {
    const arr = this.getActivity();
    arr.unshift({ ...entry, id: Date.now(), ts: new Date().toISOString() });
    if (arr.length > 500) arr.pop();
    localStorage.setItem(this.KEYS.ACTIVITY, JSON.stringify(arr));
  },

  // ── Statistiques globales ───────────────────────────
  getStats() {
    const students = this.getStudents();
    const formations = this.getFormations() || [];

    const total   = students.length;
    const inscrits = students.filter(s => s.statut === 'inscrit' || s.statut === 'hors_periode').length;
    const attente  = students.filter(s => s.statut === 'derogation_attente').length;
    const refuses  = students.filter(s => s.statut === 'derogation_refuse').length;
    const nonInscrits = total - inscrits - attente - refuses;

    // Par classe
    const byClasse = {};
    students.forEach(s => {
      const cl = s.classeAffectee || 'Non défini';
      if (!byClasse[cl]) byClasse[cl] = { total: 0, inscrits: 0, attente: 0 };
      byClasse[cl].total++;
      if (s.statut === 'inscrit' || s.statut === 'hors_periode') byClasse[cl].inscrits++;
      if (s.statut === 'derogation_attente') byClasse[cl].attente++;
    });

    // Par jour (7 derniers jours)
    const byDay = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      byDay[d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })] = 0;
    }
    students
      .filter(s => s.dateInscription)
      .forEach(s => {
        const d = new Date(s.dateInscription);
        const key = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
        if (key in byDay) byDay[key]++;
      });

    return { total, inscrits, attente, refuses, nonInscrits, byClasse, byDay };
  },

  // ── Période active ──────────────────────────────────
  getPeriodeActive() {
    const { periodes } = this.getSettings();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

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

  // ── Export JSON ─────────────────────────────────────
  exportAll() {
    return {
      settings: this.getSettings(),
      students: this.getStudents(),
      formations: this.getFormations(),
      activity: this.getActivity().slice(0, 100),
      exportedAt: new Date().toISOString(),
    };
  },

  importAll(data) {
    if (data.settings)   this.saveSettings(data.settings);
    if (data.students)   this.saveStudents(data.students);
    if (data.formations) this.saveFormations(data.formations);
  },

  // ── Reset données élèves (nouvelle année) ───────────
  resetStudents() {
    this.saveStudents([]);
    localStorage.setItem(this.KEYS.ACTIVITY, JSON.stringify([]));
  }
};

// ── Données de référence : Libellés formations ─────────
const DEFAULT_FORMATIONS = [
  { libelleAffelnet: '1CAP2  BOUCHER',                            classeAffectee: '1CAP BOU' },
  { libelleAffelnet: '1CAP2  EQUIPIER POLYVALENT DU COMMERCE',    classeAffectee: '1CAP EPC' },
  { libelleAffelnet: '1CAP2  METIERS DE LA MODE- VÊT. TAILLEUR',  classeAffectee: '1CAP MVT' },
  { libelleAffelnet: '1CAP2  METIERS DE LA MODE-VÊTEMENT FLOU',   classeAffectee: '1CAP MVF' },
  { libelleAffelnet: '1CAP2  POISSONNIER ECAILLER',               classeAffectee: '1CAP POI' },
  { libelleAffelnet: '1CAP2 ADAL : TOURISME',                     classeAffectee: '1CAP TOUR' },
  { libelleAffelnet: '1CAP2 ADAL : TOURISME CODE PRIO',           classeAffectee: '1CAP TOUR' },
  { libelleAffelnet: '1CAP2 BOUCHER CODE PRI',                    classeAffectee: '1CAP BOU' },
  { libelleAffelnet: '1CAP2 DEVLPT ACT.FAMIL.ARTIS.TOUR.PRIO',   classeAffectee: '1CAP AFAT' },
  { libelleAffelnet: '1CAP2 DEVLPT: ACT.FAMIL.ARTIS.TOUR.-TOM',  classeAffectee: '1CAP AFAT' },
  { libelleAffelnet: '1CAP2 EQUIPIER POL COM MULTI CODE PRIORI',  classeAffectee: '1CAP EPC' },
  { libelleAffelnet: '1CAP2 MET DE LA MODE-VÊT FLOU CODE PRIO',  classeAffectee: '1CAP MVF' },
  { libelleAffelnet: '1CAP2 MET MODE- VÊT. TAILLEUR CODE PRIO',  classeAffectee: '1CAP MVT' },
  { libelleAffelnet: '1CAP2 POISSONNIER CODE PRIORITAIRE',        classeAffectee: '1CAP POI' },
  { libelleAffelnet: '1ERPRO BOUCHER-CHARCUTIER-TRAITEUR',        classeAffectee: '1BP BOU' },
  { libelleAffelnet: '1ERPRO MET.COM.VEN.OP.A ANI.GES.ESP.COM.',  classeAffectee: '1BP MCV' },
  { libelleAffelnet: '1ERPRO MET.COM.VEN.OP.B PR.CL.VA.OF.COM.', classeAffectee: '1BP MCV' },
  { libelleAffelnet: '1ERPRO MET.ENTRET.TEXT.OPT.A BLANCHISS.',   classeAffectee: '1BP MET' },
  { libelleAffelnet: '1ERPRO METIERS DE COUTURE ET DE CONFECT.',  classeAffectee: '1BP MCC' },
  { libelleAffelnet: '1ERPRO METIERS DE L\'ACCUEIL',              classeAffectee: '1BP MA' },
  { libelleAffelnet: '1ERPRO POISSONNIER-ECAILLER-TRAITEUR',      classeAffectee: '1BP POI' },
  { libelleAffelnet: '2NDPRO MET. DE L\'ALIMENTAT. 2NDE COMMUNE', classeAffectee: '2nde ALIM' },
  { libelleAffelnet: '2NDPRO MET. RELATION CLIENT 2NDE COMMUNE',  classeAffectee: '2nde MRC' },
  { libelleAffelnet: '2NDPRO MET.ENTRETIEN TEXT. 2NDE COMMUNE',   classeAffectee: '2nde MET' },
  { libelleAffelnet: '2NDPRO METIERS DE COUTURE ET DE CONFECT.',  classeAffectee: '2nde MCC' },
  { libelleAffelnet: '1-STMG SC. & TECHNO. MANAGEMENT GESTION',  classeAffectee: '1 STMG' },
  { libelleAffelnet: '2NDE GENERALE ET TECHNOLOGIQUE',            classeAffectee: '2nde GT' },
];

// ── Utilitaire : correspondance libellé → classe ────────
function resolveClasse(libelleFormation, formations) {
  if (!libelleFormation || !formations) return libelleFormation;
  const clean = s => s.trim().toUpperCase().replace(/\s+/g, ' ');
  const lf = clean(libelleFormation);
  const match = formations.find(f => clean(f.libelleAffelnet) === lf);
  return match ? match.classeAffectee : libelleFormation;
}
