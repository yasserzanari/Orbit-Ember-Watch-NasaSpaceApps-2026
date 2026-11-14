# FireDetection — solution technique complète

> **But du document.** Transformer le défi « Harmonization of MODIS and VIIRS Hot Spots » en un plan de réalisation scientifique et technique, avec des règles explicites pour les situations difficiles. Ce document est une spécification de solution; il ne prétend pas que des données ont déjà été téléchargées, qu’une calibration a été validée ou qu’un feu donné est confirmé au sol.

## 1. Décision produit

Construire une application web qui répond à une question opérationnelle précise : **« Pour cette zone et cette période, quand l’activité thermique détectée par satellite est-elle inhabituelle par rapport à une référence comparable, et quelles observations appuient cette lecture ? »**

La première version est un outil de consultation et de préparation, pas un système d’alerte certifié. Elle expose les détections, les calendriers dérivés, les limites de couverture et les sources utilisées. Elle ne transforme pas automatiquement un hotspot en incendie confirmé, en superficie brûlée, en prévision de propagation ou en ordre d’intervention.

### Résultat démontrable

Un utilisateur choisit une zone et une période, voit une chronologie par satellite, sélectionne une semaine, inspecte les détections source, compare l’activité à une référence saisonnière et télécharge un rapport reproductible. Une anomalie reste qualifiée d’**activité observée inhabituelle** et indique les capteurs, la couverture et le nombre d’années qui fondent la comparaison.

## 2. Défis techniques et réponses

| Défi | Pourquoi cela casse une solution naïve | Réponse de conception |
|---|---|---|
| Résolutions et sensibilités différentes | VIIRS 375 m voit davantage de petits foyers que MODIS ~1 km; son volume plus élevé ne signifie pas automatiquement plus de feu. | Conserver une série par instrument et satellite. Comparer sur une grille commune seulement comme analyse dérivée. Ne fusionner que si l’évaluation temporelle l’autorise. |
| Constellation changeante | Le nombre de satellites et les périodes couvertes changent; une rupture peut être instrumentale. | Afficher la composition de constellation par intervalle. Fournir une vue « plateforme constante » et annoter les transitions. |
| NRT remplacé par standard | Les historiques NRT peuvent être remplacés après traitement scientifique. | Utiliser SP pour l’analyse rétrospective; archiver date d’accès, branche, version et empreinte. Traiter NRT comme un instantané révisable. |
| Absence de détection ambiguë | Un fichier vide n’établit ni absence de feu ni observation valide sans feu. | Modéliser séparément détection, couverture observée, absence confirmée et données inconnues. CSV hotspots seul ne fabrique aucun zéro. |
| Nuages, fumée, canopée, passage orbital | Un feu peut ne pas être observable ou survenir entre deux passages. | Ne pas présenter la série de détections comme inventaire exhaustif. Ajouter un indice de couverture uniquement lorsqu’un produit d’observation valide le permet. |
| Confiance incompatible | MODIS utilise une valeur numérique; VIIRS peut utiliser des classes L/N/H. Elles ne sont pas des probabilités comparables. | Garder la confiance native et des filtres distincts par source; réaliser une analyse de sensibilité, jamais une conversion implicite vers une probabilité commune. |
| Faux positifs et anomalies thermiques non-feu | Les hotspots peuvent inclure volcans, sources statiques, offshore, torchères ou autres anomalies selon produit. | Filtrer ou signaler le champ `type` avec règle documentée; conserver les lignes écartées dans l’audit. Les données NRT peuvent avoir des limites spécifiques. |
| Doublons multi-fichiers et multi-capteurs | Un recouvrement spatial/temps n’établit pas une détection du même feu; supprimer les voisins élimine de petits feux VIIRS. | Supprimer les copies exactes avec clé de provenance. Les associations inter-capteurs sont des liens probables affichés, jamais une déduplication destructive par défaut. |
| Grille et projection | Une grille géographique en degrés n’a pas une surface constante; une cellule détectée n’est pas entièrement brûlée. | Agréger en projection adaptée à la région/surface. Versionner CRS, origine et taille. Libeller le résultat « cellules avec détection », jamais km² brûlés. |
| Heures, dates et semaines | Les acquisitions sont UTC; conversion locale, minuit, année ISO et semaines 53 peuvent déplacer des points. | Stocker l’instant UTC. Garder l’agrégation scientifique en UTC avec bornes ISO documentées; afficher la zone horaire choisie séparément. Tester dates limites et années bissextiles. |
| Comparaison et validation | Une corrélation élevée peut simplement refléter une saisonnalité partagée; des lignes d’un même épisode ne sont pas indépendantes. | Séparer apprentissage/test par années ou blocs complets; préenregistrer la métrique principale et comparer au modèle sans correction. |
| Données de volume important | FIRMS global VIIRS peut produire des dizaines de milliers de lignes par jour. | Limiter l’acquisition à une zone et période; traiter en flux/colonnes typées; indexer ou agréger hors navigateur; ne livrer que les résultats utiles au client. |
| Accès API et secrets | FIRMS Area nécessite une MAP_KEY et a des limites de requête; une clé frontend serait publique. | Pour le week-end, privilégier des CSV statiques acquis à l’avance. En production, proxy backend, variable secrète, quotas, cache, délai d’expiration et erreurs explicites. |
| Résultat reproductible | Une carte seule ne dit pas quels paramètres ont produit l’indicateur. | Chaque export comprend paramètres, versions, filtres, zone, intervalle, fichiers et empreintes, couverture connue et définition des indicateurs. |

