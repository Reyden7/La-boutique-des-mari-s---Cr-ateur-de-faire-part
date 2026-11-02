# Grille guest-v3 et RSVP inclus — validation locale du 2 novembre 2026

Développement local uniquement. Aucun déploiement, paiement bancaire, commit ou push effectué.

## Comportement

- 3 299 centimes TTC jusqu’à 40 personnes ; 70 centimes par personne supplémentaire.
- RSVP inclus dans les droits d’une publication payée, y compris les licences historiques ; son affichage reste facultatif. Les anciens achats RSVP restent conservés comme justificatifs, sans création de faux achats à zéro euro.
- Les champs historiques `has_form` / `includes_rsvp` désignent un supplément facturé. Ils sont faux pour les nouveaux reçus v3, même lorsque le design contient un formulaire. La présence du formulaire se déduit du questionnaire publié, jamais de ces champs comptables.
- Première publication, capacité et nouvelle version payante restent trois opérations distinctes. Les codes promotionnels restent réservés à la première publication.
- Une republication utilise la capacité maximale entre 40, les destinataires actuels et la capacité déjà acquise. Elle n’ajoute aucune capacité au-delà de ces règles existantes.
- Les anciennes sessions Stripe continuent d’être finalisées selon leur version d’origine. Leurs montants, métadonnées, remises et droits ne sont pas réécrits.
- Une remise de 100 % conserve le parcours atomique sans Stripe : justificatif, utilisation du code, snapshot et tokens familiaux.
- Une place supplémentaire coûte 0,70 €. Un montant positif après remise inférieur au minimum EUR de 0,50 € est refusé explicitement, sans arrondi, quantité supplémentaire ou droit gratuit. Voir la [documentation Stripe](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts).

## Migration locale

`supabase/migrations/20261102075451_rsvp_included_pricing_v3.sql`

Prérequis : historique déjà réconcilié, migrations `paid_publication_versions` et `promo_full_discount_free_publication` appliquées. Les anciennes migrations ne sont pas modifiées.

La migration est transactionnelle. Elle étend les contraintes pour v3, remplace le calcul des nouvelles réservations et ajoute une version tarifaire aux reçus de republication et aux justificatifs gratuits. Les anciennes lignes reçoivent explicitement l’étiquette v2 ; leurs champs financiers restent intacts.

La colonne `guest_license_payments.subtotal_amount` conserve ses valeurs stockées. Son expression générée est retirée et remplacée par un trigger de calcul versionné pour les nouvelles écritures et un contrôle de cohérence. Aucun UPDATE des anciens montants n’est exécuté.

`get_owner_rsvp_status` expose uniquement au propriétaire connecté la présence du formulaire réellement publié et l’existence de réponses historiques. Les anciennes réponses et les archives restent accessibles si le formulaire est retiré. Les insertions RSVP vérifient le questionnaire publié, le token et la capacité ; le lien commun ne contourne pas les liens familiaux obligatoires. RLS et restrictions des fonctions privilégiées sont conservées.

## Sources impactées

Frontend : tarification/commerce, récapitulatif de publication, éditeur RSVP, actions RSVP partagées, écran des faire-part publiés, tableau de bord, réponses/export/historique, services projets/commerce/RSVP et aide.

Edge Functions à mettre à jour avec leurs helpers :

1. `stripe-webhook` : code d’entrée inchangé, mais helpers de validation des reçus v1/v2/v3 à embarquer.
2. `submit-rsvp` : contrôle du vrai questionnaire publié, sans exigence d’achat séparé.
3. `create-commerce-checkout` : fermeture des nouveaux achats RSVP, maintien des commandes sur mesure.
4. `create-checkout-session` : nouvelle grille, contrôle de version et minimum Stripe.

`validate-promo-code` et l’administration des codes restent compatibles sans modification : 1 à 100 %. Aucun changement des secrets Stripe ni de leur validation de signature. Conserver la configuration historique RSVP nécessaire aux anciens paiements tant que ces parcours restent pris en charge.

## Validation locale

Suite Node 22.23.4 : 571 tests réussis, zéro échec, zéro test ignoré. Build TypeScript/Vite réussi ; avertissement existant sur la taille du bundle. `git diff --check` propre.

