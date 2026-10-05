# Déploiement tarification invités — 5 octobre 2026

## État final : validation technique réussie, déploiement partiel, Stripe E2E non réalisé

Projet Supabase : `saaqgyjqecqbzizacvrp`.

- Migration `20261005083522_guest_count_publication_pricing.sql` réellement appliquée par
  `supabase db push --linked --skip-vault --yes`. Le dry-run ne proposait que cette migration.
- Historique distant confirmé : version `20261005083522`, nom `guest_count_publication_pricing`.
- `stripe-webhook` déployé **en premier**, version **15**, `ACTIVE`, `verify_jwt=false`.
- `create-checkout-session` conservé en version **14**, `ACTIVE`, `verify_jwt=true`.
  La version guest-v1 n'est pas encore déployée.
- Frontend Netlify **non déployé**. Aucun nouveau commit frontend de production dans cette intervention.
- Base Git locale : `a01febcf06ba86078f45accd3797aad7e82e3fd6`. Les changements de tarification
  sont toujours dans le worktree, non commités.
- Aucun secret modifié. Fonctions commerce / RSVP / templates / assets non redéployées.
- Anti-réutilisation d'événement et limite de deux republications : non implémentées.

## Schéma vérifié

- `projects` : `purchased_guest_capacity`, `purchased_extra_blocks`, `publication_license_id`,
  contrainte `projects_guest_capacity_check`, trigger de protection et nettoyage du JSON.
- `project_payments` : `pricing_version`, `guest_count`, `guest_capacity`, `guest_extra_blocks`,
  absence de montant par défaut, contrainte `project_payments_guest_quote_check`.
- `guest_license_payments` : table, contraintes de devis et ownership, identifiants Stripe uniques,
  index propriétaire/projet et unicité d'une réservation en attente / publication initiale payée.
- RLS activée ; lecture propriétaire authentifié non anonyme ; aucun INSERT/UPDATE/DELETE client.
- RPC `reserve_guest_checkout`, `finalize_guest_checkout`, `fail_guest_checkout`,
  `refund_guest_checkout` et `finalize_project_payment` : actives, `search_path=''`,
  exécution refusée à `anon`/`authenticated`, autorisée à `service_role`.

## Tests réellement exécutés

### Supabase distant, transaction avec ROLLBACK : 103 / 103 réussis

Script : `supabase/tests/guest_pricing_rls_audit.sql`.
Il réutilise un utilisateur Auth existant sans le modifier. Tous les projets, paiements et
helpers créés par cet audit sont transactionnels. Les appels Stripe ne sont pas simulés par SQL :
les fixtures ont des identifiants synthétiques et testent directement les RPC, pas le transport webhook.

| Invités | Sans formulaire | Avec formulaire | Capacité |
| --- | --- | --- | --- |
| 1 / 40 | 24,50 € | 34,40 € | 40 |
| 41 / 47 | 29,00 € | 38,90 € | 47 |
| 48 / 54 | 33,50 € | 43,40 € | 54 |
| 55 / 61 | 38,00 € | 47,90 € | 61 |
| 62 | 42,50 € | 52,40 € | 68 |

Upgrades SQL : 40→47 = 4,50 € ; 40→54 = 9 € ; 47→54 = 4,50 € ;
54→53 = aucun Checkout / capacité 54 conservée.

Autres validations :

- finalisation initiale + formulaire atomique, montant formulaire toujours 990 cents ;
- replay de finalisation et remboursement sans doublon ni restauration des droits remboursés ;
- remboursement initial : dépublication, suppression de capacité, retrait du formulaire combiné ;
- remboursement upgrade : retrait des blocs concernés, publication initiale conservée ;
- ancien tarif 24,90 € / combiné 34,80 € sans nouvelles metadata : RPC compatibles, quota null ;
- ancien formulaire séparé : conservé au remboursement de publication, retiré lors de son propre remboursement ;
- `get_public_project` retourne le projet legacy payé et refuse le projet remboursé ;
- falsification du montant : RPC et contrainte refusent ;
- trois colonnes de droits payés : UPDATE client refusé ;
- ledger : INSERT/UPDATE/DELETE client et RPC de paiement refusés (SQLSTATE 42501) ;
- droits JSON supprimés, `rsvp.purchased` reste dérivé de l'achat réel ;
- autre propriétaire / utilisateur anonyme : pas d'accès ;
- sanitizer templates : nouveaux champs commerciaux supprimés.

