# Bibliothèque générale — bases, rabats et cachets

## Statut

Implémentation locale terminée ; backend Supabase déployé le 7 octobre 2026,
après autorisation explicite. Aucun déploiement Netlify ni changement de secret.
Les fixtures de l’audit production ont toutes été annulées par ROLLBACK.
L’animation Smartphone, sa géométrie, ses timings et le rendu Tablette/PC n’ont
pas été modifiés par cette extension de la bibliothèque.

## Données et fichiers

La table existante `global_assets` conserve ses champs et ses policies admin.
Sa colonne `type` accepte déjà du texte : les trois catégories sont
`envelope_base`, `envelope_flap`, `envelope_seal`. L’état serveur
`delete_pending` protège les suppressions multi-étapes ; il n’est pas modifiable
par le navigateur. Aucun nouveau bucket n’est créé.

Chemins : `global-assets/envelope/bases/{uuid}-asset.png|webp`,
`global-assets/envelope/flaps/{uuid}-asset.png|webp`,
`global-assets/envelope/seals/{uuid}-asset.png|webp`.

Référence sauvegardée dans `opening.envelope.baseAsset`, `flapAsset`, `sealAsset` :

```ts
{ type: "global", id: globalAssetId, url: assetUrl, name: assetName }
```

La résolution utilise cette URL sauvegardée, pas la disponibilité actuelle dans
la bibliothèque. Renommer/dépublier ne change ni ID, ni URL, ni un snapshot déjà
créé. Les projets anciens, les imports de projet, les presets locaux et les
gabarits téléchargeables restent compatibles. Les templates conservent les refs
globales : aucune copie de ces fichiers vers `template-assets`.

## Interface

- `/admin/assets` : trois filtres, import direct avec Type/Nom/Fichier,
  aperçu sur damier avant publication, miniatures lazy, renommage, rang et
  Monter/Descendre, publication/dépublication, contrôle préalable à suppression.
- PNG/WebP uniquement, extension et MIME cohérents, 5 MiB maximum. Le navigateur
  décode l’image ; le serveur vérifie signature/dimensions et détermine ses
  métadonnées. Limite de sécurité : 40 mégapixels et 16384 px par côté.
- Dimensions différentes du gabarit et transparence probablement absente :
  avertissements non bloquants. La vérification de transparence échantillonne
  seulement un aperçu ; aucun traitement n’est appliqué aux octets uploadés.
- Les sélecteurs Base/Rabat/Cachet présentent presets locaux, bibliothèque
  générale triée par rang, puis imports du projet. Les catégories ne se mélangent
  pas. Les non-admins n’ont pas accès à la page de gestion.
- Invalidation immédiate du cache après mutation dans la session ; protection
  contre les réponses obsolètes. Les autres sessions récupèrent les mises à jour
  lors des rafraîchissements de bibliothèque (cache 30 s, sondage 30 s/focus).
  Pas de reload complet ni de changement automatique d’une sélection existante.

## Sécurité et suppression

La fonction existante `publish-global-asset` reste sous `verify_jwt = true` et
vérifie `auth.getUser()` puis `app_metadata.role === "admin"`, jamais
`user_metadata`. Elle accepte désormais le multipart pour les imports directs
d’enveloppe. Les autres publications JSON depuis un projet sont conservées.
Les policies Storage existantes restent sans écriture navigateur : les fichiers
sont écrits/supprimés exclusivement côté serveur via l’API Storage.

Dépublier est l’action normale : retire seulement le choix, garde le fichier.
Supprimer affiche les nombres de projets/templates utilisateurs de l’asset.
Les références sont recherchées dans tous les propriétaires (URL ou ID dans le
JSON), et non seulement les projets de l’admin. Si utilisé, suppression interdite.
Des correspondances conservatrices dans le JSON peuvent volontairement bloquer
une suppression douteuse. Un fichier partagé avec une autre entrée est aussi
protégé.

Après confirmation d’un asset inutilisé : réservation DB atomique/unpublication,
API Storage remove, puis finalisation DB. Un verrou transactionnel par asset et
des triggers ciblés empêchent une sauvegarde concurrente pendant suppression ;
les URLs locales de cette bibliothèque devenues absentes sont aussi refusées.
Les fonctions privilégiées vivent dans `private`, avec wrappers publics invoker
et grants minimum. Le navigateur admin ne peut pas appeler les RPC de suppression
ni contourner le contrôle via un DELETE direct ou changer l’identité de l’asset.
Les fonctions Stripe/RSVP et leurs règles n’ont pas été modifiées.

Si Storage ou la finalisation DB échoue, le modèle reste réservé et non publié.
L’admin voit « Suppression à finaliser » et peut réessayer. Il n’est pas republié
automatiquement. La suppression Storage n’est jamais effectuée par SQL.

## Vérifications réalisées

