# Plan de réalisation 1:1 — Orbit Ember Watch

> **But.** Faire correspondre chaque vue de l’application aux huit références visuelles de [`docs/ui/`](ui/) tout en gardant la carte interactive, le champ de vent et les interactions réels. « 1:1 » désigne la composition, la hiérarchie, les commandes et les états visuels; les chiffres d’exemple des maquettes ne doivent jamais être recopiés comme s’ils étaient des mesures.

## Direction de design

- **Sujet et audience :** lecture de l’activité thermique satellitaire et du contexte météo/terrain par analystes, gestionnaires du territoire et équipes terrain. La tâche principale est de comprendre ce qui est observé, à quel endroit et à quelle heure, puis de vérifier les limites et la provenance.
- **Palette existante :** nuit orbitale `#07111A`, coque `#0B1722`, panneaux vitreux `rgba(11,23,34,.76)`, cyan de vent `#25D2D8`, ambre d’attention `#F4B12F`, braise `#F2683B`.
- **Typographie :** IBM Plex Sans pour les titres et textes d’action; IBM Plex Mono pour dates, coordonnées, unités, états de données et légendes. Les chiffres restent alignés et portent toujours leur unité.
- **Composition :** garder la barre latérale et l’en-tête fixes; réserver le centre à une carte MapLibre interactive; placer les filtres à gauche, l’inspection à droite et une chronologie ou un graphe compact en bas. Aucun défilement global sur desktop; le contenu très détaillé défile dans son panneau. Sur téléphone, la carte reste visible sous une fiche basse et une navigation Map / Updates / Layers / Report.
- **Signature visuelle :** le vent est un champ animé en rubans de particules, coloré par vitesse, drapé sur le relief 3D. La légende est attachée à la carte; une même couleur et une même échelle signifient la même chose dans tous les onglets. Ce champ décrit le forecast météo sélectionné, jamais la vitesse ou la direction d’un feu.
- **Verre et lisibilité :** surfaces translucides avec saturation, flou, reflet de bord fin et ombre courte. Le contraste du texte et les contrôles actifs priment sur la transparence; les particules ne passent pas au-dessus des commandes.

Wireframe desktop de référence :

```text
┌ navigation ┬──────────────── en-tête : lieu / période / sources ───────────────┐
│           ┌───────────┬─────────────────────────┬───────────────────────────┐  │
│ onglets   │ contrôles │ carte 3D + vent vivant  │ inspection / briefing     │  │
│ fixes     │ ou résumé │ sélection synchronisée  │ vitreux, contextualisé    │  │
│           ├───────────┴─────────────────────────┴───────────────────────────┤  │
│           │ chronologie, calendrier, coupe ou tendances selon l’onglet       │  │
└───────────┴──────────────────────────────────────────────────────────────────┘
```

Wireframe téléphone :

```text
┌ en-tête compact + zone + vent ┐
│ carte plein écran / couches    │
│ légende et état toujours lisibles│
├ fiche basse, onglets Map/Updates/Layers/Report ┤
└ actions accessibles au pouce ──────────────────┘
```

## Parité par vue

