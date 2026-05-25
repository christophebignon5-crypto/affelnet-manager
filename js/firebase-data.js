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

/* ── Nettoyage Firestore : supprime les valeurs undefined ────────── */
// Firestore lève une exception sur toute valeur `undefined` dans un document.
// On convertit undefined → null pour tous les champs avant écriture.
function fbClean(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) => (v === undefined ? null : v)));
}

/* ── Cache mémoire ────────────────────────────────────────────────── */
const FB_CACHE = {
  settings:   null,
  students:   [],
  formations: null,
  classes:    null,
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
    const [settSnap, studSnap, formSnap, clsSnap, actSnap] = await Promise.all([
      fbDb.collection('config').doc('settings').get(),
      fbDb.collection('students').get(),
      fbDb.collection('config').doc('formations').get(),
      fbDb.collection('config').doc('classes').get(),
      fbDb.collection('activity').orderBy('ts', 'desc').limit(200).get(),
    ]);

    if (settSnap.exists) {
      // Firestore a les paramètres → source de vérité, écraser le cache local
      FB_CACHE.settings = settSnap.data();
      localStorage.setItem(DB.KEYS.SETTINGS, JSON.stringify(FB_CACHE.settings));
    } else {
      // config/settings absent de Firestore → on pousse les paramètres locaux pour initialiser
      // (évite que chaque nouvel appareil reste bloqué sur les valeurs par défaut)
      const localSettings = FB_CACHE.settings;
      if (localSettings && fbAuth && fbAuth.currentUser) {
        console.info('[Firebase] config/settings absent — initialisation depuis le cache local…');
        fbDb.collection('config').doc('settings').set(fbClean(localSettings)).catch(console.error);
      }
    }
    if (formSnap.exists) {
      FB_CACHE.formations = formSnap.data().list;
      localStorage.setItem(DB.KEYS.FORMATIONS, JSON.stringify(FB_CACHE.formations));
    }
    if (clsSnap.exists) {
      FB_CACHE.classes = clsSnap.data();
      localStorage.setItem(DB.KEYS.CLASSES, JSON.stringify(FB_CACHE.classes));
    }
    const firestoreStudents = studSnap.docs.map(d => d.data());
    if (firestoreStudents.length > 0) {
      // Firestore has data → use it as the canonical source
      FB_CACHE.students = firestoreStudents;
      localStorage.setItem(DB.KEYS.STUDENTS, JSON.stringify(FB_CACHE.students));
    } else {
      // Firestore is empty → preserve localStorage students and sync them up
      const localStudents = JSON.parse(localStorage.getItem(DB.KEYS.STUDENTS)) || [];
      FB_CACHE.students = localStudents;
      if (localStudents.length > 0) {
        console.info('[Firebase] Firestore vide — synchronisation depuis localStorage…');
        const batch = fbDb.batch();
        localStudents.forEach(s => {
          if (s.ine) batch.set(fbDb.collection('students').doc(s.ine), s);
        });
        batch.commit().catch(console.error);
      }
    }

    FB_CACHE.activity = actSnap.docs.map(d => d.data());
    localStorage.setItem(DB.KEYS.ACTIVITY, JSON.stringify(FB_CACHE.activity));

    FB_CACHE.loaded = true;
  } catch (err) {
    console.error('[Firebase] Erreur chargement:', err);
    // Fallback : lire depuis localStorage
    FB_CACHE.settings   = DB.getSettings();
    FB_CACHE.formations = DB.getFormations();
    FB_CACHE.classes    = DB.getClasses();
    FB_CACHE.students   = JSON.parse(localStorage.getItem(DB.KEYS.STUDENTS)) || [];
    FB_CACHE.activity   = JSON.parse(localStorage.getItem(DB.KEYS.ACTIVITY))  || [];
    FB_CACHE.loaded     = true;
  }
}

/* ═════════════════════════════════════════════════════════════════
   LISTENER TEMPS RÉEL — Synchronise les élèves entre utilisateurs
═════════════════════════════════════════════════════════════════ */
let fbListenerRetryCount = 0;
const FB_LISTENER_MAX_RETRY = 5;

