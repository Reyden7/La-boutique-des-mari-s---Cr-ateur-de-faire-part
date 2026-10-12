# Portes personnalisables, taille responsive et effets texte — 12 octobre 2026

## Résultat

- Six paires intégrées : Ivoire et or, Bois et lierre, Ivoire botanique, Noir et magnolias, Glycine dorée, Vert et roses. Les douze PNG sont copiés sans modification. Le nouveau p2.Gauche remplace le premier fichier dupliqué.
- Sélection indépendante gauche/droite, imports utilisateur PNG/WebP, galerie globale admin, retrait des imports et téléchargement du modèle. Le composant d’import/sélection existant des enveloppes est partagé, pas dupliqué.
- Positions horizontale/verticale de chaque battant, de −50 à +50 %, indépendantes sur Smartphone, Tablette et PC.
- Taille globale de 50 à 150 %, pas de 5 %, avec valeur numérique éditable et reset à 100 % sur le support actif.
- Un seul groupe est mis à l’échelle uniformément autour du centre. Les distances de sortie sont calculées dans le repère du groupe pour sortir entièrement du viewport à toute taille.
- Le nom automatique du faire-part a été retiré de DoorsOpening. Seul « Cliquer pour ouvrir les portes » est affiché au centre ; il s’efface en 200 ms. Le bouton transparent couvrant la zone conserve le clic souris/tactile/clavier.
- Les deux panneaux glissent horizontalement, sans perspective, rotation 3D ou changement du contenu derrière. Le document reste monté, non interactif jusqu’à la fin. Replay et callbacks uniques sont conservés.
- Les modèles importés conservent leur bitmap, couleurs et alpha. Les couleurs/Style restent utilisables avec le modèle « Classique / couleurs personnalisables », généré en deux PNG ; ils ne teintent pas les illustrations.

## Données

Configuration dans opening.doors :

```ts
{
  leftAsset?: EnvelopeAssetRef;
  rightAsset?: EnvelopeAssetRef;
  customLefts?: EnvelopeAssetRef[];
  customRights?: EnvelopeAssetRef[];
  doorScale?: number; // fallback ancien format Smartphone, absent = 1
  responsive?: {
    mobile?: { leftClosedOffset?: { x: number; y: number }; rightClosedOffset?: { x: number; y: number }; scale?: number };
    tablet?: { leftClosedOffset?: { x: number; y: number }; rightClosedOffset?: { x: number; y: number }; scale?: number };
    desktop?: { leftClosedOffset?: { x: number; y: number }; rightClosedOffset?: { x: number; y: number }; scale?: number };
  };
}
```

Le format de référence existant est réutilisé : type preset/custom/global, id, url, name, assetId éventuel, width/height éventuels. Les anciennes portes sans référence gardent leurs réglages de style/couleur via le modèle généré. Sans taille, le rendu reste à 100 %. Sans position, le décalage est nul.

## Effets texte

Ajouts : Machine à écrire (curseur optionnel), Écriture manuscrite, Mot par mot, Lettre par lettre, Soulignement dessiné.
Les effets historiques et le défaut Aucune restent inchangés.

Les nouveaux effets utilisent un masque SVG animé sur le texte original, sans découpage en spans qui changerait crénage/ligatures/retours à la ligne. Les plages DOM sont mesurées hors rotation et zoom, puis recalculées sur redimensionnement et chargement des polices. Segmentation Unicode (accents combinés et emoji), durée totale/délai, viewport de Preview et reduced motion sont pris en compte. Le masque disparaît à la fin ; une erreur de mesure affiche le texte au lieu de le laisser caché.

L’écriture manuscrite est une simulation fluide, pas un tracé réel des contours de chaque police ; l’UI le précise. Dans le canvas de contenu, les textes restent statiques pour ne pas gêner leur positionnement. Les effets sont visibles via l’Aperçu de l’éditeur et le renderer Public commun.

## Bibliothèque admin et déploiement

Types ajoutés à global_assets : door_left et door_right.
Storage utilisateur : wedding-assets/{owner}/{project}/doors/left ou doors/right.
Storage global : global-assets/doors/left ou doors/right.

Les skills Supabase et Postgres ont guidé la réutilisation des permissions existantes : autorisation app_metadata admin côté serveur, service role non exposé au navigateur, validation extension/MIME/signature/dimensions/5 Mo, copie des octets d’origine. La suppression conserve les références utilisées, passe par une réservation et des verrous SQL, puis par l’API Storage. Les anciens noms de RPC d’enveloppe sont conservés et étendus aux portes pour la rétrocompatibilité.

Préparé localement, NON déployé :

