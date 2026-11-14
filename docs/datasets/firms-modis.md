# Fiche FIRMS MODIS

## Produit candidat

Détections de feu actif et anomalies thermiques MODIS sur Terra et Aqua. FIRMS distingue produits standard (SP) et quasi temps réel (NRT). La page des données actives annonce MODIS C6.1 ; confirmer la collection réellement reçue. [FIRMS](https://firms.modaps.eosdis.nasa.gov/content/active_fire/)

## Caractéristiques et contrôles

- Résolution nominale d’environ 1 km ; une détection n’est pas la surface brûlée.
- Heure d’acquisition en UTC.
- Confiance MODIS numérique de 0 à 100 ; NASA la qualifie d’expérimentale et conseille la prudence.
- Vérifier les unités, champs, valeurs invalides et codes de satellite dans le guide de la collection exacte.

Source : [notes FIRMS](https://firms.modaps.eosdis.nasa.gov/alerts/notes.php). La table d’attributs liée par l’API n’a pas pu être consultée ; les unités n’ont pas été contrôlées sur un fichier.

## Utilisation proposée

Garder Terra, Aqua, jour/nuit et SP/NRT séparés jusqu’à l’analyse. Tester des filtres de confiance plutôt que d’imposer un seuil universel. Cible possible de calibration locale, explicitement définie comme activité équivalente à MODIS, sous réserve de la [validation](../06-validation-et-risques.md).

## Accès et statut

Archives ou API FIRMS, détails dans le [catalogue](../02-catalogue-donnees.md). Aucun fichier acquis. Collection, plage exacte, attribution et droits restent à confirmer.
