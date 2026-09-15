# Le Bureau des Mariés Studio

MVP d’un studio de création de faire-part numériques interactifs, développé avec React, TypeScript, Vite, Tailwind CSS, Konva, Framer Motion et Zustand.

## Lancer le projet

```bash
npm install
npm run dev
```

## Fonctionnalités

- création vierge et trois modèles ;
- canvas mobile 390 × 844 avec zoom ;
- texte, image, formes et décorations ;
- déplacement, redimensionnement, rotation et calques ;
- propriétés typographiques, fonds et animations ;
- annuler/rétablir, copier/coller, duplication et raccourcis ;
- sauvegarde locale automatique ;
- moteur d’ouverture indépendant du design ;
- ouvertures Sans animation, Enveloppe, Rideaux et Porte ;
- prévisualisation et personnalisation des couleurs et de la durée ;
- bibliothèque musicale CC0, import audio personnel et lecture après interaction ;
- volume, boucle, fondu et contrôle pause/reprise côté invité ;
- aperçu complet avec ouverture et ambiance sonore ;
- publication payante sécurisée par Stripe Checkout et webhook Supabase sur `/i/:publicId`.

## Authentification Supabase

Le Studio utilise l’authentification Supabase par email et mot de passe. Activez
le provider Email dans `Authentication > Providers`. Selon votre environnement,
vous pouvez conserver la confirmation d’adresse email ou la désactiver pour les
tests locaux.

Les routes `/`, `/studio/*`, `/payment/success` et `/payment/cancel` exigent une
session authentifiée persistante. `/i/:publicId` reste publique. Les anciennes
sessions anonymes sont refusées et supprimées du navigateur au démarrage.

Un ancien projet local sans `ownerId` n’est jamais envoyé automatiquement : il
apparaît avec l’action explicite « Associer », qui l’insère en brouillon pour le
compte actuellement connecté.

## Publication Stripe en mode test

Le navigateur utilise uniquement les variables publiques suivantes :

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_or_publishable_key
```

Les secrets restent exclusivement dans les secrets des Supabase Edge Functions :

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=xxx
supabase secrets set SITE_URL=http://localhost:5173
```

Appliquer puis déployer :

```bash
supabase db push
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook --no-verify-jwt
```

Dans Stripe en mode test, créer un endpoint webhook vers
`https://<project-ref>.supabase.co/functions/v1/stripe-webhook` et activer :

- `checkout.session.completed` ;
- `checkout.session.async_payment_succeeded` ;
- `checkout.session.async_payment_failed` ;
- `charge.refunded`.

Le prix (2 490 centimes, EUR) est défini uniquement dans l’Edge Function. Le
frontend ne reçoit que l’URL Checkout. La page de succès attend ensuite que le
webhook signé ait marqué le projet `paid` et `published` avant d’afficher le lien.
Les fonctions refusent volontairement toute clé autre que `sk_test_` dans cette
première version.
