# Tarification par invité — livraison locale du 12 octobre 2026

## État de livraison

**Implémentée et validée localement. Aucun déploiement, aucune migration hébergée appliquée, aucun Checkout ou paiement Stripe réel/test créé, aucun secret modifié.** Ne pas déployer uniquement le frontend : la migration et les deux Edge Functions doivent être basculées ensemble avant lui.

Le choix pour moins de 40 invités a été confirmé par l'utilisateur : conserver les **40 invités inclus**. La capacité initiale est donc `max(40, guestCount)`. Au-delà de 40, elle correspond exactement au nombre acheté, sans aucun arrondi.

## Tarification centrale

`supabase/functions/_shared/pricing.ts` est partagé avec le frontend via `src/config/pricing.ts` :

```ts
BASE_GUESTS = 40
BASE_PRICE = 2450
EXTRA_GUEST_PRICE = 100
FORM_PRICE = 990
invitationPrice = 2450 + Math.max(0, guestCount - 40) * 100
upgradePrice = Math.max(0, requestedGuestCount - currentPaidCapacity) * 100
```

Tous les calculs monétaires restent en centimes entiers. La remise est arrondie une seule fois, sur le sous-total comprenant le formulaire. Les restrictions existantes des promos restent inchangées : première publication uniquement, pas d'upgrade remisé.

| Invités | Faire-part sans formulaire |
| --- | ---: |
| 40 | 24,50 € |
| 41 | 25,50 € |
| 42 | 26,50 € |
| 45 | 29,50 € |
| 50 | 34,50 € |
| 53 | 37,50 € |
| 54 | 38,50 € |
| 55 | 39,50 € |
| 60 | 44,50 € |
| 80 | 64,50 € |
| 100 | 84,50 € |

Formulaire : +9,90 €. 55 invités + formulaire : 49,40 € ; remise 10 % : 4,94 €, total 44,46 €.

Upgrades : 40 → 41 = 1 €, 40 → 47 = 7 €, 40 → 54 = 14 €, 47 → 54 = 7 €, 54 → 60 = 6 €. Une déclaration 54 → 45 conserve la capacité 54 et ne crée aucun paiement/remboursement.

## Backend et données

Nouvelle version : `guest-v2`. Nouveau point d'entrée serveur `reserve_guest_checkout_v2`, inaccessible à `anon` et `authenticated`, exécutable uniquement par `service_role`. Il vérifie propriétaire, état de publication et droits, puis recalcule indépendamment les prix en SQL, réserve le reçu avec verrou de projet et applique la promo depuis la base.

Exemple de nouveau reçu, 55 invités + formulaire −10 % :

```json
{
  "pricing_version": "guest-v2",
  "guest_count": 55,
  "guest_capacity": 55,
  "extra_guests": 15,
  "previous_guest_capacity": 0,
  "additional_guests": 15,
  "has_form": true,
  "subtotal_amount": 4940,
  "discount_amount": 494,
  "amount_cents": 4446,
  "extra_blocks": null,
  "previous_extra_blocks": null,
  "additional_blocks": null
}
```

Les anciens champs de blocs restent présents uniquement pour conserver les reçus historiques. Ils ne sont ni calculés ni envoyés dans les nouveaux achats. Les anciennes migrations et les RPC de réservation v1 sont conservées pour les anciens appelants pendant le déploiement ; `create-checkout-session` appelle exclusivement la RPC v2.

Stripe reçoit notamment : `guest_count`, `guest_capacity`, `included_guests=40`, `extra_guests`, `extra_guest_unit_price=100`, `invitation_price`, `form_price`, `subtotal`, `discount_amount`, `final_amount`, ainsi que les identifiants du reçu/projet/propriétaire et les informations d'upgrade/promo. Le même snapshot est envoyé sur la session et le PaymentIntent. Pour un upgrade, `invitation_price` décrit le faire-part complet au nombre demandé ; le sous-total/final et `additional_guests` décrivent uniquement l'incrément payé.

Le webhook compare montant, devise, session, identifiants et metadata au reçu serveur immuable, avant les RPC atomiques de finalisation. Le prix fourni par le client est ignoré. Les droits proviennent toujours des colonnes serveur, jamais de `project_data`.

Le contrôle `pricingVersion` dans la requête et la réponse empêche les redirections de paiement avec une interface/backend de versions différentes. Un ancien onglet doit recharger la page ; aucun prix client ne devient une autorité.

## Migration et rétrocompatibilité

Migration préparée par la CLI officielle : `20261012061830_guest_per_person_pricing.sql`.

