# 04 Cas d’étude

## Cas pilote proposé : Alberta, saison 2023

**Utilisateur visé :** analyste régional des feux ou chercheur qui doit examiner les périodes d’activité observée et les limites de comparaison entre capteurs. Ce pilote ne constitue pas un outil de décision tactique.

**Question :** comment les séries de détections MODIS Terra/Aqua et VIIRS S‑NPP se comportent-elles pendant la saison albertaine 2023, et qu’est-ce qui change lorsqu’on garde les produits et plateformes séparés ? La saison 2023 est un cas de forte activité documenté par l’Alberta et le gouvernement canadien; elle ne suffit pas à elle seule à définir une anomalie statistique.

**Ancrage événementiel à vérifier :** le jeu provincial *Historical wildfire data: 2006–2025* contient l’incident EWF031, Pembina Complex, avec point d’origine 53.145183° N, 115.686783° W, début déclaré le 4 mai 2023, cause « Lightning » et superficie finale 201 913 ha. Le point et la superficie finale ne sont ni un périmètre journalier ni la vérité terrain de chaque détection FIRMS. Confirmer dans le dictionnaire la référence temporelle avant toute conversion à UTC.

**Fenêtre et emprise :** retenir le feu après avoir vérifié son polygone dans les données CNFDB/CWFIS; demander une emprise issue de ce polygone et une marge documentée. Commencer par une fenêtre événementielle courte autour des dates de départ rapportées, puis utiliser la saison entière seulement pour le calendrier régional. Ne pas prendre la boîte autour d’Edmonton comme substitut au polygone du feu.

**Produits à acquérir :** MODIS C6.1 standard séparé par Terra/Aqua et VIIRS S‑NPP standard; examiner NOAA‑20 comme série supplémentaire si la fenêtre de recouvrement et les fichiers reçus sont conformes. Garder NOAA‑21 hors du pilote tant que la disponibilité du produit standard retenu n’est pas confirmée pour toute la période. L’archive FIRMS accepte une demande CSV par courriel; aucune `FIRMS_MAP_KEY` n’est requise pour cette voie, mais il faut encore obtenir et importer les fichiers.

**Référence indépendante :** confronter les dates et l’existence de l’incident aux points de feux fournis par les agences via le CNFDB, puis son périmètre final lorsqu’il existe. Cette référence contextualise l’incident; elle ne valide pas chaque point FIRMS ni les heures de détection. Le CNFDB indique que complétude et qualité varient selon les agences et les années.

**État du pilote :** le flux CWFIS Fire M3 fournit maintenant un échantillon historique régional reproductible pour l’interface. Lors d’une requête du 14 novembre 2026 (`bbox=-116.2,52.9,-115.1,53.5`, du 4 au 20 mai 2023), il a retourné **15 457 lignes**, sans troncature. Les étiquettes conservées distinguent notamment VIIRS-I / USFS / S-NPP (4 174 lignes), VIIRS-I / USFS / NOAA-20 (4 098), VIIRS-I / NASA2 / S-NPP (2 862), VIIRS-I / NASA3 / NOAA-20 (2 460), ainsi que MODIS Terra/Aqua avec les sources NASA et NASA_can (1 863 lignes au total).

Ce résultat prouve que le panneau peut charger et ventiler le contexte CWFIS par sensor, satellite et source. Il ne compte pas des feux : plusieurs étiquettes de fournisseurs peuvent représenter des observations qui se recouvrent, la couverture des jours sans ligne est inconnue et l’emprise n’est pas un polygone d’incident. Le champ de réponse `coverageState` reste `unknown`. Les fichiers FIRMS historiques standards ne sont toujours pas importés et le polygone du pilote n’est pas confirmé. Aucune calibration, anomalie saisonnière ni validation historique n’est revendiquée.

Sources : [données historiques de feux de l’Alberta](https://open.alberta.ca/dataset/a221e7a0-4f46-4be7-9c5a-e29de9a3447e/resource/80480824-0c50-456c-9723-f9d4fc136141/download/fp-historical-wildfire-data-2006-2025.csv), [dictionnaire provincial](https://open.alberta.ca/dataset/a221e7a0-4f46-4be7-9c5a-e29de9a3447e/resource/1b635b8b-a937-4be4-857e-8aeef77365d2/download/fp-historical-wildfire-data-dictionary-2006-2023.pdf), [historique des feux CWFIS/CNFDB](https://cwfis.cfs.nrcan.gc.ca/en/fire-history), [archive FIRMS](https://firms.modaps.eosdis.nasa.gov/download/), [couverture VIIRS FIRMS](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html).

## Scénarios de démonstration

| Scénario | Question | Conclusion possible |
|---|---|---|
| Saison habituelle | Quand l’activité observée se concentre-t-elle ? | Profil de la période de référence, avec effectifs |
| Saison atypique | Une période dépasse-t-elle la référence comparable ? | Écart descriptif à examiner |
| Changement de constellation | Un saut coïncide-t-il avec l’ajout d’un satellite ? | Le changement d’échantillonnage peut y contribuer |
| Semaine sans point | Était-elle observée ou la couverture est-elle inconnue ? | Réponse selon les données de couverture disponibles |
| Calibration non transférable | Le modèle tient-il sur les années réservées ? | Rejet ou restriction de son domaine |

Ce sont des expériences à mener ; aucun résultat n’est présumé.

## Fiche de cas

- Utilisateur, question et décision visée.
- Polygone, source de géométrie et projection.
- Produits, satellites, périodes et couverture réelle.
- Périodes d’apprentissage, de réglage et de test.
- Référence locale et portée de ce qu’elle confirme.
- Filtres, grille, indicateurs et hypothèses à vérifier.
- Résultat, limites et source permettant de reproduire le calcul.

## Démonstration

Présenter la question régionale, les séries brutes par plateforme, l’effet de l’agrégation puis l’évaluation de la calibration candidate. Inspecter une semaine et remonter aux détections source. Conclure par le domaine d’interprétation et les vérifications locales restantes.

Un incident documenté donne du contexte ; il ne valide pas chaque point ni le périmètre journalier. Mesurer la performance de détection exige aussi des cas sans feu et un protocole indépendant adapté.
