# Invitations personnalisées — bilan du 29 octobre 2026

## État de livraison

Le frontend est implémenté et compilé sous Node **22.23.4**. Les migrations et fonctions ci-dessous ont été effectivement déployées sur `saaqgyjqecqbzizacvrp`, puis relues à distance. Aucun paiement Stripe réel n’a été déclenché. Aucun compte ni destinataire de test n’a été créé dans la production.

Les changements Git restent non commités sur `main` ; dernier commit existant : `5559eee` (`aperçus bloqué`). Aucun push ni déploiement Netlify n’a été lancé.

## Fonctionnalités livrées

- Premier bouton de navigation « Liste des invités », grande modale, ajout/modification/retrait, recherche et totaux par foyer/personne.
- Import local CSV et XLSX, modèle Excel téléchargeable, prévisualisation, erreurs par ligne, doublons à confirmer et choix ajout/remplacement. XLS nécessite une conversion préalable en XLSX. Limites : 5 Mo, 10 000 foyers et 100 000 personnes.
- Mode découverte en mémoire, sans noms ni tokens dans localStorage ou project_data. Conversion de la liste dans sa table dédiée après création du projet authentifié.
- Publication avec récapitulatif de la liste ; refus d’une liste vide et calcul serveur depuis les destinataires persistés. 40 personnes incluses pour 2 450 centimes, puis 100 centimes par personne ; formulaire à 990 centimes. Capacité minimale achetée de 40.
- Tokens cryptographiques de 32 octets, stables par destinataire, attribués au paiement confirmé. Lien `/i/:publicId/:recipientToken`, message personnalisé et données limitées au foyer concerné.
- Formulaire existant conservé, présence et quota vérifiés côté serveur, réponse courante unique, édition configurable, questions personnalisées et notifications conservées.
- Page existante des réponses réutilisée avec choix du projet, statuts distincts En attente / Confirmé / Décliné, statistiques, détails et export CSV : `/dashboard/responses`. Ancienne route `/studio/:projectId/rsvp/responses` conservée.
- Copie et export des liens depuis la liste après publication. Renommer conserve le token ; retirer désactive le lien et conserve les réponses. Dépasser la capacité ne crée pas de places gratuites ; upgrade existant réutilisé.
- Lecture paginée des réponses afin de ne pas tronquer les statistiques à la première page REST.

## Migrations réellement déployées

Les identifiants distants ont été générés par le connecteur Supabase. Ne pas réappliquer ces SQL sous prétexte que leurs noms de fichiers locaux ont des horodatages antérieurs.

| SQL local | Version enregistrée à distance | Nom distant |
|---|---|---|
| `supabase/migrations/20261029122005_guest_per_person_pricing.sql` | `20261029122005` | `guest_per_person_pricing` |
| `supabase/migrations/20261029122036_invitation_recipients.sql` | `20261029122036` | `invitation_recipients` |

Le prérequis tarifaire existait localement mais n’était pas encore appliqué en production. Il conserve les reçus guest-v1 et les droits acquis, tout en introduisant guest-v2. Aucun historique de paiement n’a été recalculé par un UPDATE de données.

La nouvelle table `invitation_recipients` contient : `id`, `project_id`, `display_name`, `guest_count`, `allocated_guest_count`, `public_token`, `is_active`, `created_at`, `updated_at`. UUID stable, token unique, contraintes de taille/quantités, index de projet et FK avec suppression en cascade.

`projects` reçoit `recipient_list_revision` et `recipient_links_required`. `rsvp_responses` reçoit `recipient_id`, `attendance`, `present_count`, `answers_by_id`, `updated_at`, une FK composite au destinataire/projet et un index unique par destinataire non nul. Les anciennes réponses sans destinataire restent lisibles.

## Accès et fonctions SQL

RLS activée sur la nouvelle table : SELECT réservé au propriétaire authentifié non anonyme. Pas de lecture anonyme ni de modification directe depuis le navigateur. La gestion passe par `read_invitation_recipients` et `save_invitation_recipients`, avec contrôle du propriétaire et révision optimiste.

