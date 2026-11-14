# 00 Synthèse du défi

## Résultat attendu

Le défi demande une application web qui harmonise les observations MODIS et VIIRS pour produire un calendrier de l’activité des feux dans une zone choisie. Le résumé mentionne les tendances historiques, les conditions inhabituelles et les périodes critiques, au service des gestionnaires, des scientifiques et de la préparation à la réponse. Il couvre les feux de végétation et les brûlages agricoles détectables par satellite. [Résumé du défi](https://nasaspaceapps.ae/challenges)

## Problème utilisateur

Un gestionnaire veut savoir quand l’activité observée devient inhabituelle dans sa région. Or, les capteurs n’ont pas la même résolution ni la même capacité de détection. MODIS observe à environ 1 km ; VIIRS à 375 m et détecte davantage de petits foyers. Les passages, nuages, fumée et couvert végétal influencent aussi les observations. [Notes NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/alerts/notes.php)

Une courbe brute qui mélange les capteurs risque donc de faire apparaître un faux changement. La difficulté du défi est autant de rendre cette limite compréhensible que d’agréger les fichiers.

## Lecture des exigences

| Élément | Statut | Conséquence |
|---|---|---|
| Application web, calendrier, zone d’intérêt | Résumé publié | Parcours régional reproductible |
| Comparaison MODIS et VIIRS | Résumé publié | Analyse séparée avant toute fusion |
| Activité historique et période inhabituelle | Résumé publié | Référence saisonnière et couverture |
| Une région pilote, pas hebdomadaire | Proposition | Réduire le volume et le nombre de paramètres |
| Correction statistique locale | Hypothèse à tester | Validation temporelle avant usage |
| Produits obligatoires et formats de remise | À confirmer | Relire le brief complet et ses ressources |

## Périmètre proposé

Commencer par un gestionnaire forestier ou territorial et une seule région. Afficher les observations par plateforme, un calendrier agrégé et les étapes de traitement. Une série corrigée n’est affichée que si elle passe l’évaluation indépendante décrite dans la [méthode](03-indicateurs-et-methode.md).

La détection automatique de départ de feu, la prévision de propagation et la conversion de détections en hectares brûlés dépassent le périmètre initial et nécessitent d’autres données et validations.

## Réussite proposée

- Reproduire un indicateur à partir des fichiers et paramètres documentés.
- Montrer les écarts entre capteurs avant et après traitement.
- Évaluer sur des années exclues de l’ajustement.
- Signaler les changements de constellation et les lacunes d’observation.
- Permettre à l’utilisateur de comprendre ce que mesure le calendrier.

## Questions ouvertes

- Quelle région possède des données des deux capteurs et une référence locale datée ?
- Quels produits, années et fenêtres temporelles seront utilisés ?
- Peut-on obtenir un dénominateur d’observations exploitables, y compris sans feu ?
- La calibration améliore-t-elle la comparaison sur des années réservées ?
- Le brief complet prescrit-il une source ou un livrable supplémentaire ?
