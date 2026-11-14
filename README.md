# Orbit Ember Watch — NASA Space Apps 2026

Plateforme cartographique de veille et d’analyse des détections thermiques MODIS/VIIRS, avec calendrier d’activité, comparaison des capteurs, contexte terrain et scénarios exploratoires.

## Principes

- Les observations satellite restent séparées par capteur et plateforme jusqu’à validation d’une méthode de comparaison.
- Une détection thermique n’est pas une confirmation d’incendie; les hotspots ne décrivent pas directement la superficie brûlée.
- Une période sans détection ne signifie pas absence de feu si la couverture n’est pas connue.
- Les scénarios de propagation sont exploratoires, explicitent leurs hypothèses et ne fournissent pas de recommandations tactiques.
- Les données, versions, filtres et calculs doivent être traçables et reproductibles.

## Démarrer l’application

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
npm run dev
```

Pour générer la version statique : `npm run build` (sortie dans `dist/`).

## Structure

- `src/` — application web React + TypeScript + Vite, carte MapLibre et adaptateurs météo/altitude
- `public/data/` — instantanés et agrégats publiables pour la démo
- `scripts/` — acquisition, validation et agrégation des données
- `docs/` — défi, méthode, plan produit et maquettes UI

## Documentation de départ

- [Solution technique complète](docs/09-solution-technique-complete.md)
- [Plan produit, parcours et onglets](docs/10-plan-produit-et-onglets-ui.md)
- [Maquettes UI](docs/ui/)
- [Catalogue des données](docs/02-catalogue-donnees.md)
- [Méthode d’harmonisation](docs/03-indicateurs-et-methode.md)

## État actuel

Le shell cartographique plein écran, la navigation entre les vues, le choix de quatre villes de l’Alberta, le fond cartographique, la prévision horaire Open-Meteo (vent, rafales, pluie, température, humidité relative), l’altitude ponctuelle, les états des sources, et un formulaire de sensibilité au vent sont implémentés. Le curseur horaire pilote les valeurs météo et le vecteur de vent.

NASA FIRMS n’est pas encore connecté : les hotspots, agrégats, comparaisons MODIS/VIIRS et les calendriers de détections ne sont pas disponibles. Le scénario n’est pas une simulation de propagation : il expose les entrées météo et bloque l’enveloppe de progression tant qu’un périmètre daté, des combustibles, l’humidité adaptée, le relief et un moteur validé ne sont pas intégrés. Les valeurs fictives des maquettes ne sont pas affichées comme des observations.

Voir [le plan d’implémentation](PLAN-IMPLEMENTATION.md), [le design system](DESIGN.md) et [le contrat UX](UX-CONTRACT.md) pour les prochaines tranches et critères d’acceptation.