NASA rappelle que les données de feux actifs ont une précision limitée, qu’un hotspot peut provenir d’autres sources thermiques et que la taille du symbole correspond à une empreinte nominale, pas à toute une surface en feu. Les données doivent donc être utilisées comme preuve d’une anomalie thermique détectée par satellite, avec le contexte de résolution, géométrie de vue et confiance.

## 3. Sources et stratégie d’acquisition

### Choix de produit

1. **Historique scientifique :** FIRMS standard processing (SP) pour MODIS et VIIRS sur les années réellement disponibles.
2. **Activité récente :** NRT uniquement pour la démo « récent », avec date de téléchargement et avertissement de révision possible.
3. **Couverture/no-fire :** récupérer un produit de masque de feu/qualité d’observation adapté si l’on veut distinguer une observation valide sans détection d’une absence de couverture. Ne pas inférer cette information des CSV de hotspots.
4. **Contexte :** rapports d’agences locales, périmètres d’incendies, météo ou végétation peuvent contextualiser un cas, mais leur rôle et leur unité de temps doivent rester séparés. Une limite de feu finale ne valide pas la progression journalière des hotspots.

FIRMS propose des archives en CSV, JSON et Shapefile avec authentification. Son API Area accepte une source, une emprise et une plage de jours; une clé MAP_KEY est nécessaire. Les fichiers globaux VIIRS peuvent devenir volumineux. L’architecture du prototype ne doit pas dépendre d’un appel API le jour de la présentation.

### Acquisition sûre et traçable

- Choisir une seule zone pilote et une période pilote avant tout téléchargement massif.
- Relever la disponibilité par source/satellite et vérifier les transitions de collection et de constellation.
- Conserver le fichier brut immuable; ne jamais écraser un fichier après transformation.
- Enregistrer un manifeste JSON par fichier : URL sans secret, produit, collection/version, satellite, SP/NRT, dates attendues et observées, zone, horodatage UTC de collecte, taille, SHA-256, nombre de lignes, schéma observé et licence/attribution.
- Si les dates ou colonnes ne correspondent pas au manifeste, mettre le fichier en quarantaine et produire un diagnostic, plutôt que poursuivre silencieusement.
- Pour API Area, séparer erreur réseau, réponse non autorisée, réponse vide valide et réponse mal formée. Aucun jeton ou MAP_KEY ne passe au navigateur, au rapport ou aux logs.

Le premier importateur est disponible dans [`scripts/ingest-firms-archive.mjs`](../scripts/ingest-firms-archive.mjs). Il travaille hors ligne sur un CSV non compressé choisi par l’analyste; ne télécharge pas l’archive et ne réclame pas de secret. Il copie l’entrée brute sous `data/private/firms/`, écrit une normalisation JSONL avec colonnes natives, un manifeste et un rapport d’exclusions. Une période attendue facultative protège contre un bundle inattendu. La clé d’agrégation historique et le dénominateur de couverture restent hors de ce premier import; une absence de hotspot ne produit donc pas de zéro journalier.

