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
| `04-comparer.png` | Choix des produits à gauche; carte swipe ou côte à côte au centre; courbes et indicateurs comparatifs à droite. | Dock de configuration sur la carte, cartes de tendance quotidiennes à droite, compteur de dates communes et avertissement sur l’accord non évalué; les flux restent indépendants. | Valider géométrie et densité sur les viewports de référence. Ne pas inventer corrélation, recouvrement spatial, décalage de pic ou calibration; n’afficher ces métriques qu’avec des données et une méthode validées. |
| `05-terrain.png` | Couches terrain à gauche; relief/selection au centre; fiche d’échantillon et profil A–B en bas. | DEM Terrarium, relief 3D, analyse locale et profil 25 points existent. A et B peuvent maintenant être placés sur la carte; la coupe suit le grand cercle entre ces points. | Garder composition du sol, combustible, végétation et eau indisponibles sans couche correspondante. Compléter l’identification, résolution, date et statut du DEM; valider les cas de transect court, long et traversant l’antiméridien. |
| `06-sources.png` | Catalogue à gauche; carte de contexte; métadonnées/provenance et pipeline en bas. | Catalogue de cinq sources sélectionnable; fiche de métadonnées pour la source sélectionnée; exports CSV des lignes FIRMS reçues, du vent horaire échantillonné, du profil DEM, de l’élévation ponctuelle et des manifestes présents; chaque export contient unité/source et provenance pertinente; actions vers Compare, Live Map, Terrain ou le catalogue d’archives; pipeline dynamique acquisition → normalisation → agrégation quotidienne → manifestes. | Aligner les proportions du catalogue/carte/fiche à la référence; compléter dictionnaire natif et empreinte au niveau de la sélection. Les étapes restent bornées à l’état observé. |
| `07-scenario-progression.png` | Entrées météo/terrain, carte de scénario, contrôles d’horizon et chronologie; incertitude lisible. | Contrôle what-if de vitesse et horizon présents; le panneau explique que le modèle, le périmètre et les carburants manquent et n’affiche aucune enveloppe synthétique. | La forme de la carte peut suivre la référence mais aucune progression ne sera dessinée avant l’intégration et la validation d’un modèle de comportement du feu, des carburants, de l’humidité, du périmètre et de vents cohérents. Pas d’ordres d’attaque ni de points tactiques automatiques. |
| `08-mobile-terrain.png` | Carte tactile; bandeau d’incertitude; panneau bas Area Awareness; navigation Map / Updates / Layers / Report. | Route mobile et quatre vues dédiées existent; bandeau de sécurité, note locale, filtres accessibles, météo et panneau bas repliable avec commande clavier/tactile sont disponibles. | Comparer chaque sous-vue à la référence aux largeurs 360/390 px; garder le vent et l’état des données visibles sans masquer les contrôles de carte; vérifier clavier/lecteur d’écran, grands textes et réduction d’animation. Ne pas demander la position GPS implicitement. |

## Données et vérité de l’interface

| Source / entrée | Usage affiché | Garde-fou |
|---|---|---|
| NASA FIRMS MODIS / VIIRS | Points d’anomalies thermiques, heure, produit, confiance native et FRP quand fourni. | Ce sont des détections, pas des feux uniques, un périmètre, une superficie brûlée ou une preuve d’absence. Séparer NRT/SP, plateformes et données manquantes. |
| Open-Meteo | Vitesse et direction horaires, rafales, pluie, température et humidité à 2 m/10 m selon le champ. | Afficher validité UTC, niveau, résolution/source et fraîcheur. Interpoler uniquement entre les points effectivement demandés; ne pas extrapoler hors grille ou dans le futur. |
| DEM Terrarium via AWS | Relief 3D et profil d’altitude échantillonné. | Afficher résolution/échantillonnage; ne pas présenter cette seule source comme mesure de pente, sol, combustible ou accessibilité. |
| Imports FIRMS locaux | Historique normalisé, QA, provenance, calendrier et comparaison lorsqu’une fenêtre est réellement couverte. | Manifestes et SHA-256 relient les lignes à l’archive. L’absence de ligne signifie « couverture inconnue » sans information d’acquisition suffisante. |
| Couverture, végétation, humidité des combustibles, périmètre incident | À connecter avant les indicateurs qui en dépendent. | La disponibilité générale d’un produit ne prouve pas l’observation d’une zone/date. Sans source validée, l’UI montre « non disponible », jamais une valeur plausible fabriquée. |

