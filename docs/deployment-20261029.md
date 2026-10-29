# Déploiement de production — 29 octobre 2026

Projet : `saaqgyjqecqbzizacvrp`. Achats réouverts ; `PAYMENTS_MAINTENANCE=false`.
Le webhook est resté disponible pendant la suspension des deux points d'entrée
de création d'achat. La maintenance a été vérifiée par HTTP 503 et Retry-After,
puis sa désactivation par HTTP 401 pour les demandes non authentifiées.

## Migrations réellement appliquées

Dans cet ordre, par CLI, après simulation et avec contrôle après chaque étape :

1. `20261012072232_door_global_assets_admin.sql`
2. `20261029131916_paid_publication_versions.sql`
3. `20261029145330_promo_full_discount_free_publication.sql`

Les migrations historiques n'ont pas été rejouées. La simulation finale indique
`upToDate: true` et aucune migration restante. Vault et les seeds n'ont pas été modifiés.

## Versions Edge finales relevées

| Fonction | Version | verify_jwt |
| --- | ---: | --- |
| stripe-webhook | 20 | false — signature Stripe exigée |
| submit-rsvp | 8 | false — validation publique dédiée |
| validate-promo-code | 4 | true |
| publish-global-asset | 5 | true |
| create-checkout-session | 21 | true |
| create-commerce-checkout | 7 | true |

Les changements de configuration des secrets peuvent aussi incrémenter les versions.
Les secrets Stripe existants n'ont pas été remplacés. Les seules valeurs de
configuration changées pendant le déploiement concernent PAYMENTS_MAINTENANCE.

## Contrôles

- 559 tests locaux réussis sous Node 22 ; zéro échec/ignoré.
- Build et git diff --check réussis.
- Frontend servi : `/assets/index-vTGG5bDp.js`, identique au build local du code
  frontend du commit GitHub `b45453a`. Aucun nouveau site ni déploiement Netlify nécessaire.
- Première publication gratuite via HTTP réel : 2450 centimes avant remise, zéro après.
  Aucun identifiant de session Checkout ou PaymentIntent Stripe ; justificatif gratuit présent.
- Requête répétée : même justificatif, aucune seconde transaction.
- Code 100 % créé et validé ; 101 % rejeté.
- Tokens familiaux distincts et stables, noms du projet et des foyers corrects.
- Snapshot protégé contre l'écriture par le propriétaire, nouvelle version éditable,
  brouillon non payé invisible dans l'invitation publiée.
- Devis de republication positif, RSVP déjà acquis non refacturé ; devis abandonné
  sans session Stripe ni activation du nouveau snapshot.
- Ajout de places indépendant, promo refusée pour cet achat ; devis abandonné.
- RSVP synthétique enregistré par RPC et visible au propriétaire, sans email de notification.
- Cinq PNG Porte/Enveloppe contrôlés par HTTP 200. Pas de contrôle visuel exhaustif
  des animations dans le navigateur pendant cette intervention.

## Données

Les 14 projets préexistants ont été comparés à l'archive : noms, contenus
project_data et propriétaires identiques. Les 335 objets Storage ont la même
empreinte d'inventaire qu'avant le déploiement. Aucun ancien projet payé n'était
présent dans la base contrôlée ; le grandfathering a été validé dans les tests locaux.

Deux projets synthétiques nommés `DEPLOYMENT CHECK` sont conservés pour audit.
Leurs identifiants restent dans les rapports locaux exclus de Git.

Leurs codes de contrôle sont désactivés et leur compte synthétique, sans droit
administrateur, est bloqué. État final : 16 projets (14 initiaux + 2 contrôles),
30 comptes Auth (29 initiaux + 1 contrôle), 4 foyers (1 initial + 3 contrôles),
1 réponse RSVP synthétique, 2 justificatifs gratuits. Aucun devis de contrôle pending.
Aucune suppression et aucun achat bancaire réel.

## Limites et suivi

- Le connecteur Stripe n'a pas fourni d'accès exploitable malgré l'authentification :
  inventaire des sessions ouvertes directement chez Stripe non vérifié.
- Aucun paiement bancaire réel n'a été exécuté ; confirmations/reprises signées
  et tarification normale sont couvertes par les tests automatisés.
- Sauvegarde contrôlée conservée dans
  `%USERPROFILE%\Documents\SupabaseBackups\saaqgyjqecqbzizacvrp\20261029T182017Z`.
  Restauration indépendante non testée, risque accepté par l'utilisateur.
- Les avertissements Advisors sur les RPC SECURITY DEFINER autorisées et la
  protection contre les mots de passe compromis restent à suivre séparément.
- La réconciliation des noms de migrations et la garde de maintenance sont
  versionnées ensemble lors de la synchronisation suivant le déploiement.
  Cette synchronisation Git n'exécute aucune migration ni aucun déploiement Edge.
