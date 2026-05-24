/* =====================================================================
   firebase-config.js — Configuration Firebase
   =====================================================================
   INSTRUCTIONS :
   1. Aller sur https://console.firebase.google.com
   2. Cliquer "Ajouter un projet" → nommer ex: "lpo-mana-affelnet"
   3. Dans le projet → Paramètres (⚙️) → "Ajouter une application" → Web (</>)
   4. Copier l'objet firebaseConfig et remplacer les valeurs ci-dessous
   5. Dans Firebase Console → Authentication → Commencer → Email/Mot de passe → Activer
   6. Dans Firebase Console → Firestore Database → Créer une base → Mode production
   7. Dans Firestore → Règles → Copier les règles indiquées en bas de ce fichier
   ===================================================================== */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCFba2Lmyw57o5Y6NUeTwTX0dtoGV-hPxU",
  authDomain:        "gestion-des-inscriptions.firebaseapp.com",
  projectId:         "gestion-des-inscriptions",
  storageBucket:     "gestion-des-inscriptions.firebasestorage.app",
  messagingSenderId: "1083938957112",
  appId:             "1:1083938957112:web:ca6705a2a770bac79a43cd",
  measurementId: "G-YG4X3YM5NQ"

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