- Suite locale complète : **362 tests, 362 réussis, 0 échec, 0 ignoré**.
- PostgreSQL/PGlite : migration réelle + script
  `supabase/tests/envelope_global_assets_rls_audit.sql` : **24 contrôles**, RLS
  admin/non-admin, identité stable, références inter-propriétaires, réservation,
  refus des URLs pending/supprimées. **ROLLBACK** confirmé : aucune fixture ou
  modification de rôle Auth ne subsiste, tables temporaires supprimées.
- Vrais handlers Edge avec Auth/DB/Storage simulés : trois catégories, upload
  global direct, octets/alpha inchangés, MIME/dimensions serveur, WebP VP8/VP8L/VP8X,
  refus anonymes/non-admins, extension/MIME/signature/taille incorrects, copie
  depuis un projet, erreurs upload/insert/remove/finalisation.
- Template : les trois refs globales sont conservées sans copie Storage ;
  sauvegarde/rechargement JSON et instanciation indépendante vérifiés.
- Navigateur local, vraies interfaces avec backend en mémoire : import manuel
  d’une base PNG transparente et aperçu avant publication ; choix des trois
  catégories à partir de fixtures ; filtres, renommage, ordre, sélection non-admin,
  garde de route admin, reload JSON, dépublication et refus de supprimer un modèle
  utilisé. Aperçu/Public chargent les mêmes trois URLs originales, y compris
  celle dépubliée ; ouverture jusqu’à « Faire-part ouvert » vérifiée.
- `deno check` du handler : OK. `npm run build` : OK. Avertissement Vite existant :
  chunk JS supérieur à 500 kB. `git diff --check` : OK.

Preuves locales : `docs/qa/20261007-envelope-global-admin/admin-final.png`,
`admin-reference-guard.png`, `preview-unpublished-reference.png`,
`public-unpublished-reference.png`. Ce ne sont pas des captures de production.

## Déploiement Supabase effectué le 7 octobre 2026

- Projet : `saaqgyjqecqbzizacvrp`.
- SQL exact de `20261007075714_envelope_global_assets_admin.sql` appliqué via MCP.
  Supabase a enregistré la migration sous la version **20261007083948**, nom
  `envelope_global_assets_admin`. Ne pas réappliquer le fichier local : son
  timestamp diffère de celui attribué par MCP, mais son contenu est déjà installé.
- `publish-global-asset` : **v2 ACTIVE**, `verify_jwt = true` ; les cinq fichiers
  déployés ont été comparés au code local et sont identiques.
- Audit transactionnel exécuté sur Supabase jusqu’au **ROLLBACK**, tous les
  contrôles réussis ; zéro asset/projet/template d’audit restant, comme avant.
- RPC suppression réservées au service_role ; usage avec garde admin ; RLS et
  bucket public `global-assets` inchangés, PNG/WebP autorisés.
- Appel multipart sans authentification : **401**, aucune écriture.
- Advisors sécurité : avertissements préexistants uniquement, sur les fonctions
  publiques de projets/templates et la protection des mots de passe compromis.
- Suite locale relancée : **362/362**, `npm run build` OK (warning chunk existant).
- Aucun secret, fonction Stripe/RSVP ou déploiement Netlify modifié.
- Import authentifié réel non rejoué : aucune session navigateur disponible.
  L’utilisateur peut retenter « Publier » avec son fichier déjà choisi.

## Plan initial de déploiement (historique)

1. Appliquer `20261007075714_envelope_global_assets_admin.sql` après les migrations
   existantes templates/global-assets. Ne pas appliquer les anciennes migrations
   une deuxième fois.
2. Déployer `publish-global-asset` avec ses dépendances `_shared/envelopeFormats.ts`
   et `verify_jwt = true`, sans modification de secrets.
3. Exécuter l’audit SQL transactionnel sur Supabase et contrôler son ROLLBACK.
4. Déployer le frontend puis faire le smoke test authentifié et les uploads réels
   PNG/WebP dans Supabase. Noter la nouvelle version de la fonction à ce moment.

Les uploads/suppressions réels Storage restent non réalisés par l’agent. Les tests
de concurrence sont des validations des états/guards en PostgreSQL local, pas
un test de charge multi-connexions sur la production.

## Fichiers de production concernés

- `src/types/globalAssets.ts`
- `src/services/globalAssetRepository.ts`
- `src/hooks/useGlobalAssets.ts`
- `src/features/openings/envelopeAssets.ts`
- `src/features/openings/EnvelopeAssetControls.tsx`
- `src/components/admin/GlobalEnvelopeAssetImport.tsx`
- `src/pages/AdminAssetsPage.tsx`
- `src/styles.css` (styles admin seulement pour cette tâche)
- `supabase/functions/publish-global-asset/index.ts`
- `supabase/functions/_shared/envelopeFormats.ts`
- `supabase/migrations/20261007075714_envelope_global_assets_admin.sql`
