# Mes Voyages ✈️ — Carnet de bord

Application maison pour organiser tous tes voyages, de l'idée jusqu'aux souvenirs.

## 🚀 Lancement

Aucune installation : **double-clique sur `index.html`** et l'application s'ouvre dans ton navigateur.
Tu peux créer un raccourci sur le bureau pour y accéder plus vite.

## ✨ Fonctionnalités

### 🎨 Interface moderne
Design soigné façon carnet de voyage : police **Plus Jakarta Sans**, **cartes-voyage avec photo de couverture** 📸, **itinéraire en timeline**, fond de carte épuré (CARTO, clair/sombre), onglets en pills, dégradés doux et 5 thèmes (clair, sombre, océan, sable, forêt).

### 🏠 Tableau de bord
- Compte à rebours en direct avant le prochain départ
- Mode « voyage en cours » : programme du jour, dépense rapide, météo, journal
- ⏰ Alertes des préparatifs en retard ou à faire sous 7 jours
- ✨ « Souvenirs du jour » : il y a X ans jour pour jour, tu étais à…
- Bouton flottant 💸 : noter une dépense en 3 secondes, depuis n'importe quel écran

### 🧳 Mes voyages — 9 onglets par voyage

| Onglet | Ce qu'on y fait |
|---|---|
| 🗓️ **Itinéraire** | Planning jour par jour en **timeline verticale** ✨, **réorganisable par glisser-déposer ↕️** (et déplaçable d'un jour à l'autre). Export **.ics** vers Google Agenda / Outlook. |
| 🗺️ **Carte** | Étapes sur carte (recherche de lieux, clic, marqueurs déplaçables). **🛣️ Tracé sur les vraies routes** avec **temps de trajet précis** pour la voiture, le bus, le vélo et la marche (le tracé suit les routes/chemins) ; l'avion et le bateau restent à vol d'oiseau. Distances, durées et CO₂ par tronçon. Guide 📖 Wikipédia, **🏛️ « que voir autour ? »**, **🧭 ouvrir dans Google Maps** et météo 🌦️ 7 jours par étape. « 🧭 Où suis-je ? ». Internet requis (les trajets calculés sont gardés en cache pour l'hors-ligne). |
| 💰 **Budget** | Dépenses par catégorie, jauge, **enveloppes 🎯 par catégorie**, **courbe du rythme des dépenses**, saisie en **devise locale** (conversion auto), 📎 photo du ticket sur chaque dépense, **partage façon Tricount** avec remboursements « ✅ c'est réglé », convertisseur de devises. |
| ✅ **Préparatifs** | Checklist administrative générée selon le pays (visa, passeport, assurance…) avec échéances calculées depuis la date de départ. |
| 🎒 **Bagages** | Listes avec modèles (essentiels, plage, ville, montagne, rando, 💊 pharmacie), attribution par voyageur et filtres. |
| 📄 **Documents** | Infos clés (avec **📋 copie en 1 clic** des n° de réservation) + **pièces jointes** 📎 (billets PDF, photos, QR codes) stockées localement, corbeille 🗑️ incluse. |
| 🧰 **Pratique** | Fiche pays (monnaie, conduite, indicatif…), **double horloge** maison/destination avec **conseil anti-jetlag 😴**, **🔌 prises électriques** (adaptateur nécessaire ?), **💵 pourboires locaux + calculateur**, **🌅 lever/coucher du soleil sur place**, numéro d'urgence local, fiche ICE, **jours fériés sur place**, guide de conversation en 7 langues, liste de courses. |
| 📔 **Journal** | Récits avec humeur, **dictée vocale 🎤**, **notes audio 🎙️** (l'ambiance d'un lieu !), stickers, pièces jointes photos (ou **glisser-déposer** direct), **📸 import auto des photos rangées au bon jour** (date EXIF), **▶️ diaporama plein écran**, **💌 carte postale numérique** à envoyer, position 📍 visible sur la carte, **corbeille 🗑️** (souvenirs et docs récupérables), **🏆 best-of** et **✍️ mot de la fin de chaque voyageur** en fin de voyage. |
| 🎮 **Jeux** | **🏅 Chasse aux défis** (à relever avec photo-preuve, attribuables par voyageur), bingo du trajet (3×3 ou 4×4), quiz capitales et drapeaux **avec classement famille 🏆**, **🪢 pendu du voyageur**, tirage au sort. |

En-tête de voyage : ✏️ modifier · 📑 dupliquer · 📕 **album souvenir** · 📤 exporter une **page souvenir HTML** à partager · 🖨️ imprimer · 🗑️ supprimer (récupérable via la corbeille).

### 📕 Album souvenir de fin de voyage

Le bouton 📕 (en-tête du voyage, best-of du journal, ou rappel du tableau de bord quand un voyage vient de se terminer) génère un **album exhaustif dans un seul fichier HTML** :
couverture photo, voyage en chiffres, **carte du parcours**, étapes avec transports et distances, itinéraire jour par jour, **journal de bord avec les photos intégrées**, galerie des photos géolocalisées, budget complet (catégories, détail, qui a payé), palmarès 🏆, bingo, bagages/préparatifs, et documents (en option).
Trois qualités de photos au choix. L'album s'ouvre dans un nouvel onglet, se télécharge, et son bouton 🖨️ le transforme en **PDF**. Fonctionne hors ligne. Les photos intégrées sont celles stockées sur le PC qui génère l'album.

### 📅 Calendrier
L'année entière en 12 mini-mois : chaque voyage colore ses jours, les chevauchements sont signalés, un clic ouvre le voyage.

### 📱 Application installable (PWA)
Si l'app est servie en http(s), elle est **installable sur téléphone/PC** (icône « Installer » du navigateur) et fonctionne hors ligne. Interface adaptée au mobile (menu ☰).

⌨️ Raccourcis : **N** nouveau voyage · **D** dépense rapide · **C** calendrier · **/** recherche · **Échap** fermer.
🎨 5 thèmes au choix dans les Paramètres : clair, sombre, océan, sable, forêt.

### 💫 Liste d'envies
Destinations de rêve avec priorité ★ ; « 🎲 Surprends-moi » tire au sort la prochaine ; **« 🌡️ Comparer »** met 2-3 destinations côte à côte (climat du mois choisi, distance, budget) ; un clic transforme le rêve en voyage.

### 🛂 Suivi des papiers d'identité
Dans les Paramètres, enregistre les dates d'expiration des passeports/CNI de la famille. Le tableau de bord **t'alerte** quand un papier expire bientôt — ou risque de poser problème pour un voyage à venir (beaucoup de pays exigent 6 mois de validité après le retour).

### 🌍 Carte du monde
Le planisphère « à gratter » : pays visités en vert, envies en orange, le reste à découvrir. **Toutes tes photos 📷 et récits 📔 géolocalisés y sont épinglés**, tous voyages confondus — ta vie de voyageur sur une carte.

### 📊 Statistiques
Pays, jours, km et **% du tour du monde**, empreinte CO₂, budget moyen/jour, pays les plus dépensiers, mois préférés (heatmap), **16 badges** à débloquer, frise chronologique, **🧑‍🤝‍🧑 stats par voyageur**, **🏆 records de la famille** (plus grosse dépense, repas le plus cher, plus long trajet…), **🎁 rétrospective annuelle** et **⚖️ comparateur de deux voyages**.

### ⚙️ Paramètres
Profil et devise, **📦 sauvegarde COMPLÈTE en .zip (photos comprises)** pour déménager vers un autre PC sans rien perdre, export/import JSON, **corbeille** (10 derniers voyages supprimés), **sauvegardes automatiques quotidiennes** (5 conservées), suivi des papiers d'identité 🛂, 5 thèmes 🎨.

### 🔎 Recherche globale
La barre de la colonne de gauche cherche partout : voyages, activités, journal, documents, bagages, étapes, envies.

## 👨‍👩‍👧 Mode famille (pCloud)

Pour que **toute la famille partage le même carnet** depuis plusieurs PC :

1. Chaque PC doit avoir le dossier de l'application **synchronisé par pCloud** (pCloud Drive ou sync).
2. Ouvrir l'app dans **Chrome ou Edge** → ⚙️ Paramètres → **👨‍👩‍👧 Mode famille** → « 📂 Choisir le dossier des données » → choisir un dossier **dans pCloud** (par ex. un sous-dossier `donnees` de ce dossier).
3. Créer son profil à l'écran « Qui es-tu ? ». C'est tout !

Ce que ça donne :
- **`carnet-famille.json`** : le carnet partagé — tout le monde voit les mêmes voyages. À la première activation, tes données locales actuelles y migrent automatiquement.
- **Carnets personnels** (optionnels) : via l'indicateur 🟢 en haut de la colonne de gauche → « 🔒 Carnet de … ». Chacun le sien, il démarre vide.
- **Synchro automatique** : les enregistrements des autres sont récupérés toutes les 15 secondes (le temps que pCloud synchronise les fichiers entre PC, compte quelques secondes de plus).
- **Anti-conflit** : si deux personnes enregistrent exactement en même temps, l'app le détecte et demande quelle version garder.
- L'indicateur affiche l'état : 🟢 synchronisé · 🟡 écriture en cours · 🔴 attention.

À savoir : au lancement, le navigateur peut demander une confirmation d'accès au dossier (un clic — coche « Autoriser à chaque visite » dans Chrome pour ne plus la voir). Les pièces jointes 📎 restent locales à chaque PC. Et si deux PC modifient **hors ligne** en même temps, pCloud peut créer une « copie en conflit » du fichier — ouvre alors la plus récente.

## 💾 Où sont mes données ?

Tout est stocké **localement dans ton navigateur** (localStorage + IndexedDB pour les pièces jointes) — rien ne part sur internet.

⚠️ Si tu changes de navigateur ou d'ordinateur, le carnet sera vide. **Exporte une sauvegarde régulièrement** (Paramètres → ⬇️ Exporter). Les pièces jointes 📎 ne sont pas incluses dans l'export JSON — mais l'**album souvenir 📕** les contient : c'est la meilleure archive d'un voyage terminé.

💡 Les grosses photos (> 4 Mo, typiques des téléphones) sont **compressées automatiquement** à l'ajout pour ne pas saturer le stockage.

## 🌐 Fonctions nécessitant internet

Cartes (fond OpenStreetMap), recherche de lieux, météo, fiche pays, jours fériés, guides Wikipédia, taux de change, drapeaux sous Windows. Tout le reste fonctionne hors ligne.
