/* =====================================================================
   firebase-config.js — MODÈLE DE CONFIGURATION Firebase
   =====================================================================
   1. Copier ce fichier et le renommer : firebase-config.js
   2. Remplir les valeurs depuis Firebase Console → Paramètres → App Web
   3. NE JAMAIS committer firebase-config.js sur GitHub
   ===================================================================== */

const FIREBASE_CONFIG = {
  apiKey:            "VOTRE-API-KEY",
  authDomain:        "votre-projet.firebaseapp.com",
  projectId:         "votre-projet-id",
  storageBucket:     "votre-projet.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId:             "1:000000000000:web:000000000000"
};

/* =====================================================================
   RÈGLES FIRESTORE À COPIER dans Firebase Console → Firestore → Règles
   =====================================================================

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}

   ===================================================================== */
