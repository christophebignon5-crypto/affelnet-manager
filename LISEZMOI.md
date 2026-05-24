# AFFELNET Manager — LPO Léopold Elfort, Mana

## Démarrage rapide

1. Double-cliquer sur **`index.html`** pour ouvrir l'application dans votre navigateur
   (ou faire glisser le fichier dans Firefox / Chrome)

## Comptes par défaut (à modifier dans Paramètres)

| Rôle | Login | Mot de passe | Droits |
|------|-------|-------------|--------|
| **Proviseur** | `proviseur` | `proviseur2025` | Accès total, paramètres, inscription hors période |
| **Secrétaire** | `secretaire` | `secr2025` | Inscription + validation dérogations |
| **AED Accueil** | `aed` | `aed2025` | Validation inscription, demande dérogation, impression PDF |

## Utilisation quotidienne

### 1. Première utilisation
1. Se connecter en tant que **Proviseur**
2. Aller dans **Paramètres → Périodes** pour saisir les dates d'inscription
3. Aller dans **Import AFFELNET** pour charger :
   - Le fichier `affectesEtablissementAccueil_XXXXX.xlsx` (liste des élèves AFFELNET)
   - Le fichier `LIBELLE FORMATION.xlsx` (correspondance libellés → classes)

### 2. Accueil des familles (AED)
1. Se connecter en tant que **AED**
2. Ouvrir **Liste des élèves**, rechercher l'élève par nom
3. Cliquer **Voir** pour ouvrir la fiche
4. Cliquer **✅ Inscrire l'élève** si la période est ouverte
5. Si hors période → cliquer **⚠️ Demander dérogation**
6. Une fois inscrit → **🖨️ Imprimer fiche** pour générer le PDF (2 exemplaires)

### 3. Gestion des dérogations (Direction / Secrétaire)
1. Aller dans **Dérogations**
2. Les demandes **En attente** apparaissent en orange
3. Cliquer **✅ Valider** ou **❌ Refuser** (motif obligatoire si refus)

## Périodes d'inscription

| Période | Couleur | Qui peut inscrire |
|---------|---------|------------------|
| **Pré-Tour** | 🔵 Bleu | Secrétaire, AED, Proviseur |
| **1er Tour** | 🟣 Violet | Secrétaire, AED, Proviseur |
| **2nd Tour** | 🔴 Pourpre | Secrétaire, AED, Proviseur |
| **Hors période** | ⚫ Gris | Secrétaire et Proviseur uniquement |

## Sauvegarde et migration

- **Export** : Import AFFELNET → "Exporter toutes les données (JSON)"
- **Restauration** : Import AFFELNET → "Restaurer depuis JSON"
- **Nouvelle année** : Import AFFELNET → "Réinitialiser pour nouvelle année" (Proviseur uniquement)

## Migration vers GitHub Pages (future)

1. Créer un dépôt GitHub
2. Glisser les fichiers `index.html`, `css/`, `js/` dans le dépôt
3. Activer GitHub Pages → branche `main`
4. Partager l'URL aux utilisateurs

## Structure des fichiers

```
AFFELNET-Manager/
├── index.html          ← Ouvrir ce fichier dans le navigateur
├── css/
│   └── style.css       ← Styles et thème visuel
├── js/
│   ├── data.js         ← Gestion des données (LocalStorage)
│   └── app.js          ← Logique de l'application
└── LISEZMOI.md         ← Ce fichier
```

## Données stockées

Toutes les données sont sauvegardées automatiquement dans le **navigateur** (LocalStorage).
Elles persistent entre les sessions sur le même ordinateur / navigateur.
Utiliser l'export JSON pour sauvegarder sur clé USB ou cloud.
