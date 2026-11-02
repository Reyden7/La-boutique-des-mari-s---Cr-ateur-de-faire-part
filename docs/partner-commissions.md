# Commissions partenaires — implémentation locale

Aucun déploiement, commit, push ou paiement bancaire. Les modifications locales antérieures des codes à usage limité sont conservées.

## Administration

`/admin/promo-codes` comporte trois vues : Codes promotionnels, Partenaires, Commissions partenaires.

- Le code conserve sa réduction et sa limite ; l’association à un partenaire et le taux de commission sont facultatifs. Aucun partenaire implique un taux de zéro.
- La création d’un partenaire passe par un RPC administrateur. Le nom commercial normalisé (casse et espaces en bordure) est unique ; sélectionner/créer un nom déjà connu réutilise son identifiant sans écraser ses coordonnées.
- Contact et email professionnels sont facultatifs. Pas de coordonnées bancaires dédiées ni espace partenaire.
- Désactiver un partenaire arrête les nouvelles attributions. Les devis déjà attribués et leur taux sont conservés ; la réduction client reste indépendante.
- La vue commissions affiche les écritures réelles, les ventes, le CA net de remboursements, les commissions à régler, les règlements et les régularisations. Filtres par partenaire/date de vente et export CSV avec protection contre les formules Excel. Les lectures sont paginées, sans troncature silencieuse à 1 000 lignes.

## Modèle et confidentialité

Migration : `20261102102520_partner_commissions.sql`, après `20261102100112_promo_usage_limits_reservations.sql` et ses dépendances (versions payantes, finalisation gratuite et tarification v3).

Cinq tables nouvelles :

| Table | Rôle |
| --- | --- |
| `partners` | Identité commerciale, contact facultatif, activation |
| `partner_sale_attributions` | Partenaire, nom et taux figés sur le reçu du devis |
| `partner_commissions` | Vente confirmée, montant, TVA, base, taux, commission et état |
| `partner_settlements` | Règlement manuel, total serveur, administrateur, date, référence et clé d’idempotence |
| `partner_commission_adjustments` | Historique des remboursements cumulés et régularisations |

`promo_codes` reçoit `partner_id` et `partner_commission_rate` (0–100, deux décimales maximum). Les anciens codes restent sans partenaire, à zéro. Aucune attribution/commission rétroactive n’est créée, y compris pour un ancien reçu déjà en attente lors de la migration. Seule une nouvelle attribution de code à un nouveau devis peut figer le partenaire.

RLS sur les cinq tables : lecture administrateur uniquement via `private.is_admin()`, pas d’écriture directe navigateur. Les écritures de partenaires/règlements utilisent des RPC vérifiant l’administrateur ; les confirmations/remboursements sont réservés à `service_role`. Tous les privilèges `PUBLIC`/`anon` sont révoqués sur ces RPC. Les politiques préexistantes des codes sont conservées.

Les attributions sont séparées des reçus accessibles aux propriétaires. Aucun nom commercial, taux ou montant de commission n’est ajouté aux réponses publiques, métadonnées Stripe ou snapshots des faire-part.

## Confirmation, calcul et TVA

1. Appliquer/valider un code ne crée aucune commission. La préparation du reçu fige l’association et le taux commercial, dans la transaction serveur de devis/réservation. Une modification ultérieure du taux ne modifie jamais ce devis ni une vente antérieure.
2. L’insertion atomique de `promo_code_uses` après finalisation d’une vente crée au maximum une commission par reçu/utilisation. Le trigger partage la transaction de finalisation : une erreur annule l’ensemble.
3. Pour Stripe, la commission reste **En attente** tant que la TVA n’a pas été confirmée par le webhook signé et les contrôles du reçu. Un échec après publication laisse une commission non réglable ; le rejeu du webhook termine la confirmation sans recréer les droits ni la commission.
4. Le serveur utilise `session.amount_total` et `session.total_details.amount_tax` ; une session complète est relue si les informations sont absentes. Une preuve incohérente est refusée. La fonction ne configure ni n’active Stripe Tax. Si de la TVA est appliquée hors Stripe, ce traitement doit être adapté à cette source comptable avant production : aucun taux de TVA n’est deviné.
5. Base = encaissé − TVA. Commission = `round(base_cents × taux / 100)`, en `numeric` SQL puis centimes entiers. Exemple sans TVA : 3 299 − 330 = 2 969 centimes, 15 % → 445 centimes.
6. Une publication gratuite attribuée crée une écriture à zéro, sans Stripe et non sélectionnable pour un règlement.

Les états sont `pending` (En attente), `payable` (À régler), `paid` (Réglée), `canceled` (Annulée). Les codes restent réservés à la première publication. Les republications, upgrades, RSVP inclus, tarifs et droits historiques ne sont pas modifiés.

## Remboursements et concurrence

Le webhook `charge.refunded` gère désormais les remboursements partiels pour le registre partenaire. La révocation des droits reste limitée au parcours de remboursement total existant ; une commission n’accorde ni ne retire de droits de son propre chef.

