# 08 Journal des décisions

Consigner les choix qui changent les données ou l’interprétation. Entrées initiales : propositions documentaires au 11 novembre 2026, heure de Toronto.

| Sujet | Choix de préparation | Raison | À réviser si |
|---|---|---|---|
| Défi | Harmonization of MODIS and VIIRS Hot Spots | Correspond au dossier FireDetection | Le brief complet précise un autre périmètre |
| Structure | Reprendre les catégories documentaires FieldShift | Cohérence entre les dossiers du hackathon | Une dépendance nécessite d’autres documents |
| Région | Alberta 2023 est le pilote proposé; événement EWF031/Pembina Complex pour ancrage | Jeu provincial officiel de feux 2006–2025 et référence événementielle CNFDB; reste cohérent avec l’emprise Edmonton | Réviser si le polygone CNFDB manque, si les archives FIRMS standard ne couvrent pas la fenêtre ou si une autre région offre une meilleure référence vérifiable |
| Capteurs | Conserver l’identité des plateformes | Éviter de confondre constellation et activité | Une fusion est évaluée et traçable |
| Harmonisation | Distinguer formats, support et correction statistique | Agréger ne suffit pas à démontrer la comparabilité | Une méthode validée justifie une autre définition |
| Couverture | Laisser inconnue si non observée | CSV hotspots seul ne fournit pas le dénominateur | Un produit de couverture est effectivement utilisé |
| Historique/récent | Privilégier SP pour l’analyse rétrospective, versionner NRT | FIRMS recommande SP pour l’analyse scientifique | Disponibilité des produits impose un traitement explicite |
| S-NPP | Garder pour historique, vérifier NOAA-20/21 pour récent | Avis de transition FIRMS | Un avis ultérieur modifie la disponibilité |
| Calibration | Conditionner son usage à un test sur années réservées | Mesurer son transfert temporel | Critères fixés avant le test sont satisfaits |

## À décider avant les calculs

Zone et polygone, utilisateur, produits et versions, tailles et origine de grille, dates de comparaison, satellites, filtres, tolérance temporelle, données d’exposition, années réservées, gain minimal, référence locale et critère d’anomalie.

## Mise à jour du pilote — 14 novembre 2026

**Statut : proposé, pas encore validé par acquisition.** Le jeu provincial téléchargé en mémoire contient l’enregistrement 2023 `EWF031` / Pembina Complex : début indiqué le 4 mai, point d’origine à 53.145183° N, 115.686783° W, cause lightning et superficie finale publiée de 201 913 ha. La date/heure source n’est pas traitée comme UTC sans vérification du dictionnaire. Le périmètre CNFDB reste à retrouver et les CSV FIRMS SP MODIS/VIIRS à demander/importer. Le registre provincial décrit l’événement; ni sa superficie finale ni son point ne valident une détection individuelle.

Sources : [registre provincial](https://open.alberta.ca/dataset/a221e7a0-4f46-4be7-9c5a-e29de9a3447e/resource/80480824-0c50-456c-9723-f9d4fc136141/download/fp-historical-wildfire-data-2006-2025.csv), [dictionnaire provincial](https://open.alberta.ca/dataset/a221e7a0-4f46-4be7-9c5a-e29de9a3447e/resource/1b635b8b-a937-4be4-857e-8aeef77365d2/download/fp-historical-wildfire-data-dictionary-2006-2023.pdf), [CNFDB](https://cwfis.cfs.nrcan.gc.ca/en/fire-history).

## Modèle d’entrée

```text
Date et sujet :
Statut : proposé / expérience / confirmé par évaluation / rejeté
Décision et options :
Source ou résultat justificatif :
Paramètres et domaine de validité :
Conséquences et critère de révision :
Responsable :
```
