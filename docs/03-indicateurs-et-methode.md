# 03 Indicateurs et méthode d’harmonisation

## But et portée

Construire un calendrier régional d’activité observée et mesurer si les séries MODIS et VIIRS deviennent comparables. C’est un protocole candidat ; aucun coefficient ni résultat n’a été calculé.

Les notes FIRMS décrivent l’écart de résolution, la sensibilité accrue de VIIRS et les limites d’observation. [Documentation NASA](https://firms.modaps.eosdis.nasa.gov/alerts/notes.php)

Il faut distinguer les formats communs, l’agrégation sur un support commun et la comparabilité statistique. Les deux premiers ne garantissent pas le troisième. Le rapport des surfaces nominales de pixels ne convertit pas les nombres de détections.

## 1. Schéma analytique et provenance

Garder les lignes sources intactes et ajouter des champs normalisés : identité de l’enregistrement et du fichier, instrument, satellite, produit, collection, statut SP/NRT, date-heure UTC, coordonnées, confiance native, identifiant de règle qualité, FRP avec unité vérifiée, champs de passage selon le produit, cellule, période et version de méthode.

Avant import, vérifier chaque champ et unité dans le guide de la collection. Les tables d’attributs consultées n’étaient pas accessibles ; aucune valeur réelle n’a été contrôlée. Voir les fiches [MODIS](datasets/firms-modis.md) et [VIIRS](datasets/firms-viirs.md).

## 2. Qualité et doublons

1. Vérifier dates, coordonnées, types, champs requis et valeurs invalides selon le produit.
2. Enregistrer le nombre et la raison de chaque exclusion.
3. Retirer les copies exactes dues au recouvrement de lots, avec une clé documentée.
4. Préférer SP à NRT pour la même observation uniquement si l’appariement est fiable.
5. Conserver des analyses de sensibilité aux filtres qualité.

Un point VIIRS proche d’un point MODIS n’est pas un doublon établi. La proximité spatiale et temporelle est une association possible ; supprimer ces voisins risque d’effacer les petites détections propres à VIIRS.

La confiance native de MODIS est numérique, tandis que VIIRS a une échelle catégorielle. Ne pas les interpréter comme des probabilités comparables. Tester les seuils par capteur et documenter l’effet du filtre.

## 3. Support spatial et temporel

Tester des mailles de 1, 2 et 5 km dans une projection appropriée à surfaces égales. Ces tailles sont des paramètres candidats, pas des seuils recommandés par NASA. Une maille de 1 km ne reproduit pas l’empreinte réelle d’un pixel MODIS. Documenter projection, origine, taille et affectation.

Affecter d’abord le centre de chaque détection à une cellule. Cela simplifie le prototype, mais ignore l’empreinte du pixel. Tester les effets de bordure ; vérifier la définition des champs de dimensions de pixel avant de les utiliser. Une cellule avec une détection n’est pas une cellule entièrement brûlée.

Conserver les dates UTC et agréger par semaine à bornes fixes. Documenter les années ISO à 53 semaines et le 29 février. Examiner jour et nuit séparément avant tout regroupement.

## 4. Activité et exposition

Pour un satellite, une cellule et un jour, définir le nombre de détections, la présence active, et le nombre d’occasions d’observation exploitables, si cette exposition est disponible. Encoder la présence comme 1 avec détection, 0 si une observation valide sans détection est établie, et inconnue si couverture invalide ou absente.

Les CSV hotspots seuls ne permettent généralement pas de déduire une absence de feu ou une observation valide d’une ligne absente. Une réponse vide de l’API signifie qu’aucune détection n’a été renvoyée ; elle ne prouve pas l’absence de feu. Un échec réseau est encore un autre état.

| Indicateur | Définition | Limite |
|---|---|---|
| Détections retenues | Somme par plateforme et période | Dépend de la sensibilité et des passages |
| Cellules détectées | Cellules avec au moins une détection | N’est pas une surface brûlée |
| Cellules-jours actives | Somme des présences observées | Comparaison limitée par les lacunes |
| Taux par exposition | Détections par occasion valide, si le dénominateur existe | Numérateur et dénominateur doivent partager une unité |
| Pic saisonnier | Fenêtre où l’indicateur atteint le maximum | Sensible aux lacunes et aux ex æquo |

Ne pas sommer la FRP de passages éloignés comme puissance instantanée ou énergie régionale sans méthode physique adaptée.

## 5. Comparaison de référence

Choisir plateformes et années de recouvrement effectivement disponibles. Fixer collection, statut SP/NRT, filtres, zone, plages horaires et grille. Comparer les passages dans une tolérance temporelle définie à l’avance ; proximité horaire n’implique pas identité.

Tracer les séries par plateforme et par saison. Signaler chaque ajout ou retrait de satellite. Une série VIIRS à plusieurs plateformes ne se compare pas directement à une seule plateforme historique ; garder la composition explicite ou produire une analyse à plateforme fixe.

Réserver des années complètes avant de choisir coefficient ou seuil. Les années de test ne participent ni au réglage ni à la référence saisonnière qui sert à les évaluer.

## 6. Calibration candidate

Commencer sans correction. Si le volume et la couverture le permettent, tester une relation robuste entre agrégats VIIRS et MODIS sur support commun. Définir la cible, par exemple une activité équivalente à MODIS ; elle ne représente pas le nombre réel d’incendies.

Comparer le modèle à deux références : aucune correction et coefficient constant ajusté sur l’apprentissage. Si l’exposition est disponible, examiner une régression de comptages avec exposition. Sans ce dénominateur, la couverture limite les conclusions. Un ajustement saisonnier exige assez d’années dans chaque groupe.

Accepter la calibration seulement si elle améliore les métriques définies avant le test sur des périodes réservées, sans masquer la saisonnalité ni effacer l’information propre à VIIRS. Rééchantillonner des années ou blocs temporels plutôt que des lignes corrélées.

Si la correction ne se transfère pas, montrer les séries séparées et publier l’échec. Les années antérieures au recouvrement restent une branche MODIS distincte, sauf validation explicite d’une reconstruction.

## 7. Référence saisonnière et anomalies

Pour chaque fenêtre saisonnière, calculer médiane, quantiles et nombre d’années exploitables sur la référence comparable. Fixer les quantiles avant d’examiner l’année cible. Cinq années complètes est un minimum exploratoire proposé, pas une garantie de stabilité.

Traiter les petits effectifs et les distributions composées de zéros explicitement. Afficher « référence insuffisante » si l’effectif ou la comparabilité ne permettent pas l’interprétation. La standardisation par capteur situe une période dans sa propre distribution ; elle ne corrige pas les différences physiques entre capteurs.

Employer « activité observée inhabituelle » pour un dépassement descriptif. Une affirmation de significativité statistique demande un test adapté à la dépendance temporelle et aux comparaisons multiples. Ce calendrier n’est pas une prévision de nouveaux départs de feu.

Chaque export contient zone, dates, produits, satellites, filtres, statut SP/NRT, grille, couverture connue, référence, paramètres, métriques de test, empreintes des fichiers et version de méthode. N’inclure aucune clé API.