| Référence | Composition à reproduire | État vérifié dans le code courant | Travail restant avant parité |
|---|---|---|---|
| `01-dashboard.png` | Résumé activité à gauche sur la carte; carte 3D au centre; briefing et météo à droite; tendances et caveat en bas. | Résumé vitré, carte, briefing météo, historique des retours FIRMS et timeline météo existent. Les états de source et l’avertissement « anomalie ≠ feu confirmé » existent. | Faire correspondre les proportions et groupes de la référence; n’afficher les parts par capteur, anomalies saisonnières, taux de couverture ou baseline que si un dénominateur et une archive multiannuelle validés existent. Ajouter une hiérarchie d’activité lisible lorsque les données sont chargées. |
| `02-carte-live.png` | Filtres capteur/couche à gauche; cluster sur carte; inspection à droite; lecture par date en bas. | Dock de filtres, sélection/cluster, panneau d’inspection et timeline des dates retournées existent. | Aligner densité et ordre des filtres; états aucune observation/inconnu/erreur; faire correspondre toutes les commandes de lecture à la date réellement sélectionnée. Les swaths/footprints restent désactivés tant qu’aucune source correspondante n’est connectée. |
| `03-calendrier.png` | Carte et résumé de fenêtre en haut; calendrier d’activité au premier plan; détails de semaine à droite. | Vues mois/semaine, sélection de date, chiffres de lignes retournées et limites de fenêtre existent. | Conserver la distinction entre jour non interrogé, hors fenêtre, requête échouée, zéro ligne et couverture inconnue; aligner la cellule sélectionnée, carte, graphe et panneau hebdomadaire. Une journée sans ligne d’archive ne devient pas un zéro sans preuve de couverture. |
| `04-comparer.png` | Choix des produits à gauche; carte swipe ou côte à côte au centre; courbes et indicateurs comparatifs à droite. | Choix de deux produits et modes swipe/côte à côte existent; les deux flux sont indépendants. | Comparer mêmes lieux/fenêtres et rendre les unités explicites. Ne pas inventer corrélation, recouvrement, décalage de pic ou calibration; afficher « non calculable / non validé » tant que les données et la méthode ne suffisent pas. |
| `05-terrain.png` | Couches terrain à gauche; relief/selection au centre; fiche d’échantillon et profil A–B en bas. | DEM Terrarium, relief 3D, transect d’élévation et analyse locale existent. | Ne pas afficher composition du sol, combustible, végétation, eau ou pente régionale sans couche correspondante. Ajouter à chaque couche sa résolution, date, source et statut. La coupe doit suivre les deux points réellement choisis et rester synchronisée à la carte. |
| `06-sources.png` | Catalogue à gauche; carte de contexte; métadonnées/provenance et pipeline en bas. | Disponibilité FIRMS, catalogue des imports locaux, provenance et limites de clé/date existent. | Compléter la fiche produit réellement sélectionné, le dictionnaire de champs, formats, licence, période et empreinte du manifeste. Chaque pipeline doit montrer une étape seulement si elle a réellement tourné; téléchargement/export ne doit pas laisser croire à un service absent. |
| `07-scenario-progression.png` | Entrées météo/terrain, carte de scénario, contrôles d’horizon et chronologie; incertitude lisible. | Contrôle what-if de vitesse et horizon présents; le panneau explique que le modèle, le périmètre et les carburants manquent et n’affiche aucune enveloppe synthétique. | La forme de la carte peut suivre la référence mais aucune progression ne sera dessinée avant l’intégration et la validation d’un modèle de comportement du feu, des carburants, de l’humidité, du périmètre et de vents cohérents. Pas d’ordres d’attaque ni de points tactiques automatiques. |
| `08-mobile-terrain.png` | Carte tactile; bandeau d’incertitude; panneau bas Area Awareness; navigation Map / Updates / Layers / Report. | Route mobile et quatre vues dédiées existent; note locale, filtres accessibles et météo sont disponibles. | Comparer chaque sous-vue à la référence aux largeurs 360/390 px; garder le vent et l’état des données visibles sans masquer les contrôles de carte; vérifier clavier/lecteur d’écran, grands textes et réduction d’animation. Ne pas demander la position GPS implicitement. |

## Données et vérité de l’interface

| Source / entrée | Usage affiché | Garde-fou |
|---|---|---|
| NASA FIRMS MODIS / VIIRS | Points d’anomalies thermiques, heure, produit, confiance native et FRP quand fourni. | Ce sont des détections, pas des feux uniques, un périmètre, une superficie brûlée ou une preuve d’absence. Séparer NRT/SP, plateformes et données manquantes. |
| Open-Meteo | Vitesse et direction horaires, rafales, pluie, température et humidité à 2 m/10 m selon le champ. | Afficher validité UTC, niveau, résolution/source et fraîcheur. Interpoler uniquement entre les points effectivement demandés; ne pas extrapoler hors grille ou dans le futur. |
| DEM Terrarium via AWS | Relief 3D et profil d’altitude échantillonné. | Afficher résolution/échantillonnage; ne pas présenter cette seule source comme mesure de pente, sol, combustible ou accessibilité. |
| Imports FIRMS locaux | Historique normalisé, QA, provenance, calendrier et comparaison lorsqu’une fenêtre est réellement couverte. | Manifestes et SHA-256 relient les lignes à l’archive. L’absence de ligne signifie « couverture inconnue » sans information d’acquisition suffisante. |
| Couverture, végétation, humidité des combustibles, périmètre incident | À connecter avant les indicateurs qui en dépendent. | La disponibilité générale d’un produit ne prouve pas l’observation d’une zone/date. Sans source validée, l’UI montre « non disponible », jamais une valeur plausible fabriquée. |

