# Correction « Bucket not found » — 14 octobre 2026

## Cause confirmée et déploiement

Projet Supabase : `saaqgyjqecqbzizacvrp` — Faire part de mariage.

Le frontend utilisait déjà exactement **`card-preview-videos`**, via `PREVIEW_VIDEO_BUCKET` dans `src/features/previewVideos/previewVideo.ts`. Ce bucket, les deux colonnes `preview_video_path` et la file de nettoyage étaient absents du projet distant : la migration préparée lors de l’implémentation initiale n’avait pas été appliquée.

Les quatre buckets existants étaient publics ou dédiés aux demandes sur mesure ; aucun n’était adapté à la confidentialité des vidéos de projet. Ils n’ont pas été modifiés. Aucun deuxième bucket vidéo n’a été créé.

Migrations **déployées et vérifiées dans l’historique distant** :

1. `20261014072906_card_preview_videos.sql` — migration existante : bucket privé, colonnes facultatives, file de nettoyage, permissions et triggers.
2. `20261014095009_fix_preview_video_template_read_policy.sql` — nouvelle migration corrective ciblée : qualification explicite de `storage.objects.name` dans la lecture des templates publiés et les vérifications des parents à l’upload.

La vérification sur le schéma réel a révélé que `name` non qualifié se liait à `public.templates.name` ou `public.projects.name` dans les sous-requêtes. Cela bloquait la lecture des templates publiés et aurait bloqué les uploads utilisateurs après création du bucket. Le test Postgres reproduit désormais ces colonnes réelles pour prévenir cette régression.

Les migrations ont été exécutées individuellement via la CLI Supabase, puis leur application a été enregistrée avec `migration repair --status applied` sous leurs numéros locaux exacts. **Aucune autre migration en attente n’a été déployée ni réparée.** La migration initiale, une fois déployée, n’a pas été réécrite.

## Configuration et politiques

- Bucket : `card-preview-videos`, **`public = false`**.
- MIME autorisés : `video/mp4`, `video/webm`.
- Limite inchangée : **15 728 640 octets** (15 MiB, affichés « 15 Mo » dans l’application).
- Projet : lecture/import/retrait réservés au propriétaire authentifié non anonyme ; même un admin ne reçoit pas l’accès aux vidéos privées d’un autre compte.
- Template : import/retrait admin ; brouillon lisible uniquement par les admins ; fichier actuellement associé à un template publié lisible selon les règles de galerie existantes.
- Le remplacement utilise un nouvel UUID et une nouvelle référence : pas d’overwrite Storage ni de nouvelle permission UPDATE générale. L’ancien fichier est nettoyé seulement après enregistrement de la nouvelle référence.
- URLs signées temporaires conservées. Un bucket privé nécessite une requête autorisée ou une URL signée, contrairement à un bucket public qui contourne les contrôles de lecture. [Documentation officielle Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals).

Politiques Storage créées par la première migration :

- `preview videos owner or published template reads` — SELECT.
- `preview videos immutable uploads` — INSERT.
- `preview videos owner or admin cleanup` — DELETE.

La seconde migration corrige uniquement les expressions des deux premières.

Politiques de `public.preview_video_cleanup`, avec RLS activée :

- `preview retirement reads` — SELECT.
- `preview retirement acknowledgements` — DELETE.
- `preview retirement rollback candidates` — INSERT.

Triggers : `validate_project_preview`, `validate_template_preview`, `retire_project_preview`, `retire_template_preview`. Les fonctions privées de triggers ne sont pas exécutables directement par les clients.

## Fichiers modifiés dans cette correction

- `supabase/migrations/20261014095009_fix_preview_video_template_read_policy.sql` — nouveau.
- `tests/preview-video-sql.test.mjs` — schéma de test rapproché du schéma réel et application de la correction.
- `docs/preview-video-storage-fix-20261014.md` — ce compte rendu.

La migration initiale est réutilisée sans modification. **Aucun changement au frontend, aux miniatures statiques ou au lecteur vidéo.** Les modifications non committées de la refonte des animations restent intactes.

## Vérifications réalisées

- Inventaire distant avant/après, bucket privé, limite/MIME, colonnes, politiques, triggers, permissions et historique des deux migrations.
- API Storage réelle via CLI administrative : upload de trois petits WebM synthétiques (47 213 octets), lecture/téléchargement avec SHA-256 identique, suppression des trois fichiers. Aucun fichier utilisateur supprimé. Le fichier synthétique original reste disponible localement.
- Accès par URL publique anonyme au fichier privé refusé (HTTP 400, erreur Storage `NoSuchBucket`, comportement normal pour cette route publique d’un bucket privé).
- Type MIME `image/png` explicitement refusé par l’API (`InvalidMimeType`). Les MP4 et la limite de taille sont également couverts par la configuration distante et les tests de validation.
- Vérification sur le vrai Postgres avec identités SQL simulées et **transaction intégralement annulée** : propriétaire lit/associe/remplace/retire sa référence, retrait atomique en file, impossibilité de réassocier une référence retirée, autre propriétaire/admin refusé pour un projet privé, admin gère un template, brouillon inaccessible en anon, template publié lisible en anon. Aucun état de projet/template/publication n’a été conservé.
- Vérification finale : zéro objet de test restant et zéro tâche de nettoyage de test. Les tests n’ont pas laissé de vidéo associée à un projet ou à un template.
- Les uploads CLI utilisent les permissions administratives, pas une session utilisateur web : les autorisations d’INSERT sont testées séparément sur Postgres local avec les vrais noms de colonnes. Le test de rôle distant n’est pas présenté comme un login web réel.
- Tests existants du pipeline : validation MP4/WebM, remplacement, retrait, nettoyage différé, conflits, signatures temporaires et contrôle de lecture unique au survol. Aucun nouveau test navigateur connecté à un compte de production durant cette correction ; le lecteur n’a pas été changé.
- **495 tests passent**, sans échec ni test ignoré, dont les tests RLS Postgres locaux.
- **`npm run build` passe** sous Node 22 ; seul l’avertissement préexistant de taille de bundle demeure.
- `git diff --check` passe.

Les skills Supabase et Postgres ont guidé la vérification du schéma réel, le moindre privilège et le contrôle des migrations déployées. Le changelog/documentation officiels ont été consultés.

## Advisors

Audit de sécurité avant/après : aucune nouvelle alerte liée aux vidéos. Les avertissements préexistants sur les RPC publiques et la protection des mots de passe compromis sont hors périmètre et n’ont pas été modifiés : [RPC anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RPC authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [protection des mots de passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

L’index de la nouvelle file de nettoyage n’a encore aucun usage enregistré, ce qui est normal à sa création ; il est conservé. Les autres remarques de performance préexistantes n’ont pas été corrigées dans cette tâche.
