# Fiche FIRMS VIIRS

## Produits candidats

Détections VIIRS 375 m sur S-NPP, NOAA-20 et NOAA-21. Les sources API distinguent plateformes et statuts de traitement. Confirmer la collection et son schéma dans le guide du produit. [API FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/)

FIRMS annonce l’arrêt de livraison des données S-NPP au 2 novembre 2026 et recommande NOAA-20/21 pour la transition. [Avis FIRMS](https://firms2.modaps.eosdis.nasa.gov/content/notifications/firms2/news.html) Les dates de disponibilité de NOAA-21 diffèrent entre pages de catalogue ; voir S10/S11 dans le [registre](../sources/registre.md) et vérifier le flux choisi.

## Contrôles scientifiques

La résolution nominale plus fine de VIIRS accroît la détection des petits feux par rapport à MODIS. Garder les détections propres à VIIRS ; ne pas les supprimer en appariant simplement les coordonnées. [Notes NASA](https://firms.modaps.eosdis.nasa.gov/alerts/notes.php)

Vérifier les classes de confiance, unités FRP et températures, valeurs invalides et attributs propres à la collection. Ne pas faire correspondre directement les classes catégorielles VIIRS à la confiance numérique MODIS. Les colonnes du tutoriel NASA servent de point de départ, pas de validation du schéma de chaque fichier.

## Accès et statut

Archives et API décrites dans le [catalogue](../02-catalogue-donnees.md). Le dépôt fournit maintenant un [importateur CSV hors ligne](../../scripts/README.md) qui conserve la plateforme, les champs natifs, le hash et les exclusions dans un manifeste/rapport QA. Aucun fichier VIIRS n’a été acquis ou traité : le schéma, la version et les règles doivent être confirmés sur un CSV du produit réellement retenu. Vérifier les droits et l’attribution avant de publier l’archive.
