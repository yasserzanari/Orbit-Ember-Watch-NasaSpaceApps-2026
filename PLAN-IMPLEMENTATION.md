# Orbit Ember Watch — plan concret d’implémentation

## Résultat visé

Construire l’application cartographique montrée dans les huit maquettes de `docs/ui/` : dashboard, carte, calendrier, comparaison, terrain, sources, scénarios et vue mobile. L’interface doit garder la zone, la période et les capteurs synchronisés entre les vues, utiliser la hauteur disponible sur desktop, et rester lisible sur téléphone.

L’application est un outil de situation et d’analyse. Tant qu’un flux n’a pas été branché et contrôlé, la vue doit annoncer clairement son état au lieu d’afficher les valeurs fictives des maquettes comme si elles étaient réelles.

## Priorité produit et ordre d’exécution

Le résultat doit satisfaire deux niveaux sans les confondre : le **cœur du défi NASA Space Apps 2026** est de rendre les historiques actifs MODIS et VIIRS comparables et consultables dans un calendrier d’activité par zone; le **produit élargi demandé** ajoute carte météo/vent, relief, scénario et situation mobile. Le dashboard, le calendrier, la comparaison et la provenance servent le défi directement. Le vent et le relief enrichissent l’interprétation, mais ne remplacent pas l’harmonisation. Le scénario et la vue terrain restent des surfaces de contexte; ils ne doivent pas prendre la place du calendrier historique ni afficher une propagation fictive.

