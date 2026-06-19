# GestNote Elite — Firefox & Chrome (un seul manifest, un seul mécanisme)

Extension pour le portail de notes de Polytech Nantes qui enrichit l'affichage avec des statistiques de classe calculées à partir des données déjà présentes dans la page. **Même manifest.json et même code** sur Firefox et sur Chrome (comprend Edge, Opera, Brave etc..).

## Ce que ça fait

Pour chaque évaluation, l'extension affiche :

- **Moyenne de classe** — calculée à partir de toutes les notes de la promo
- **Ton rang** — ex. `3/42`
- **Histogramme de répartition** — un graphique SVG au clic pour voir la distribution des notes

Et au niveau supérieur :

- **Moyenne de classe par UE** — pondérée par les coefficients matières
- **Moyenne générale de classe** — pondérée par les ECTS

> Tout est calculé localement à partir de ce que le site charge déjà dans ton navigateur, aucune donnée n'est récupérée ou traitée extérieurement.

## Installation

### Manuelle : 

Enregistre ce repo au format zip, extrait le, et en fonction du navigateur : 

#### Firefox (128+)
1. Va sur `about:debugging#/runtime/this-firefox`
2. Clique sur **Charger un module complémentaire temporaire…**
3. Sélectionne le fichier `manifest.json`

#### Chrome / Edge / Brave / Opera (111+)
1. Va sur `chrome://extensions`
2. Active le **Mode développeur**
3. Clique sur **Charger l'extension non empaquetée**
4. Sélectionne le dossier contenant `manifest.json`

### Automatique :

#### Firefox (128+)
Disponible ici : https://addons.mozilla.org/fr/firefox/addon/gestnote-elite/

#### Chrome / Edge / Brave / Opera (111+)
Disponible ici : `soon`

## Compatibilité

- Firefox PC 128+, Firefox Android 142+
- Chrome 111+ (et navigateurs Chromium équivalents : Edge, Brave, Opera…)

Fonctionne uniquement sur `scolarite.polytech.univ-nantes.fr`.

## Fonctionnement technique

Le site embarque les notes de toute la promo dans des fonctions JS (`fnToCall`) attachées à des éléments du DOM, mais ne les affiche pas. Pour les lire il faut s'exécuter dans le **contexte JS de la page** (le « monde principal »), pas dans le monde isolé d'un content script classique.

`injected.js` est déclaré dans `manifest.json` avec `"world": "MAIN"` — le mécanisme standard pour ça depuis Chrome 111 et Firefox 128. Il lit le code source de `fnToCall` (`fn.toString()`) et en extrait le tableau de notes via une regex, sans jamais appeler `eval()`.

`content.js` (qui tourne en isolated world, comme un content script classique) communique avec `injected.js` par `postMessage` pour déclencher un scan et récupérer le résultat, puis injecte les badges/graphiques dans la page. Un `MutationObserver` détecte les rechargements AJAX du tableau (changement de maquette/semestre) et relance automatiquement les calculs.

## Licence

MIT
