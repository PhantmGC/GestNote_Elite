# GestNote Elite — Extension Firefox

Extension Firefox pour le portail de notes de Polytech Nantes qui enrichit l'affichage avec des statistiques de classe calculées à partir des données déjà présentes dans la page.

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

### Depuis AMO (recommandé)

Cherche **GestNote Elite** sur [addons.mozilla.org](https://addons.mozilla.org) et clique sur Ajouter à Firefox.
Soon : Chrome Web Store

### Manuellement (dev)

1. Clone ce repo
2. Va sur `about:debugging#/runtime/this-firefox`
3. Clique sur **Charger un module complémentaire temporaire…**
4. Sélectionne le fichier `manifest.json`

## Compatibilité

- Firefox PC (115+)
- Firefox Android (142+)

Fonctionne uniquement sur `scolarite.polytech.univ-nantes.fr`.

## Fonctionnement technique

Le site embarque les notes de toute la promo dans des fonctions JS (`fnToCall`) attachées à des éléments du DOM, mais ne les affiche pas. L'extension lit ces fonctions, en extrait les tableaux de valeurs via regex, puis calcule et injecte les statistiques dans la page, sans aucune requête réseau supplémentaire.

Un `MutationObserver` détecte les rechargements AJAX du tableau (changement de maquette/semestre) et relance automatiquement les calculs.

## Licence

MIT