`recipient_checkout_total` et `submit_recipient_rsvp` sont réservées au service serveur. La réservation v2 recalcule le total sous verrou de projet. Un trigger de finalisation du paiement attribue les tokens dans la même transaction, sans doublons lors d’un webhook rejoué.

`get_recipient_invitation` est volontairement publique : le token constitue un secret d’accès à un seul foyer. Elle vérifie publication, paiement, expiration, activation et capacité ; elle ne renvoie pas les autres destinataires, tokens, réponses ni données internes de paiement. Le lien reste transférable. Le renderer applique une politique referrer restrictive pour ces liens.

Le lecteur public historique et les anciennes réponses sont conservés. Les nouveaux projets seulement imposent un lien personnel pour répondre. Les anciens projets payés sans capacité chiffrée ne reçoivent pas de droits inventés : leur lien commun continue à fonctionner, la transition de capacité nécessite une vérification de leurs droits existants.

Le nettoyage des templates retire les collections privées ; les destinataires et réponses appartiennent à des tables séparées et ne sont pas dupliqués avec le design.

## Edge Functions réellement déployées

| Fonction | Version distante | Statut | Vérification JWT passerelle |
|---|---:|---|---|
| `create-checkout-session` | 17 | ACTIVE | true |
| `stripe-webhook` | 17 | ACTIVE | false — signature Stripe vérifiée dans le handler |
| `submit-rsvp` | 5 | ACTIVE | false — validation du lien et des droits dans le handler |

Les fichiers d’entrée et toutes leurs dépendances embarquées ont été récupérés après déploiement et comparés au code local : identiques. Le bundler omet normalement les helpers non importés.

Supabase JS **2.116.0** dans le lockfile frontend et dans les imports npm des fonctions. Stripe **22.6.0** conservé. Frontend et Checkout utilisent `guest-v2` ; une ancienne UI est refusée par le contrôle de version plutôt que facturée selon un prix différent. Le webhook lit encore les reçus guest-v1 et les anciens paiements.

Aucune autre migration ou Edge Function n’est nécessaire pour cette refonte. Les migrations sans rapport n’ont pas été lancées.

## Vérifications et limites

- **539 tests réussis, 0 échec, 0 ignoré**, sous Node 22.23.4 ; inclut les tests PostgreSQL PGlite avec les migrations réelles, RLS, isolation propriétaire/visiteur, tarifs/promo, webhooks simulés, tokens, quotas, modification unique, désactivation et cascades.
- Deux des 539 tests ont été ajoutés en clôture pour vérifier la pagination des réponses et le refus d’un tableau silencieusement tronqué après erreur réseau.
- `npm run build` : **succès**, `tsc -b && vite build`. Avertissement non bloquant Vite sur la taille du bundle. `git diff --check` : succès.
- QA navigateur sur fixture locale : ajout, modification, fermeture/réouverture, Excel réel, prévisualisation/doublons/remplacement, CSV invalide avec erreurs et import bloqué, nom personnalisé, quota HTML maximum 4, questions personnalisées conservées. Dimensions contrôlées à 390, 768 et 1280 px. Le parsing CSV valide et les exports sont aussi testés automatiquement.
- Contrôle distant : 14 projets avant/après, empreinte des champs préexistants identique ; aucun paiement/réponse/destinataire créé. RLS active, lecture anonyme et écriture directe authentifiée interdites, token inexistant renvoie null.
- Aucun projet payé/publié présent dans cette base au moment du contrôle : pas de vieux lien réel disponible pour un test navigateur de production. Compatibilité vérifiée par tests et conservation du lecteur historique, sans inventer un paiement de test en production.
- Conseiller sécurité Supabase exécuté : avertissements attendus sur les RPC SECURITY DEFINER volontairement exposées, contrôlées par propriétaire ou token. L’avertissement préexistant « Leaked Password Protection Disabled » reste hors périmètre. Références : https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable et https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable .

