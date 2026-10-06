# Image — bordures décoratives et fondu/flou

Implémentation locale du 6 octobre 2026. Aucun déploiement, paiement, changement de secret ou écriture Supabase.

## Propriétés et compatibilité

Le panneau suit désormais : Disposition → Importation → Ajustement → Apparence → Animation.

- Ajustement : contain/cover, crop non destructif, flips, opacité globale, rotation.
- Apparence : bordure haute, bordure basse, fondu haut, fondu bas, cadre existant.
- Les huit presets de Section sont réutilisés, ainsi que leurs miniatures et contrôles : aucune, déchirure, vagues, festonné, oblique, zigzag, nuage, papier découpé.
- Chaque bordure conserve `enabled`, `style`, `height`, `intensity` (amplitude 0..1), `inverted`.
- Chaque fondu conserve `enabled`, `height`, `intensity`, `blur`, `opacity` (opacité finale).
- Absence de configuration : effets désactivés, rendu historique inchangé. L’import existant conserve `fit: contain` et animation `none`.
- Valeurs lors de l’activation d’un fondu : hauteur 80 px, intensité .65, flou 6 px, opacité finale 0.

Structure dans les données existantes :

```ts
imageStyle: {
  frame?: ImageFrameConfig,
  transform?: Partial<ImageTransformConfig>,
  appearance?: {
    topEdge?: SectionEdgeConfig,
    bottomEdge?: SectionEdgeConfig,
    topFade?: ImageFadeConfig,
    bottomFade?: ImageFadeConfig,
  },
  responsive?: {
    tablet?: Partial<ImageTransformConfig> & { appearance?: ImageAppearanceConfig },
    desktop?: Partial<ImageTransformConfig> & { appearance?: ImageAppearanceConfig },
  },
}
```

L’Apparence est éditée uniquement sur le support actif. Avant un changement Smartphone, les apparences héritées des deux autres supports sont matérialisées. Les transforms et les layouts géométriques sont préservés. Une modification ultérieure du crop/flip Tablette/PC conserve également `appearance` dans cet override.

## Pipeline commun

`composeImageAppearance()` calcule les mêmes pixels pour Konva et le canvas DOM utilisé par le renderer commun Preview/Public (également réutilisé par la Page d’accueil).

1. Calcul contain/cover et crop existant via `getImageRenderLayout()`.
2. Retournements du contenu, sans modifier le fichier source.
3. Clip via le polygone déterministe de `getSectionShape()`.
4. Flou réel Canvas2D, mélangé progressivement dans les bandes activées seulement.
5. Masques alpha progressifs haut/bas ; smoothstep puis courbe d’intensité.
6. Rotation centrée, opacité globale et animation restent dans les wrappers existants.

Les finitions suivent la partie visible de la photo : pas le vide de letterboxing en mode contain. Les bandes haut/bas restent indépendantes des flips. Le flou utilise `source-atop` pour ne pas remplir les trous alpha d’un PNG ni sortir de la silhouette. Le cadre est conservé et ne subit pas le fondu de la photo. Une opacité finale de 0 révèle le fond réel derrière l’image ; aucune couleur de fond artificielle n’est ajoutée.

Le traitement est mémorisé : pas de recomposition au déplacement, à la sélection, à la rotation ou au changement d’opacité globale. Résolution au plus 2x, 4096 px sur un axe et 2 millions de pixels ; buffers temporaires libérés immédiatement. Aucun `getImageData` dans le code de production. Pas de nouvelle dépendance.

Le chargement demande CORS anonyme lorsque les effets sont actifs, avec un fallback pour ne pas rendre inutilisables les anciennes sources externes ne proposant pas CORS. Konva ignore les résultats de chargements devenus obsolètes ; le DOM invalide explicitement le compositing à chaque nouveau chargement du même nœud `<img>`.

## Vérifications réalisées

- Suite Node complète : **282 tests réussis**, 0 échec, 0 ignoré.
- 28 nouveaux tests (26 logique, 2 store/persistence) : valeurs par défaut, normalisation, huit formes sur chaque bord, indépendance responsive, crop/flip, courbe alpha, contain/cover, buffers bornés, sauvegarde/rechargement, duplication, snapshots de template, verrouillage, undo/redo.
- Navigateur Chromium local, vrais `EditorCanvas`, `PropertiesPanel` et `WeddingRenderer` : **48 configurations Preview et 48 Public**. Huit configurations de finitions × deux modes contain/cover × trois supports. Recadrage, flips X/Y, rotations 45°/-25°, opacité .65, bande haute/basse, styles et inversion couverts.
- Comparaison de tous les canaux du compositing DOM/Konva : différence maximale **1/255** sur quelques canaux (arrondis de draw/readback du navigateur), aucun écart visuel important.
- Contrôles pixel dédiés : alpha progressivement décroissant ; contraste réellement réduit par le flou ; milieu hors bande inchangé ; trou transparent d’un PNG toujours transparent.
- Manipulations UI : hauteur et inversion de bordure, amplitude, hauteur du fondu, flou, opacité finale, désactivation complète et retour au rendu normal, rechargement JSON, resize via largeur, changement de source, cadre Polaroid.
- Aucune erreur JavaScript dans la console du test.
- `npm run build` final : **OK**. Seul avertissement Vite : bundle principal dépassant 500 kB (déjà existant).
- `git diff --check` : OK (avertissements LF/CRLF Windows uniquement).

Limites : contrôles réalisés localement, pas sur une publication de production ni par nouvel upload Storage. Les formats Smartphone/Tablette/PC sont les layouts logiques réels, pas trois appareils physiques. Safari/Firefox n’ont pas été exécutés dans cette session. Les animations restent sur le wrapper commun existant ; pas de modification de leurs timings.

## Fichiers de cette modification

Production :

- `src/types/editor.ts`
- `src/utils/imageLayout.ts`
- `src/utils/imageAppearance.ts` (nouveau)
- `src/features/images/useImageAppearance.ts` (nouveau)
- `src/features/images/ImageAppearanceProperties.tsx` (nouveau)
- `src/features/images/ImageContentRenderer.tsx`
- `src/features/images/ImageFrameRenderer.tsx`
- `src/features/images/ImageFrameProperties.tsx`
- `src/components/editor/EditorCanvas.tsx`
- `src/components/properties/PropertiesPanel.tsx`
- `src/components/renderer/WeddingRenderer.tsx`
- `src/styles.css`

Tests et preuves :

- `tests/image-appearance.test.mjs`
- `tests/image-appearance-persistence.test.mjs`
- `tests/image-appearance.browser.html`
- `tests/image-appearance.browser.tsx`
- `docs/qa/20261006-image-appearance/wave-tear-fade-public.jpg`
- `docs/qa/20261006-image-appearance/polaroid-fade-public.jpg`

Les modifications préexistantes (Calendrier, Programme, Sections, etc.) sont conservées.