## 4. Pipeline de données

```text
FIRMS SP/NRT et produits de couverture
        ↓ téléchargement délimité + manifeste + empreinte
Zone brute immuable (CSV/JSON d’origine)
        ↓ lecture typée + schéma propre au produit
Table normalisée avec champs natifs conservés
        ↓ règles qualité versionnées + journal des exclusions
Détections qualifiées par satellite
        ↓ projection + cellule + périodes + exposition si connue
Agrégats par satellite / cellule / jour / semaine
        ↓ référence saisonnière + comparaison et validation bloquée
API de lecture / fichiers analytiques statiques
        ↓ calendrier, carte, inspection et export
Interface FireDetection
```

### Schéma normalisé minimal

```text
detection_id                 identifiant stable calculé depuis fichier + ligne/clé source
source_file_sha256           origine exacte
product, collection, version branche de traitement
instrument                   MODIS | VIIRS
platform                     Terra | Aqua | S-NPP | NOAA-20 | NOAA-21
processing                   SP | NRT | RT | URT
acquired_at_utc              horodatage construit et contrôlé
latitude, longitude          coordonnées du pixel selon le produit
confidence_native            valeur/chaîne native, sans conversion abusive
frp_mw                       valeur et unité seulement si définies par le produit
type_native                  champ original et mapping documenté
daynight                     indicateur natif si fourni
scan, track, pixel_area      géométrie si fournie et interprétée selon le guide
quality_rule_version         version des filtres appliqués
grid_id, time_bin            dimensions analytiques dérivées
```

Ne pas imposer des colonnes VIIRS aux données MODIS si elles n’existent pas. Conserver les colonnes sources sous forme typée et un champ `native_attributes` pour le reste, avec un schéma produit précis.

### Contrôle qualité

- Vérifier types, dates UTC, latitude `[-90,90]`, longitude `[-180,180]`, coordonnées finies et unités documentées.
- Détecter lignes dupliquées par même identifiant source ou même hash+numéro de ligne. Ne pas dédupliquer sur la seule proximité géographique.
- Vérifier les types de détection selon collection et les anomalies documentées (par exemple versions touchées d’un champ `Type`).
- Générer une table d’audit : nombre importé, exclu par règle, retenu, inconnu, avec exemples inspectables.
- En cas de valeur manquante, garder `unknown`; ne pas la remplacer automatiquement par zéro.
- Conserver des analyses de sensibilité : tous les niveaux de confiance, puis filtre nominal/élevé selon les catégories propres à chaque capteur.

## 5. Définition des indicateurs

### Indicateurs présentés

Pour une zone, satellite `s`, cellule `g` et période `t` :

- `detections(s,g,t)`: nombre d’enregistrements retenus. C’est un compte de détections, pas un nombre de départs de feu ni un nombre de feux distincts.
- `active_cells(s,t)`: nombre de cellules avec au moins une détection. Ne pas convertir automatiquement en surface brûlée.
- `observed_active_cell_days(s,t)`: nombre de combinaisons cellule-jour pour lesquelles une présence détectée est établie. Le dénominateur d’observation reste séparé.
- `frp_distribution(s,t)`: distribution des valeurs FRP, non somme de passages présentée comme puissance régionale continue ou énergie totale.
- `coverage_status(s,g,t)`: `observed_with_detection`, `observed_without_detection`, `no_valid_observation` ou `unknown`, uniquement si la source de couverture soutient cette classification.
- `seasonal_rank(s,t)`: comparaison d’un indicateur avec sa propre référence saisonnière, accompagnée du nombre d’années et de l’état de validité.

### Anomalie saisonnière

1. Fixer l’indicateur, la zone, les filtres, les satellites et la fenêtre temporelle.
2. Calculer la référence sur des années comparables et expliciter les ruptures de constellation/produit.
3. Montrer médiane, intervalle quantile, effectif et trous de couverture; employer une référence par capteur tant que l’harmonisation n’est pas validée.
4. Marquer « référence insuffisante » si l’effectif préétabli n’est pas atteint ou si une rupture invalide la comparaison.
5. Dire « inhabituel dans les observations comparables » pour un dépassement descriptif. Réserver « significatif » à un test statistique adapté, défini avant l’analyse et tenant compte de dépendance temporelle et comparaisons multiples.

