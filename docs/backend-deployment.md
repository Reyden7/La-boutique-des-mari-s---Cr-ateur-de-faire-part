# Déploiement backend de production

Projet Supabase détecté : `saaqgyjqecqbzizacvrp`  
Domaine public : `https://www.laboutiquedesmaries.fr`

## 1. Préparer la CLI Supabase

Depuis la racine du dépôt :

```powershell
npm exec --yes supabase@latest -- login
npm exec --yes supabase@latest -- link --project-ref saaqgyjqecqbzizacvrp
npm exec --yes supabase@latest -- migration list
```

Le mot de passe demandé par `link` est le mot de passe Postgres du projet, pas
le mot de passe du compte Supabase.

## 2. Vérifier puis appliquer les migrations

```powershell
npm exec --yes supabase@latest -- db push --linked --dry-run
npm exec --yes supabase@latest -- db push --linked
npm exec --yes supabase@latest -- migration list
```

Le dry-run doit proposer, au minimum si elles ne sont pas déjà appliquées :

- `202609270006_scrollable_fonts_commerce_rsvp.sql`
- `202609270007_backend_security_hardening.sql`
- `20260927135223_combined_publication_form.sql`

Ne pas utiliser `migration repair` sauf si l’historique distant est réellement
désynchronisé du schéma.

## 3. Secrets Edge Functions

Créer localement `supabase/.env.production.local`. Ce fichier est couvert par
`.gitignore` et ne doit jamais être commité :

```ini
SITE_URL=https://www.laboutiquedesmaries.fr
STRIPE_SECRET_KEY=rk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RSVP_ADDON_PRICE_CENTS=990
RSVP_ABUSE_SALT=<secret-aleatoire-d-au-moins-32-caracteres>
RESEND_API_KEY=re_...
RSVP_EMAIL_FROM=Formulaire <rsvp@laboutiquedesmaries.fr>
```

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement
par Supabase. Les noms commençant par `SUPABASE_` sont réservés et ne doivent
pas être envoyés avec `secrets set`.

Après avoir créé le webhook Stripe et récupéré son secret `whsec_...` :

```powershell
npm exec --yes supabase@latest -- secrets set --env-file supabase/.env.production.local --project-ref saaqgyjqecqbzizacvrp
npm exec --yes supabase@latest -- secrets list --project-ref saaqgyjqecqbzizacvrp
```

La clé Stripe recommandée est une clé restreinte donnant seulement les droits
nécessaires à Checkout Sessions et à leur lecture. Utiliser une clé de sandbox
pour la recette, puis une clé live distincte pour la production.

## 4. Déployer les Edge Functions

```powershell
npm exec --yes supabase@latest -- functions deploy create-checkout-session --project-ref saaqgyjqecqbzizacvrp --use-api
npm exec --yes supabase@latest -- functions deploy create-commerce-checkout --project-ref saaqgyjqecqbzizacvrp --use-api
npm exec --yes supabase@latest -- functions deploy stripe-webhook --project-ref saaqgyjqecqbzizacvrp --use-api
npm exec --yes supabase@latest -- functions deploy submit-rsvp --project-ref saaqgyjqecqbzizacvrp --use-api
```

`supabase/config.toml` conserve la vérification JWT pour les deux créations de
Checkout. Elle est désactivée uniquement pour le webhook Stripe signé et pour
la soumission RSVP publique, qui refait toutes les validations côté serveur.

## 5. Stripe

Créer un endpoint webhook dans Stripe Workbench :

```text
https://saaqgyjqecqbzizacvrp.supabase.co/functions/v1/stripe-webhook
```

Événements nécessaires :

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `charge.refunded`

Copier son secret de signature dans `STRIPE_WEBHOOK_SECRET`, puis relancer
`secrets set`. Les trois flux utilisent `purchase_type` : `publication`,
`custom_invitation` et `rsvp_addon`. Aucun routage ne dépend du montant seul.

## 6. Supabase Auth et frontend

Dans **Authentication > URL Configuration** :

```text
Site URL: https://www.laboutiquedesmaries.fr
Redirect URL: https://www.laboutiquedesmaries.fr/**
```

Dans les réglages Auth :

- désactiver les connexions anonymes ;
- activer la protection contre les mots de passe compromis ;
- conserver la confirmation email activée pour la production.

Variables du build frontend :

```ini
VITE_SUPABASE_URL=https://saaqgyjqecqbzizacvrp.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_RSVP_ADDON_PRICE_CENTS=990
```

La valeur Vite du formulaire n’est qu’un affichage. La facturation utilise
uniquement `RSVP_ADDON_PRICE_CENTS` dans les Edge Functions. Pour un projet neuf,
le supplément est ajouté au paiement de publication et finalisé dans la même
transaction logique. `create-commerce-checkout` ne facture séparément le
formulaire que pour un projet déjà payé et publié.

## 7. Resend

Ajouter et vérifier `laboutiquedesmaries.fr` dans Resend, publier les entrées DNS
SPF/DKIM demandées, puis utiliser une adresse du domaine vérifié, par exemple :

```ini
RSVP_EMAIL_FROM=Formulaire <rsvp@laboutiquedesmaries.fr>
```

L’adresse destinataire n’est jamais reçue du formulaire public : la fonction la
charge via Supabase Auth avec l’`owner_id` du projet.

## 8. Contrôles après déploiement

Dans Supabase, exécuter les Security et Performance Advisors. Vérifier également :

- que `custom-request-assets` est privé ;
- que `wedding-assets` reste public pour le rendu des médias et polices ;
- que `anon` n’a aucun droit direct sur `rsvp_responses` ;
- que seules les fonctions publiques prévues sont exécutables par `anon` ;
- qu’aucune clé `service_role`, Stripe ou Resend n’est présente dans le bundle frontend.

L’advisor peut continuer à signaler `get_public_project` comme fonction
`SECURITY DEFINER` exécutable par `anon`. C’est l’unique exception intentionnelle :
elle ne retourne que le projet payé, publié et non expiré correspondant au
`public_id`, sans `owner_id`, email, identifiants Stripe ni état interne de paiement.
