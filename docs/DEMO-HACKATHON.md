# Démo hackathon — Orbit Ember Watch

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
2. **Comparer les instruments.** Ouvrir Compare sur la même zone et la même fenêtre, garder MODIS et VIIRS dans deux séries distinctes, puis ouvrir quelques attributs natifs et heures UTC.
3. **Relier au contexte.** Dans Live Map, activer les couches de vent et de relief; préciser que le vent vient d’Open‑Meteo et ne prédit pas la propagation du feu.
4. **Montrer la traçabilité.** Dans Data & Sources, distinguer les flux NRT de sept jours des archives historiques. Une disponibilité globale ne prouve pas la couverture d’un pixel.

## Message scientifique

Orbit Ember Watch aide à explorer et comparer des détections MODIS et VIIRS sans confondre leurs résolutions, leurs confidences natives ou leurs limites d’observation. La vue NRT prouve le parcours cartographique et la comparaison récente. Une calibration historique, une référence saisonnière et une mesure de couverture restent à valider avant d’afficher une série harmonisée ou un score d’accord.

## Conditions et limites

- Les CSV publics utilisés sans clé couvrent seulement les sept derniers jours au Canada; l’API de disponibilité et les fenêtres plus anciennes nécessitent `FIRMS_MAP_KEY` côté serveur.
- Aucune ligne retournée ne signifie pas absence de feu. Le flux FIRMS n’est pas un dénominateur de couverture.
- Les résultats sont des détections NRT; ils ne remplacent pas un historique standard science-quality.
- Le scénario ne produit pas de prévision opérationnelle de propagation.