- Étend les contraintes aux reçus v2, sans modifier montants, statuts ou capacités déjà achetées.
- Garde l'ancien sous-total calculé pour les lignes v1 ; le nouveau utilise le nombre d'invités supplémentaires.
- Une ancienne capacité de 54 reste 54 ; son upgrade vers 60 coûte 600 centimes.
- Les projets historiques sans capacité restent sans quota ajouté et ne sont pas refacturés automatiquement.
- Une ancienne session ouverte n'est pas réutilisée pour un nouvel achat v2 ; une session déjà payée ou en confirmation n'est pas remplacée.
- Replays et remboursements v1 restent traités au montant historique, jamais au nouveau prix.
- Les capacités sont recalculées depuis la capacité initialement payée et les incréments encore payés. Un remboursement retire uniquement l'incrément concerné ; un replay tardif ne le restaure pas.
- La protection des droits clients, les RLS, les index, les licences, les formulaires achetés séparément et l'audit promo sont conservés.

## Fichiers modifiés

- `supabase/functions/_shared/pricing.ts`
- `supabase/functions/_shared/guestPayment.ts`
- `supabase/functions/_shared/legacyGuestPayment.ts` (nouveau, lecture historique uniquement)
- `supabase/functions/create-checkout-session/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/migrations/20261012061830_guest_per_person_pricing.sql` (nouveau)
- `src/config/pricing.ts`
- `src/services/projectRepository.ts`
- `src/components/toolbar/TopToolbar.tsx`
- `tests/guest-pricing.test.mjs`
- `tests/guest-checkout-webhook.test.mjs`
- `tests/guest-project-data.test.mjs`
- `tests/promo-pricing.test.mjs`
- `tests/guest-pricing-sql.test.mjs`
- `tests/guest-pricing-db.fixture.mjs` (nouveau, schema local partagé)
- `tests/guest-per-person-sql.test.mjs` (nouveau)
- Ce rapport et `docs/qa/20261012-guest-per-person/55-form-promo.jpg`.

## Vérifications

**449 tests réussis, aucun échec, aucun test ignoré**, sous Node 22.23.3. Les tests PostgreSQL utilisent PGlite en mémoire, sans connecter le projet Supabase hébergé.

- Nouveaux montants, capacité exacte, upgrade depuis capacité non arrondie et ancienne capacité, baisse sans remboursement.
- Handler Checkout réel avec Stripe/Supabase simulés : recalcul, metadata, lignes à 100 centimes par invité, faux prix/promo ignorés, sessions en cours, propriétaire, invités invalides, concurrence, version frontend/backend.
- Handler webhook réel simulé : signature, montant, devise, metadata, paiements asynchrones, remboursements et compatibilité des paiements v1/anciens prix fixes/formulaire indépendant.
- SQL v2 : **96 combinaisons prix/formulaire/promo**, anciens droits inchangés après migration, ancien paiement en attente finalisé après migration, upgrades/refunds/replays, refus des écritures clients et accès inter-projets, permissions RPC.
- SQL historique/promo : **426 assertions** passent ; les audits historiques d'enveloppe restent aussi verts.
- ROLLBACK confirmé, fixtures et droits revenus à leur état initial, aucune ligne d'audit promo ni reçu v2 persistant après le test.
- Vérification statique Deno des deux Edge Functions : réussie.
- `npm run build` : réussi, TypeScript + Vite. Seul warning existant : taille du bundle > 500 kB.
- Navigateur, vraie modale avec adaptateurs en mémoire : détail 55 + formulaire, remise à 44,46 €, capacité 55, upgrade 40 → 54 à 14 €, confirmation des trois formats indispensable. Aucun Checkout créé depuis la fixture.

## Ordre de déploiement à prévoir — non effectué

1. Appliquer la migration SQL après validation de son coût/verrouillage sur les tables de reçus.
2. Déployer le webhook local compatible v1 + v2 avec ses helpers, avant tout nouveau Checkout.
3. Déployer `create-checkout-session` guest-v2 et ses helpers ; faire les vérifications serveur sans paiement.
4. Déployer le frontend issu de la même livraison. Les anciens onglets reçoivent un message de rechargement, pas un prix incohérent.
5. Test Stripe de bout en bout dans un environnement de test isolé, avant un éventuel paiement réel autorisé séparément.

Les nouvelles versions Edge hébergées ne sont pas attribuées tant qu'aucun déploiement n'a eu lieu. **Stripe end-to-end : non réalisé. Production Supabase/Stripe/Netlify inchangée.** Aucun changement des secrets, des SDK Stripe existants, de l'anti-réutilisation ou des règles de republication.

Documentation consultée : [Checkout metadata](https://docs.stripe.com/api/checkout/sessions/create#checkout_session_create-metadata), [Finalisation par webhook](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted), [Protection Data API et RPC](https://supabase.com/docs/guides/api/securing-your-api).