Une fenêtre d’au moins cinq années est un seuil exploratoire de projet, pas une garantie de stabilité. L’interface doit afficher ce statut au lieu de masquer l’incertitude.

## 6. Harmonisation : méthode graduée, pas de correction magique

### Niveau A — harmonisation des formats

Renommer unités et dates vers un schéma commun, en gardant la valeur native, le produit et le satellite. Cela permet de traiter ensemble les tables; cela ne les rend pas statistiquement équivalentes.

### Niveau B — support spatio-temporel commun

- Choisir un CRS adapté à la région; versionner taille et origine de grille.
- Tester des tailles candidates (par exemple 1, 2 et 5 km) et montrer la sensibilité du résultat.
- Affecter d’abord chaque centre de détection à une maille, en l’appelant clairement agrégation par centre. Si les géométries de pixels sont disponibles et nécessaires, faire une analyse d’empreinte distincte.
- Agréger à la journée UTC puis à la semaine ISO, sans mélanger jour/nuit avant d’avoir vérifié leurs profils.
- Produire les séries individuelles de Terra, Aqua, S-NPP, NOAA-20, NOAA-21, puis les variantes multi-plateformes explicitement étiquetées.

Une maille 1 km n’est pas une reproduction de l’empreinte MODIS; l’agrégation ne corrige pas la détectabilité. Ne pas créer d’appariement un-à-un à partir d’un tampon arbitraire.

### Niveau C — calibration statistique candidate

La calibration est facultative et doit pouvoir échouer. Sur une période de recouvrement qui possède une couverture exploitable :

1. Définir la cible comme **indice d’activité équivalent à la référence MODIS choisie**, pas « vrai nombre de feux ».
2. Garder des périodes de test (années ou saisons complètes) hors réglage. Les groupes d’un même épisode ne doivent pas être répartis aléatoirement entre train/test.
3. Comparer au moins : (a) VIIRS brut agrégé, (b) coefficient constant ajusté, (c) modèle robuste candidat. Utiliser le même support et la même couverture éligible.
4. Si des occasions d’observation valides sont connues, utiliser un modèle de comptage avec exposition appropriée; sans dénominateur, ne pas annoncer un taux d’activité corrigé pour l’exposition.
5. Évaluer MAE, biais, accord spatial (p. ex. Jaccard), déplacement du pic saisonnier et stabilité par satellite/année. Une corrélation seule n’est pas suffisante.
6. Rééchantillonner des blocs temporels ou des années, pas des points indépendants, pour encadrer l’incertitude.
7. Accepter la correction uniquement si elle bat le niveau non corrigé sur le test préspécifié, reste stable dans des analyses de sensibilité et ne supprime pas systématiquement les événements propres à VIIRS.
8. Sinon, afficher les séries séparées et inscrire le résultat « rejeté » ou « indéterminé ». Ne jamais interpoler une série VIIRS avant son lancement comme si elle était mesurée.

### Comparaison de passages

Une proximité temporelle entre Terra/Aqua et VIIRS aide à étudier les écarts, mais ne prouve pas que les points sont le même feu : les capteurs ont différentes empreintes, heures de passage, angles et seuils de détection. Présenter les correspondances spatiales comme associations, avec tolérance choisie, sans effacer les observations originales.

## 7. Architecture applicative

### Prototype de hackathon (recommandé)

- **Prétraitement local Python** : pandas/polars, GeoPandas/Shapely ou équivalent pour lecture, filtres et agrégats; scripts déterministes dans `scripts/`.
- **Données publiables statiques** : manifeste JSON, agrégats JSON/Parquet convertis en JSON compact, GeoJSON simplifié de la zone et échantillon de détections pour inspection.
- **Frontend React + TypeScript + Vite** : carte, calendrier, graphiques et panneau de preuve. Aucun traitement lourd dans le navigateur.
- **Pas de base distante obligatoire** : permet une démo fiable hors réseau et évite secrets et dépendances d’exploitation.
- **Acquisition répétable** : scripts facultatifs gardés hors parcours de démo; le site annonce l’horodatage de l’instantané.

### Évolution après le hackathon