function fbListenStudents() {
  if (!FB_MODE) return;
  // Détacher le listener précédent si existant (reconnexion propre)
  if (fbUnsubscribe) { fbUnsubscribe(); fbUnsubscribe = null; }

  fbUnsubscribe = fbDb.collection('students').onSnapshot(snapshot => {
    // Réinitialiser le compteur de tentatives en cas de succès
    fbListenerRetryCount = 0;

    let hasChanges = false;
    snapshot.docChanges().forEach(change => {
      hasChanges = true;
      const student = change.doc.data();
      if (change.type === 'added' || change.type === 'modified') {
        const idx = FB_CACHE.students.findIndex(s => s.ine === student.ine);
        if (idx >= 0) FB_CACHE.students[idx] = student;
        else FB_CACHE.students.push(student);
      } else if (change.type === 'removed') {
        FB_CACHE.students = FB_CACHE.students.filter(s => s.ine !== student.ine);
      }
    });

    if (!hasChanges) return; // Pas de modification réelle, éviter un rendu inutile

    localStorage.setItem(DB.KEYS.STUDENTS, JSON.stringify(FB_CACHE.students));

    // Mettre à jour l'indicateur de synchronisation dans l'en-tête
    fbUpdateSyncIndicator();

    // Rafraîchir la vue active sans réinitialiser les filtres ni l'interface
    if (typeof currentView !== 'undefined') {
      const el = document.getElementById('page-content');
      if (el) {
        if (currentView === 'dashboard') {
          renderDashboard(el);
        } else if (currentView === 'students') {
          // renderStudentTable() au lieu de renderStudents() → préserve les filtres et la recherche
          if (typeof renderStudentTable === 'function') renderStudentTable();
        } else if (currentView === 'derogations') {
          renderDerogations(el);
        } else if (currentView === 'listes') {
          renderClassLists(el);
        }
      }
      if (typeof renderSidebar === 'function') renderSidebar();
    }
  }, err => {
    console.error('[Firebase] Erreur listener élèves:', err);
    fbUnsubscribe = null;
    // Reconnexion automatique avec délai exponentiel (max 5 tentatives)
    if (fbListenerRetryCount < FB_LISTENER_MAX_RETRY) {
      fbListenerRetryCount++;
      const delay = Math.min(2000 * Math.pow(2, fbListenerRetryCount), 30000);
      console.warn(`[Firebase] Reconnexion listener dans ${delay / 1000}s (tentative ${fbListenerRetryCount}/${FB_LISTENER_MAX_RETRY})`);
      setTimeout(() => {
        if (typeof fbAuth !== 'undefined' && fbAuth.currentUser) fbListenStudents();
      }, delay);
    } else {
      console.error('[Firebase] Listener définitivement arrêté après plusieurs échecs.');
      fbUpdateSyncIndicator(true);
    }
  });
}

// Met à jour l'indicateur de sync dans l'en-tête
function fbUpdateSyncIndicator(error = false) {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (error) {
    el.innerHTML = `<span style="color:#B71C1C;font-size:.72rem" title="Synchronisation interrompue">⚠️ Sync perdue</span>`;
  } else {
    el.innerHTML = `<span style="color:#2D6A4F;font-size:.72rem" title="Données synchronisées">🟢 Sync ${now}</span>`;
  }
}

/* ═════════════════════════════════════════════════════════════════
   AUTHENTIFICATION FIREBASE
═════════════════════════════════════════════════════════════════ */

// Rafraîchissement manuel déclenché par le bouton 🔄
async function fbRefreshNow() {
  if (!FB_MODE) return;
  const btn = document.getElementById('btn-refresh');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    await fbLoadAll();
    fbListenerRetryCount = 0;
    fbListenStudents(); // Reconnecte le listener si nécessaire
    fbUpdateSyncIndicator();
    // Rafraîchir la vue active
    const el = document.getElementById('page-content');
    if (el && typeof currentView !== 'undefined') {
      if (currentView === 'dashboard')   renderDashboard(el);
      else if (currentView === 'students')  { if (typeof renderStudentTable === 'function') renderStudentTable(); }
      else if (currentView === 'derogations') renderDerogations(el);
      else if (currentView === 'listes')  renderClassLists(el);
    }
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof showToast === 'function') showToast('Données synchronisées avec Firebase.', 'success');
  } catch(err) {
    console.error('[Firebase] Erreur rafraîchissement manuel:', err);
    fbUpdateSyncIndicator(true);
  } finally {
    if (btn) { btn.textContent = '🔄'; btn.disabled = false; }
  }
}