Une erreur de préparation de fixture a été corrigée : le test d'achat formulaire séparé
omettait `amount_cents=990`, alors que la table de production n'a plus de valeur par défaut.
Ce n'était pas un bug des flows de paiement ; aucune migration corrective n'a été nécessaire.

Vérification **après ROLLBACK** (avant le contrôle UI ci-dessous) :
12 projets, 0 projet SQL d'audit, 0 `project_payments`, 0 `rsvp_addon_purchases`,
0 `guest_license_payments`. Empreinte d'état des 12 projets inchangée :
`fcfcc8d7e7790757e99a0b16e103e3e1`.

Il n'existait aucune publication ni aucun paiement historique dans cette base avant l'audit.
La compatibilité a donc été vérifiée sur des fixtures annulées, pas sur de véritables achats historiques.

### Handler Edge isolé / tests locaux

79 tests Node réussis, 0 échec, 0 skipped (PGlite activé).
Les handlers source réels sont exécutés avec des adaptateurs SDK Stripe/Supabase isolés :
18 paliers initial/formulaire, upgrades, montant frontend ignoré, auth/ownership,
réservation concurrente, session en attente, signature/metadata/montant falsifiés,
anciens paiements, formulaire séparé et sur-mesure.
Ces tests ne remplacent pas des paiements Stripe end-to-end.

`npm run build` réussi. Warning Vite : chunk JS > 500 kB (1 267,55 kB minifié).
`git diff --check` : pas d'erreur ; avertissements LF/CRLF seulement.

### Webhook réellement déployé

- POST sans signature : HTTP 400 `Missing Stripe-Signature`.
- POST avec signature invalide : HTTP 400 `Invalid webhook signature`.
- Gateway sans JWT confirmée, validation de signature toujours active.
- Aucun événement signé Stripe payé/rejoué/remboursé n'a encore été livré dans cet audit.

## Blocage Stripe constaté dans l'application

Le Dashboard fourni par l'utilisateur montre l'« environnement de test Digitalloom ».
Le connecteur Stripe n'expose toutefois que `acct_1UFFLCA749W5I0xC`, `livemode=true`.
Un lien de gestion des accès a été fourni pour ajouter le sandbox au connecteur.

Indépendamment du connecteur, le flow de publication **actuellement en production**
crée une session `cs_live_…`. Le serveur utilise donc la clé Stripe réelle.
Une carte de test ne peut pas valider ce Checkout. Le simple changement d'environnement
dans le Dashboard ou le connecteur ne change pas les secrets du serveur.

Un projet technique distinct a été créé pour ce contrôle :
`4edce66d-a9dc-40b0-a45f-684e02ee2d3a`, « Audit tarification — flow historique 24,90 € ».
Il est en brouillon, paiement en attente, reçu à 2490 cents, sans PaymentIntent réglé.
La page Checkout a été quittée via Retour : aucune carte saisie, aucun paiement effectué.
Ce projet UI et son reçu ne font pas partie des fixtures SQL avec rollback ; ils restent
présents pour reprise/nettoyage contrôlé. La session peut rester ouverte jusqu'à son expiration Stripe.
Le connecteur ne propose pas l'opération d'expiration de session recherchée ; aucune opération
destructive de nettoyage n'a été exécutée.

## Advisors

Sécurité : aucun avertissement portant sur les nouvelles RPC de paiement.
Notifications existantes :

