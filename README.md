# Orbit Ember Watch — NASA Space Apps 2026

Plateforme cartographique de veille et d’analyse des détections thermiques MODIS/VIIRS, avec calendrier d’activité, comparaison des capteurs, contexte terrain et scénarios exploratoires.

## Principes

- Les observations satellite restent séparées par capteur et plateforme jusqu’à validation d’une méthode de comparaison.
- Une détection thermique n’est pas une confirmation d’incendie; les hotspots ne décrivent pas directement la superficie brûlée.
- Une période sans détection ne signifie pas absence de feu si la couverture n’est pas connue.
- Les scénarios de propagation sont exploratoires, explicitent leurs hypothèses et ne fournissent pas de recommandations tactiques.
- Les données, versions, filtres et calculs doivent être traçables et reproductibles.

## Structure

- `src/` — application web (React + TypeScript + Vite prévu)
- `public/data/` — instantanés et agrégats publiables pour la démo
- `scripts/` — acquisition, validation et agrégation des données
- `docs/` — défi, méthode, plan produit et maquettes UI

## Documentation de départ

- [Solution technique complète](docs/09-solution-technique-complete.md)
- [Plan produit, parcours et onglets](docs/10-plan-produit-et-onglets-ui.md)
- [Maquettes UI](docs/ui/)
- [Catalogue des données](docs/02-catalogue-donnees.md)
- [Méthode d’harmonisation](docs/03-indicateurs-et-methode.md)

## État

Dépôt initial de préparation. Le frontend et le pipeline de données doivent encore être implémentés. Les chiffres des maquettes sont fictifs et ne sont pas des résultats d’analyse.
