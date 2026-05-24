/* =====================================================================
   firebase-data.js — Couche Firebase (Auth + Firestore)
   =====================================================================
   Ce fichier remplace les méthodes de DB (data.js) par des versions
   synchronisées avec Firestore, en mode "cache-first" :
   - Les lectures utilisent un cache JS en mémoire (instantané)
   - Les écritures mettent à jour le cache ET Firestore en arrière-plan
   - Un listener temps réel synchronise les élèves entre utilisateurs
   ===================================================================== */

const FB_MODE = (
  typeof FIREBASE_CONFIG !== 'undefined' &&
  FIREBASE_CONFIG.apiKey !== 'VOTRE-API-KEY'
);

if (!FB_MODE) {
  console.info('[Firebase] Config non remplie — mode LocalStorage activé.');
}

/* ── Cache mémoire ────────────────────────────────────────────────── */
const FB_CACHE = {
  settings:   null,
  students:   [],
  formations: null,
  activity:   [],
  loaded:     false,
};

/* ── Références Firebase ─────────────────────────────────────────── */
let fbApp   = null;
let fbAuth  = null;
let fbDb    = null;
let fbUnsubscribe = null;  // listener temps réel élèves

if (FB_MODE) {
  fbApp  = firebase.initializeApp(FIREBASE_CONFIG);
  fbAuth = firebase.auth();
  fbDb   = firebase.firestore();
}

/* ═════════════════════════════════════════════════════════════════
   CHARGEMENT INITIAL DEPUIS FIRESTORE
═════════════════════════════════════════════════════════════════ */
async function fbLoadAll() {
  if (!FB_MODE) return;

  try {
    const [settSnap, studSnap, formSnap, actSnap] = await Promise.all([
      fbDb.collection('config').doc('settings').get(),
      fbDb.collection('students').get(),
      fbDb.collection('config').doc('formations').get(),
      fbDb.collection('activity').orderBy('ts', 'desc').limit(200).get(),
    ]);

    if (settSnap.exists) {
      FB_CACHE.settings = settSnap.data();
      localStorage.setItem(DB.KEYS.SETTINGS, JSON.stringify(FB_CACHE.settings));
    }
    if (formSnap.exists) {
      FB_CACHE.formations = formSnap.data().list;
      localStorage.setItem(DB.KEYS.FORMATIONS, JSON.stringify(FB_CACHE.formations));
    }
    FB_CACHE.students = studSnap.docs.map(d => d.data());
    localStorage.setItem(DB.KEYS.STUDENTS, JSON.stringify(FB_CACHE.students));

    FB_CACHE.activity = actSnap.docs.map(d => d.data());
    localStorage.setItem(DB.KEYS.ACTIVITY, JSON.stringify(FB_CACHE.activity));

    FB_CACHE.loaded = true;
  } catch (err) {
    console.error('[Firebase] Erreur chargement:', err);
    // Fallback : lire depuis localStorage
    FB_CACHE.settings   = DB.getSettings();
    FB_CACHE.formations = DB.getFormations();
    FB_CACHE.students   = JSON.parse(localStorage.getItem(DB.KEYS.STUDENTS)) || [];
    FB_CACHE.activity   = JSON.parse(localStorage.getItem(DB.KEYS.ACTIVITY))  || [];
    FB_CACHE.loaded     = true;
  }
}

/* ═════════════════════════════════════════════════════════════════
   LISTENER TEMPS RÉEL — Synchronise les élèves entre utilisateurs
═════════════════════════════════════════════════════════════════ */
function fbListenStudents() {
  if (!FB_MODE || fbUnsubscribe) return;

  fbUnsubscribe = fbDb.collection('students').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      const student = change.doc.data();
      if (change.type === 'added' || change.type === 'modified') {
        const idx = FB_CACHE.students.findIndex(s => s.ine === student.ine);
        if (idx >= 0) FB_CACHE.students[idx] = student;
        else FB_CACHE.students.push(student);
      } else if (change.type === 'removed') {
        FB_CACHE.students = FB_CACHE.students.filter(s => s.ine !== student.ine);
      }
    });
    localStorage.setItem(DB.KEYS.STUDENTS, JSON.stringify(FB_CACHE.students));

    // Rafraîchir les vues sensibles si l'app est ouverte
    if (typeof currentView !== 'undefined') {
      if (currentView === 'dashboard') {
        const el = document.getElementById('page-content');
        if (el) renderDashboard(el);
      } else if (currentView === 'students') {
        const el = document.getElementById('page-content');
        if (el) renderStudents(el);
      } else if (currentView === 'derogations') {
        const el = document.getElementById('page-content');
        if (el) renderDerogations(el);
      }
      // Rafraîchir les badges de la sidebar
      if (typeof renderSidebar === 'function') renderSidebar();
    }
  }, err => {
    console.error('[Firebase] Erreur listener élèves:', err);
  });
}

/* ═════════════════════════════════════════════════════════════════
   AUTHENTIFICATION FIREBASE
═════════════════════════════════════════════════════════════════ */

