# 📱 Consulter « Mes Voyages » sur ton téléphone (Android)

Objectif : ouvrir l'app sur ton téléphone pour **consulter** tes voyages (texte toujours à jour) **avec les photos**.

Petit rappel de fonctionnement :
- Le **PC** garde son mode famille pCloud habituel (rien ne change).
- Le **téléphone** ne peut pas lire directement le dossier pCloud. Il récupère donc :
  - le **texte** (voyages, itinéraires, journal, budget…) depuis un **lien public pCloud**, automatiquement et toujours à jour ;
  - les **photos** depuis une **sauvegarde ZIP** importée une seule fois (elles ne sont pas dans pCloud).

---

## Étape 1 — Mettre l'app en ligne (GitHub Pages, gratuit)

> On publie **seulement l'application**, jamais tes données. Le fichier `.gitignore` exclut déjà `carnet-*.json` et `profils.json` : ne les mets pas en ligne.

1. Crée un compte sur **github.com** (gratuit).
2. Crée un nouveau dépôt **public** (bouton « New repository »), par ex. `mes-voyages`.
3. Envoie les fichiers de l'app dans le dépôt **SAUF** `carnet-*.json` et `profils.json` :
   - Fichiers à mettre : `index.html`, `style.css`, `app.js`, `data.js`, `features.js`, `album.js`, `extras.js`, `family.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `icon-maskable.svg`, `GUIDE-MOBILE.md`, `.gitignore`.
   - (Si tu utilises Git : `git init`, `git add .` — le `.gitignore` écarte automatiquement tes données — puis `git commit` et `git push`.)
4. Dans le dépôt : **Settings → Pages → Source : `main` / dossier `/root` → Save**.
5. Au bout d'1–2 minutes, GitHub affiche ton adresse, du type :
   **`https://TON-PSEUDO.github.io/mes-voyages/`**

---

## Étape 2 — Ouvrir et installer sur le téléphone

1. Sur le téléphone, ouvre cette adresse dans **Chrome**.
2. Menu **⋮ → « Ajouter à l'écran d'accueil »** : l'app s'installe comme une vraie appli (icône, plein écran, fonctionne hors-ligne).

---

## Étape 3 — Charger tes données (texte, automatique)

1. Sur **pCloud**, partage le fichier **`carnet-famille.json`** en **lien public** et copie le lien.
2. Dans l'app sur le téléphone : **⚙️ Paramètres → 📱 Consultation sur mobile** → colle le lien → **💾 Enregistrer & charger**.
3. Tes voyages s'affichent. À chaque ouverture, le texte se recharge tout seul depuis pCloud (toujours à jour).

> **Si le message « Lien illisible » apparaît** : pCloud bloque parfois la lecture directe (CORS) ou donne un lien « page » au lieu d'un lien « fichier ». Essaie de fournir le **lien de téléchargement direct** du fichier. À défaut, l'import ZIP de l'étape 4 contient aussi tout le texte (mais figé).

---

## Étape 4 — Avoir les photos (une seule fois)

1. Sur le **PC** : **⚙️ Paramètres → 💾 Sauvegarde → 📦 Sauvegarde COMPLÈTE (avec photos)**. Un fichier `.zip` est téléchargé.
2. Transfère ce `.zip` sur le téléphone (câble, e-mail, pCloud, Google Drive… au choix).
3. Sur le **téléphone** : **⚙️ Paramètres → 💾 Sauvegarde → 📂 Restaurer une sauvegarde complète** → choisis le `.zip`.
4. Les photos se rangent automatiquement au bon voyage (elles sont reliées par identifiant). ✅

---

## Mettre à jour plus tard

- **Texte** (nouveaux voyages, journal, budget…) : rien à faire, ça se recharge depuis le lien pCloud.
- **Nouvelles photos** : refais simplement l'export ZIP (PC) puis la restauration (téléphone).

## Bon à savoir
- Sur le téléphone, l'app est en **consultation** : si tu y modifies quelque chose, ça reste **local au téléphone** et n'est pas renvoyé vers pCloud.
- Le globe 3D, le planisphère et les fonds de carte ont besoin d'internet ; les zones de carte déjà consultées restent visibles hors-ligne.