- RPC publiques `SECURITY DEFINER` intentionnelles : `get_public_project` (anon + authenticated),
  `duplicate_template`, `instantiate_project_from_template`, `publish_project_as_template` (authenticated).
  [Advisor fonctions publiques](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
  [Advisor fonctions authentifiées](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- [Protection des mots de passe compromis désactivée](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Performance : 4 FK sans index couvrant, 15 notices initplan RLS, 9 index inutilisés.
Les nouvelles notices concernent notamment la FK `(project_id,owner_id)` de `guest_license_payments`
(un index par projet existe, mais pas d'index composite couvrant) et sa policy RLS.
Pas de changement des policies historiques ni suppression d'index dans cette intervention.
[FK/index](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[RLS initplan](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
[Index inutilisés](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
CLI v2.117.0 : version v2.119.0 disponible ; aucune mise à jour automatique.

## Audit final selon la décision utilisateur : SQL transactionnel et simulations uniquement

L'utilisateur a finalement choisi de ne pas créer de backend de test et de ne faire aucun
paiement, réel ou Stripe Test. La tentative préalable de création Supabase a été refusée
par la limite des deux projets gratuits actifs : **aucun projet créé**, aucun autre projet
suspendu ou supprimé. Les adaptations locales provisoires pour un environnement isolé
ont été retirées. Aucun secret, fonction distante ou site Netlify n'a été modifié pendant
cette validation finale. Les installations CLI temporaires n'ont créé aucun backend.

### Résultats finaux vérifiés à nouveau

- **152 / 152 assertions SQL distantes réussies**, sur le projet actuel, en transaction
  `BEGIN ISOLATION LEVEL REPEATABLE READ ... ROLLBACK`.
- **42 assertions du ledger** : reçu unique, statut paid/refunded, montant, invité/capacité,
  blocs, identifiants synthétiques de session/intent, replay et remboursement upgrade.
- Paliers : les neuf nombres demandés, avec/sans formulaire, montants et droits après finalisation.
- Upgrades : 40→47 = 450 cents ; 40→54 = 900 ; 47→54 = 450 ; 54→53 = 0, capacité 54 conservée.
- Achat séparé du formulaire **après une publication guest-v1 à 2450 cents** : 990 cents,
  activation et replay validés, capacité/publication inchangées. Son droit survit au
  remboursement de la publication, puis disparaît lors du remboursement de cet achat séparé.
- Remboursements combinés, remboursements d'extensions et anciens flows : validés en SQL.
- RLS et grants : aucun accès aux RPC de paiement pour `anon`/`authenticated`, exécution
  serveur seule ; droits achetés non éditables via colonnes ou JSON client.
- **79 / 79 tests Node réussis, aucun skipped**, incluant PostgreSQL local PGlite et les
  handlers source exécutés avec SDK Stripe/Supabase remplacés par des adaptateurs en mémoire.
- Metadata générées vérifiées explicitement : receipt/project/owner, purchase_type,
  pricing_version, guest_count, guest_capacity, extra_blocks, previous_extra_blocks,
  additional_blocks, has_form, includes_form, form_amount_cents. Metadata identiques
  sur Checkout Session et PaymentIntent. Le montant falsifié envoyé par le frontend est ignoré.
- `npm run build` : **OK** ; warning préexistant de chunk JS > 500 kB.
- `git diff --check` : **OK**, avertissements LF/CRLF seulement.

### ROLLBACK et absence de modification des données existantes

Une mesure globale d'empreinte des projets entre deux requêtes séparées a changé pendant
l'audit ; un projet existant présentait un `updated_at` récent. Cette mesure ne permet pas
de distinguer une activité simultanée de l'application et ne doit donc pas être annoncée
comme « inchangée ». Le script a été renforcé sans modifier le schéma distant : snapshot
temporaire des quatre tables métier et isolation repeatable-read.

Les quatre assertions `existing_rows_unchanged_*` passent : **chaque ligne préexistante de
projects, project_payments, guest_license_payments et rsvp_addon_purchases reste exactement
identique dans le snapshot de l'audit**. Les fixtures sont les seuls enregistrements ajoutés.

Contrôle séparé après le ROLLBACK :

- 13 projets existants, **0 projet `[Audit guest pricing]`** ;
- 1 reçu de publication préexistant, **0 reçu SQL `cs_audit_*`** ;
- **0 guest_license_payments**, **0 rsvp_addon_purchases** ;
- tables temporaires d'audit absentes ;
- empreinte du reçu préexistant inchangée : `62393e8bc94f4c2eb3b152a773e9292a`.

Le projet technique UI décrit précédemment reste préexistant à cette exécution ; aucun
nettoyage de ce projet ou de sa session Stripe live n'a été entrepris. Le « zéro fixture
persistée » concerne les fixtures des audits SQL, pas cet ancien projet UI.

### Ce qui reste non réalisé

**Tests Stripe end-to-end : NON RÉALISÉS.** Aucun paiement par carte, réel ou Test.
La signature du SDK est simulée dans les tests du handler ; cela valide les branches de
refus/acceptation, pas le transport cryptographique de bout en bout. La réception réelle
des événements signés, les replays Stripe, les remboursements Stripe et les paramètres
effectivement acceptés/produits par l'API Stripe restent à valider dans un environnement Test.

Scénarios différés : 40 sans formulaire ; 41 ; 54 avec formulaire ; upgrade 40→54 ; achat
formulaire après publication ; remboursement ; replay ; falsification frontend dans ce flow.
Ils passent en fixtures/simulations, **pas en paiement Stripe réel de test**.

### Versions et décision de déploiement

La migration `20261005083522` figure toujours dans l'historique distant.

| Fonction | État constaté | Action ultérieure |
| --- | --- | --- |
| `stripe-webhook` | v15 ACTIVE, verify_jwt=false | Déjà guest-v1 et rétrocompatible ; aucun redéploiement nécessaire si sources inchangées |
| `create-checkout-session` | v14 ACTIVE, verify_jwt=true, ancien tarif | Déployer les sources locales guest-v1 après décision explicite |
| `create-commerce-checkout` | v4 ACTIVE, verify_jwt=true | Aucun changement requis |
| `submit-rsvp` | v4 ACTIVE, verify_jwt=false | Aucun changement requis |

Lecture réelle du bundle webhook v15 : les quatre fichiers déployés (index.ts, http.ts,
guestPayment.ts, pricing.ts) correspondent aux fichiers locaux testés, après normalisation
des fins de ligne. SHA-256 du bundle déployé :
`30969f5e3aab9ce1347fb1b61e7ed5ca208258a09d71941877c19f43ccbe50f5`.

Empreintes SHA-256 des fichiers locaux à déployer avec Checkout (distinctes du hash de bundle) :

| Fichier | SHA-256 |
| --- | --- |
| create-checkout-session/index.ts | `D886B8B515ABFFBEE8D08C77438960642616FEBA05BBA357F48C3D85813BF99E` |
| _shared/guestPayment.ts | `019D98E2C6FB3838D4DC9299F62D9C370ACBC87F4507A99DF226281BC106D85B` |
| _shared/pricing.ts | `A061E71240145DFA155B0E0A4011DE61B33B34CA6790E9A3930C5EF55487A20A` |
| _shared/http.ts | `6FCA4821F2C7733B8F0618C4074833E313737AA79D1EA8F64C3AFD6F85687FA5` |

Le numéro de la future version Checkout sera attribué au déploiement ; ne pas confondre
`guest-v1` (version tarifaire) avec le compteur de déploiement Supabase. Les sources ne
sont pas encore commitées : le HEAD `a01febcf06ba86078f45accd3797aad7e82e3fd6` ne contient
pas les changements tarifaires du worktree.

**Conclusion technique :** les calculs, l'autorisation, les droits, le ledger et les
transitions SQL sont raisonnablement prêts techniquement au regard des tests exécutés.
Ce n'est pas une certification de l'intégration Stripe end-to-end ni une annonce que
la nouvelle tarification fonctionne déjà dans l'application de production.

**Frontend : attendre, ne pas le déployer seul.** Le frontend nouveau affiche 24,50 €,
alors que Checkout v14 facture encore l'ancien tarif. Inversement, l'ancien frontend
n'envoie pas guestCount, requis par le nouveau Checkout. Il faut une bascule coordonnée,
avec prise en compte des onglets anciens et possibilité de retour arrière. Idéalement,
attendre les tests Stripe Test avant cette bascule ; un lancement sans eux nécessite
une acceptation explicite de ce risque résiduel. Aucune bascule automatique effectuée.

Les Advisors relus restent identiques à ceux listés ci-dessus. Aucun warning de sécurité
sur les nouvelles RPC de paiement ; notices de performance à traiter séparément, sans
modifier les politiques ou le schéma pendant cet audit.