1. Migration 20261012072232_door_global_assets_admin.sql, après la migration enveloppe existante.
2. Version locale de la fonction publish-global-asset.
3. Frontend local.

Aucun secret, paiement Stripe, projet Supabase distant ou site Netlify de production n’a été modifié. L’intégration admin réellement distante reste à vérifier après déploiement autorisé.

## Vérifications réalisées

- 457 tests automatisés : 457 réussis, zéro échec, zéro test ignoré, sous Node 22.23.3.
- Les 12 PNG : dimensions/alpha, côtés distincts, proportions uniformes et sortie complète.
- Géométrie aux tailles 50/75/100/125/150 %, supports 320×568, 390×844, 768×1024, 1440×900, positions normales et extrêmes.
- Store réel : indépendance des supports, undo/redo, sauvegarde/relecture et création depuis template.
- Vrai handler Edge exécuté avec clients simulés : imports des cinq catégories enveloppe/porte, MIME/octet source, erreurs, autorisation admin, suppression des deux dossiers de porte et rejet des chemins dangereux. Aucun appel cloud.
- PostgreSQL local PGlite : migration appliquée, 24 checks SQL/RLS historiques enveloppe et 24 checks portes, références multi-propriétaires/projets/templates, dépublication, réservation, droits admin/non-admin et URL obsolètes. ROLLBACK confirmé ; aucune fixture, mutation d’identité admin ou table temporaire d’audit persistante.
- Navigateur local, services isolés : galerie, import utilisateur p2.Gauche, sélection immédiate, positions, taille/relecture, ancien défaut 100 %, Editor fermé non interactif, Preview et renderer Public, clic d’ouverture, disparition du texte, suppression finale de l’overlay, replay, fallback PNG inaccessible.
- Contrôles visuels Smartphone 50/75/100 %, Tablette 125 %, PC/Public 150 %, paires Ivoire/Bois/Vert. Le vrai composant Preview conserve ses réglages responsive.
- Effets texte : état masqué puis final, apparition mot par mot intermédiaire visible, un seul nœud texte, alignement inchangé, mesures/polices, option curseur et simulation manuscrite. Dans Preview, les quatre premiers effets atteignent leur état final ; le dernier reste en attente quand il est hors viewport.
- Catégories et formulaire d’import gauche/droite visibles dans la page admin locale.
- deno check --no-lock --no-config supabase/functions/publish-global-asset/index.ts : réussi.
- npm run build : réussi (TypeScript + Vite). Avertissement existant conservé : bundle JS supérieur à 500 kB.

Pas de test Safari/iOS matériel ni d’import admin sur Supabase de production.

## Fichiers

Sources ajoutées :

- src/features/openings/doorAssets.ts
- src/features/openings/doorLayout.ts
- src/features/openings/DoorPositionControls.tsx
- src/features/openings/DoorSizeControls.tsx
- src/components/renderer/TextEntrance.tsx
- src/utils/textAnimation.ts

Sources modifiées :

- src/features/openings/animations/DoorsOpening.tsx
- src/features/openings/OpeningProperties.tsx
- src/features/openings/EnvelopeAssetControls.tsx
- src/features/openings/envelopeAssets.ts
- src/features/openings/registry/openingRegistry.ts
- src/components/editor/EditorCanvas.tsx
- src/components/properties/AnimationProperties.tsx
- src/components/properties/PropertiesPanel.tsx
- src/components/renderer/AnimatedElement.tsx
- src/components/renderer/WeddingRenderer.tsx
- src/components/admin/GlobalEnvelopeAssetImport.tsx
- src/pages/AdminAssetsPage.tsx
- src/services/assetRepository.ts
- src/services/globalAssetRepository.ts
- src/types/editor.ts
- src/types/globalAssets.ts
- src/styles.css (ancien CSS 3D porte retiré ; rideaux conservés)
- supabase/functions/_shared/envelopeFormats.ts
- supabase/functions/publish-global-asset/index.ts

Migration ajoutée : supabase/migrations/20261012072232_door_global_assets_admin.sql.

Assets ajoutés : public/assets/openings/doors/p1.Gauche.png et p1.Droite.png, puis les mêmes deux fichiers pour p2, p3, p4, p5 et p6.

Tests ajoutés : tests/doors-and-text.test.mjs, tests/doors-text.browser.html, tests/doors-text.browser.tsx, tests/doors-text.vite.mjs.
Tests étendus : tests/envelope-assets.test.mjs, tests/envelope-global-edge.test.mjs, tests/envelope-global-sql.test.mjs, tests/envelope-upload.test.mjs, tests/png-envelope-opening.test.mjs.

Documentation : ce rapport et doors-preview-20261012.jpg.
