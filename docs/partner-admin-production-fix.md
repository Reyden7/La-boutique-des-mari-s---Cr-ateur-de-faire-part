# Correction de l’administration partenaires — production, 2 novembre 2026

Projet contrôlé : `saaqgyjqecqbzizacvrp`. Frontend public contrôlé : `https://www.laboutiquedesmaries.fr/admin/promo-codes`, bundle `/assets/index-CtPYtTGW.js`, HTTP 200. Sources locales au départ : commit `5efb9f7`, dépôt propre.

## Cause exacte

Le frontend avait été publié sans les migrations serveur correspondantes. L’historique distant contenait 27 migrations, mais pas les migrations des limites de codes et des commissions.

- `admin_save_partner` : fonction réellement absente, d’où le POST RPC 404. Aucun doublon ou surcharge n’a été ajouté.
- Chargement des partenaires : table `public.partners` absente.
- Chargement des commissions : les tables `partner_commissions`, `partner_settlements` et `partner_commission_adjustments` étaient absentes ; les attributions l’étaient également.
- Codes promotionnels : absence de `max_uses`, `partner_id`, `partner_commission_rate` et du RPC `admin_promo_codes` requis par le frontend actuel.
- Ce n’était pas uniquement un cache PostgREST obsolète. Le cache a été rechargé après création du schéma par `NOTIFY pgrst, 'reload schema'`.

## Migrations réellement appliquées

Application progressive via Supabase CLI, sur une copie de travail isolée et ignorée par Git, contenant exclusivement l’historique déjà enregistré et la migration à appliquer. Contrôle à blanc avant chaque application, puis vérification du schéma et de l’historique après chaque étape :

1. `20261102100112_promo_usage_limits_reservations.sql`
2. `20261102102520_partner_commissions.sql`

Aucune ancienne migration rejouée, aucun seed, aucune mise à jour de Vault. Les versions enregistrées sont exactement les versions des fichiers locaux.

La migration tarifaire `20261102075451_rsvp_included_pricing_v3.sql` est restée **non appliquée**. Un test SQL supplémentaire démontre que les deux migrations administratives fonctionnent avec les fonctions de devis `guest-v2` existantes, sans dépendance opérationnelle à une modification tarifaire. Le commentaire historique mentionnant v3 ne nécessite donc pas son déploiement pour cette correction.

## Fonctions déployées

| Fonction | Avant | Après | Vérification JWT |
| --- | --- | --- | --- |
| `stripe-webhook` | 20 | **21 ACTIVE** | Désactivée comme précédemment ; signature Stripe toujours obligatoire |
| `validate-promo-code` | 4 | **5 ACTIVE** | Activée ; authentification contrôlée dans le handler |

Déploiement avec tous les helpers du dépôt nécessaires. Le webhook est compatible avec les reçus historiques v1/v2 et les nouvelles écritures de commissions. La validation applique les limites globales sans consommer le code au clic.

`create-checkout-session` reste en version **21**, `create-commerce-checkout` en **7**, `submit-rsvp` en **8** : aucune modification ni redéploiement de ces fonctions. Aucun secret changé. Aucun paiement ou virement réel créé. Aucun déploiement Netlify, commit ou push.

## RPC, rôles et confidentialité

Signatures confirmées dans `public` :

- `admin_save_partner(uuid,text,text,text,boolean)`
- `admin_promo_codes()`
- `admin_settle_partner_commissions(uuid,uuid,uuid[],date,bigint,text)`
- `confirm_partner_commission(uuid,text,text,integer,integer)`
- `refund_partner_commission(uuid,text,text,integer,integer,text,integer)`

Les RPC administratifs sont exécutables par `authenticated` mais contrôlent `private.is_admin()` ; les deux RPC de confirmation financière sont réservés à `service_role`. Aucun de ces RPC n’est exécutable par `anon`. La règle administrateur réelle consulte `auth.users.raw_app_meta_data ->> 'role' = 'admin'` et exclut les sessions anonymes, conformément à l’indication UI `session.user.app_metadata.role`.

RLS activée sur les cinq tables nouvelles. Pas d’écriture navigateur directe dans le registre, ni d’ouverture publique. Tests HTTP anonymes : **401 / 42501** sur partenaires, commissions, règlements et ajustements. Le webhook appelé sans signature répond **400 Missing Stripe-Signature**, et non 500.

## Vérifications réellement effectuées

- Interface locale réelle connectée à Supabase de production, avec la session administrateur existante : création d’un partenaire, modification du contact, rechargement complet de la page, relecture persistée. Pas de fixture en mémoire pour ce contrôle.
- Seul enregistrement de contrôle conservé : **« QA — Vérification partenaires 2026-11-02 »**, inactif, contact synthétique et email `example.invalid`. Aucun code actif de contrôle conservé.
- Les quatre codes historiques se chargent sans erreur ; le bouton d’ajout est disponible. Console de cette session de contrôle sans erreur.
- Commissions : chargement réussi, zéro écriture, message de liste vide sans erreur.
- Dans une transaction SQL de production avec le véritable rôle administrateur, puis **ROLLBACK** : création/modification/désactivation d’un partenaire, association à un code de réduction 100 %, commission 0 puis 15 %, usage unique puis multiusage, lecture via `admin_promo_codes`. Aucune vente artificielle ni droit de publication créé.
- Dans une autre transaction annulée, avec un véritable identifiant non administrateur et `SET LOCAL ROLE authenticated` : lectures masquées par RLS, écriture partenaire et lecture RPC des codes refusées avec `ADMIN_REQUIRED`.
- Test automatisé ajouté : application conjointe des migrations sans v3, publication et commission de contrôle sur une base PGlite jetable au tarif v2, fonction tarifaire inchangée.
- Suite complète sous **Node 22.23.4 : 612 réussis, 0 échoué, 0 ignoré**.
- `npm run build` : **code 0**, avertissement de taille du bundle préexistant.
- `git diff --check` : **code 0**.

Les empreintes agrégées avant/après sont identiques pour les projets, destinataires/tokens, réponses RSVP, reçus de licences invités, utilisations de codes et définition de la fonction tarifaire. Les données clients et droits déjà acquis n’ont pas été modifiés ; aucune commission historique créée rétroactivement.

## Écart distinct à traiter séparément

Le contrôle de compatibilité finale a confirmé un décalage **préexistant** : le bundle frontend public contient `guest-v3`, alors que `create-checkout-session` déployé conserve `PRICING.version = 'guest-v2'` et refuse explicitement un corps `pricingVersion` différent avec HTTP 409 / `pricing_changed`.

Cet écart peut donc empêcher la préparation d’un nouvel achat depuis le frontend public actuel. Il n’est pas la cause du POST `admin_save_partner` 404 et n’a pas été introduit par cette correction. Il est laissé intact conformément à la consigne explicite de ne pas modifier prix/paiements. Une synchronisation tarifaire distincte, autorisée et cohérente entre migrations, fonctions et frontend, reste nécessaire. Aucun achat réel n’a été tenté pour le vérifier.
