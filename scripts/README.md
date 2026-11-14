# Pipeline de données

## Import d’une archive FIRMS

Après téléchargement manuel d’un CSV original décompressé depuis [NASA FIRMS Archive Download](https://firms.modaps.eosdis.nasa.gov/download/), lancer :

```sh
npm run data:firms:ingest -- \
  --file /chemin/vers/fichier-firms.csv \
  --product VIIRS_NOAA21_SP \
  --retrieved-at 2026-11-14T12:00:00Z \
  --expected-start 2026-11-01 \
  --expected-end 2026-11-07
```

`--product` doit identifier le produit FIRMS choisi parmi `MODIS_NRT`, `MODIS_SP`, les variantes `VIIRS_NOAA20_*`, `VIIRS_NOAA21_*` ou `VIIRS_SNPP_*`. La période attendue est facultative, mais si elle est fournie, les deux bornes sont obligatoires et toute ligne hors période met le fichier en quarantaine.

Le pipeline lit le CSV en flux, impose un plafond par défaut d’un million de lignes et conserve les colonnes NASA originales sur chaque enregistrement normalisé. Les coordonnées, la date/heure UTC et le FRP sont validés; les lignes invalides, doublons exacts et exemples de rejet sont comptés. Le schéma absent, un CSV mal formé, un dépassement de limite, une période incohérente ou zéro observation exploitable bloquent l’admission.

- Les CSV originaux et sorties JSONL vont sous `data/private/firms/`, ignoré par Git.
- Les preuves d’import et les rapports QA vont sous `data/manifests/firms/`, destinés à la revue et au versionnement.
- L’identifiant d’import contient le produit et le SHA-256 du fichier source; une copie identique ne crée pas un nouvel identifiant.
- `sourceRetrievedAtUtc` est renseigné uniquement avec `--retrieved-at`. La date de modification locale du fichier n’est jamais présentée comme date de téléchargement.
- L’import documente explicitement qu’un CSV de hotspots ne fournit pas de dénominateur de couverture et que l’absence de ligne n’est pas une observation valide sans feu.

Les lignes de confiance restent dans leur champ natif, sans équivalence MODIS/VIIRS. Le pipeline n’harmonise pas les capteurs et ne crée aucun zéro journalier. Vérifier la collection, la citation et les droits de redistribution du produit exact avant toute publication. Ne jamais commiter MAP_KEY, token ou données dont la redistribution n’est pas autorisée.