// Force l'écriture des paramètres actuels dans Firestore (bouton "Forcer sync" dans Paramètres)
async function fbForceSyncSettings() {
  if (!FB_MODE) return;
  if (!fbAuth || !fbAuth.currentUser) {
    if (typeof showToast === 'function') showToast('Non connecté à Firebase — rechargez la page et reconnectez-vous.', 'error');
    return;
  }
  try {
    const s = FB_CACHE.settings || DB.getSettings();
    await fbDb.collection('config').doc('settings').set(fbClean(s));
    if (typeof showToast === 'function') showToast('✅ Paramètres forcés vers Firebase — tous les appareils vont se mettre à jour.', 'success');
    console.info('[Firebase] Synchronisation forcée des paramètres réussie.');
  } catch (err) {
    console.error('[Firebase] Erreur sync forcée:', err);
    if (typeof showToast === 'function') showToast('❌ Échec sync forcée : ' + err.code + '. Vérifiez les règles Firestore.', 'error');
  }
}

// Affiche le bouton refresh et l'indicateur de sync (appelé après login Firebase réussi)
function fbShowSyncUI() {
  const btn = document.getElementById('btn-refresh');
  if (btn) btn.style.display = '';
  fbUpdateSyncIndicator();
}

// Convertit le login local en email Firebase fictif
function loginToEmail(login) {
  return `${login.toLowerCase()}@affelnet-lpo.app`;
}

// Mot de passe Firebase Auth INTERNE — fixe, jamais modifié par l'utilisateur.
// Indépendant du mot de passe applicatif (stocké dans Firestore config/settings).
// Ce découplage permet de changer les mots de passe applicatifs sans jamais
// toucher Firebase Auth, et garantit la synchronisation multi-appareils.
function loginToFirebaseAuthPwd(login) {
  return `${login.toLowerCase()}_affelnet_lpo_key_2025`;
}

// Charge les settings Firestore via auth anonyme (fallback d'urgence)
async function fbLoadAllAnonymous() {
  if (!FB_MODE) return;
  if (!fbAuth.currentUser) {
    await fbAuth.signInAnonymously();
  }
  const settSnap = await fbDb.collection('config').doc('settings').get();
  if (settSnap.exists) {
    FB_CACHE.settings = settSnap.data();
    localStorage.setItem(DB.KEYS.SETTINGS, JSON.stringify(FB_CACHE.settings));
  }
}

// Ancienne fonction de synchronisation — désormais inutile car le mot de passe
// Firebase Auth est interne et fixe. DB.saveSettings() suffit pour synchroniser
// les mots de passe applicatifs via Firestore sur tous les appareils.
async function fbSyncAuthPassword(login, password) {
  // Plus nécessaire : le mot de passe Firebase Auth est fixe (loginToFirebaseAuthPwd).
  // DB.saveSettings() met déjà à jour config/settings dans Firestore en temps réel.
}