```text
Scheduler/worker → stockage objet versionné → PostGIS/Parquet analytique
                 → API backend protégée → frontend
```

Le backend gère MAP_KEY côté serveur, quotas, cache, reprise et audit. Les données brutes restent dans le stockage objet; PostGIS sert aux requêtes spatiales; les agrégats analytiques peuvent être Parquet/DuckDB selon volume. Ne pas introduire cette architecture avant que le besoin multi-zones, actualisation fréquente ou collaboration le justifie.

### Contrats d’API internes

- `GET /api/catalog`: régions, sources, périodes, statut de disponibilité.
- `GET /api/calendar?areaId=&from=&to=&sensor=&metric=`: agrégats, référence, couverture et qualité.
- `GET /api/detections?areaId=&period=&platform=`: détails paginés filtrés.
- `GET /api/provenance/{analysisId}`: manifeste et méthode utilisée.

Le prototype statique peut fournir les mêmes contrats comme fichiers JSON locaux.

## 8. UX : rendre la preuve lisible

### Parcours principal

1. **Choisir la zone** — périmètre, source géométrique et période disponibles.
2. **Lire le calendrier** — lignes distinctes par plateforme; référence saisonnière; annotations de constellation, collection, lacunes connues et période atypique.
3. **Comprendre un pic** — sélection semaine → carte/compte de détections → filtres natifs → capteur et date UTC → source brute.
4. **Comparer** — activer vue normalisée/calibrée seulement si son test est valide; afficher sinon « calibration non validée ».
5. **Exporter** — fiche courte et CSV/JSON reproductibles avec données et limites.

### États obligatoires de l’interface

- chargement avec source et période;
- aucun résultat retourné;
- panne réseau/import;
- couverture inconnue;
- observation valide sans détection (seulement si preuve de couverture);
- période non disponible pour le capteur;
- référence saisonnière insuffisante;
- anomalie descriptive, avec définition visible;
- série harmonisée non validée ou domaine hors test.

Les points peuvent se regrouper visuellement à petite échelle, mais le cluster ne doit jamais être présenté comme un incident unique. Le panneau détail doit rappeler « anomalie thermique détectée », et afficher le capteur, le niveau de confiance natif, l’heure UTC et la FRP si disponible.

## 9. Tests, validation et critères de sortie

### Tests de données

- tests de schéma par produit/collection et échantillons de référence;
- tests dates frontières : changement de jour UTC, année ISO, semaine 53, 29 février;
- coordonnées et unités plausibles;
- déterminisme des agrégats : mêmes entrées + même version = mêmes sorties;
- conservation des comptes : bruts = retenus + exclus + lignes invalides;
- les lignes absentes ne deviennent jamais `observed_without_detection` sans couverture explicite;
- aucune déduplication d’un voisin MODIS/VIIRS sans règle prouvée.

### Tests scientifiques

- période de test gelée avant calibration;
- référence et cible définies sans fuite des années test;
- comparaison des variantes brutes/corrigées sur support et couverture communs;
- sensibilité à la taille de maille, aux filtres de confiance, au jour/nuit et à la constellation;
- test du cas d’échec : calibration moins performante → produit conserve les séries séparées;
- revue manuelle d’au moins un pic jusqu’aux lignes source.

### Tests UX/fiabilité

- démo fonctionne sans réseau à partir de l’instantané;
- sources, date de mise à jour et état NRT/SP toujours visibles;
- export réimportable et cohérent avec l’écran;
- carte et calendrier restent utilisables sur petit écran;
- les messages distinguent « détection », « événement confirmé » et « couverture ».

### Critères de sortie

Le MVP est présentable lorsque :

1. Une zone et un scénario reproductibles sont choisis.
2. Un manifeste complet existe pour tous les fichiers d’entrée.
3. Les agrégats sont reproductibles avec version de code/méthode.
4. Les séries par satellite et les changements de constellation sont visibles.
5. Aucune absence de détection n’est transformée en absence de feu sans preuve de couverture.
6. L’utilisateur inspecte une semaine et retrouve ses détections sources.
7. L’anomalie est décrite avec référence, effectif et incertitude.
8. La calibration est soit évaluée sur test indépendant, soit clairement désactivée.
9. L’export indique toutes les limites et citations nécessaires.
10. La démo tient hors ligne avec ses données d’exemple identifiées.

