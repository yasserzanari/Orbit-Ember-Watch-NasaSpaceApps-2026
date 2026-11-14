# 05 Produit et architecture proposée

## Proposition

FireDetection aide un gestionnaire à examiner l’activité régionale des feux, en montrant comment les observations MODIS et VIIRS soutiennent l’interprétation. Le premier parcours relie une question, un calendrier et les données sources.

## Périmètre fonctionnel

Sélection d’une zone et période, calendrier hebdomadaire, séries par satellite, comparaison des méthodes, inspection des observations et export documenté. Une série calibrée n’est affichée qu’avec son évaluation et son domaine de validité.

## Chaîne proposée

```text
Sources et métadonnées
    ↓ acquisition avec manifeste, fichiers bruts conservés
Normalisation et contrôle qualité par produit
    ↓ exclusions documentées
Agrégation spatiale et temporelle par plateforme
    ↓ couverture connue ou inconnue
Comparaison de référence et calibration candidate
    ↓ test sur périodes réservées
Calendrier, observations consultables et export reproductible
```

Les contrats applicatifs devraient séparer manifestes source, détections, couverture, agrégats, calibration et références saisonnières. Ne jamais calculer la couverture à partir du seul nombre de hotspots. Conserver les agrégats par plateforme.

## Prototype de week-end

Commencer par un traitement local et des exports statiques pour une zone. Garder toute clé API côté serveur si l’acquisition en direct est ajoutée. Prévoir un instantané daté pour la démonstration, avec sa provenance visible.

Une réponse vide, une erreur réseau et une couverture inconnue sont des états distincts. L’export reprend filtres, unités et version de méthode. Le premier parcours n’a pas besoin d’une IA ou d’une base distante.
