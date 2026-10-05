# Tarification invités — préparation locale, pas encore déployée

## Contrat commercial

Source partagée : `supabase/functions/_shared/pricing.ts`, réexportée par `src/config/pricing.ts`.

```ts
extraBlocks = Math.max(0, Math.ceil((guestCount - 40) / 7));
guestCapacity = 40 + extraBlocks * 7;
invitationPriceCents = 2450 + extraBlocks * 450;
totalPriceCents = invitationPriceCents + (hasForm ? 990 : 0);
additionalBlocks = Math.max(0, newExtraBlocks - purchasedExtraBlocks);
upgradePriceCents = additionalBlocks * 450;
```

Les nombres sont des entiers, de 1 à 100 000 (borne technique explicite).
La capacité n'est **pas** un compteur de visiteurs. Aucun IP, fingerprint ou
blocage de device n'est ajouté.

Une licence est liée à un projet / événement par son paiement initial et son
`publication_license_id`. Cela prépare une future politique anti-réutilisation
et les deux republications gratuites ; ces mécanismes ne sont pas implémentés
dans cette livraison. Modifier actuellement un faire-part publié reste possible.

## Données et droits

| Emplacement | Champs | Autorité |
| --- | --- | --- |
| `projects.project_data` | `requestedGuestCount` | Déclaration éditable, sans droit acheté |
| `projects` | `purchased_guest_capacity`, `purchased_extra_blocks`, `publication_license_id` | Serveur uniquement |
| `project_payments` | `pricing_version`, `guest_count`, `guest_capacity`, `guest_extra_blocks` | Reçu de publication initiale |
| `guest_license_payments` | Devis historique, type, nombre, capacité, blocs précédents/additionnels, formulaire, montant, session/intent, état | Réservation serveur puis validation webhook |

Le frontend charge les droits depuis les colonnes SQL, jamais depuis JSON.
`saveRemoteProject` les retire du JSON transmis ; un trigger SQL les retire aussi
et bloque la modification directe des colonnes. Le booléen `rsvp.purchased`
reste calculé par le trigger existant depuis les achats payés.

RLS : lecture des reçus par leur propriétaire authentifié non anonyme seulement.
Aucun INSERT/UPDATE/DELETE client. Les RPC de réservation/finalisation/échec/
remboursement sont réservées à `service_role` avec `search_path = ''`.

## Checkout et webhook

`create-checkout-session` reçoit uniquement `projectId` et `guestCount`.
Il valide la session avec Auth, l'ownership, l'entier et l'état de la licence.
La réservation SQL verrouille le projet, calcule le tarif à nouveau et conserve
un seul reçu pending. Un bail de préparation de 10 minutes empêche les doubles
Checkout concurrents. Une session identique est réutilisée ; une session ouverte
obsolète est expirée. Une session complète en paiement différé n'est pas remplacée.

Stripe reçoit des lignes séparées (base, blocs, formulaire), les mêmes metadata
sur Session et PaymentIntent, et une clé d'idempotence basée sur le reçu.
Une extension contient seulement les blocs supplémentaires, sans base ni formulaire.

Metadata : `receipt_id`, `project_id`, `owner_id`, `pricing_version`, `purchase_type`,
`guest_count`, `guest_capacity`, `extra_blocks`, `previous_extra_blocks`,
`additional_blocks`, `has_form` et les anciennes clés formulaire compatibles.

Le webhook vérifie la signature, le montant/devise Stripe et chaque metadata
contre le reçu sauvegardé. Il ne valide les droits qu'après `payment_status=paid`.
La finalisation SQL est atomique : paiement, publication, lien stable, capacité et
option formulaire. Le navigateur et la page de succès ne peuvent rien accorder.
Pour une extension, la page de succès attend le paiement du reçu correspondant,
pas seulement l'état déjà publié du projet.

Rejouer un événement ne double ni le paiement ni la capacité. Une baisse de la
déclaration ne réduit jamais les droits. Seul un remboursement complet signé
retire les blocs réellement remboursés. Une publication combinée remboursée
redevient draft/refunded et perd son formulaire inclus ; un formulaire acheté
séparément n'est pas retiré par ce remboursement. Un événement de paiement tardif
ne réactive pas un reçu remboursé.

## Compatibilité

- Les reçus existants gardent leur montant, leur identifiant Stripe et la version
  `legacy`. Les sessions historiques à 24,90 / 34,80 € conservent leur chemin webhook.