async function fbLogin(login, appPassword) {
  if (!FB_MODE) return;

  const email       = loginToEmail(login);
  const internalPwd = loginToFirebaseAuthPwd(login);

  // ── Tous les mots de passe candidats pour Firebase Auth ──────────────────
  // Firebase Auth sert UNIQUEMENT à obtenir l'accès à Firestore.
  // Le vrai mot de passe applicatif est vérifié ensuite depuis config/settings Firestore.
  const candidates = [internalPwd, appPassword, 'proviseur2025', 'secr2025', 'aed2025']
    .filter((p, i, arr) => p && arr.indexOf(p) === i);

  // ── Étape 1 : essayer chaque candidat ────────────────────────────────────
  let signedIn = false;
  for (const pwd of candidates) {
    try {
      await fbAuth.signInWithEmailAndPassword(email, pwd);
      signedIn = true;
      // Si ce n'est pas le mot de passe interne, migrer en arrière-plan (sans bloquer)
      if (pwd !== internalPwd) {
        fbAuth.currentUser.updatePassword(internalPwd)
          .then(() => console.info('[Firebase] Migré vers mdp interne pour', login))
          .catch(e  => console.warn('[Firebase] Migration bg:', e.code));
      }
      break;
    } catch (_) { /* candidat incorrect — continuer */ }
  }

  // ── Étape 2 : créer le compte si aucune connexion ne fonctionne ──────────
  // Firebase SDK v10 renvoie auth/invalid-credential pour les comptes inexistants
  // ET pour les mauvais mots de passe — on ne peut pas distinguer les deux cas.
  // → On tente la création ; si le compte existe déjà, Firebase lèvera email-already-in-use.
  if (!signedIn) {
    try {
      await fbAuth.createUserWithEmailAndPassword(email, internalPwd);
      signedIn = true;
      console.info('[Firebase] Compte Firebase Auth créé pour', login);
    } catch (createErr) {
      // email-already-in-use = compte existant avec mdp inconnu → pas grave, on continue
      if (createErr.code !== 'auth/email-already-in-use') {
        console.warn('[Firebase] Création compte impossible:', createErr.code);
      }
    }
  }

  // ── Étape 3 : auth anonyme en dernier recours ────────────────────────────
  if (!signedIn) {
    try {
      await fbAuth.signInAnonymously();
      signedIn = true;
      console.warn('[Firebase] Auth anonyme utilisée pour accéder à Firestore');
    } catch (_) {
      console.error('[Firebase] Toutes les méthodes d\'authentification ont échoué pour', login);
      // On ne throw pas — fbLoadAll va échouer proprement et utiliser le localStorage
    }
  }

  // ── Étape 4 : charger les données depuis Firestore ────────────────────────
  await fbLoadAll();
  fbListenStudents();
  fbShowSyncUI();
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
    // Écriture Firestore uniquement si l'utilisateur est authentifié (évite d'écraser
    // avec les valeurs par défaut lors de l'initialisation avant login)
    if (fbAuth && fbAuth.currentUser) {
      fbDb.collection('config').doc('settings').set(fbClean(s)).catch(err => {
        console.error('[Firebase] Erreur sauvegarde paramètres:', err);
        // Remonter l'erreur à l'utilisateur si showToast est disponible
        if (typeof showToast === 'function') {
          showToast('⚠️ Paramètres sauvegardés localement uniquement — erreur Firebase : ' + err.code, 'error');
        }
      });
    }
  };

  // ── Formations ───────────────────────────────────────────────────
  DB.getFormations = function() {
    if (FB_CACHE.formations) return FB_CACHE.formations;
    return JSON.parse(localStorage.getItem(this.KEYS.FORMATIONS));
  };

  DB.saveFormations = function(f) {
    FB_CACHE.formations = f;
    localStorage.setItem(this.KEYS.FORMATIONS, JSON.stringify(f));
    fbDb.collection('config').doc('formations').set(fbClean({ list: f })).catch(console.error);
  };

  // ── Classes ──────────────────────────────────────────────────────
  DB.getClasses = function() {
    if (FB_CACHE.classes) return FB_CACHE.classes;
    return JSON.parse(localStorage.getItem(this.KEYS.CLASSES)) || {};
  };

  DB.saveClasses = function(c) {
    FB_CACHE.classes = c;
    localStorage.setItem(this.KEYS.CLASSES, JSON.stringify(c));
    fbDb.collection('config').doc('classes').set(fbClean(c)).catch(console.error);
  };

  // ── Élèves ───────────────────────────────────────────────────────
  DB.getStudents = function() {
    return FB_CACHE.loaded ? FB_CACHE.students : (JSON.parse(localStorage.getItem(this.KEYS.STUDENTS)) || []);
  };

  DB.saveStudents = function(arr) {
    FB_CACHE.students = arr;
    localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify(arr));
    // Écriture batch Firestore — fbClean élimine les undefined
    const batch = fbDb.batch();
    arr.forEach(s => {
      const ref = fbDb.collection('students').doc(s.ine);
      batch.set(ref, fbClean(s));
    });
    batch.commit().catch(console.error);
  };

  DB.upsertStudent = function(student) {
    const arr = this.getStudents().slice();
    const idx = arr.findIndex(s => s.ine === student.ine);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...student };
    else arr.push(student);
    FB_CACHE.students = arr;
    localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify(arr));
    const toWrite = idx >= 0 ? arr[idx] : student;
    // fbClean : Firestore rejette undefined, on le convertit en null
    fbDb.collection('students').doc(student.ine).set(fbClean(toWrite), { merge: true }).catch(console.error);
  };

  DB.updateStudentStatus = function(ine, patch) {
    const arr = this.getStudents().slice();
    const idx = arr.findIndex(s => s.ine === ine);
    if (idx >= 0) {
      arr[idx] = { ...arr[idx], ...patch };
      FB_CACHE.students = arr;
      localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify(arr));
      fbDb.collection('students').doc(ine).set(fbClean(arr[idx])).catch(console.error);
      return arr[idx];
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
    fbDb.collection('activity').doc(String(full.id)).set(fbClean(full)).catch(console.error);
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
