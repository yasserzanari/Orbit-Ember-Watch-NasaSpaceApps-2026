# 01 Stratégie de recherche

## Objectif

Choisir un cas régional pour lequel une comparaison des capteurs est utile et vérifiable. Prioriser les incertitudes qui peuvent invalider le calendrier : couverture réelle, produits, définition des indicateurs et validation indépendante.

## Ordre recommandé

1. Relire le brief complet et mettre à jour la [synthèse](00-synthese-defi.md).
2. Écrire le cas d’usage : « Pour [utilisateur] dans [zone], examiner [période] afin de préparer [décision]. »
3. Vérifier les produits exacts, leurs dates disponibles, les accès et l’attribution.
4. Comparer séparément MODIS et VIIRS durant leurs périodes de recouvrement.
5. Fixer l’indicateur, le protocole d’évaluation et les critères avant d’ajuster une correction.
6. Consigner les résultats et décisions dans le [journal](08-journal-decisions.md).

## Sélection d’une région

Évaluer chaque candidate selon la disponibilité des deux capteurs, le nombre d’années complètes, l’existence d’une référence locale indépendante et le volume compatible avec le temps du hackathon. Le Québec en 2023 est une piste, pas encore un cas choisi. Une région de brûlage agricole est aussi possible, avec une interprétation spécifique.

## Questions à résoudre

- Les données standard et quasi temps réel se recouvrent-elles ? Comment tracer leur remplacement ?
- Les dates annoncées correspondent-elles bien au produit et service sélectionnés ?
- Quel produit permet de distinguer observation exploitable sans feu et absence de couverture ?
- Quelle tolérance temporelle permet de comparer des passages ?
- Quels changements de collection ou de satellites créent une rupture de série ?
- La référence locale décrit-elle un événement daté, un périmètre final ou la progression du feu ?

L’[API de disponibilité FIRMS](https://firms.modaps.eosdis.nasa.gov/api/data_availability/) permet de vérifier les périodes annoncées par produit. Elle ne mesure pas à elle seule les observations exploitables de chaque cellule au sol.

## Niveaux de preuve

| Niveau | Exemple | Usage |
|---|---|---|
| Documentation | Définition d’un champ et d’une unité | Définir le traitement |
| Observation | Détection retenue après contrôle qualité | Décrire une détection |
| Indicateur dérivé | Cellules détectées par semaine | Décrire l’activité observée |
| Hypothèse | Calibration locale candidate | Définir une expérience |
| Évaluation indépendante | Résultat sur des années réservées | Évaluer le transfert temporel |
| Référence externe | Rapport local daté | Contextualiser, sans valider chaque pixel |

Utiliser le [modèle de compte rendu](templates/compte-rendu-recherche.md). Un résumé secondaire aide à comprendre le sujet, mais le brief officiel demeure la référence des exigences.