- Pas de quota imposé rétroactivement aux anciens achats : capacité et blocs
  restent NULL. Leur interface ne propose pas de nouvelle facturation invités.
- L'achat séparé du formulaire après publication et les demandes sur mesure
  gardent leur Checkout existant. `create-commerce-checkout` / `submit-rsvp` ne changent pas.
- Les snapshots et créations depuis template ne transmettent aucun droit de licence.
- Aucun renderer, layout responsive ou identifiant public existant n'est modifié.
- Le checkbox de confirmation des trois formats reste local, obligatoire et remis
  à false à chaque ouverture. Le nombre d'invités n'est persisté qu'à la confirmation.

## Migration à autoriser

`20261005083522_guest_count_publication_pricing.sql` est préparée **localement**.
Elle ajoute les colonnes / table ci-dessus, contraintes et index, la RLS, le
trigger de protection, et ces RPC service-only :

- `reserve_guest_checkout`
- `finalize_guest_checkout`
- `fail_guest_checkout`
- `refund_guest_checkout`

Elle adapte `finalize_project_payment` pour soustraire le bon tarif de publication
avant d'attribuer exactement 990 cents au formulaire. La logique historique reste
2490 cents. `refund_project_payment` et `fail_project_payment` restent inchangées.
Le helper privé `refresh_guest_capacity` recalcule les blocs payés ; le sanitizer
privé de templates retire les nouveaux champs commerciaux sans perdre l'ancien
nettoyage. Les contraintes SQL dupliquent intentionnellement la formule afin de
ne pas dépendre de JavaScript ; l'audit teste leur concordance à tous les paliers.

### Ordre recommandé après autorisation explicite

1. Vérifier sauvegarde / historique distant, grants et versions des fonctions.
2. Appliquer la migration dans un environnement de validation ; audit SQL et Advisors.
3. Appliquer la migration en production. Aucun ancien reçu payé n'est réécrit.
4. Déployer **d'abord `stripe-webhook`** (`verify_jwt=false`, signature Stripe obligatoire),
   puis **`create-checkout-session`** (`verify_jwt=true`). Le webhook est rétrocompatible.
5. Déployer le frontend après le backend. Sinon, les anciens clients sans `guestCount`
   seront refusés proprement ; éviter cet intervalle par une courte fenêtre de maintenance.
6. Vérifier `RSVP_ADDON_PRICE_CENTS=990` sans modifier les secrets dans cette tâche.
7. Paiements Stripe de test : base, tranche, combiné, upgrade, formulaire séparé,
   paiement différé, rejeu et remboursement complet ; vérifier les droits et le lien public.
8. Tests applicatifs de template, sauvegarde/rechargement, Preview/Public puis Advisors.

Ne pas lancer de restauration destructive pour revenir en arrière : les nouveaux
reçus exigent que le webhook guest-v1 reste disponible. En cas d'incident, suspendre
les nouveaux Checkout et conserver la migration / le webhook pour solder les paiements.

## Validation locale réalisée

- Suite Node : paliers avec/sans formulaire, extensions, refus des valeurs invalides,
  simulation des véritables handlers Edge, metadata altérées, session absente/anonyme,
  ownership, concurrence refusée, anciennes transactions, échec / remboursement.
- PostgreSQL en mémoire (PGlite, installé hors dépôt) : migration exécutée, calculs
  SQL indépendants, RLS / grants, protection JSON, publication + formulaire atomique,
  extension, baisse de déclaration, rejeu, remboursement avant/après finalisation,
  conservation du formulaire séparé, snapshots ; transaction terminée par ROLLBACK.
  Le bootstrap reproduit les tables concernées et utilise les fonctions historiques
  du dépôt, y compris leur migration corrective RSVP. Seul le générateur d'octets
  pgcrypto est simulé ; ce n'est pas un test de toute la plateforme Supabase.
- Navigateur : modale réelle avec adaptateur Checkout isolé, neuf paliers sans
  formulaire, quatre paliers combinés pour chaque format éditeur, checkbox / reset,
  champ vide refusé, transmission de 54 et extension 40→54 à 9 € ; aucune erreur console.
- `npm run build` réussi ; avertissement existant de bundle >500 kB.

**Pas de migration distante, déploiement, paiement réel ni modification de secret.**
Les paiements de bout en bout, Advisors et tests production restent à exécuter après
votre autorisation de déploiement.