### Vent : contrat de rendu et de calcul

1. Le client récupère les composantes et paramètres horaires nécessaires sur une grille de 5 × 5 qui couvre la vue cartographique réelle. Il conserve l’heure valide, l’heure de récupération, la source, les variables et la géométrie des 25 nœuds.
2. La couche MapLibre projette la grille sur l’emprise et la caméra actuelles. La vitesse et la direction sont interpolées spatialement entre nœuds disponibles; le changement d’heure remplace la trame de manière explicite. Pour animer les traces, le cap est/nord interpolé est projeté localement à travers la caméra courante avant d’avancer les particules en pixels.
3. Les rubans de particules suivent le vecteur local interpolé. La couleur code la vitesse selon une seule légende; l’espacement/longueur ne doit pas suggérer une durée ou une propagation du feu. Une animation statique directionnelle remplace les particules si `prefers-reduced-motion` est actif.
4. Zoom, rotation, inclinaison, redimensionnement, déplacement et franchissement de l’antiméridien recalculent la couverture. Le forecast horaire et la grille viewport doivent appartenir au même lieu et à la même heure; pendant un changement de lieu, les anciennes valeurs météo sont retirées jusqu’à la réponse correspondante. Pendant le rafraîchissement d’emprise, l’ancien champ reste identifié comme dernier champ reçu; après erreur, aucune nouvelle valeur n’est inventée.
5. Le budget d’animation est proportionnel à la surface de canvas et à la capacité mobile. Pause quand la vue est inactive; le mode 3D garde le relief sous le champ sans bloquer la sélection des feux.
6. Validation: comparer plusieurs points du rendu aux valeurs source; vérifier 2D/3D, directions cardinales, vent nul, rafales, zoom extrême, ±180°, heure passée/suivante, réseau interrompu, mobile et animations réduites.

### Correctif UTC et intégrité du champ — implémenté, revue visuelle à compléter