// Convertit le login local en email Firebase fictif
function loginToEmail(login) {
  return `${login.toLowerCase()}@affelnet-lpo.app`;
}

async function fbLogin(login, password) {
  if (!FB_MODE) return null;

  const email = loginToEmail(login);
  try {
    // Tentative de connexion
    await fbAuth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // Premier login : créer le compte Firebase
      await fbAuth.createUserWithEmailAndPassword(email, password);
    } else {
      throw err;
    }
  }
  // Charger les données depuis Firestore
  await fbLoadAll();
  fbListenStudents();
}

async function fbLogout() {
  if (!FB_MODE) return;
  if (fbUnsubscribe) { fbUnsubscribe(); fbUnsubscribe = null; }
  FB_CACHE.loaded = false;
  await fbAuth.signOut();
}

/* ═════════════════════════════════════════════════════════════════
   SURCHARGE DES MÉTHODES DB (cache-first + sync Firestore)
═════════════════════════════════════════════════════════════════ */
if (FB_MODE) {

  // ── Paramètres ──────────────────────────────────────────────────
  DB.getSettings = function() {
    if (FB_CACHE.settings) return FB_CACHE.settings;
    return JSON.parse(localStorage.getItem(this.KEYS.SETTINGS));
  };

  DB.saveSettings = function(s) {
    FB_CACHE.settings = s;
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(s));
    fbDb.collection('config').doc('settings').set(s).catch(console.error);
  };

  // ── Formations ───────────────────────────────────────────────────
  DB.getFormations = function() {
    if (FB_CACHE.formations) return FB_CACHE.formations;
    return JSON.parse(localStorage.getItem(this.KEYS.FORMATIONS));
  };

  DB.saveFormations = function(f) {
    FB_CACHE.formations = f;
    localStorage.setItem(this.KEYS.FORMATIONS, JSON.stringify(f));
    fbDb.collection('config').doc('formations').set({ list: f }).catch(console.error);
  };

  // ── Élèves ───────────────────────────────────────────────────────
  DB.getStudents = function() {
    return FB_CACHE.loaded ? FB_CACHE.students : (JSON.parse(localStorage.getItem(this.KEYS.STUDENTS)) || []);
  };

  DB.saveStudents = function(arr) {
    FB_CACHE.students = arr;
    localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify(arr));
    // Écriture batch Firestore
    const batch = fbDb.batch();
    arr.forEach(s => {
      const ref = fbDb.collection('students').doc(s.ine);
      batch.set(ref, s);
    });
    batch.commit().catch(console.error);
  };

  DB.upsertStudent = function(student) {
    const idx = FB_CACHE.students.findIndex(s => s.ine === student.ine);
    if (idx >= 0) FB_CACHE.students[idx] = { ...FB_CACHE.students[idx], ...student };
    else FB_CACHE.students.push(student);
    localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify(FB_CACHE.students));
    fbDb.collection('students').doc(student.ine).set(
      idx >= 0 ? FB_CACHE.students[idx] : student,
      { merge: true }
    ).catch(console.error);
  };

  DB.updateStudentStatus = function(ine, patch) {
    const idx = FB_CACHE.students.findIndex(s => s.ine === ine);
    if (idx >= 0) {
      FB_CACHE.students[idx] = { ...FB_CACHE.students[idx], ...patch };
      localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify(FB_CACHE.students));
      fbDb.collection('students').doc(ine).set(patch, { merge: true }).catch(console.error);
      return FB_CACHE.students[idx];
    }
    return null;
  };

  // ── Journal d'activité ───────────────────────────────────────────
  DB.getActivity = function() {
    return FB_CACHE.activity.length ? FB_CACHE.activity : (JSON.parse(localStorage.getItem(this.KEYS.ACTIVITY)) || []);
  };

  DB.addActivity = function(entry) {
    const full = { ...entry, id: Date.now(), ts: new Date().toISOString() };
    FB_CACHE.activity.unshift(full);
    if (FB_CACHE.activity.length > 500) FB_CACHE.activity.pop();
    localStorage.setItem(this.KEYS.ACTIVITY, JSON.stringify(FB_CACHE.activity));
    fbDb.collection('activity').doc(String(full.id)).set(full).catch(console.error);
  };

  // ── Reset élèves ─────────────────────────────────────────────────
  DB.resetStudents = async function() {
    FB_CACHE.students = [];
    FB_CACHE.activity = [];
    localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify([]));
    localStorage.setItem(this.KEYS.ACTIVITY, JSON.stringify([]));

    // Supprimer tous les documents élèves dans Firestore
    const batch = fbDb.batch();
    const snap = await fbDb.collection('students').get();
    snap.forEach(doc => batch.delete(doc.ref));
    const actSnap = await fbDb.collection('activity').get();
    actSnap.forEach(doc => batch.delete(doc.ref));
    batch.commit().catch(console.error);
  };
}
