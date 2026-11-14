# Orbit Ember Watch — plan concret d’implémentation

## Résultat visé

Construire l’application cartographique montrée dans les huit maquettes de `docs/ui/` : dashboard, carte, calendrier, comparaison, terrain, sources, scénarios et vue mobile. L’interface doit garder la zone, la période et les capteurs synchronisés entre les vues, utiliser la hauteur disponible sur desktop, et rester lisible sur téléphone.

L’application est un outil de situation et d’analyse. Tant qu’un flux n’a pas été branché et contrôlé, la vue doit annoncer clairement son état au lieu d’afficher les valeurs fictives des maquettes comme si elles étaient réelles.

## État de réalisation

**Tranches cartographiques implémentées :** shell sombre à navigation persistante, carte MapLibre interactive avec sélection d’un point, choix de quatre secteurs de l’Alberta, terrain 3D et hillshade depuis le DEM AWS Terrarium, ainsi qu’une altitude ponctuelle Open-Meteo. Une requête météo groupée construit une grille 5×5 de 25 points; l’interpolation vectorielle horaire alimente des flèches de direction/vitesse et des particules animées. La timeline synchronise le vent, la pluie, la température, l’humidité, les flèches et le flux; le relief et le vent ont chacun un contrôle d’affichage. L’animation exprime un flux relatif et ne représente ni le temps réel de déplacement d’une masse d’air, ni la propagation d’un incendie. La sensibilité au vent permet d’éditer une hypothèse, mais ne calcule pas de propagation.

**Intégration FIRMS implémentée :** le serveur Node fournit un proxy à clé privée, une allowlist des produits MODIS/VIIRS NASA, la validation stricte des boîtes géographiques et fenêtres de 1–5 jours, une mise en cache de deux minutes et une normalisation de CSV en observations typées. La carte permet de choisir un produit, demander la dernière journée, voir les points et inspecter leurs attributs. L’API exige une MAP_KEY NASA; sans elle, la réponse est explicitement indisponible. La configuration sans clé a été vérifiée de bout en bout; la vérification d’un appel autorisé et d’un échantillon NASA réel attend une clé présente dans `.env`.

**Toujours à réaliser :** import/manifeste et agrégats reproductibles, calendriers réels de détections, comparaison instrument par instrument, couverture du sol et classes de combustibles, analyse raster de pente/aspect, calcul FWI/FBP validé, cache terrain hors ligne et vérification détaillée de toutes les maquettes sur plusieurs appareils. Le relief 3D sert à lire la forme du terrain; il ne remplace pas ces couches dérivées. Les états manquants restent visibles dans l’application. Un build de production valide le frontend; il ne prouve pas que les sources FIRMS, les modèles feu ou les vues de données dérivées fonctionnent.

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

### Étape 1 — fondation et rendu fidèle

- Mettre en place application Vite, shell plein écran, même sidebar, topbar et tokens de DESIGN.md.
- Construire le Dashboard en référence à sa maquette, états vides réalistes et données locales clairement marquées.
- Ajouter navigation accessible et état global d’AOI/période/capteurs.
- Critère : toutes les maquettes sont représentées comme routes fonctionnelles, aucune page ne déborde verticalement sur desktop de référence.

### Étape 2 — carte et sources NASA

- Intégrer MapLibre, couches par plateforme, sélection/inspection et FIRMS archive/snapshot.
- Construire registre source/manifeste et normalisation produit par produit.
- Critère : une détection réelle peut être retrouvée depuis la carte jusqu’au fichier, et erreur/absence/inconnu restent distincts.

### Étape 3 — météo et vent observables

- Ajouter adaptateur météo horaire, contrôles AOI/période, flèches vectorielles, animation temporelle et états de cache/fraîcheur.
- Ajouter précipitation, température, humidité relative comme variables source, pas comme sécheresse calculée.
- Critère : valeurs/horodatages/unités de l’interface correspondent exactement à la réponse source et aux conversions affichées.

### Étape 4 — calendrier, comparaison et terrain

- Produire agrégats reproductibles par plateforme, calendriers, comparaison et profils topographiques.
- Brancher sources auxiliaires au catalogue et afficher provenance/résolution.
- Critère : même sélection alimente map/chart/calendar et export; aucun taux « corrigé » sans test.

### Étape 5 — sécheresse et modèle de propagation

- Choisir jeu de combustible et service officiel FWI/FBP approprié à la zone, documenter droit d’usage/API, puis implémenter un worker côté serveur.
- Valider le moteur sur cas historiques avec périmètres/observations distincts de ceux utilisés pour calibrer.
- Comparer sorties aux observations d’agence et publier biais/incertitude/domaine; garder modèle verrouillé tant que validation non suffisante.
- Critère : édition des hypothèses produit une simulation reproductible; les contours et horizon sont marqués comme potentiel et datés.

### Étape 6 — mobile et durcissement

- Construire layout adapté aux gants, lumière et réseau discontinu; offline read-only pour snapshot et cache d’AOI; rapport terrain avec provenance.
- Contrôles d’accessibilité, performance, visual review à petite et grande largeur et déploiement preview.
- Critère : pertes réseau/données anciennes sont explicites, contenu opérationnel jamais inventé, desktop/mobile restent utilisables.

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