Pour un remboursement partiel, la base HT est proratisée sur le remboursement TTC cumulé : `round(base_initiale × (TTC − remboursé) / TTC)`, puis le taux figé est appliqué et arrondi. Ce choix comptable est explicite ; la base et la commission initiales restent enregistrées. Les montants cumulés empêchent les doubles ajustements et les retours en arrière sur événement tardif. La confirmation fiscale et l’ajustement du remboursement partagent une transaction, sans passage transitoire à un état réglable.

Un remboursement total annule une commission non réglée. Après règlement, son justificatif et son montant versé restent intacts : la commission acquise est ajustée et une écriture de régularisation est enregistrée. Le tableau/CSV expose le montant à traiter manuellement. Aucun prélèvement, remboursement bancaire ou déduction automatique sur une future commission. Le rapprochement et le traitement effectif de cette régularisation restent manuels hors application.

Le règlement manuel verrouille le partenaire et les commissions dans un ordre stable. Le serveur contrôle l’unicité de la sélection, le partenaire commun, le statut, la date et le montant recalculé. Le total affiché est une assertion optimiste, jamais une source de montant : un remboursement intervenu entre l’affichage et la confirmation impose une actualisation. Le même identifiant de requête peut être rejoué sans nouveau règlement, avec contrôle de l’identité des paramètres. Aucune commission n’est réglée deux fois, aucune commission annulée/à zéro/en attente ne peut être réglée.

## Fichiers concernés par cette fonctionnalité

- `src/pages/AdminPromoCodesPage.tsx`
- `src/components/admin/PromoCodesManager.tsx`
- `src/components/admin/PartnersManager.tsx` (nouveau)
- `src/components/admin/PartnerCommissionsManager.tsx` (nouveau)
- `src/features/partners/partnerData.ts` (nouveau)
- `src/services/promoCodeRepository.ts`
- `src/services/partnerRepository.ts` (nouveau)
- `src/styles.css`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/functions/_shared/partnerCommissions.ts` (nouveau)
- `supabase/migrations/20261102102520_partner_commissions.sql` (nouvelle)
- `tests/guest-checkout-webhook.test.mjs`
- `tests/partner-commissions-db.fixture.mjs` (nouveau)
- `tests/partner-commissions-sql.test.mjs` (nouveau)
- `tests/partner-data.test.mjs` (nouveau)
- `tests/partner-repository.test.mjs` (nouveau)
- `tests/partner-commissions.browser.html` et `.tsx` (nouveaux)
- `docs/partner-commissions.md` (nouveau)

## Mise en production ultérieure — rien exécuté

1. Vérifier sauvegarde, historique distant et versions des sources ; ne pas supposer les migrations locales déjà appliquées. Confirmer la source de TVA et la règle de proratisation des remboursements partiels avec la comptabilité.
2. Préserver les webhooks et paiements déjà engagés ; suspendre seulement les nouveaux achats avec le mécanisme existant si nécessaire.
3. Appliquer, uniquement si manquantes, les dépendances de tarification v3, puis `20261102100112_promo_usage_limits_reservations.sql`, puis `20261102102520_partner_commissions.sql`. Aucune ancienne migration n’est modifiée par cette fonctionnalité.
4. Déployer `stripe-webhook` et ses helpers compatibles. Aucun autre handler Stripe n’a été modifié pour les commissions : l’attribution se fait par trigger SQL du devis existant. Si les codes à usage limité sont également en attente, déployer leurs versions compatibles de `validate-promo-code` et `create-checkout-session` selon leur documentation.
5. Vérifier les abonnements aux événements de succès, succès différé, remboursements et expiration de session (codes limités). Conserver les secrets et la validation de signature ; aucune clé nouvelle de virement/Connect n’est nécessaire.
6. Déployer le frontend sur le site existant, contrôler les accès admin et parcours avec données de contrôle, puis réouvrir les nouveaux achats après validation.

Tests locaux : SQL réel sur PGlite avec migrations précédentes, handlers réels avec Stripe/Supabase simulés, règles de calcul/CSV, pagination et règlement RPC. Pas de paiement réel, test Stripe connecté ni test de charge PostgreSQL multi-connexions. Les essais navigateur sont isolés sur données synthétiques : partenaire, code associé, confirmation et historique de règlement, CSV téléchargé, mobile/tablette.

Validation finale du 2 novembre 2026 sous Node 22.23.4 : **611 tests réussis, 0 échoué, 0 ignoré**. `npm run build` (`tsc -b && vite build`) : code 0 ; avertissement préexistant sur les chunks supérieurs à 500 ko. `git diff --check` : code 0. Export CSV téléchargé et relu : BOM UTF-8 et six lignes (en-tête + cinq ventes synthétiques). La totalité des modifications locales reste non commitée : 32 fichiers modifiés/nouveaux, dont ceux des fonctionnalités précédentes.
