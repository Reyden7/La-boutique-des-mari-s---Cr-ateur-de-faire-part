# Vidéos de présentation des miniatures — 14 octobre 2026

## Périmètre

Import manuel uniquement : aucun enregistrement automatique du canvas ni bouton d’enregistrement dans l’éditeur. Les vidéos concernent les cartes d’accueil et la galerie de templates, pas le faire-part lui-même. Les introductions, Preview/Public, prix et droits d’achat restent inchangés.

## Utilisation

- Projets : action « Vidéo de présentation » à côté des actions existantes.
- Admin : même action sur chaque ligne dans `/admin/templates`.
- Fenêtre commune : importer, remplacer, voir et retirer la vidéo avec confirmation.
- Formats MP4/WebM, maximum 15 MiB (15 Mo affichés). Contrôle de l’extension, du MIME et de la signature du conteneur avant upload. Conseils affichés : 5–15 secondes, 480p/720p, 24/30 fps, sans audio, MP4 H.264 recommandé. Pas de compression automatique.
- Chaque upload utilise un nouveau UUID. La référence est enregistrée avec contrôle de modification concurrente avant le nettoyage de l’ancien fichier. Modifier la vidéo d’un template ne réécrit pas son contenu.

## Lecture

`HoverVideoThumbnail` est partagé par les deux galeries. L’image ou le contenu statique actuel reste visible jusqu’à la première image vidéo décodée. Aucun élément vidéo ni URL signée n’est créé au montage des cartes.

Au survol souris : chargement différé, `muted`, `loop`, `playsInline`, `preload="none"`, sans contrôles. Sortie : pause, retour à zéro et suppression du lecteur. Un coordinateur partagé arrête la précédente présentation. Arrêt également lors du masquage de l’onglet, perte de focus, sortie de la zone visible ou démontage. Les erreurs et refus de `play()` conservent le contenu statique.

Sur tactile et avec `prefers-reduced-motion`, pas d’autoplay : bouton lire/arrêter discret. Son clic ne déclenche pas l’ouverture du projet. Les boutons Aperçu/Utiliser restent distincts.

## Migration et sécurité

À appliquer **avant les imports en production** :

`supabase/migrations/20261014072906_card_preview_videos.sql`

Elle ajoute les colonnes facultatives `projects.preview_video_path` et `templates.preview_video_path`, le bucket privé `card-preview-videos`, les règles RLS et une file de nettoyage transactionnelle. Les anciennes lignes restent à NULL ; aucun contenu vidéo n’entre dans `project_data`. Les duplications/instanciations ne réutilisent pas la vidéo privée d’un autre projet.

Chemins :

```text
projects/{userId}/{projectId}/{uuid}.mp4|webm
templates/{templateId}/{uuid}.mp4|webm
```

- Projet : lecture/upload/suppression réservés au propriétaire authentifié non anonyme, même si le projet est publié ou acheté. Le rôle admin n’accorde pas de lecture des vidéos privées d’autrui.
- Template : écriture admin uniquement ; lecture des brouillons admin uniquement ; lecture du fichier actuellement associé à un template publié autorisée publiquement par RLS.
- Pas d’overwrite Storage : nouvelle clé à chaque remplacement. Validation DB du chemin, de l’existence de l’objet, de la taille et du MIME ; limite/MIME également configurés sur le bucket.
- URLs signées de 5 minutes, cache mémoire de 4 minutes partitionné par utilisateur, résolution uniquement à la demande. Aucune URL signée persistée. Une URL déjà signée reste utilisable jusqu’à expiration ou suppression du fichier ; dépublier n’annule pas instantanément ce jeton.
- Un trigger met en file l’ancienne référence après remplacement/retrait/suppression du parent. Suppression des octets via l’API Storage, jamais par SQL sur `storage.objects`. Les échecs restent en file et sont retentés à la prochaine visite accueil/admin ou opération vidéo. Pas de worker périodique ajouté. Si la connexion disparaît avant même la mise en file d’un upload non associé, un fichier orphelin peut nécessiter un nettoyage administratif.

Les skills Supabase et Postgres ont guidé le bucket privé, les règles d’accès, les URLs temporaires et les tests de sécurité. Références officielles : [contrôle d’accès Storage](https://supabase.com/docs/guides/storage/security/access-control), [téléchargements et URLs signées](https://supabase.com/docs/guides/storage/serving/downloads).

**Aucune migration distante, aucun upload réel et aucun déploiement effectués.** Les vérifications SQL sont locales ; aucun résultat d’advisor distant n’est revendiqué.

## Fichiers

Composants et helpers créés :

- `src/features/previewVideos/HoverVideoThumbnail.tsx`
- `src/features/previewVideos/PreviewVideoManager.tsx`
- `src/features/previewVideos/previewVideo.ts`
- `src/features/previewVideos/previewVideos.css`
- `src/services/previewVideoRepository.ts`

Intégration :

- `src/pages/HomePage.tsx`
- `src/pages/AdminTemplatesPage.tsx`
- `src/services/projectRepository.ts`
- `src/services/templateRepository.ts`
- `src/types/editor.ts`
- `src/types/templates.ts`
- `src/utils/templateSnapshot.ts`
- `src/styles.css` (préservation de la mise en page des cartes)

Migration, tests et QA :

- `supabase/migrations/20261014072906_card_preview_videos.sql`
- `tests/preview-videos.test.mjs`
- `tests/preview-video-sql.test.mjs`
- `tests/guest-project-data.test.mjs` (mock du nouveau service de nettoyage)
- `tests/preview-videos.browser.html`
- `tests/preview-videos.browser.tsx`
- `tests/preview-videos.mock.tsx`
- `tests/preview-videos.vite.mjs`

## Vérifications

- **485 tests passent**, sans tests ignorés, avec Node 22 et PGlite pour les tests SQL.
- Validation MP4/WebM, taille, erreurs d’upload/enregistrement/concurrence, remplacement, retrait, nettoyage différé, signatures, sauvegarde/rechargement et exclusion des vidéos des snapshots.
- Migration exécutée sur Postgres local PGlite : propriétaire/autre utilisateur/admin/anon/session anonyme, template publié/brouillon, chemins invalides, objet absent/trop gros, file de nettoyage et permissions des fonctions.
- Skill Computer Use : navigateur local avec les vrais composants Home/Admin et un client Supabase simulé en mémoire. Import projet, lecture du fichier, remplacement et nettoyage ; import admin sur deux templates ; zéro lecteur avant survol ; lecture silencieuse/en boucle ; passage d’une carte à l’autre (un seul lecteur) ; arrêt en sortie ; aperçu interactif et retour ; sortie avant réponse lente ; fichier indisponible sans erreur JS.
- Largeurs 390×844 et 820×1180 : bouton tactile lire/arrêter, pas de navigation accidentelle. Branches tactile/mouvement réduit simulées dans la fixture ; pas de validation sur appareil physique. Un débordement horizontal préexistant du bandeau admin de l’accueil a été observé à 390 px, indépendant des cartes vidéo et non modifié dans cette tâche.
- **`npm run build` passe.** Avertissement existant de bundle supérieur à 500 ko ; pas d’erreur TypeScript.
- `git diff --check` passe.

Le WebM synthétique produit par la fixture sert uniquement de fichier de test local : ce n’est pas une fonctionnalité d’enregistrement des projets.

Captures : `preview-videos-project-20261014.jpg`, `preview-videos-templates-20261014.jpg`, `preview-videos-mobile-20261014.jpg`.