## 10. Plan d’exécution priorisé

### P0 — confirmer le cas et les données

- Lire le brief complet et ressources officielles; vérifier les sources requises par le challenge.
- Choisir l’utilisateur, la zone, la géométrie, la période et une référence indépendante possible.
- Acquérir un petit échantillon SP MODIS + VIIRS et contrôler les vrais schémas.
- Fixer l’instantané de démo et documenter le manifeste.

### P1 — produire une analyse correcte

- Écrire import typé, QA, journal d’exclusions et tests de dates/unités.
- Produire agrégats par satellite, calendrier saisonnier et statut de couverture.
- Vérifier une période de bout en bout jusqu’aux lignes sources.

### P2 — construire le parcours web

- Carte de zone, calendrier, profils par plateforme, détail d’une semaine et provenance.
- Ajouter états de couverture inconnue et référence insuffisante.
- Ajouter export de rapport et données.

### P3 — tester la valeur de l’harmonisation

- Réserver années complètes; comparer brut et correction candidate.
- Exécuter les analyses de sensibilité et publier le résultat même si la correction échoue.
- N’activer une couche calibrée qu’après réussite des critères.

### P4 — finition de présentation

- Démonstration de 3 à 5 minutes : question régionale → calendrier → semaine sélectionnée → source → limites → export.
- Inclure provenance et références NASA dans le dépôt et la soumission.
- Préparer une capture/vidéo et un mode dégradé hors ligne; éviter les dépendances live le jour du jury.

## 11. Cas de démonstration et narration

**Narration recommandée :** « Les satellites n’observent pas les mêmes feux de la même manière. Notre outil garde leur identité, compare les périodes où leurs mesures se recouvrent et signale ce que les données ne permettent pas de conclure. »

Choisir un épisode régional documenté, mais ne pas ajuster la méthode sur cet épisode puis le présenter comme validation. Montrer :

1. le profil habituel calculé sur des années de référence;
2. une période sélectionnée et ses observations MODIS/VIIRS séparées;
3. les différences avant/après agrégation commune;
4. l’état de couverture et les capteurs actifs;
5. le résultat du test de calibration (y compris rejet/indétermination);
6. la trace source et l’export.

## 12. Limites explicites

- Le calendrier décrit l’activité thermique **détectée**, non tous les feux existants.
- Les détections ne sont pas des polygones de feu ni une estimation directe de surface brûlée.
- Les CSV hotspots n’établissent pas l’absence de feu pour les périodes sans points.
- Une anomalie descriptive n’est ni une prévision ni un ordre d’intervention.
- MODIS comme référence n’est pas une vérité terrain indépendante.
- Un incident final ou un témoignage apporte du contexte, pas une vérité pixel/jour exhaustive.
- Toute correction peut échouer hors de la région, période, constellation et définition testées.

## 13. Références opérationnelles

- [Challenge NASA Space Apps — Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)
- [FIRMS Active Fire Data : produits, couverture, SP/NRT](https://firms.modaps.eosdis.nasa.gov/content/active_fire/)
- [FIRMS Archive Download](https://firms.modaps.eosdis.nasa.gov/download/)
- [FIRMS API Academy : disponibilité, champs, API Area et volumes](https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html)
- [FIRMS Fire Alert Notes : différences MODIS/VIIRS et causes de non-détection](https://firms.modaps.eosdis.nasa.gov/alerts/notes.php)
- [FIRMS page de carte : avertissements d’usage et portée du hotspot](https://firms.modaps.eosdis.nasa.gov/map/)
- [Guide NASA MODIS Collection 6/6.1](https://www.earthdata.nasa.gov/s3fs-public/2023-09/MODIS_C6_C6.1_Fire_User_Guide_1.0.pdf)
- [Guide NASA/USGS VIIRS Collection 2, 375 m](https://www.earthdata.nasa.gov/s3fs-public/2025-06/VIIRS_C2_AF-375m_User_Guide_1.2.pdf)

> Les pages FIRMS consultées affichent des périodes qui peuvent diverger selon l’archive, l’API, la collection et la date d’actualisation. Le pipeline doit interroger la disponibilité effective du produit choisi et inscrire cette réponse dans le manifeste; ne pas coder une date de fin supposée.
