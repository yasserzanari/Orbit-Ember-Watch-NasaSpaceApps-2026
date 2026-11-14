# 06 Validation et risques

## Risques scientifiques

| Risque | Effet | Contrôle |
|---|---|---|
| Addition de capteurs de sensibilités différentes | Hausse artificielle de la série | Séries séparées et comparaison sur support commun |
| Ajout ou retrait d’un satellite | Rupture instrumentale | Composition explicite, séries à plateforme fixe |
| CSV vide assimilé à absence de feu | Fausse accalmie | Séparer acquisition, détection et couverture |
| Cellule détectée assimilée à surface brûlée | Surface inventée | Distinguer feux actifs et produit de surface brûlée |
| Appariement spatial qui supprime VIIRS | Perte de petits foyers | Dédoublonner seulement les copies identifiées |
| Évaluation sur données ajustées | Gain surestimé | Réserver des années entières |
| Fusion SP/NRT ou de collections | Rupture non documentée | Manifeste et branches de traitement |
| FRP sommée entre passages | Puissance ou énergie trompeuse | Utiliser une méthode physique adaptée |
| Référence locale incomplète | Validation excessive | Limiter la conclusion à ce qu’elle établit |

## Protocole

Séparer apprentissage, réglage et test par années ou saisons complètes, sans répartir au hasard les détections d’un même épisode. Fixer avant le test l’indicateur principal, les filtres, le support et le gain minimal attendu.

Comparer sur les mêmes périodes : séries sans correction, coefficient constant et modèle candidat. Documenter les effectifs, exclusions et couverture. La corrélation seule est insuffisante ; une meilleure concordance avec MODIS ne prouve pas une meilleure détection réelle et peut effacer des foyers propres à VIIRS.

| Mesure | Usage | Limite |
|---|---|---|
| MAE | Erreur moyenne absolue sur périodes éligibles | Référence MODIS n’est pas vérité terrain |
| Biais moyen | Écart signé moyen | Les erreurs opposées peuvent s’annuler |
| Jaccard des cellules actives | Accord spatial sur périodes comparables | Dépend de grille et filtres |
| Écart du pic saisonnier | Distance entre fenêtres maximales | Ne mesure pas la qualité entière |
| Stabilité | Comparer résultats par année, saison et plateforme | Petits groupes peu concluants |

Tester plusieurs tailles de grille, filtres, tolérances de passage et références. Si le signe d’une anomalie change, exposer cette sensibilité. Estimer l’incertitude par années ou blocs temporels lorsque l’effectif le permet.

## Critères de sortie

- Reproduire un indicateur à partir des fichiers source et paramètres.
- Afficher unités, provenance, exclusions et période de référence.
- Consigner si la calibration est acceptée, rejetée ou indéterminée.
- Distinguer détection, activité observée et événement confirmé.

Le protocole est défini ; aucun résultat de validation n’est encore mesuré.
