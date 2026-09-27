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

## Paiements Stripe et fonctions backend

Le navigateur utilise uniquement les variables publiques suivantes :

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
VITE_RSVP_ADDON_PRICE_CENTS=990
```

Les secrets restent exclusivement dans les secrets des Supabase Edge Functions :

```bash
supabase secrets set STRIPE_SECRET_KEY=rk_live_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set SITE_URL=https://www.laboutiquedesmaries.fr
supabase secrets set RSVP_ADDON_PRICE_CENTS=990
supabase secrets set RSVP_ABUSE_SALT=<secret-aleatoire-de-32-caracteres-minimum>
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set 'RSVP_EMAIL_FROM=Formulaire <rsvp@laboutiquedesmaries.fr>'
```

Appliquer puis déployer :

```bash
supabase db push
supabase functions deploy create-checkout-session
supabase functions deploy create-commerce-checkout
supabase functions deploy stripe-webhook
supabase functions deploy submit-rsvp
```

Dans Stripe en mode test, créer un endpoint webhook vers
`https://<project-ref>.supabase.co/functions/v1/stripe-webhook` et activer :

- `checkout.session.completed` ;
- `checkout.session.async_payment_succeeded` ;
- `checkout.session.async_payment_failed` ;
- `charge.refunded`.

Les prix réellement facturés sont définis côté Edge Functions : 2 490 centimes
pour la publication, 5 000 centimes pour la commande sur mesure et
`RSVP_ADDON_PRICE_CENTS` pour l’option formulaire. Avant la première publication,
le supplément est inclus dans la même Checkout Session. Le checkout séparé reste
réservé à l’ajout du formulaire sur un projet déjà payé et publié. La variable
frontend du prix est uniquement informative. Le déblocage des achats dépend
exclusivement du webhook Stripe signé.

La procédure complète de mise en production se trouve dans
[`docs/backend-deployment.md`](docs/backend-deployment.md).
