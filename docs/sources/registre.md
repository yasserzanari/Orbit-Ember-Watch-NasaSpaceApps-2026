# Registre des sources

Consultations recensées au **11 novembre 2026, heure de Toronto**. Une source repérée n’est pas forcément intégralement accessible. Aucune donnée satellite n’a été téléchargée dans ce travail.

## Défi et règles

| ID | Source | Appui et statut |
|---|---|---|
| S00 | [Défi officiel](https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/) | Référence à relire ; page détaillée en erreur 502 lors de la consultation |
| S01 | [Résumé organisateur UAE](https://nasaspaceapps.ae/challenges) | Consulté : application, calendrier, zone et utilisateurs ; résumé secondaire |
| S02 | [GO Team, discussion 1849](https://github.com/nasa/spaceapps/discussions/1849) | Réponse du 6 novembre : ressources annoncées le 12, source NASA exigée pour prix mondiaux, déclaration de l’usage de l’IA. Question d’origine sur un autre défi ; recouper avec règlement final |
| S03 | [GO Team, discussion 1813](https://github.com/nasa/spaceapps/discussions/1813) | Réponse du 5 novembre : recherche préparatoire permise, développement à partir du lancement ; vérifier modalités locales |

## Données et accès FIRMS

| ID | Source | Appui et statut |
|---|---|---|
| S10 | [FIRMS Active Fire Data](https://firms.modaps.eosdis.nasa.gov/content/active_fire/) | Consultée : produits, archives et conseil d’utiliser SP pour analyse ; dates de Terra/Aqua/NOAA-20 ; NOAA-21 annoncée dès janvier 2024 |
| S11 | [FIRMS Archive Download](https://firms2.modaps.eosdis.nasa.gov/download/) | Consultée : formats et authentification ; S-NPP annoncé jusqu’au 2 novembre 2026 ; NOAA-21 dès mars 2023. Divergence à vérifier par produit |
| S12 | [FIRMS API Area](https://firms.modaps.eosdis.nasa.gov/api/area/) | Consultée : source, boîte, date, fenêtres de 1–5 jours, MAP_KEY. Aucun appel authentifié |
| S13 | [FIRMS Data Availability](https://firms.modaps.eosdis.nasa.gov/api/data_availability/) | Consultée : disponibilité par source ; pas d’exposition par cellule |
| S14 | [Tutoriel NASA API](https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html) | Piste consultée ; exemple et colonnes non exécutés |
| S15 | [Avis de transition FIRMS](https://firms2.modaps.eosdis.nasa.gov/content/notifications/firms2/news.html) | Consulté : fin de livraison S-NPP annoncée au 2 novembre 2026 ; transition vers NOAA-20/21 |

## Définitions scientifiques

| ID | Source | Appui et statut |
|---|---|---|
| S20 | [Notes FIRMS](https://firms.modaps.eosdis.nasa.gov/alerts/notes.php) | Consultées : UTC, résolution nominale, confiance MODIS, meilleure sensibilité VIIRS et limites de détection |
| S21 | [Table MODIS via NASA](https://go.nasa.gov/3JSgbdb) | Lien officiel fourni par l’API ; récupération 403 ; définitions et unités à confirmer |
| S22 | [Table VIIRS NOAA-20](https://www.earthdata.nasa.gov/learn/find-data/near-real-time/firms/vj114imgtdlnrt) | Lien de l’API ; récupération 403 ; vérifier la correspondance de collection |
| S23 | [FAQ FIRMS](https://www.earthdata.nasa.gov/data/tools/firms/faq) | Page officielle en erreur 403 ; sens des champs à vérifier |
| S24 | [Guide MODIS C6/C6.1](https://www.earthdata.nasa.gov/s3fs-public/2023-09/MODIS_C6_C6.1_Fire_User_Guide_1.0.pdf) | Source de référence à lire pour le produit retenu |
| S25 | [Algorithme VIIRS 375 m](https://viirsland.gsfc.nasa.gov/PDF/VIIRS_activefire_375m_ATBD.pdf) | Source de référence à lire pour le produit retenu |

## Données complémentaires à choisir

| ID | Source | Travail restant |
|---|---|---|
| S30 | [NASA Earthdata Search](https://search.earthdata.nasa.gov/) | Sélectionner produit avec masque permettant de caractériser la couverture |
| S31 | [NASA GIBS](https://www.earthdata.nasa.gov/data/tools/gibs) | Vérifier les couches et leur usage visuel |
| S32 | [NASA EONET](https://eonet.gsfc.nasa.gov/) | Vérifier la couverture de l’événement retenu |
| S33 | Agence régionale | Choisir après fixation de la zone |

Pour chaque nouvelle source, noter le passage qui soutient l’affirmation, sa date de consultation, le produit et ses limites. Pour un fichier, consigner requête sans secret, date, empreinte et droits.