Les nouvelles migrations s’exécutent après les migrations historiques dans PostgreSQL embarqué PGlite. Tests des montants 1/40/41/50/100 invités, RSVP avec/sans supplément nul, première publication payée/gratuite, rejouabilité gratuite, portée des promos, refus du supplément RSVP séparé, petits montants, nouvelle version/cancellation, capacité, tokens, snapshot actif, droits propriétaire, RSVP et réponses conservées. Les reçus v2 en attente sont comparés avant/après migration puis finalisés sans changement de prix. Les métadonnées Stripe historiques v1/v2 et les versions v2/v3 sont vérifiées séparément.

Contrôles navigateur isolés : récapitulatif, total 0,00 €, bouton « Publier gratuitement », mention « Inclus », absence du bouton Réponses sans questionnaire publié, présence avec questionnaire et accès distinct à l’historique. Fenêtre visible et défilable à 390×844, 768×1024 et 1440×900. Supabase et Stripe sont simulés ; aucune donnée réelle n’est utilisée.

Ces contrôles ne constituent pas une validation d’une migration sur la base hébergée ni d’un paiement bancaire réel.

## Déploiement à effectuer uniquement après accord

1. Vérifier la sauvegarde récente, l’historique distant et les sessions Stripe encore ouvertes ; ne pas réappliquer les migrations déjà présentes.
2. Activer `PAYMENTS_MAINTENANCE=true` pour les deux fonctions de création de paiement. Vérifier HTTP 503 et `Retry-After`. Maintenir `stripe-webhook`, les liens familiaux et RSVP disponibles.
3. Déployer `stripe-webhook` avec les helpers compatibles v1/v2/v3. Cette version sait encore lire les anciens reçus avant migration.
4. Appliquer uniquement la nouvelle migration transactionnelle. Contrôler contraintes, ACL, anciens reçus, capacités et snapshots.
5. Déployer `submit-rsvp`, `create-commerce-checkout`, puis `create-checkout-session` avec tous leurs helpers, en gardant la maintenance active.
6. Publier le frontend sur le site Netlify existant. Le handshake `guest-v3` refuse les anciennes interfaces en cache plutôt que de facturer un prix différent de celui affiché.
7. Vérifier avec des projets synthétiques identifiés : code 100 %, snapshot et liens, réponses/historique, ancien client, nouvelle version et augmentation de capacité. Aucun achat bancaire réel sans autorisation distincte.
8. Réouvrir les achats avec `PAYMENTS_MAINTENANCE=false` seulement après validation de toute la chaîne.

En cas d’échec : garder la création des achats bloquée et le webhook compatible actif. Corriger en avant ; ne pas restaurer automatiquement une ancienne base, supprimer des justificatifs ou remettre un ancien webhook incapable de lire v3. Une fois des reçus v3 créés, un retour aux anciennes fonctions de paiement serait incompatible.

## Inventaire des fichiers modifiés ou ajoutés

- `src/components/toolbar/TopToolbar.tsx`
- `src/config/commerce.ts`
- `src/config/pricing.ts`
- `src/features/rsvp/RsvpFormEditor.tsx`
- `src/features/tutorial/tutorialConfig.ts`
- `src/pages/EditorPage.tsx`
- `src/pages/HomePage.tsx`
- `src/pages/RsvpResponsesPage.tsx`
- `src/services/commerceRepository.ts`
- `src/services/projectRepository.ts`
- `src/services/rsvpRepository.ts`
- `supabase/functions/_shared/guestPayment.ts`
- `supabase/functions/_shared/pricing.ts`
- `supabase/functions/_shared/publicationVersions.ts`
- `supabase/functions/create-checkout-session/index.ts`
- `supabase/functions/create-commerce-checkout/index.ts`
- `supabase/functions/submit-rsvp/index.ts`
- `tests/guest-checkout-webhook.test.mjs`
- `tests/guest-pricing.test.mjs`
- `tests/guest-project-data.test.mjs`
- `tests/publication-version-checkout.test.mjs`
- `tests/publication-versions.browser.tsx`
- `tests/publication-versions.mock.tsx`
- `tests/recipient-rsvp-edge.test.mjs`
- `docs/pricing-v3-rsvp-included.md`
- `src/features/rsvp/PublishedRsvpActions.tsx`
- `src/features/rsvp/usePublishedRsvpStatus.ts`
- `supabase/functions/_shared/publishedRsvp.ts`
- `supabase/migrations/20261102075451_rsvp_included_pricing_v3.sql`
- `tests/pricing-v3-sql.test.mjs`
- `tests/published-rsvp.test.mjs`
