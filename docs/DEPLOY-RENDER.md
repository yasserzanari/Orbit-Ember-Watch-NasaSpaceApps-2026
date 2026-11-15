# Déploiement de la démo Render

Le dépôt contient un Blueprint [`render.yaml`](../render.yaml) pour le serveur Node complet : l’API FIRMS/CWFIS et le build Vite sont servis par le même service Web. Le contrôle de santé est `/api/health`. La configuration choisit le plan gratuit, désactive les déploiements automatiques et active le flux historique CWFIS conformément à l’acceptation de l’accord par l’équipe. Aucun `FIRMS_MAP_KEY` n’est requis pour les flux publics Canada NRT.

## Mise en ligne

1. Pousser sur GitHub le commit contenant `render.yaml`.
2. Dans Render, créer un **Blueprint** à partir du dépôt `yasserzanari/Orbit-Ember-Watch-NasaSpaceApps-2026` et sélectionner la branche `main`.
3. Examiner le plan et les variables proposés : un seul Web Service, plan `free`, `CWFIS_EULA_CONFIRMED=true`. Ne pas ajouter de clé FIRMS dans le frontend.
4. Après création du service, attendre que son déploiement soit **Live**, puis valider `/api/health`, l’accueil, un flux NASA Canada NRT et le volet historique CWFIS avant de copier l’URL dans le formulaire de l’équipe.
5. Les mises à jour exigent un déploiement manuel (`autoDeployTrigger: "off"`); cela évite de publier un commit qui n’a pas été vérifié.

La création du service public et son premier déploiement sont des actions Render distinctes de la préparation locale de ce Blueprint.

## Limites du plan gratuit

Un Web Service gratuit peut se mettre en veille après une période sans trafic et son système de fichiers est éphémère. Le premier accès suivant peut donc être plus lent, et les imports FIRMS locaux ne sont pas présents dans ce service. La démo publique doit s’appuyer sur les flux publics Canada NRT et CWFIS; une clé historique et des données privées ne sont pas incluses. Vérifier les limites d’usage courantes de Render avant la remise.

Sources officielles : [Blueprint YAML](https://render.com/docs/blueprint-spec.md), [déploiement gratuit](https://render.com/docs/free.md), [contrôles de santé](https://render.com/docs/health-checks.md).