## Netlify et erreur Bad Request

Le premier contrôle Netlify demandait une authentification. Après acceptation, les lectures ont réussi : aucun site correspondant au Bureau des Mariés n’est accessible dans ce compte. Seul un autre site a été renvoyé. Ce résultat n’indique donc ni réussite ni échec d’un build de ce projet. Aucun déploiement Netlify de cette refonte n’a été effectué ou confirmé.

La recherche de `Bad Request` dans les attributs des journaux Supabase disponibles sur la dernière fenêtre de 24 heures n’a renvoyé aucun résultat. La console de la fixture navigateur n’a pas d’erreur. L’origine exacte de `{"detail":"Bad Request"}` n’est pas déterminable avec les traces disponibles ; aucune preuve ne permet de l’attribuer au build ou aux migrations. Des erreurs de liaison/commande du navigateur ont été récupérées pendant la QA, sans perte du développement.

## Dernières actions pour publier

1. Inclure tous les fichiers modifiés **et les nouveaux fichiers non suivis** dans le commit de cette refonte, puis pousser sur le dépôt relié au bon site Netlify.
2. Déployer le frontend sur ce site avec Node 22 ; ne pas relancer les deux migrations appliquées. Si une synchronisation CLI des historiques est nécessaire, rapprocher les versions par nom/contenu ci-dessus avant tout `db push` global.
3. Vérifier les routes SPA `/i/:publicId/:recipientToken` et `/dashboard/responses`, un import depuis l’UI déployée et la lecture d’une invitation de test dans un environnement Stripe de test. Aucun paiement réel n’est nécessaire pour cette recette.
4. Pour une vérification via le connecteur Netlify, connecter le compte/équipe qui possède le site du Bureau des Mariés.

Le serveur de développement utilisateur `http://localhost:5173/` n’a pas été arrêté ni modifié.

## Fichiers de la refonte

Frontend modifié : `src/App.tsx`, `src/components/renderer/WeddingRenderer.tsx`, `src/components/sidebar/LeftSidebar.tsx`, `src/components/toolbar/TopToolbar.tsx`, `src/pages/EditorPage.tsx`, `src/pages/HomePage.tsx`, `src/pages/PublicInvitePage.tsx`, `src/pages/RsvpResponsesPage.tsx`, `src/features/discovery/persistGuestDraft.ts`, `src/features/rsvp/RsvpFormEditor.tsx`, `src/features/rsvp/RsvpFormRenderer.tsx`, `src/services/rsvpRepository.ts`, `src/types/editor.ts`, `src/utils/templateSnapshot.ts`.

Nouveaux modules : `src/features/recipients/recipientData.ts`, `recipientStore.ts`, `RecipientListModal.tsx`, `RecipientInvitationContext.tsx`, `RecipientSessionBoundary.tsx`, `recipients.css`, ainsi que `src/services/recipientRepository.ts` et `public/models/liste-invites.xlsx`.

Serveur modifié : `supabase/functions/create-checkout-session/index.ts`, `supabase/functions/submit-rsvp/index.ts`. Nouveau helper `supabase/functions/_shared/recipientRsvp.ts` et nouvelle migration `20261029122036_invitation_recipients.sql` (nom aligné sur la version distante). La migration tarifaire préexistante et le webhook local ont été déployés sans nouvelle modification de leurs sources.

Dépendances : `package.json`, `package-lock.json` (`read-excel-file` et outil de tests PostgreSQL PGlite).

Tests modifiés : `tests/auth-recovery.test.mjs`, `discovery.mock.tsx`, `discovery.test.mjs`, `guest-checkout-webhook.test.mjs`, `invitation-viewer.test.mjs`. Nouveaux tests : `recipients.test.mjs`, `recipients-sql.test.mjs`, `recipient-rsvp-edge.test.mjs`, `recipient-response-pages.test.mjs`, `recipients.browser.html`, `recipients.browser.tsx`, `tests/fixtures/recipients-invalid.csv`.
