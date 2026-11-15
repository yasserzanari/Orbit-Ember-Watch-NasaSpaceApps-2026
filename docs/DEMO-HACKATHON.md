# Démo hackathon — Orbit Ember Watch

Le [brouillon de soumission et le pitch de 90 secondes](SUBMISSION-DRAFT.md) sont prêts à adapter au nom de l’équipe, au lien de démo et aux consignes de votre événement local.

## Préparer la démo

1. Lancer `npm run dev` et ouvrir l’application après le redémarrage du serveur.
2. Choisir **Edmonton, Alberta**, **5 UTC days** et **VIIRS · NOAA‑20 · near real-time**.
3. Charger les observations; les CSV publics NASA du Canada fonctionnent sans clé pour les sept derniers jours. Le nombre varie avec la date et les mises à jour de FIRMS.

Pour tester le service sans navigateur :

```sh
curl 'http://localhost:4174/api/firms?source=VIIRS_NOAA20_NRT&bbox=-115.5938,52.1461,-111.3938,54.9461&days=5'
```

## Déroulé de 90 secondes

1. **Situer le signal.** Sur Dashboard, charger les observations pour Edmonton; expliquer que chaque point est une anomalie thermique détectée par satellite, pas une confirmation d’incident.
2. **Comparer les instruments.** Ouvrir Compare sur la même zone et la même fenêtre, garder MODIS et VIIRS dans deux séries distinctes, puis montrer l’aperçu exploratoire sur mailles communes de 1 km et les attributs natifs/heures UTC. Présenter le chevauchement comme descriptif des détections retournées uniquement : il ne mesure ni la couverture ni l’accord entre capteurs.
3. **Relier au contexte.** Dans Live Map, activer les couches de vent et de relief; préciser que le vent vient d’Open‑Meteo et ne prédit pas la propagation du feu.
4. **Montrer la traçabilité.** Dans Data & Sources, distinguer les flux NRT de sept jours des archives historiques. Une disponibilité globale ne prouve pas la couverture d’un pixel.

### Si le flux en direct est pauvre

Ne pas attendre qu’un nombre de détections apparaisse et ne pas présenter un résultat vide comme une période calme. Passez au volet **Historical sample** de Calendar pour montrer le cas régional CWFIS du 4 au 20 mai 2023 et ses séries séparées par source/capteur. Ce flux composite donne un exemple visuel historique, mais n’est ni une archive FIRMS brute ni une validation de l’harmonisation. La comparaison live reste une vue des lignes retournées; si MODIS et VIIRS n’ont aucun jour de détection partagé, l’interface affiche « Agreement not evaluated ».

## Volet historique contextuel sans clé

Dans **Calendar**, ouvrir **Historical sample**, laisser la case de confirmation cochée après l’avoir lue, puis charger la fenêtre par défaut **Alberta west · May 4–20, 2023**. Le panneau permet aussi de choisir une fenêtre UTC de 1 à 31 jours dans cette même emprise; en cas de troncature à 20 000 lignes, raccourcir la période avant de lire les comptes. Les séries quotidiennes restent séparées par étiquette de capteur et de source, et le décompte des étiquettes est calculé sur les lignes retournées. La requête utilise l’API WFS officielle CWFIS `public:hotspots`; le flux Fire M3 réunit plusieurs fournisseurs et ses lignes conservent `source`, `sensor`, `satellite` et `agency`.

Présenter cette carte comme **contexte régional historique CWFIS** : son emprise contient des détections de la région et ne relie pas chaque détection à EWF031/Pembina. Elle n’est ni une archive NASA FIRMS brute ni une vérité terrain de périmètre. Les jours sans ligne ont une couverture inconnue. Les métadonnées CWFIS décrivent un produit hotspot composite comportant des sources NASA, USFS et plusieurs instruments; la provenance de chaque ligne reste affichée dans le panneau. [CWFIS Fire M3 — métadonnées](https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/archive/fireM3_hotspots_metadata_NAP_ISO_19115_2003.pdf), [attributs du jeu de données](https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/fireM3_hotspots_metadata_attributes_EN_FR.pdf).

Les métadonnées indiquent aussi qu’un **End-User Agreement est requis** et imposent une attribution CWFIS. L’équipe a confirmé avoir accepté l’accord pour ce projet; `CWFIS_EULA_CONFIRMED=true` est configuré localement et l’API a été redémarrée. Le panneau et le serveur appliquent tous deux ce contrôle; `.env.example` reste désactivé par défaut. Pour un autre environnement, n’activer le flag qu’après examen et acceptation de l’accord applicable par l’équipe. L’attribution complète est affichée sous les séries. Pour montrer une date inconnue dans Calendar, garder **5 UTC days** et régler la fin de fenêtre à **4 jours UTC avant aujourd’hui**; la première date demandée se trouve alors hors de la fenêtre publique de 7 jours.

L’endpoint de ce panneau est distinct de `/api/firms` :

```sh
curl 'http://localhost:4174/api/cwfis/hotspots?bbox=-116.2,52.9,-115.1,53.5&start=2023-05-04&end=2023-05-20'
```

Il limite une requête à 31 jours et 20 degrés carrés, retourne jusqu’à 20 000 lignes et annonce la troncature lorsque le serveur amont en retourne davantage. Pour produire des comparaisons ou des tendances de saison validées, il faut encore importer les CSV standard FIRMS correspondants et une référence de périmètre indépendante.

## Message scientifique

Orbit Ember Watch aide à explorer et comparer des détections MODIS et VIIRS sans confondre leurs résolutions, leurs confidences natives ou leurs limites d’observation. La vue NRT prouve le parcours cartographique et la comparaison récente. Une calibration historique, une référence saisonnière et une mesure de couverture restent à valider avant d’afficher une série harmonisée ou un score d’accord.

## Conditions et limites

- Les CSV publics utilisés sans clé couvrent seulement les sept derniers jours au Canada. Une fenêtre historique ne fonctionne sans clé que si une archive locale correspondante a été importée et acceptée; sinon elle requiert `FIRMS_MAP_KEY` côté serveur. Une archive peut être partielle : couverture inconnue.
- Une requête qui chevauche le début de la fenêtre publique retourne les lignes NRT disponibles dans la partie récente; les dates antérieures sont marquées comme hors fenêtre et restent inconnues.
- Aucune ligne retournée ne signifie pas absence de feu. Le flux FIRMS n’est pas un dénominateur de couverture.
- Les résultats sont des détections NRT; ils ne remplacent pas un historique standard science-quality.
- Le scénario ne produit pas de prévision opérationnelle de propagation.

## Préparer un historique sans MAP_KEY

Pour alimenter la vue historique, demander un export CSV depuis le [portail NASA FIRMS Archive Download](https://firms.modaps.eosdis.nasa.gov/download/). NASA prend en charge une authentification Earthdata ou par code envoyé par courriel; le lien de téléchargement est fourni une fois la demande traitée. Importer ensuite le CSV original non compressé avec `npm run data:firms:ingest -- --file <CSV> --product <PRODUIT>`, puis générer les séries avec `npm run data:firms:aggregate`. Les données et agrégats restent sous `data/private/firms/`, ignoré par Git; ne publier que les sorties autorisées par la citation et la licence du produit.