Les réponses Open-Meteo demandées avec `timezone=UTC` peuvent fournir des heures sans suffixe. Elles sont maintenant normalisées en timestamps UTC canoniques avant d’être utilisées par le curseur, les vecteurs et les exports; les décalages explicites sont conservés. La grille n’est publiée que si elle contient tous les points demandés, des séries temporelles alignées, des coordonnées valides et des vitesses/directions dans leur domaine attendu. Une réponse invalide déclenche l’état d’erreur et l’action de réessai existante. [Documentation Open-Meteo — format et fuseau des horodatages](https://open-meteo.com/en/docs#api-documentation).

Vérifications : build TypeScript/Vite réussi; requête réelle Open-Meteo sur une grille 5 × 5 de Calgary — 25 lieux, 192 heures, tableaux synchronisés, 25 vecteurs exploitables à chaque heure. Le parseur impose aussi au moins neuf vecteurs exploitables par heure avant d’accepter le champ; le calme sans direction explicite est traité comme un vecteur nul. La revue visuelle navigateur reste ouverte : Chromium headless s’est bloqué avant de produire une capture décodable et a été fermé; aucune image partielle n’est réutilisée. Il reste à confirmer la sélection temporelle sous plusieurs fuseaux et la disposition du raster dans les vues 2D/3D. Ce travail reste nécessaire avant d’étendre le scénario : la carte « what-if » demeure une sensibilité météorologique explicitement hypothétique, pas un modèle validé de propagation.

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

## Avancement — dashboard vitré et vent animé

- Le résumé de zone du Dashboard a reçu une surface vitrée plus lisible, un contraste renforcé, une hiérarchie de données plus nette, un bouton d’action plus visible et des tailles adaptées aux écrans étroits. La barre latérale et la palette restent celles du produit.
- Le rendu animé du vent passe par un canvas superposé à la carte, afin d’éviter la mise à jour continue de centaines d’objets GeoJSON. Les traces sont plus contrastées; en mode de réduction des animations, les flèches statiques restent disponibles.
- Le flux public FIRMS accepte des lignes datées même quand elles ne couvrent pas toute la fenêtre demandée. Les jours avant/après la fenêtre glissante restent explicitement inconnus au lieu d’être comptés comme zéro.
- Vérification : `npm run build` réussi et `git diff --check` propre. La revue visuelle automatique n’a pas pu démarrer dans l’environnement Chrome isolé; le lancement s’est arrêté avec une erreur GPU. Aucune capture non validée n’est conservée. Cette tranche ne valide donc pas encore la parité visuelle complète.

## Avancement — intégrité du champ pendant le déplacement

- Toute nouvelle emprise met désormais la grille de vent en état `loading` immédiatement, avant le délai anti-rebond et l’appel météo. Les anciennes particules et le raster sont cachés pendant ce recalcul; ils ne sont pas projetés sur une caméra qui a changé.
- L’animation est suspendue pendant les mouvements de la caméra. Le badge, la légende et le panneau météo distinguent `ready`, `loading` et `error`; une erreur conserve le dernier champ en mémoire pour diagnostic, sans l’afficher sur la nouvelle emprise.
- Cette règle est commune au Dashboard, Live Map, Terrain, Scenario et aux deux cartes de Compare, car elles réutilisent le même composant `MapCanvas`.
- Vérification de cette tranche : `npm run build` réussi, `git diff --check` propre. Reste à vérifier le parcours de pan/zoom et la parité visuelle dans un navigateur opérationnel.

## Avancement — légende du vent sans collision avec les docks

- La capture Scenario décodée et CRC-validée montrait la légende de vitesse au centre de la carte, partiellement cachée par le dock « Environmental inputs ». Le dock Terrain a la même implantation à gauche.
- Le workspace Scenario reçoit maintenant une classe dédiée et les légendes Scenario/Terrain sont ancrées à droite de la carte, dans la zone libre; les règles de tablette et mobile ont des largeurs adaptées. Live Map conserve son ancrage après le dock gauche.
- Vérification : build TypeScript/Vite et `git diff --check` réussis. Je n’ai pas généré de nouvelle capture : les tentatives Chrome de cette session échouent au démarrage du processus GPU.

## Avancement — contexte historique CWFIS dans Calendar

- Calendar propose une vue commutable « Historical sample » dans son panneau inférieur existant : elle ne crée pas de nouvelle rangée de grille, ne réduit pas la carte et garde les limites de couverture visibles. L’échantillon Alberta west du 4 au 20 mai 2023 provient du WFS Fire M3 officiel et sépare les lignes par capteur/source; la provenance source, satellite et agence reste affichée.
- Le serveur borne les requêtes à 31 jours, 20 degrés carrés, 20 000 lignes et 12 MB, valide les coordonnées et les dates retournées, annonce les correspondances/troncatures et garde un cache court. Le panneau demande confirmation de revue de l’accord d’utilisation, et le serveur bloque aussi l’API sauf si l’équipe configure `CWFIS_EULA_CONFIRMED=true` après cette revue; l’attribution demandée dans les métadonnées accompagne les résultats. Les états d’absence ne sont pas convertis en couverture zéro. Le panneau précise que CWFIS est composite et distinct de FIRMS; aucune correspondance au périmètre d’incident n’est revendiquée.
- Vérification historique avant le verrou serveur : la source WFS et son proxy ont répondu en HTTP 200 avec 15 457 correspondances pour cet échantillon; la réponse conservait source/satellite/agence et `coverageState: unknown`. Depuis l’ajout de `CWFIS_EULA_CONFIRMED`, une configuration non confirmée répond HTTP 403 sans interroger le fournisseur. Build TypeScript/Vite et `git diff --check` réussis; pas de nouvelle capture Chrome.

## Avancement — surfaces cartographiques Calendar et Terrain

- Les panneaux flottants de Calendar et Terrain reprennent désormais le verre dépoli du Dashboard, Scenario et Live Map : reflets cyan discrets, surface translucide, flou/saturation, reflet de bord et sous-cartes plus légères. Les géométries, commandes et états de données restent identiques.
- Le contraste du texte et des contrôles reste prioritaire; les états au survol ne changent que le fond et la bordure des couches activables. Build et diff à vérifier dans la tranche courante; une capture navigateur reste nécessaire pour confirmer le rendu sur la carte réelle.

## Avancement — lisibilité du résumé Dashboard

- Le panneau d’activité de la zone a été élargi sur desktop, son verre dépoli et son liseré renforcés, et les chiffres, conditions météo et provenance ont gagné en lisibilité. Le bouton de chargement possède une cible tactile plus grande; l’état sans clé est annoncé comme « Setup needed » et reste accompagné de son explication d’accès aux données.
- Les dimensions et la densité se réadaptent aux tablettes et mobiles sans déplacer les commandes de carte.
- Vérification : `npm run build` réussi; `git diff --check` propre. Une nouvelle capture n’a pas été effectuée dans cette tranche.

## Avancement — composition de Compare

- Les sélecteurs produits, actions de chargement et modes swipe/côte à côte sont réunis dans un dock vitré flottant au-dessus de la carte. Les courbes quotidiennes sont dans le panneau droit avec les compteurs et la réserve sur la non-évaluation de l’accord.
- Les états du dock distinguent maintenant les lignes reçues, le flux public Canada limité aux sept derniers jours, l’absence de clé et une archive locale correspondante possible.
- Le dock et les cartes de tendances reprennent les surfaces glassy et les accents de capteur du reste de l’application. Sur mobile, les deux commandes passent côte à côte au-dessus de la carte.
- Vérification : `npm run build` réussi; `git diff --check` propre. La revue visuelle navigateur reste à effectuer lorsque Chrome démarre sans erreur GPU.

## Avancement — tendances Compare dans le panneau droit

- Les séries quotidiennes sont désormais des courbes SVG construites depuis les dates UTC et les lignes réellement retournées par chaque produit. Leurs axes, points et tooltips exposent les valeurs, les unités de temps et la provenance sans utiliser les valeurs décoratives de la maquette.
- Les contrôles de mode ont rejoint le dock de configuration gauche; la carte centrale garde le séparateur swipe manipulable et les deux couches restent synchronisées. La rangée de graphiques inférieure a été retirée afin d’utiliser la hauteur du panneau droit.
- Une métrique de corrélation, d’overlap spatial ou de calibration reste volontairement absente : la source actuelle n’apporte ni vérité terrain ni méthode validée pour ces calculs.
- Vérification : `npm run build` réussi et `git diff --check` propre; Chrome headless a de nouveau terminé avec l’erreur GPU 133 avant toute capture valide.

## Avancement — profil A—B interactif dans Terrain

- Le profil par défaut reste une coupe est–ouest de 80 km. Les commandes **Set A** et **Set B** permettent de remplacer les extrémités en cliquant directement sur la carte; A entraîne automatiquement le choix de B, la ligne et les repères A/B se déplacent, puis 25 échantillons du DEM Terrarium sont relus le long du grand cercle.
- L’axe et la légende affichent la distance réellement échantillonnée au lieu de conserver une étiquette fixe de 80 km. Les profils de plus de 600 km sont refusés avant les requêtes de tuile pour maintenir un coût de lecture borné; les couches land cover/fuels restent déclarées sans source.
- La fiche de pente locale reste calculée autour du point de zone sélectionné. Le choix A/B ne déplace pas ce point d’analyse.
- Vérification : `npm run build` réussi et `git diff --check` propre. Les cas de transect restent à valider contre des tuiles sur plusieurs distances et dans le navigateur.

## Avancement — pipeline de provenance dans Data & Sources

- Le panneau inférieur de cette vue affiche maintenant l’état de la requête FIRMS active, le nombre de lignes normalisées avec date, l’agrégation sur les jours UTC réellement présents et l’état du catalogue de manifestes locaux. Les lignes sont explicitement décrites comme observations et non comme feux; l’archive locale est séparée du flux en direct.
- La disposition reprend la bande de pipeline de la référence et utilise des cartes translucides; sur mobile, les étapes deviennent une grille 2 × 2. Le catalogue sélectionnable et la fiche complète des métadonnées restent à construire.
- Vérification : `npm run build` réussi et `git diff --check` propre. Pas de capture navigateur dans cette tranche; le statut de parité visuelle reste ouvert.

## Avancement — catalogue Data & Sources sélectionnable

- Un dock vitré au-dessus de la carte propose FIRMS, vent Open-Meteo, DEM Terrarium, élévation Open-Meteo et archives locales; la sélection met à jour une fiche de détails avec période, statut, résolution/échantillonnage, validité UTC ou provenance selon la source.
- Les calques hotspots, vent et relief agissent sur la carte. Sensor footprints et orbit swaths restent explicitement indisponibles tant qu’aucune source de couverture n’est connectée. Le dock peut se replier, et démarre replié sur téléphone pour préserver la carte.
- Vérification : `npm run build` réussi et `git diff --check` propre. La capture de référence et l’alignement pixel par pixel restent à faire.

## Avancement — mise à jour atomique du forecast météo

- Au changement de coordonnées, les heures et l’heure de récupération du forecast précédent sont maintenant effacées pendant la requête Open-Meteo. L’interface ne peut donc plus montrer la météo de l’ancien lieu à côté de la nouvelle emprise du vent.
- La réponse horaire est acceptée uniquement si chaque variable demandée partage la même longueur temporelle; les échantillons incomplets ou dont les valeurs ne sont pas finies sont retirés avant affichage.
- Vérification : build TypeScript/Vite et `git diff --check` à effectuer; le pan vers un autre lieu et le retour après erreur réseau restent à valider au navigateur.

## Avancement — orientation des particules du vent sous caméra 3D

- La direction météorologique reste calculée comme composantes est/nord en km/h. Avant le déplacement visuel des particules, cette direction est maintenant projetée localement avec le transform MapLibre courant; les caps suivent donc bearing et pitch au lieu d’être assimilés aux axes écran.
- La cadence des particules reste une convention graphique et n’est pas une vitesse de déplacement au sol ni une durée de propagation. Les valeurs physiques sont portées par le raster et la légende km/h.
- Vérification : build et diff à vérifier; comparer des caps cardinaux sur caméra nord, carte tournée et relief incliné dans un navigateur.

## Avancement — panneau tactile Field Situation

- La poignée visible du panneau mobile est devenue un vrai bouton accessible avec `aria-expanded`/`aria-controls`. Le panneau s’ouvre davantage en sélectionnant Updates, Layers ou Report et reste plus compact sur Map; l’utilisateur peut changer cette hauteur avec le bouton.
- Le scroll est limité au contenu de la fiche, la commande de hauteur reste visible et la barre de navigation basse conserve sa zone tactile.
- Vérification : build TypeScript/Vite et `git diff --check` à effectuer; comparer hauteur, scroll et zones tactiles sur 360 × 800 et 390 × 844 px.

## Avancement — verre dépoli du panneau Field Situation

- Le panneau bas mobile partagé par Map, Updates, Layers et Report utilise maintenant une surface translucide bleu pétrole avec un reflet turquoise léger, un liseré plus net et une poignée distincte. Les fiches de source, couches et rapports gardent des fonds plus denses afin de préserver leur contraste; les états de faible transparence peuvent revenir à une surface pleine.
- Revue navigateur des quatre onglets à 390 × 844 : Map, Updates, Layers et Report ont été sélectionnés et capturés. Les quatre PNG ont passé la vérification CRC et le décodage complet; Chrome headless a été limité à 6 cœurs sur 12 puis fermé après la revue. Les filtres Updates sont accessibles, le toggle Vent et les couches en lecture seule sont clairs, le rapport garde une attribution locale et un formulaire focalisé.
- Sur Report, l’ordre mobile place maintenant le formulaire juste après son en-tête; le bouton Save local note est visible dès l’ouverture. À 390 × 844, sa boîte est dans la zone visible (y = 573–619 px). Le statut de stockage, la localisation, le vent et les notes récentes suivent le formulaire et défilent dans le panneau; la barre des onglets reste fixe.
- La balise viewport demande le redimensionnement du contenu quand un clavier virtuel apparaît. Quand un champ Report est actif, les onglets bas se masquent, la fiche s’ancre au bas du viewport et les champs gardent une marge de défilement. Avec une taille de texte simulée à 200 %, la fiche commence 8 px sous le bandeau de sécurité, sans débordement horizontal; les graduations mobiles du vent se limitent à 0/50/100/150/200+.
- En combinant ce texte agrandi avec un viewport réduit à 390 × 580 (simulation clavier), les onglets sont masqués et Save local note devient visible dans le panneau après défilement. La mesure est basée sur l’émulation du navigateur, pas sur un clavier ou réglage d’accessibilité de téléphone réel.
- À revoir : valider le clavier et le réglage de texte réel sur Android/iOS, puis vérifier la disposition paysage.
- Vérification du code : `npm run build` réussi et `git diff --check` propre.

## Avancement — avertissement mobile toujours visible

- Un bandeau ambre sous les commandes de carte rappelle en permanence « situational awareness only » et demande confirmation par le commandement. Il précise qu’aucune prévision validée de propagation n’est connectée; il ne reprend pas les corridors ou priorités fictifs de l’image de référence.
- Revue navigateur avec le bandeau final : captures 360 × 800 et 390 × 844 de Map après chargement du fond; les deux PNG ont passé le contrôle CRC et le décodage complet. Le bandeau 10 px, le badge, la légende vent, la fiche basse et la navigation restent visibles sans collision aux deux largeurs. Il reste à revoir Updates, Layers et Report ainsi que les interactions de hauteur/scroll de la fiche.
- Vérification du code modifié : `npm run build` réussi et `git diff --check` propre.

## Avancement — échelle vent cohérente avec le raster

- L’échelle affichait ses repères à intervalles égaux malgré des valeurs irrégulières (0–100 par pas de 10, puis 150 et 200), et son endpoint 200+ était cyan alors que le raster interpolé utilise un bleu-vert sombre. Les repères sont maintenant placés selon la vitesse linéaire 0–200 km/h et les couleurs du dégradé correspondent aux arrêts de `windSpeedColor`.
- Vérification : `npm run build` réussi et `git diff --check` propre. La capture navigateur a échoué avant la création d’un PNG exploitable; aucun fichier de capture n’est réutilisé.

## Avancement — finition vitrée du résumé Dashboard

- Le panneau « Area activity » laisse davantage transparaître la carte sous son verre dépoli, avec un liseré plus lumineux, un reflet froid et une lueur ambre limitée à l’identité feu et aux observations. Les surfaces de contexte sont plus légères; l’action principale garde un contraste net et un retour tactile.
- Les tailles étroites conservent un flou réduit pour limiter le coût de composition. Le léger changement de bordure au survol s’éteint avec `prefers-reduced-motion`; les états de données et leurs avertissements ne changent pas.
- Revue navigateur au format 1238 × 1113, 390 × 844 et 360 × 800. Les captures dédiées ont passé la vérification CRC et le décodage complet PNG; Chrome headless a été limité à 6 cœurs sur 12 puis fermé à la fin de chaque capture. Sur téléphone, le panneau est resserré à 196 px pour dégager les commandes 3D et Vent; les statuts et le titre restent visibles, le contenu de provenance peut se tronquer sur une seule ligne.
- Vérification : `npm run build` réussi et `git diff --check` propre. La météo n’était pas disponible pendant les captures; le panneau l’a signalé et aucun chiffre météo n’a été inventé.

## Avancement — contraste du verre sur le résumé Dashboard

- La capture de revue au format du commentaire (1238 × 1113) montrait le relief cartographique trop présent à travers « Area activity », ce qui diminuait le contraste du texte.
- La surface garde un verre dépoli, ses reflets cyan/ambre et la carte visible autour, avec un fond plus sombre, un flou mieux dosé, un contexte de lieu cadré et un bouton d’action plus contrasté et plus facile à repérer.
- Vérification : captures 1585 × 992 et 1238 × 1113 décodées intégralement et CRC vérifiés; le rendu a été relu à la taille exacte du commentaire. `npm run build` et `git diff --check` réussis. Le flux public n’avait pas encore chargé les observations; l’interface a conservé son état inconnu au lieu d’afficher zéro.

## Avancement — export et comparaison dans Data & Sources

- La fiche FIRMS permet de charger ou recharger la fenêtre sélectionnée, télécharger les lignes réellement reçues en CSV UTF-8 et passer directement à Compare. Le produit choisi va dans A pour MODIS ou B pour VIIRS. Le vent exporte les points de grille à l’heure sélectionnée avec composantes et directions; le DEM exporte les 25 points du profil A–B avec coordonnées et élévation; Open-Meteo exporte l’échantillon d’élévation; Archives exporte les manifestes présents ou les observations locales chargées.
- Chaque fichier garde les données effectivement chargées, les unités et la provenance utile. Aucun export de données n’est proposé si la source n’a retourné aucun échantillon; le catalogue d’archives peut être chargé ou réessayé depuis sa fiche.
- Vérification navigateur déjà effectuée : le flux public FIRMS a fourni une détection VIIRS NOAA-20 du 14 novembre 2026 exportée avec produit et provenance; les exports vent (25 points) et élévation (valeur réelle, coordonnées et unité) ont aussi été téléchargés. L’ouverture Compare a été vérifiée pour un produit VIIRS et un produit MODIS, chacun dans son emplacement A/B valide. Les exports multi-échantillons du profil DEM et des manifestes sont ajoutés dans cette étape et restent à revalider. Chrome a été limité à 6 cœurs sur 12 et fermé après revue.

## Avancement — démarrage 2D et 3D explicite

- Un premier chargement sans paramètre `terrain` démarre maintenant en 2D. Le lien partageable `terrain=1` garde le relief et le pitch 40°; `terrain=0` force le 2D. La création de la carte et l’événement `style.load` respectent tous deux ce choix pour éviter un flash initial du relief. Le toggle 3D existant reste actif. Le pitch maximum est 60°; MapLibre marque les valeurs supérieures comme expérimentales et susceptibles de produire des problèmes de rendu ([MapOptions](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/)).
- Revue visuelle diagnostique : la capture hillshade-off n’a pas abouti à un PNG vérifiable; le fichier incomplet/non vérifié a été écarté, Chrome a été fermé et aucune conclusion sur hillshade contre DEM n’est tirée. Pas de nouvelle capture dans cette tranche.
- Vérification des liens par lecture statique : `terrain=1` active le relief; l’absence de paramètre et `terrain=0` le désactivent; l’écriture d’état produit explicitement `terrain=1` ou `terrain=0`. Les contrôles de pitch, du `maxPitch` et du toggle sont présents. `git diff --check` et `npm run build` réussissent. La capture hillshade-off a expiré avant une image vérifiable; elle ne permet pas de conclure sur la cause des plaques sombres.

## Avancement — aperçu exploratoire sur mailles communes

- Compare agrège les deux produits réellement chargés sur une grille locale LAEA sphérique de 1 km par jour UTC; les métriques utilisent uniquement les jours où chaque produit a retourné au moins une ligne. Les jours non partagés n’entrent pas au dénominateur.
- La vue nomme produits, modes d’accès et comptes, affiche le chevauchement observé/union et avertit que ce n’est ni une couverture, ni une concordance de capteurs, ni une identité de feux. Le CSV contient la fenêtre, les paramètres de projection et les comptes/plateformes par produit.
- Vérification : compilation TypeScript/Vite réussie; cas synthétiques exécutés sous `America/Los_Angeles` pour une date UTC locale sans suffixe, un jour partagé avec 50 % de chevauchement descriptif et des fenêtres sans jour commun. Avec les réponses NASA du Canada interrogées pour Edmonton (0 ligne MODIS, 6 VIIRS), le calcul ne produit aucun chevauchement et affiche qu’aucun jour partagé ne peut être comparé.
- Limite : ce prototype aligne un support spatial candidat; il ne calibre pas la sensibilité, ne prouve pas la couverture et ne remplace pas les archives NASA FIRMS standard ni une validation indépendante.

## Avancement — plages de dates FIRMS sans ambiguïté

- L’API renvoie deux informations distinctes : la fenêtre où le flux NRT public est disponible et les dates réellement présentes dans le CSV national téléchargé. Le client conserve les deux; le pipeline Data & Sources les montre séparément et précise que les dates nationales ne décrivent pas la couverture de la zone sélectionnée.
- Le message Dashboard pour une fenêtre qui dépasse la disponibilité indique maintenant la borne de disponibilité et garde les dates hors fenêtre inconnues; il ne prétend plus que des lignes existent jusqu’à cette date.
- Vérification : pour Edmonton, l’API NRT Canada a répondu HTTP 200 avec fenêtre disponible du 2026-11-08 au 2026-11-15 et lignes de CSV datées du 2026-11-07 au 2026-11-14; le navigateur limité à 6 cœurs a rendu ces deux plages distinctement. `npm run build` et `git diff --check` passent.

## Avancement — prévenir les points périmés pendant le chargement

- Chaque nouvelle requête FIRMS efface immédiatement les observations et l’heure de récupération précédentes, en plus de ses anciennes métadonnées d’accès. Les points, courbes et comptes ne restent donc pas affichés sous la nouvelle fenêtre demandée pendant l’attente ou après une erreur.
- Le chargement de Dashboard, Compare et des capteurs de Live Map partage ce hook; le changement s’applique uniformément à ces requêtes.

## Avancement — choisir la fenêtre de contexte historique

- Le panneau CWFIS de Calendar garde son échantillon Alberta west comme défaut, mais permet de demander une période passée choisie de 1 à 31 jours dans la même emprise. Les données et leur fenêtre sont effacées dès qu’on modifie les dates afin de ne pas attribuer l’ancien graphique au nouveau choix.
- Le client expose maintenant les correspondances tronquées par la limite de 20 000 lignes et invite à réduire la période avant d’interpréter les totaux; la série des jours et ses étiquettes suit la fenêtre choisie.
- Vérification : la fenêtre 2023-05-01 → 2023-05-31 a rendu 16 084 lignes CWFIS, cinq étiquettes de source, 31 jours et aucune troncature. La revue Chrome 1440 × 1000 a montré les deux champs de date et le résultat chargé; Chrome était limité à 6 cœurs sur 12. La capture a passé le contrôle CRC et le décodage complet.

## Avancement — export des lignes du contexte CWFIS

- Le panneau historique exporte maintenant les lignes réellement retournées, avec date/coordonnées et les attributs `source`, `sensor`, `satellite` et `agency`. Chaque ligne répète les bornes demandées, le nombre de correspondances/résultats, le statut de troncature, l’état de couverture inconnue et la source WFS.
- Le nom et le guide d’utilisation identifient l’export comme CWFIS Fire M3 composite, distinct d’une archive FIRMS NASA brute.
- Vérification navigateur sous Chrome limité à 6 cœurs : export de l’échantillon de mai 2023 de 16 084 lignes, avec 16 champs. Le CSV de 3,52 MB contient `matched_feature_count=16084`, `truncated=false`, `coverage_state=unknown` et les coordonnées/provenances de la première ligne.
