# 02 Catalogue des données candidates

| Source | Rôle | Accès | Limite à vérifier |
|---|---|---|---|
| FIRMS MODIS Terra/Aqua | Historique des détections | CSV d’archives ou API MODIS_SP, MODIS_NRT | Séparer plateformes, collections et états |
| FIRMS VIIRS S-NPP/NOAA-20/NOAA-21 | Détections à résolution nominale plus fine | CSV ou sources API par satellite | Composition de la constellation variable |
| Granules science avec masque de classification | Nuages, observations valides et absence de feu | Collection à sélectionner dans Earthdata | Plus complexes que le CSV hotspots |
| NASA GIBS | Contexte visuel daté | Tuiles et couches à vérifier | Une image de carte n’est pas une série analytique |
| NASA EONET | Contexte d’événements documentés | API | Ni inventaire exhaustif ni vérité terrain systématique |
| Agence locale | Référence datée pour un cas régional | Rapport, incident ou géométrie | Un périmètre final n’est pas la progression journalière |
| Surface brûlée | Contrôle indépendant optionnel | Produit à choisir | Mesure distincte des feux actifs |

## Couverture et produit

FIRMS annonce MODIS Terra dès novembre 2000 et Aqua dès juillet 2002. L’archive S-NPP débute en janvier 2012 et NOAA-20 en avril 2018. Ces périodes sont indicatives ; confirmer le produit reçu. [Données actives](https://firms.modaps.eosdis.nasa.gov/content/active_fire/) · [Archives](https://firms2.modaps.eosdis.nasa.gov/download/)

Les pages FIRMS consultées divergent pour NOAA-21 : janvier 2024 sur la page des données actives, mars 2023 sur l’archive. Vérifier la disponibilité effective de la source retenue et consigner cette vérification.

Pour l’historique, privilégier les produits scientifiques standards (SP). Les produits récents NRT peuvent être remplacés par des données standard ultérieures ; conserver branche, date de téléchargement et manifeste pour tracer cette révision. NASA conseille les produits standards pour l’analyse scientifique. [Politique FIRMS](https://firms.modaps.eosdis.nasa.gov/content/active_fire/)

## Accès API

L’[API Area FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/) demande une clé MAP_KEY gratuite, un produit, une boîte ouest,sud,est,nord et une date. La documentation indique des requêtes de 1 à 5 jours. Vérifier les limites et la disponibilité avant acquisition.

~~~
https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{WEST,SOUTH,EAST,NORTH}/{DAY_RANGE}/{DATE}
~~~

Exemple de forme uniquement ; aucun appel n’a été exécuté. Pour un polygone, télécharger la boîte englobante puis filtrer la géométrie exacte. Scinder une zone traversant l’antiméridien. Ne pas exposer la clé dans le navigateur, le dépôt ou les journaux.

Les archives proposent CSV, JSON et Shapefile avec authentification par courriel. Vérifier séparément l’accès aux granules Earthdata.

## Provenance à conserver

Produit, collection, satellite, période réelle, zone, date de récupération, URL sans clé, format, empreinte SHA-256, règles qualité, statut SP/NRT et citation. Vérifier les droits et l’attribution sur le produit exact avant de partager les fichiers.

Voir le [registre](sources/registre.md), et les fiches [MODIS](datasets/firms-modis.md) et [VIIRS](datasets/firms-viirs.md).
