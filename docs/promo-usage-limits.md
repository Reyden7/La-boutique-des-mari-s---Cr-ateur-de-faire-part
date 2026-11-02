# Codes promotionnels : limites globales et réservations

Implémentation locale, sans déploiement. Les codes historiques ont `max_uses = NULL` (illimité).
Un administrateur peut sélectionner une utilisation ou une limite numérique (1 à 1 000 000).
Les codes désactivés restent dans l’historique ; les droits et justificatifs existants ne sont pas recalculés.

## Transaction et concurrence

- La validation authentifiée appelle `promo_code_availability` sans réserver ni consommer.
- La réservation intervient dans un trigger du reçu serveur : même transaction que le devis, le nombre réel d’invités et le snapshot candidat. Elle couvre également les anciens RPC de devis.
- Un verrou consultatif transactionnel par identifiant de code sérialise réservations, consommation et modification de limite. Le plafond compte les utilisations confirmées et les réservations actives, tous comptes/projets confondus.
- Le trigger de `promo_code_uses` transforme la réservation en consommation dans la transaction de finalisation existante. Une erreur annule droits, snapshot, preuve gratuite et consommation ensemble. Rejeux Stripe et rejeux gratuits restent idempotents.
- Une désactivation ultérieure ne retire pas la réduction d’un paiement déjà réservé. Les remboursements ne rendent pas un code consommé réutilisable.
- Une republication et un upgrade restent exclus des promotions. Aucun changement des prix, du RSVP inclus, des tokens familiaux ou des réponses.

## Expiration et paiements différés

Les nouveaux Checkouts expirent après une heure. La réservation porte la même échéance indicative, mais le temps seul ne la libère jamais.

`reconcilePromoSession` relit Stripe avant de libérer : session réellement expirée et impayée, ou PaymentIntent définitivement annulé. Sur échec asynchrone, un intent `requires_payment_method` peut être annulé explicitement ; `processing`, `requires_action` et `succeeded` ne le sont pas.
Un événement périmé, un retour sur la page d’annulation ou une erreur réseau ne prouvent pas l’échec du paiement.

Le webhook gère `checkout.session.expired`. Vérifier que l’endpoint Stripe est abonné à cet événement, en plus des événements de confirmation, échec différé et remboursement déjà utilisés.
La validation et la préparation d’achat réconcilient aussi les réservations des codes limités : elles peuvent expirer auprès de Stripe une session encore ouverte dont l’échéance est atteinte.

Si la réponse de création/attachement a été perdue, le serveur recherche la session par métadonnées exactes du reçu (montant, propriétaire, projet et devis vérifiés), sur au plus 1 000 sessions. Il peut ainsi rattacher et réconcilier une session retrouvée. Un résultat incertain reste réservé : aucun déblocage automatique dangereux.

**Limite opérationnelle :** une création Stripe sans résultat identifiable nécessite une réconciliation opérateur. Ne pas libérer directement sur la seule base d’un délai. Rechercher le reçu dans les sessions/logs Stripe, établir l’absence de paiement finalisable, puis utiliser le chemin serveur de réconciliation. Les erreurs Stripe de création explicitement rejetées (400 InvalidRequest) et les erreurs avant tout appel de création peuvent libérer immédiatement.

## Sécurité et historique

`promo_code_reservations` : RLS active, lecture administrateur uniquement, aucune écriture navigateur. Les RPC d’état et de libération sont réservés au service serveur. `admin_promo_codes` contrôle `private.is_admin()` et fournit seulement aux administrateurs les codes et compteurs nécessaires à leur historique.
Les politiques existantes des codes et utilisations restent inchangées. Les messages publics ne contiennent aucune identité.

## Déploiement ultérieur (non effectué)

1. Vérifier que les migrations versions payantes, finalisation gratuite et `20261102075451_rsvp_included_pricing_v3.sql` sont appliquées. Cette dernière n’était pas déployée lors du précédent contrôle ; ne pas la supposer présente.
2. Suspendre les nouveaux achats avec le dispositif serveur existant, sans arrêter les webhooks. Inventorier les Checkouts en cours ; la migration conserve les reçus et réserve les Checkouts promotionnels en attente/échoués avec session.
3. Appliquer uniquement `20261102100112_promo_usage_limits_reservations.sql` après contrôle de l’historique. Aucun ancien fichier SQL n’a été modifié.
4. Déployer `stripe-webhook`, `validate-promo-code`, `create-checkout-session` avec `_shared/promoReservations.ts` et les helpers du même commit ; vérifier les événements Stripe abonnés et les permissions de lecture/annulation des PaymentIntents.
5. Publier le frontend, contrôler les parcours puis réouvrir les achats. Aucune nouvelle fonction RSVP ou modification de paiement réel nécessaire à la validation locale.

## Vérifications locales

Tests SQL sur PGlite : migration additive avec reçu préexistant, limite globale, demandes entre comptes, consommation/rejeu, publication gratuite, rollback injecté, liens et RSVP, droits admin, codes illimités, libération contrôlée et rejet d’un webhook après libération.
Tests des vrais handlers avec Stripe/Supabase simulés : authentification, erreurs d’indisponibilité, absence de Checkout à 0 €, événement expiré et notification périmée. Tests du helper : paiement différé, annulation définitive, panne réseau et résultat de création inconnu.

PGlite exécute ses requêtes sur une seule connexion : les demandes concurrentes y vérifient l’exclusivité logique, pas un test de charge multi-connexions PostgreSQL. Aucun paiement réel ni appel Stripe de production n’a été réalisé.

Validation du 2 novembre 2026 : 593 tests réussis, 0 échoué, 0 ignoré, sous Node 22.23.4. Build `tsc -b && vite build` réussi ; avertissement préexistant de bundle supérieur à 500 ko. `git diff --check` : code 0. Administration vérifiée dans la fixture navigateur isolée : création à 100 % / limite 1 et conservation après désactivation ; affichage des états réservé, utilisé et historique illimité.

## Fichiers de cette modification

- `src/components/admin/PromoCodesManager.tsx`
- `src/components/toolbar/TopToolbar.tsx`
- `src/config/promo.ts`
- `src/services/projectRepository.ts`
- `src/services/promoCodeRepository.ts`
- `supabase/functions/_shared/promo.ts`
- `supabase/functions/_shared/promoReservations.ts` (nouveau)
- `supabase/functions/create-checkout-session/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/functions/validate-promo-code/index.ts`
- `supabase/migrations/20261102100112_promo_usage_limits_reservations.sql` (nouvelle)
- `tests/guest-checkout-webhook.test.mjs`
- `tests/promo-codes.browser.tsx`
- `tests/promo-reservations.test.mjs` (nouveau)
- `tests/promo-usage-sql.test.mjs` (nouveau)
- `docs/promo-usage-limits.md` (nouveau)

Le fichier local préexistant `docs/template-category-production-fix.md` a été conservé sans modification.
