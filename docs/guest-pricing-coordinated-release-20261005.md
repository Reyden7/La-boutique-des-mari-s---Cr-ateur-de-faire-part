# Bascule coordonnée guest-v1 — 5 octobre 2026

Ce rapport complète le rapport historique `guest-pricing-production-audit-20261005.md` : la bascule, précédemment différée, est désormais effectuée.

## Versions effectivement en production

- Supabase : `saaqgyjqecqbzizacvrp`.
- `create-checkout-session` : **v15 ACTIVE**, `verify_jwt=true`, source locale guest-v1. Les quatre fichiers TypeScript relus dans le bundle déployé correspondent aux sources testées.
- SHA256 du bundle Checkout : `c42151ad7d01ebd16d93a9a2ba3cd47fc91ab855c8b5e62eb13e3daff4a4067e`.
- `stripe-webhook` : **v15 ACTIVE**, inchangé, `verify_jwt=false` au gateway ; vérification de signature Stripe conservée. Compatible guest-v1 et anciens paiements.
- Aucun redéploiement commerce, RSVP, templates ou assets. Aucune nouvelle migration nécessaire pendant cette bascule.
- Aucun secret Stripe ou réglage Netlify modifié.

## Vérifications après déploiement Checkout, avant déploiement frontend

- Audit SQL distant : **152/152 assertions réussies**, transaction terminée par `ROLLBACK`.
- Tests automatisés locaux : **79/79 réussis**, aucun échec ni test ignoré.
- Les handlers sont exécutés avec adaptateurs Stripe/Supabase simulés : aucune requête de création de session Stripe réelle.
- Montants, capacités, blocs, metadata Session/PaymentIntent, droits Formulaire, remboursements, replay, rétrocompatibilité et protection client contrôlés.
- Montant frontend falsifié ignoré par le handler ; cohérence des montants imposée par les RPC/contraintes.
- Upgrades : 40→47 = 4,50 € ; 40→54 = 9,00 € ; 47→54 = 4,50 € ; 54→53 = 0 €, capacité 54 conservée.
- Quatre assertions de conservation des données préexistantes réussies dans le même snapshot transactionnel. Aucun projet/paiement d'audit persistant après rollback.
- Lecture finale : zéro ligne dans `guest_license_payments`, zéro dans `rsvp_addon_purchases` ; l'unique ligne préexistante de `project_payments` est conservée.

## Frontend Netlify

- Commit poussé sur `main` : `2cbe61e479ab37bf587f7139d4154b454b77247d`.
- Déploiement Git Netlify : `6ac3b441fe22f800097442f3`.
- Site existant : `8113c245-f04b-4be4-81ea-21e64d30eee5`.
- Statut confirmé : **ready**, contexte **production**, `error_message=null`.
- Publication : `2026-10-05T14:29:33.496Z`.
- URL : https://laboutiquedesmaries.fr.
- `npm run build` : **réussi** (TypeScript + Vite). Warning non bloquant : bundle JavaScript supérieur à 500 kB.

## Contrôles réels de la modale en production

Les valeurs suivantes ont été saisies dans la modale sur des projets existants, sans cliquer sur « Payer et publier » et sans modifier leur contenu :

| Invités | Sans Formulaire | Avec Formulaire | Capacité |
| --- | --- | --- | --- |
| 40 | 24,50 € | 34,40 € | 40 |
| 41 | 29,00 € | 38,90 € | 47 |
| 47 | 29,00 € | 38,90 € | 47 |
| 48 | 33,50 € | 43,40 € | 54 |
| 54 | 33,50 € | 43,40 € | 54 |

- Parité constatée entre affichage frontend et devis serveur : base 2 450 cents, tranche de sept 450 cents, option Formulaire 990 cents.
- Confirmation Smartphone/Tablette/PC : décochée à l'ouverture ; bouton désactivé ; cocher active le bouton ; décocher le désactive ; fermeture/réouverture réinitialise la confirmation.
- Contrôle effectué avec et sans Formulaire et sur les trois formats sélectionnés dans l'éditeur. Contrôles complémentaires aux viewports Smartphone 390×844, Tablette 768×1024 et PC 1440×1000 : total correct et bouton bloqué sans confirmation.
- Modale refermée à la fin ; override de viewport supprimé.
- Capture : `release-evidence-20261005/pricing-54-form.jpg` (54 invités avec Formulaire, total 43,40 €).

## Limites explicites et sécurité

- **Aucun Checkout live déclenché, aucun paiement live effectué, aucune clé/secret Stripe modifié.**
- Paiement Stripe end-to-end, livraison réelle du webhook et remboursement Stripe réel : **non réalisés**, conformément à la demande.
- Anciennes publications : compatibilité validée par fixtures transactionnelles et tests de handlers legacy ; aucune publication historique payée n'était disponible dans la base pour un contrôle réel supplémentaire.
- Backend et frontend coordonnés techniquement validés ; le premier paiement réel reste à la décision de l'utilisateur.
- Ce rapport et la capture sont des preuves locales post-déploiement, non incluses dans le commit frontend ci-dessus.
