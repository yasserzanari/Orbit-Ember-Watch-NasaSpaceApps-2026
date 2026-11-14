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

`npm run dev` lance le frontend et l’API locale. Pour servir la version compilée avec l’API FIRMS : `npm run build`, puis `npm start`.

Pour activer NASA FIRMS, demander une MAP_KEY gratuite sur [le portail officiel NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/), copier `.env.example` vers `.env`, puis renseigner `FIRMS_MAP_KEY`. La clé est lue uniquement par le serveur Node; elle ne doit jamais être préfixée par `VITE_`, committée ou collée dans une conversation. Sans clé, l’interface annonce clairement que le flux n’est pas disponible.

## Structure

- `server/` — serveur Node, app statique de production et proxy FIRMS protégé côté serveur
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

Le shell cartographique plein écran, la navigation entre les vues, le choix de quatre villes de l’Alberta ou d’un point cliqué sur la carte, le relief 3D MapLibre alimenté par le DEM AWS Terrarium, l’ombrage du relief et l’altitude ponctuelle sont implémentés. Le champ de vent interroge 25 points Open-Meteo et interpole leurs composantes vectorielles pour afficher les flèches locales et un flux de particules animé. La timeline horaire pilote simultanément les valeurs météo, les flèches et l’animation; des commandes permettent de masquer le vent ou de repasser en carte 2D. La vitesse visuelle des particules est relative et n’est ni un temps de parcours ni une propagation de feu. Le serveur valide les demandes FIRMS, garde la MAP_KEY côté serveur, met les réponses en cache deux minutes et normalise les lignes CSV dans un schéma traçable.

L’intégration NASA FIRMS est prête, mais nécessite votre MAP_KEY dans `.env` avant que des hotspots puissent être récupérés. Les agrégats, comparaisons MODIS/VIIRS et calendriers de détections restent à construire. Le scénario n’est pas une simulation de propagation : il expose les entrées météo et bloque l’enveloppe de progression tant qu’un périmètre daté, des combustibles, l’humidité adaptée, le relief et un moteur validé ne sont pas intégrés. Les valeurs fictives des maquettes ne sont pas affichées comme des observations.

Voir [le plan d’implémentation](PLAN-IMPLEMENTATION.md), [le design system](DESIGN.md) et [le contrat UX](UX-CONTRACT.md) pour les prochaines tranches et critères d’acceptation.