La route est volontairement bloquée par ses dépendances : acquisition historique → schéma et QA par produit → agrégats séparés → test de comparaison → référence saisonnière/anomalies → visualisations. Les sources NRT servent à montrer les nouveautés; elles ne sont pas la base silencieuse d’une climatologie. Pour l’historique, chaque produit, satellite, collection et mode SP/NRT garde son identité. L’API Area FIRMS accepte une période de 1 à 5 jours et une date, et expose une route d’`data_availability`; elle convient aux requêtes bornées, mais une série de vingt ans ne doit pas être chargée en boucles synchrones depuis le navigateur. Il faut un import batch versionné, avec un manifeste, puis servir à l’UI des agrégats reproductibles. Voir [l’API Area FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area) et [l’index des APIs FIRMS](https://firms.modaps.eosdis.nasa.gov/api/).

### Plan concret, dépendances et preuve de sortie

| Ordre | Livraison | Travail concret | Preuve de sortie |
|---|---|---|---|
| **0 · Contrat visuel** | Référence UI unique | Conserver le même thème, la même navigation, les contrôles globaux et le canvas cartographique; chaque onglet reprend sa maquette `docs/ui/` en géométrie, hiérarchie, densité et comportement. Les données d’exemple restent interdites dans le flux réel. | Revue de chaque route à 1600×1000 et 390×844; pas de scroll de page desktop; états vide, chargement, erreur, données périmées et réussite capturés lorsqu’ils s’appliquent. |
| **1 · État partagé** | Navigation fiable | Une source d’état canonique pour AOI, début/fin UTC, capteurs, collection, date active, sélection de détection, heure météo et visibilité des couches; restaurer et partager les filtres depuis l’URL. | Changer d’onglet, actualiser et utiliser retour/avance conserve les filtres et la sélection sans requête obsolète qui écrase le nouvel état. |
| **2 · Catalogue et acquisition** | Sources consultables | Créer un registre typé pour MODIS Terra/Aqua, VIIRS par satellite, branches SP/NRT, FIRMS, Open-Meteo, DEM, fond de carte et couches de référence. Afficher accès, disponibilité, période, licence/attribution, unité, résolution connue, dernière récupération et limites. Ajouter la date personnalisée à l’API FIRMS bornée, son endpoint de disponibilité, puis un import historique batch séparé. | Pour chaque produit, la fiche montre la source réelle et ses métadonnées; l’UI ne présente jamais un produit « connecté » s’il n’a pas été interrogé ou importé. Le lot d’historique se relance avec la même empreinte et donne le même manifeste. |
| **3 · Contrats et QA** | Données prêtes à agréger | Garder les colonnes sources; normaliser les champs communs et unités sans perdre la confiance native; valider lat/lon, dates UTC, doublons exacts et version; journaliser chaque rejet et appliquer les filtres par capteur. | Rapport par fichier/produit avec lignes reçues, gardées, exclues par motif, période couverte et hash; un défaut d’unité ou de schéma bloque l’import de ce lot au lieu de produire un graphique plausible. |
| **4 · Agrégats historiques** | Série comparable sans fusion implicite | Produire des tables jour/semaine/mois, zones/grilles, par plateforme et produit, avec valeurs manquantes distinctes de zéro, changements de constellation, plages couvertes et paramètres de projection. | Recalcul d’un point calendrier à partir du manifeste et des lignes sources; chacune des deux séries reste inspectable séparément; aucune absence de hotspot n’est convertie en non-détection valide sans dénominateur d’observation. |
| **5 · Calibration et anomalies** | Harmonisation testée ou refusée | Définir cible et période de recouvrement; fixer apprentissage/test par blocs d’années; comparer non corrigé, baseline simple et modèle candidat; valider avant de présenter une série harmonisée. Produire une anomalie saisonnière descriptive seulement si l’effectif et la couverture passent les règles préenregistrées. | Rapport avec version, paramètres, années incluses/exclues, métriques, sensibilité et domaine; une calibration rejetée ou indéterminée laisse les séries originales séparées. Le score n’apparaît qu’après évaluation indépendante. |
| **6 · Écrans cœur** | Dashboard, Calendar, Compare, Sources | Alimenter les graphiques et cartes avec les agrégats de la tranche 4–5; synchroniser le clic calendrier, la carte, les facettes capteur, le détail et l’export; faire de Sources l’inspecteur du manifeste et du pipeline. | Revue maquette par maquette; une sélection calendrier ouvre exactement la même période/cellule dans Compare et Sources; métrique, unité, population, période et source figurent au point de lecture. |
| **7 · Couches météo et terrain** | Vent lisible et contexte mesuré | Garder le vent Open-Meteo comme prévision horaire distincte des observations feu; mettre à jour la grille 5×5 et l’interpolation vectorielle selon l’heure sélectionnée; vitesse en couleur km/h, filets blancs directionnels, échelle et fraîcheur; terrain DEM, profil, pente locale et ensuite land-cover seulement après validation de sa source. | Valeurs horaires de l’inspecteur identiques au point de grille correspondant; conversion « from » → « to » centralisée; chaque couche porte source, validité, récupération, unités et résolution; panne ou point manquant ne peint pas une donnée comme valide. Référence visuelle vent : champ de vitesse coloré et lignes de flux, adapté au thème de l’application. |
| **8 · Extensions contrôlées** | Scenario et Field Situation | Faire dépendre l’enveloppe de propagation d’un périmètre daté, de fuels et humidité documentés, d’un relief compatible, d’un moteur canadien approprié et d’une validation locale. Sans ces entrées, conserver le layout de la maquette avec blocage explicite. Sur mobile, fournir lecture légère, cache réellement horodaté et rapports brouillons attribués. | Le scénario identique et reproductible restitue son snapshot/version; aucune enveloppe sans prérequis; le mobile ne montre ni consigne d’attaque ni faux statut offline/synchronisé. |
| **9 · Finition et publication** | Huit écrans cohérents | Ajuster l’architecture en composants partagés, accessibilité clavier/tactile, tailles 44 px pour actions principales, focus, reduced motion, sélection d’AOI alternative au dessin et états réseau cohérents. | Build de production, revue browser desktop/mobile, liste de vérification du skill frontend, `git diff --check`, capture intégrité validée; commit poussé et `HEAD == origin/main`. |

**Prochain chantier exécutable :** acquérir une archive pilote redistribuable, exécuter l’importateur, examiner son manifeste et ses exclusions sur le schéma exact du produit, puis ajouter des agrégats journaliers distincts par plateforme avant d’activer l’historique dans Calendar. L’API de disponibilité indique les bornes globales FIRMS, mais ne constitue pas une archive ni un dénominateur d’observation par zone. Le portail d’archives exige une acquisition explicite; aucun fichier n’est disponible dans ce dépôt. Tant que ce pilote n’existe pas, le calendrier historique doit afficher « non importé » plutôt que des zéros fabriqués.

**Règle de fidélité 1:1 :** on reproduit la composition, les panneaux, les proportions, les densités, l’ordre des interactions, les états et les légendes des huit maquettes; on ne reproduit pas leurs nombres fictifs, logos NASA non officiels, feux inventés, couvertures ou périmètres de scénario. Toute différence visuelle due à l’absence de source doit être matérialisée dans la zone concernée par l’état indisponible correspondant, sans casser le layout. L’acceptation visuelle est faite sur le même viewport et chaque évolution met à jour l’écran existant, jamais une deuxième identité.

## Direction visuelle pour l’implémentation 1:1

Le sujet est l’observation géospatiale des anomalies thermiques en Alberta. L’écran doit aider un analyste à relier une observation à son lieu, son heure et sa source. La carte est donc l’élément principal, et les panneaux sont des instruments de lecture compacts autour d’elle.

**Choix de composition :** conserver un shell commun avec la même barre latérale, le même bandeau de zone/période/capteurs et la même carte persistante; adapter les panneaux et graphiques à la tâche de chaque onglet. Une série de pages indépendantes ferait perdre le contexte spatial et les filtres. Sur desktop, viser les proportions de la maquette 1600 × 1000 : rail fixe, barre de filtres, carte au centre, docks latéraux et bande de temps/graphique en bas; chaque dock peut défiler dans sa propre zone. Sur mobile, utiliser un menu latéral et une carte 2D prioritaire avec panneau bas repliable.

| Option de layout | Lecture | Décision |
|---|---|---|
| A — shell persistant, carte et panneaux spécialisés | Une même zone, date et sélection restent en place en passant Dashboard → Live Map → Calendar; la carte est le fil conducteur. | **Retenue**, c’est le layout des maquettes et la préférence déjà établie. |
| B — page indépendante par onglet | Plus de surface pour un graphique ou une table, mais la carte, les filtres et la sélection changent ou disparaissent à chaque page. | Rejetée pour le desktop; certains panneaux prennent toute la largeur seulement sur téléphone ou dans une vue de détail. |

```text
DESKTOP — 1600 × 1000
┌────────────┬───────────────────────────────────────────────────────────────┐
│ sidebar    │ bandeau : zone | dates UTC | produits/capteurs | état source │
│ persistante├──────────────────┬─────────────────────┬────────────────────┤
│ identique  │ résumé/couches    │ CARTE + vent       │ sélection/preuve   │
│ 8 onglets  │ filtres ou config │ 3D, hotspots       │ détail + graphique │
│            ├──────────────────┴─────────────────────┴────────────────────┤
│            │ calendrier, lecture temporelle ou tendance liée à la carte  │
└────────────┴───────────────────────────────────────────────────────────────┘

MOBILE — 390 × 844
┌────────────────────────────────────┐
│ titre | zone | fraîcheur           │
├────────────────────────────────────┤
│ carte 2D, vent, sélection          │
│ contrôles tactiles et légende      │
├────────────────────────────────────┤
│ panneau bas : conditions / détails│
│ actions Carte · Mises à jour · ... │
└────────────────────────────────────┘
```

**Signature visuelle :** le « ruban de vent » cyan traverse le relief et relie la carte à l’heure météo sélectionnée; les anomalies thermiques gardent leur couleur et leur identité capteur. C’est l’élément mémorable propre à ce produit. Le reste reste calme : surfaces bleu encre, traits fins, typographie compacte, animation limitée au flux et au déplacement temporel. Ne pas ajouter de logo NASA, ni de statuts verts décoratifs. Les sources NASA sont nommées et attribuées sans laisser croire à une approbation NASA.

| Rôle | Décision de style |
|---|---|
| Fond | `#07111A` — encre profonde |
| Panneaux | `#122330` — bleu ardoise |
| Traits | `#28404D` — séparation discrète |
| Vent / focus | `#25D2D8` — cyan lisible |
| Attention / activité | `#F4B12F` et `#F2683B` — ambre puis braise, seulement pour les données qui le justifient |
| Interface / données | IBM Plex Sans pour les libellés, IBM Plex Mono pour mesures et heures UTC; conserver les solutions de repli hors ligne |

Ce choix suit le système existant dans [DESIGN.md](DESIGN.md) et [tokens.css](src/styles/tokens.css), plutôt que de réinventer un thème générique. À chaque vue, la hiérarchie, les marges, les proportions et les contrôles des maquettes sont reproduits; les nombres fictifs, fausses anomalies et périmètres inventés ne le sont pas.

## Plan concret par écran — cible et critères fonctionnels

| Écran | Composition à reprendre | Interactions et données qui rendent l’écran fonctionnel |
|---|---|---|
| **Dashboard** — `01-dashboard.png` | Filtres communs en haut; résumé à gauche; carte Alberta au centre; briefing à droite; tendance, composition capteurs et caveat en bas. | Une synthèse réelle issue de FIRMS et de la période choisie; facettes MODIS/VIIRS distinctes; série et comparaison historique masquées si l’archive, la couverture ou la référence manquent; clic sur période/cluster conserve la sélection vers la carte et le calendrier. |
| **Live Map** — `02-carte-live.png` | Contrôles de couches à gauche; grande carte 2D/3D; inspection à droite; lecture temporelle et activité en bas. | Visibilité distincte par plateforme/produit; points, cluster ou densité avec seuil explicite; filtres de confiance natifs; inspection d’une ligne NASA avec heure UTC, plateforme, confiance, FRP, ID/version; l’animation suit seulement les dates disponibles. |
| **Calendar** — `03-calendrier.png` | Résumé capteurs à gauche; carte contextuelle au-dessus; grille mensuelle/hebdomadaire en bas; détails de semaine à droite. | Agrégation calculée depuis des observations valides; jour vide, jour non couvert et jour sans fichier restent des états distincts; clic semaine synchronise carte, courbe et inspection; activité relative toujours accompagnée de sa métrique et de sa période de référence. |
| **Compare** — `04-comparer.png` | Configuration à gauche; carte swipe ou côte-à-côte au centre; séries et état de validation à droite. | MODIS et VIIRS filtrés indépendamment sur la même zone et période; diff/mailles uniquement avec supports compatibles; les scores de corrélation ou d’accord restent « non calculés/non validés » jusqu’à un pipeline et un jeu de validation réels. |
| **Terrain** — `05-terrain.png` | Sélecteur de couches à gauche; carte en relief et transect en bas; cellule sélectionnée et résumé environnemental à droite. | DEM Terrarium échantillonné au point et le long d’un profil; pente/aspect dérivés et décrits comme échantillon local; classes de végétation, fuel, eau et humidité uniquement après ajout d’une source/licence/résolution validée; sélection de cellule pilotée par le pointeur; distinguer clairement échantillon local et raster régional. |
| **Data & Sources** — `06-sources.png` | Catalogue à gauche; aperçu cartographique au centre; fiche produit, mapping et provenance à droite; pipeline en bas. | Sélection d’un produit réel; champs source→modèle, filtres, état, fraîcheur, période, licence/URL et empreinte du fichier; export lié au périmètre/période; ne jamais afficher une taille ou empreinte d’exemple comme vraie provenance. |
| **Scenario** — `07-scenario-progression.png` | Barre d’entrées datées en haut; environnement à gauche; carte au centre; hypothèses et incertitude à droite; horizon temporel en bas. | Vent/pluie sont des prévisions sourcées; périmètre initial daté/confirmé, combustibles FBP, humidité, pente et moteur validé sont des prérequis pour toute enveloppe. Tant qu’ils manquent, garder ce layout, rendre « calcul indisponible » et ne dessiner aucune croissance simulée. Un calcul futur doit être une exécution reproductible et versionnée. |
| **Mobile Situation** — `08-mobile-terrain.png` | Même identité; carte dominante; fiche « situation » en panneau bas; navigation mobile Carte/Mises à jour/Couches/Rapport. | Carte 2D et contrôles tactiles; fraîcheur/hors ligne réelle; localisation après autorisation; rapport attribué comme brouillon; contenu à vérifier avec le commandement, sans points d’attaque, ordre tactique, numéro SOS non configuré ou statut de synchronisation fictif. |

### État constaté avant le prochain chantier

- Le shell, les huit entrées de navigation, la météo horaire, la grille de vent Open-Meteo à 25 points, le relief 3D AWS Terrarium, l’altitude ponctuelle et le proxy serveur FIRMS sont présents.
- Les routes gardent une carte partagée. Le Dashboard a une disposition map-first avec résumé FIRMS, briefing de zone, météo et graphiques issus des données chargées. Calendar a une grille mensuelle/hebdomadaire liée à la sélection sur la carte et un détail de semaine. Compare interroge deux produits NASA distincts avec swipe/côte-à-côte. Terrain dérive altitude, pente/aspect local et profil depuis les tuiles Terrarium; occupation du sol/fuels et Scenario restent incomplets, et Data & Sources n’a pas encore de catalogue/manifeste.
- La zone, l’onglet, l’heure météo, la date sélectionnée, la visibilité du vent/relief, le produit FIRMS, les deux produits de comparaison et leur fenêtre UTC sont sérialisés dans l’URL. Restent la conservation de l’observation sélectionnée au travers de toutes les vues et l’accès à une archive arbitraire pour les maquettes.
- **Correction livrée avec la tranche de plan :** le filtre CSS qui recolorait tout le conteneur WebGL est supprimé. Le fond OSM est maintenant assombri par les propriétés raster uniquement; les flèches et particules cyan restent lumineuses. Les symboles du vent sont élevés au-dessus du DEM pour rester lisibles en 3D. La revue visuelle a confirmé 25 points météo et des particules animées; la densité, les streamlines et les variations de relief restent à affiner au fil de la tranche B.
- Le développement de fonctions complètes dépend des accès réels aux produits. Tant que `FIRMS_MAP_KEY` n’est pas configurée sur le serveur, les écrans doivent rester utilisables en état vide explicatif; aucune clé ne sera ajoutée au dépôt ou collée dans le chat.

## Tranches de réalisation et publication

Chaque ligne ci-dessous est une tranche verticale livrable. Elle se termine par un build, une revue manuelle de la vue touchée aux tailles de référence, un commit, puis un push et une intégration sur `main`. Les données sensibles restent dans `.env` et hors Git.

| Tranche | Travail concret | Preuve d’achèvement avant push |
|---|---|---|
| **A — fondation UI partagée** | Sortir le shell, la barre latérale, l’en-tête global, les contrôles de filtres, les docks, la timeline et la carte de `App.tsx` vers des composants/feature folders; introduire l’état partagé AOI, dates UTC, produits, sélection et heure; sérialiser les filtres partageables dans l’URL. Ne pas changer le thème approuvé. | Navigation clavier, changements d’onglet sans perte de sélection, contrôles communs identiques, pas de scroll de page à 1600×1000; mobile drawer et panneau bas utilisables à 390×844. |
| **B — source de détections et carte live** | Garder le proxy FIRMS existant; établir adaptateur typé et provenance; ajouter chargement par périmètre/période bornés, pagination/snapshots selon API, distinction produit SP/NRT et plateforme; vraie heatmap/cluster, filtre/inspection; corriger couleurs et placement du vent sur le terrain 3D. | Réponse FIRMS réelle inspectable de la carte au détail; loading/partiel/vide/inconnu/erreur distincts; aucune donnée simulée affichée comme observée. |
| **C — Dashboard** | Remplacer panneau météo par la disposition Dashboard de la maquette; bâtir cartes de synthèse, facettes capteurs, briefing, chart saisonnier et caveat avec des agrégats typés issus des requêtes. | Chaque chiffre a période, unité, produit et source; pas de baseline/coverage sans données; clic dans courbe et carte conserve le même contexte. |
| **D — Calendar** | Construire grille mensuelle/hebdomadaire, légende métrique et panneau période sélectionnée depuis l’agrégat partagé. | Les cases distinguent activité nulle, non observée et source indisponible; sélection synchronisée à la carte/dashboard. |
| **E — Compare** | Ajouter facettes indépendantes par capteur, swipe/côte-à-côte, série de chaque capteur et calcul descriptif sur grille/temps communs; registre de statut de validation. | Même AOI/période côté A et B; seules métriques définies sont affichées; aucune calibration simulée ou prétendument validée. |
| **F — Terrain et Sources** | Ajouter catalogue/manifeste produits; brancher sources de DEM, occupation du sol, couverture et données terrain après validation; coupe de terrain/profil et fiche provenance. | Attribution, date, résolution et état par couche; cellule sélectionnée relie map, tableau et source; classes de combustible ne viennent pas d’une simple couleur de fond. |
| **G — Scenario** | Modéliser les entrées avec timestamps et qualité; choisir/intégrer un moteur officiel adapté au Canada, le lancer dans un worker, enregistrer paramètres et versions; séparer sortie, incertitude et limites. | Pas d’enveloppe avant périmètre initial daté, entrées de combustible/météo/terrain adaptées et évaluation indépendante; scénario reproductible pour mêmes entrées. |
| **H — Mobile, accessibilité et finition** | Reprendre le mockup mobile sans son cadre de téléphone : carte compacte, panneaux bas, navigation fixe, réseau dégradé, états cache, contrôles 44 px et reduced-motion. Régler typographie, densité, contrastes et composition de chaque capture. | Comparaison visuelle à 1600×1000 et 390×844 pour chaque écran; focus clavier, alternative textuelle aux valeurs cartographiques, reduced-motion et contenu exploitable sans scroll inutile. |

### Architecture cible pour ces tranches

```text
src/app/            shell, navigation, URL et sélection globale
src/features/map/   MapLibre, couches source, terrain, vent et légendes
src/features/*/     dashboard, live-map, calendar, compare, terrain, sources, scenario, field
src/data/           contrats typés, adaptateurs Open-Meteo/FIRMS/DEM, provenance et états
src/components/     filtres, graphiques, panneaux, tables, erreurs/vides chargés
server/             proxy de secrets et acquisitions qui ne doivent pas vivre dans le navigateur
```

Un seul état partagé est l’autorité pour la zone, les dates UTC, le produit/capteur, la cellule, la détection et l’heure météo. Chaque module consomme les mêmes sélections; un onglet n’implémente pas une copie indépendante de la carte ou des filtres. Les graphiques sont des vues des données typées, jamais des séries fixées dans le JSX. La carte conserve ses sources/attributions et expose un contrôle de couche dont le libellé, l’état, la plage horaire et la provenance sont visibles.

Les propriétaires communs sont : barre de filtres (zone + période UTC + plateformes), recherche/choix de zone, sélecteur de dates app-owned, liste de capteurs à cases à cocher, contrôle de couches, état source inline, légende, détail de sélection et menu d’export. Ils sont définis une seule fois et déclinés par densité, pas réécrits dans chaque écran. L’interface reste en anglais comme les maquettes; la documentation produit reste en français. Toutes les dates d’acquisition sont stockées en UTC et affichent clairement leur fuseau.

### Revue visuelle de chaque tranche

Comparer la vue réelle à son fichier `docs/ui/` à 1600×1000 (desktop) et 390×844 (mobile). La revue porte sur géométrie, largeur des docks, densité, niveaux typographiques, légendes, marges, états de chargement et comportements responsive. La fidélité concerne la composition et les interactions; les valeurs de démonstration des PNG restent interdites en données réelles. Faire cette revue dans Chrome pendant l’inspection puis fermer l’instance utilisée, conformément à la préférence exprimée.

## État de réalisation

**Tranches cartographiques implémentées :** shell sombre à navigation persistante, carte MapLibre interactive avec sélection d’un point, choix de quatre secteurs de l’Alberta, terrain 3D et hillshade depuis le DEM AWS Terrarium, ainsi qu’une altitude ponctuelle Open-Meteo. Une requête météo groupée construit une grille 5×5 de 25 points; l’interpolation vectorielle horaire alimente des flèches de direction/vitesse et des particules animées. La timeline synchronise le vent, la pluie, la température, l’humidité, les flèches et le flux; le relief et le vent ont chacun un contrôle d’affichage. L’animation exprime un flux relatif et ne représente ni le temps réel de déplacement d’une masse d’air, ni la propagation d’un incendie. La sensibilité au vent permet d’éditer une hypothèse, mais ne calcule pas de propagation.

**Intégration FIRMS implémentée :** le serveur Node fournit un proxy à clé privée, une allowlist des produits MODIS/VIIRS NASA, la validation stricte des boîtes géographiques et fenêtres de 1–5 jours, une mise en cache de deux minutes et une normalisation de CSV en observations typées. La carte permet de choisir un produit, demander la dernière journée, voir les points et inspecter leurs attributs. L’API exige une MAP_KEY NASA; sans elle, la réponse est explicitement indisponible. La configuration sans clé a été vérifiée de bout en bout; la vérification d’un appel autorisé et d’un échantillon NASA réel attend une clé présente dans `.env`.

**Toujours à réaliser :** import/manifeste et agrégats reproductibles, calendriers réels de détections, comparaison instrument par instrument, couverture du sol et classes de combustibles, analyse raster de pente/aspect, calcul FWI/FBP validé, cache terrain hors ligne et vérification détaillée de toutes les maquettes sur plusieurs appareils. Le relief 3D sert à lire la forme du terrain; il ne remplace pas ces couches dérivées. Les états manquants restent visibles dans l’application. Un build de production valide le frontend; il ne prouve pas que les sources FIRMS, les modèles feu ou les vues de données dérivées fonctionnent.

**Avancement tranche A — état de travail partageable :** `useWorkspaceState` détient désormais la vue active, les coordonnées/nom de zone, l’heure de prévision UTC, le produit FIRMS, la fenêtre de 1/2/3/5 jours et la visibilité du vent et du relief. Le lien restaure ces paramètres après rechargement ou partage; les coordonnées sont bornées et une heure Open-Meteo sans suffixe de fuseau est explicitement interprétée en UTC. Le sélecteur de lieu, la sélection d’un point sur la carte, la timeline, les contrôles produit/période et les boutons de couches écrivent le même état. La requête utilise réellement le produit et la période choisis; l’inspecteur reprend le produit commun et explique la fenêtre. Le layout mobile affiche les mêmes contrôles sous forme de boutons iconifiés, avec libellés accessibles. La tranche A reste en cours : il faut encore extraire le shell/carte en composants dédiés, ajouter une période calendrier si une archive source la permet et conserver le détail d’observation actif.

**Avancement tranche C — Dashboard map-first initial :** le dock gauche sur la carte résume la zone, le produit choisi, le nombre d’anomalies uniquement après réponse FIRMS, le vent/la pluie de l’heure sélectionnée, la fraîcheur et l’action de chargement. Il indique aussi explicitement si la clé de serveur manque. Le briefing latéral montre la plus forte FRP parmi les observations reçues, ou un état vide explicite, puis les conditions Open-Meteo, l’heure de validité et l’état de la grille de vent. En bas, le graphique par date est construit depuis `acquiredAtUtc` des enregistrements réellement reçus; le graphique des 24 prochaines heures trace les vitesses `wind_speed_10m` du forecast. Le cartouche de couverture dit explicitement que FIRMS ne fournit pas ici une baseline saisonnière ni un pourcentage de couverture. Le layout carte/vent a été revu en Chrome à 1600×1000 et 390×844; il reste à compléter le Dashboard par des agrégats multi-capteurs et une archive historique réellement disponible, puis à ajuster le mobile au workflow Field Situation dédié.

**Avancement tranche D — calendrier récent raccordé aux observations :** la grille Month/Week affiche les dates UTC du mois sélectionné et permet de parcourir les mois; seules les dates dans la fenêtre FIRMS demandée peuvent afficher un nombre. Les états « nombre retourné (y compris 0) », « non interrogé », « fenêtre chargée », « en chargement » et « erreur » sont distincts. Le clic sur une date conserve la sélection dans l’URL, filtre les anomalies visibles sur la carte et synchronise le détail de la semaine, sa série journalière et la FRP maximale effectivement observée. Le panneau précise que le proxy ne fournit pas les agrégats de couverture ou une baseline d’activité. Le rendu a été inspecté à 1600×1000 et 390×844; les limites de source restent visibles quand la clé FIRMS manque.

**Avancement tranche E — comparaison MODIS / VIIRS :** deux produits indépendants peuvent être choisis et chargés sur le même périmètre et la même fenêtre UTC. Deux cartes MapLibre affichent chacune ses propres points FIRMS avec un rideau swipe manipulable, une disposition côte à côte et une caméra synchronisée; elles reprennent aussi le vent forecast et le relief actifs. Les comptes et mini-tendances proviennent des enregistrements réellement renvoyés, et les choix de produits sont conservés dans l’URL. L’écran a été inspecté à 1600×1000; la capture PNG a passé le contrôle CRC et le décodage pixel complet. Le nombre de jours où chaque source renvoie au moins un enregistrement est seulement une coïncidence de dates, pas un recouvrement d’observation. Accord, couverture, calibration et résolution spatiale restent non évalués. La clé FIRMS et un appel NASA réussi restent requis pour voir des observations.

**Avancement tranche F — Terrain, relief mesuré :** l’application lit les PNG Terrarium à z12, applique la formule RGB officielle pour décoder l’altitude, calcule la pente Horn 3×3 et l’aspect descendant sur le voisinage local, puis construit une coupe est–ouest de 80 km à partir de 25 échantillons du même DEM. La sélection d’un point sur la carte relance l’analyse; la coupe A—B est dessinée sur la carte et peut être masquée. L’aspect est volontairement marqué « quasi plat » sous 2° de pente. À Calgary, l’échantillon a renvoyé 1 048 m, 0,8° et un échantillon indépendant Open-Meteo de 1 051 m (écart de 3 m); la coupe 80 km varie de 973 à 1 325 m. L’écran et le chargement réel des tuiles ont été vérifiés à 1600×1000. La source est attribuée et ses limites sont visibles : ce n’est pas une couverture de sol, une classe de combustible ou une pente raster régionale. Restent occupation du sol, humidité/végétation, eau, profils configurables par deux points et manifeste de sources.

**Amélioration vent — vitesse visible sur la carte :** les 25 points horaires Open-Meteo alimentent maintenant un champ raster interpolé (composantes est/nord, échelle km/h) sous les particules; la palette progresse du turquoise au jaune, orange et magenta, avec bords adoucis pour éviter un masque rectangulaire abrupt sur le relief. Les particules sont des filets blancs orientés avec le flux, et une légende intégrée affiche les repères 0–200+ km/h et la vitesse moyenne du champ. Les valeurs restent un forecast météo horaire : couleur et animation visualisent la vitesse/direction interpolées, pas une mesure de vent au sol ni une simulation de propagation du feu.

**Avancement tranche — date FIRMS explicite :** le sélecteur global accepte une date de fin UTC, la conserve dans l’URL et passe à l’API le début calculé de la fenêtre; les cellules de calendrier hors requête déclenchent cette même requête et les jours futurs sont désactivés. Le proxy vérifie le format et la validité calendaire, refuse les fenêtres futures, ajoute la date au chemin NASA, isole la clé côté serveur et renvoie les bornes `queryStartDate`/`queryEndDate`; les courbes utilisent ces bornes plutôt que l’heure de récupération pour nommer les jours. Une date historique ne peut pas encore être considérée comme une série historique validée : la réponse dépend d’une MAP_KEY et d’un produit disponible, et le bulk des archives, le manifeste, QA et les agrégats multi-annuels restent à faire. Vérification actuelle : build de production réussi et audit statique strict du skill sans finding; aucun appel NASA autorisé n’a été exécuté.

**Avancement tranche — disponibilité des produits FIRMS :** le proxy ajoute `/api/firms/availability`, récupère et valide les dates `data_id/min_date/max_date` rapportées par NASA, ne retourne que les huit produits MODIS/VIIRS de l’application et met la réponse en cache une heure. La clé reste exclusivement dans l’environnement serveur; les erreurs, la clé manquante, la disponibilité inconnue et les réponses valides sont distinctes. Data & Sources affiche une plage par produit, un instant de récupération et un contrôle d’actualisation, avec la limite explicite que la disponibilité globale ne garantit ni passage satellite, ni couverture sans nuage, ni détection dans l’AOI. Les choix de produits incluent aussi VIIRS Suomi‑NPP pour consulter son historique, avec une couleur distincte sur la carte. Le service accepte NRT/standard selon ce que rapporte le point de disponibilité courant; aucune plage n’est codée en dur. En l’absence de `FIRMS_MAP_KEY`, la vue reste explicitement en état « clé non configurée » et aucune plage NASA n’est simulée. Vérification : build de production et audit statique strict réussis sans finding, `git diff --check` propre, réponse `503 firms_key_missing` vérifiée localement, et écran Data & Sources revu en capture Chrome 1600×913 avec clé absente; le navigateur de capture a été fermé ensuite. Aucun appel NASA ni aucune plage n’a été simulé.

**Avancement pipeline — import FIRMS hors ligne :** `scripts/ingest-firms-archive.mjs` accepte un CSV original et un produit explicitement choisi, calcule le SHA‑256, garde une copie brute ignorée par Git, produit du JSONL qui conserve les champs natifs et émet un manifeste et un rapport QA suivis par Git. Il contrôle le schéma, les dates/heures UTC, coordonnées, FRP, période facultative, doublons exacts et limite de lignes; les fichiers mal formés, hors plage, sans observation exploitable ou trop volumineux sont mis en quarantaine. La documentation donne la commande opératoire et marque les limites de couverture/no-fire. Vérification faite : syntaxe Node, aide CLI, build, `git diff --check` et audit strict. Aucun CSV NASA n’étant fourni, le pipeline n’a pas été exécuté sur un produit réel; le manifeste et la QA scientifiques restent à confirmer sur une archive pilote avant agrégation.

## Architecture de travail

```text
NASA FIRMS ──────────────── détections MODIS / VIIRS ─┐
Open-Meteo / CWFIS NRCan ─ météo / FWI ──────────────┤
DEM + land cover ───────── relief / combustible ─────┼─> adaptateurs typés
Périmètre incident ─────── frontière initiale ───────┘        ↓
                                              validation + manifeste
                                                       ↓
                                     stores partagés / agrégats versionnés
                                                       ↓
                         React app ─ carte / graphiques / scénario exploratoire
```

- Frontend : React + TypeScript + Vite, CSS variables sémantiques et composants partagés.
- Carte : MapLibre GL JS pour navigation, sources raster/vectorielles, couches heatmap et polygones. 3D activée uniquement si le terrain fourni le permet; 2D reste le mode de repli.
- Graphiques : Recharts avec le Chart Kit archivé dans le skill `frontui`, adapté par thème et branché uniquement à des données typées.
- Données : adaptateurs client pour endpoints publics sans clé; proxy serveur/worker pour FIRMS lorsqu’une MAP_KEY est nécessaire. Secrets jamais livrés dans Vite.
- Démo : snapshot versionné avec manifeste; l’app affiche sa date réelle et son statut hors ligne.
- État : sélection de l’AOI, période, plateformes, métrique et observation active partagés via un store simple; navigation URL conserve les filtres partageables.

## Contrats des données et fonctions

### Vent et météo

1. Résoudre le centroïde de l’AOI et requêter les variables horaires de vent à 10 m, rafales, pluie, température et humidité relative pour la zone et l’horizon disponibles.
2. Stocker séparément `valid_time`, heure d’exécution/modèle, unité, fournisseur, coordonnées de grille et heure de récupération.
3. Afficher vitesse/direction sur la carte avec flèches orientées vers la direction où le vent souffle; les API décrivent généralement la direction d’où il vient, donc convertir explicitement et tester les 8 directions cardinales.
4. Interpoler visuellement seulement entre des points d’une source griddée; garder la valeur brute à l’inspection. Les stations ponctuelles ne sont pas présentées comme un champ continu.
5. Montrer fraîcheur et incertitude; en panne, conserver les dernières données en cache avec badge « données anciennes » et bouton Réessayer.

### Sécheresse et combustibles

- Météo/pluie observée et prévue alimentent le contexte; elles ne suffisent pas seules à estimer l’humidité du combustible.
- Utiliser d’abord les indices officiels CFFDRS/Fire Weather Index ou CWFIS déjà produits, quand disponibles pour l’emprise; afficher FFMC, DMC, DC, ISI, BUI/FWI selon couverture.
- Pour une carte de sécheresse dérivée, spécifier source, algorithme, fenêtre temporelle, résolution, saisons et données manquantes. Les valeurs de végétation (NDVI/EVI), humidité de surface satellite et classes de couvert restent des indicateurs distincts; ne pas les appeler humidité du combustible sans modèle validé.
- Mapper l’occupation du sol vers un type de combustible FBP seulement si la source de combustible correspondante existe. Land-cover générique seul = proxy incertain, jamais classe FBP certaine.
- Légende catégorielle : faible/modérée/élevée/incertaine; seuils préenregistrés et montrés dans la fiche méthode.

### Progression potentielle

- Pour l’Alberta/Canada, étudier en priorité l’intégration du système canadien FWI/FBP de Ressources naturelles Canada, dont les entrées comprennent combustible FBP, météo/indices FWI, vent, pente/aspect, date et type/heure d’allumage.
- Entrée initiale : périmètre d’incendie daté d’une source d’agence ou géométrie fournie et confirmée. Un groupe de hotspots FIRMS n’est pas un front complet.
- Calcul côté serveur/worker, jamais dans le rendu carte. Versionner le moteur, entrées, unités, grille, pas de temps et statut de calibration.
- Fournir des sorties enveloppe/ensemble et intervalles d’incertitude uniquement si le moteur les retourne. Sinon afficher un scénario déterministe explicitement identifié comme tel.
- Le curseur 0/1/3/6 h anime les sorties calculées. Modifier vent/pluie relance le calcul après confirmation visuelle des hypothèses; pas de fausse propagation générée côté client.
- La « fenêtre de réponse » est un horizon de préparation dérivé du scénario, non un compte à rebours de sécurité. Elle porte la mention « à confirmer par le centre de commandement ».
- La vue ne proposera pas de points d’attaque, trajectoires d’équipes, choix tactiques, routes d’évacuation ou instruction automatique. Le besoin mobile est la situation vérifiable et les points d’information à confirmer auprès du commandement.

## Parcours et critères par écran

1. **Dashboard** — l’utilisateur comprend l’état et les sources en un coup d’œil; la carte reste principale; cliquer un pic ouvre la même sélection dans Calendrier.
2. **Carte** — plateformes distinctes, légendes, filtres de confiance natifs, heure UTC, sélection et source consultable; heatmap réglable.
3. **Calendrier** — jours/semaines liés à carte + détail, bandes historiques seulement avec échantillon valable; période sans données distinguée de zéro.
4. **Comparer** — mêmes AOI/périodes, facettes MODIS/VIIRS, grille commune et calibration explicitement non validée tant que le test réservé n’existe pas.
5. **Terrain** — DEM, pente/aspect, eau, végétation et combustible avec source, date, résolution et légende; ne pas inférer de causalité.
6. **Sources** — manifeste, sélection source, colonnes, exclusions, fraîcheur, licence et pipeline consultables.
7. **Scénario** — entrées/validité/assomptions à gauche, carte de progression au centre, incertitude/horizon à droite, scrubber inférieur; aucun faux chiffre.
8. **Mobile Situation** — carte simplifiée, alertes de fraîcheur/hors-ligne, conditions, incertitude et éléments « à vérifier avec le commandement »; cache paquet AOI; rapport terrain attribué et non vérifié avant validation.

## Ordre de réalisation

La séquence exécutable, écran par écran, est la table **Tranches de réalisation et publication (A–H)** plus haut dans ce document. Elle remplace l’ancien regroupement en six étapes afin de terminer et publier chaque vue visible séparément. L’ordre est A fondation → B carte/source → C Dashboard → D Calendar → E Compare → F Terrain/Sources → G Scenario → H Mobile et finition.

## Conditions d’intégration continue et Git

L’utilisateur a demandé qu’à chaque tranche terminée les changements soient commités, poussés et intégrés à `main`. Pour chaque tranche : synchroniser `main`, implémenter dans le dépôt, vérifier build et comportement demandé, commit, push `origin/main`, puis vérifier que `HEAD == origin/main`. Les changements sont publiés directement sur `main` conformément à cette demande; si GitHub impose une règle de protection qui interdit le push direct, créer une branche/PR et ne pas prétendre que la fusion est faite avant preuve du statut merged.

## Risques et réponse

| Risque | Réponse |
|---|---|
| La carte paraît précise mais l’entrée est approximative | Résolution/source/horodatage visibles; proxy qualifié; géométrie des données connue. |
| Direction du vent inversée | Normaliser convention « from » vers « to » dans un helper unique; test cardinal systématique. |
| Pluie/NDVI interprétés comme humidité de combustible | Présenter mesures distinctes; FWI/FBP officiel ou estimation nommée et validée. |
| Mauvais périmètre initial | Date et source exigées, validation utilisateur, import source d’agence préférée. |
| Modèle utilisé hors région/saison/fuel | Domaine de validation attaché au run; statut hors-domaine bloque la couche de progression. |
| Perte réseau en terrain | Cache read-only, date de fraîcheur persistante; aucun enqueue de décision opérationnelle.
| Les valeurs de la maquette sont confondues avec le réel | Fixtures supprimées du produit; état source « exemple » uniquement dans Storybook/doc.

## Sources techniques de référence

- [Ressources naturelles Canada — FBP System](https://natural-resources.canada.ca/forests-forestry/wildland-fires/canada-fire-behaviour-prediction-system)
- [Ressources naturelles Canada — fuel types](https://natural-resources.canada.ca/forests-forestry/wildland-fires/canada-fire-behaviour-prediction-system-fuel-types)
- [Ressources naturelles Canada — CFFDRS](https://natural-resources.canada.ca/forests-forestry/wildland-fires/canadian-forest-fire-danger-rating-system)
- [Ressources naturelles Canada — FWI](https://natural-resources.canada.ca/forests-forestry/wildland-fires/canada-fire-weather-index-system)
- [Open-Meteo — Forecast API](https://open-meteo.com/en/docs)
- [NASA FIRMS — données actives](https://firms.modaps.eosdis.nasa.gov/content/active_fire/)
- [NASA FIRMS — notes de détection](https://firms.modaps.eosdis.nasa.gov/alerts/notes.php)