### Vent : contrat de rendu et de calcul

1. Le backend récupère les composantes et paramètres horaires nécessaires sur une grille qui couvre la vue cartographique réelle. Il conserve heure valide, heure de récupération, source, variables et géométrie.
2. La couche MapLibre projette la grille sur l’emprise et la caméra actuelles. La vitesse et la direction sont interpolées spatialement entre nœuds disponibles; le changement d’heure remplace la trame de manière explicite.
3. Les rubans de particules suivent le vecteur local interpolé. La couleur code la vitesse selon une seule légende; l’espacement/longueur ne doit pas suggérer une durée ou une propagation du feu. Une animation statique directionnelle remplace les particules si `prefers-reduced-motion` est actif.
4. Zoom, rotation, inclinaison, redimensionnement, déplacement et franchissement de l’antiméridien recalculent la couverture. Pendant un rafraîchissement, l’ancien champ reste identifié comme dernier champ reçu; après erreur, aucune nouvelle valeur n’est inventée.
5. Le budget d’animation est proportionnel à la surface de canvas et à la capacité mobile. Pause quand la vue est inactive; le mode 3D garde le relief sous le champ sans bloquer la sélection des feux.
6. Validation: comparer plusieurs points du rendu aux valeurs source; vérifier 2D/3D, directions cardinales, vent nul, rafales, zoom extrême, ±180°, heure passée/suivante, réseau interrompu, mobile et animations réduites.

## Ordre de réalisation et livrables

### Étape 1 — Contrat visuel et shell commun

- Geler les huit images comme références à taille native, noter les boîtes de chaque écran et construire une grille de comparaison par onglet.
- Garder navbar, topbar, palette, typo et rayon de panneaux identiques; fixer des tailles et états focus communs.
- Comparer captures de l’application aux références à `1585×992` desktop, puis `1024×768`, `390×844` et `360×800`.
- **Fini quand :** tous les onglets partagent le même shell, pas de scroll global desktop, aucune superposition de badge/légende/commandes et tous les boutons ont un état focus visible.

### Étape 2 — Carte et vent comme socle partagé

- Stabiliser le contrat de données météo et sa provenance; relier le champ interpolé au canvas MapLibre sur toutes les vues.
- Harmoniser l’emprise des nœuds à la caméra, la projection, le terrain, l’échelle vitesse et le playback UTC.
- Mettre en place un état visible `live / loading / last received / unavailable`, une légende glassy non bloquante et le budget mobile.
- **Fini quand :** tous les onglets rendent le même champ correct pour la vue et l’heure, les incertitudes sont visibles, aucun vecteur ne prétend décrire le déplacement du feu.

### Étape 3 — Dashboard, Live Map, Calendar, Compare

- Implémenter les quatre compositions de `01`–`04` avec panneaux dédiés, mais une sélection, période et emplacement persistants.
- Relier chaque action à carte + panneau + graphe : clic sur point/jour/série met à jour les autres vues; retour navigateur restaure l’état de l’URL.
- Calculer uniquement les agrégats supportés par les enregistrements chargés; isoler chaque produit et afficher les inconnues de couverture.
- **Fini quand :** un parcours de détection est démontrable du Dashboard vers l’inspection, le calendrier et Compare sans valeur non sourcée.

### Étape 4 — Terrain et Data & Sources

- Faire de la sélection map une cellule échantillonnée : coordonnée, élévation et coupe A–B sont synchronisées; le profil utilise les points A/B choisis.
- Compléter les fiches source depuis les métadonnées/manifestes existants, avec dates, licence, champs natifs, QA, provenance et formats réellement disponibles.
- Ajouter couches de sol/combustibles/eau seulement après validation des rasters et de leur date/résolution.
- **Fini quand :** toute valeur environnementale peut être suivie jusqu’à sa couche/source; une couche absente est désactivable avec explication.

### Étape 5 — Scénario scientifique

- Écrire une fiche modèle avant l’UI: modèle choisi (par ex. CFFDRS/FBP si entrées et licences compatibles), domaine régional, pas temporel, variables obligatoires, validation historique et métriques d’incertitude.
- Acquérir/valider un périmètre et son heure; codes de combustible et humidité; vent cohérent spatialement; relief; paramètres de propagation; tester contre des périmètres documentés réservés au test.
- Construire la forme de corridor/horizon de `07` uniquement sur les sorties du modèle et hachurer les pixels hors données/forte incertitude. Au moindre intrant manquant, garder une carte météo/contextuelle et montrer la raison.
- **Fini quand :** le modèle reproduit un jeu de validation versionné, ses limites sont visibles, le scénario n’est jamais une instruction d’évacuation, d’attaque ou de déploiement.

### Étape 6 — Field Situation mobile et qualité finale

- Reprendre l’image `08` en disposition téléphone sans reproduire ses mesures fictives : bandeau d’avertissement sobre, carte tactile, fiche basse, tabs fixes et rapport volontairement attribué.
- Vérifier chaque sous-onglet, rotation, clavier, taille de police, reduced motion, perte réseau, cache, export et permission de position (opt-in uniquement).
- Mesurer les captures de référence: mêmes zones relatives, mêmes composants et même hiérarchie; tester les actions et calculs sur données réelles et fixture identifiable.
- **Fini quand :** aucun écran essentiel ne demande un scroll global, chaque panneau a un état vide/chargement/erreur/prêt, et l’ensemble passe revue visuelle et fonctionnelle desktop/mobile.

## Règle de tranche et publication

Chaque tranche touche une vue ou un comportement partagé du vent, comprend: (1) mise à jour de ce plan avec état et preuve, (2) revue visuelle aux dimensions de référence si le navigateur le permet, (3) vérification de build et interactions concernées, (4) revue `git diff` pour isoler les changements, puis (5) commit et push sur `main` comme demandé. Ne pas inclure un fichier déjà modifié par un autre travail en cours sans en examiner et isoler les lignes. La tranche n’est pas « 1:1 terminée » sur la seule base d’un build vert.

## État de départ vérifié

- Huit références sont disponibles sous `docs/ui/`; elles montrent le même thème général, mais les chiffres 2025 qu’elles contiennent sont des exemples et ne sont pas des résultats validés de l’application.
- Le dépôt est sur `main` synchronisé avec `origin/main` au début de ce plan. `src/ui/App.tsx` contient une modification locale non publiée de logique de couverture du calendrier; elle est hors de la tranche design de ce document et doit rester isolée.
- Les vues et le champ animé existent déjà; l’écart principal est maintenant la parité des compositions, la couverture réelle des couches et la validation de bout en bout, avec la simulation comme dépendance scientifique majeure plutôt qu’un simple dessin manquant.

## Avancement — scénario et sensibilité du vent

- La vue Scénario affiche maintenant à gauche les valeurs météo du forecast sélectionné (vent à 10 m, rafales, pluie horaire, humidité à 2 m) ainsi que l’échantillon de pente DEM quand le chargement est terminé. L’interface marque explicitement comme manquants le périmètre daté, le type/humidité de combustible et le modèle validé; elle n’invente pas de couloir de propagation.
- Le curseur de vent hypothétique agit maintenant sur les vitesses des échantillons du champ de vent de la carte, en conservant les directions et le profil spatial relatif du forecast. La légende reprend ces vitesses; « Use forecast » remet le champ d’origine. Un texte explique qu’il s’agit d’une sensibilité uniforme et non d’un calcul de propagation.
- Vérification de cette tranche : `npm run build` réussi; `git diff --check` propre. Une revue visuelle de cette nouvelle composition reste à faire sur le viewport de référence avant de la qualifier de parité 1:1.
