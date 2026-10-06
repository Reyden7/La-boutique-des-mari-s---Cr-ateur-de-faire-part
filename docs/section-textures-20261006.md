# Matières de fond de section — 6 octobre 2026

> Le comportement Couleur + texture décrit dans ce premier rapport a été corrigé ensuite : voir `section-material-color-20261006.md`. Le réglage devient une intensité de relief préservant la teinte, et non une superposition opaque de papier coloré.

## Fonctionnement

Dans Section > Fond : Couleur, Texture, Couleur + texture, et les choix Dégradé / Image existants. Une bibliothèque de onze SVG légers, autonomes et déterministes fournit les matières. Aucun téléchargement, upload Storage ou nouvelle dépendance.

Textures : Papier doux, Papier froissé, Papier aquarelle, Papier vintage, Grain léger, Toile / canvas, Nuage doux, Texture organique, Bruit fin, Parchemin, Papier humide. Le choix Aucune est disponible.

La texture appartient uniquement à la surface de fond. Elle passe dans les mêmes clips de coins arrondis et de bordures haute/basse que le fond existant. Les enfants restent hors de ces clips, sans déplacement, changement de padding ni interception des événements. Le marqueur de dernière section et le calcul de hauteur du document ne changent pas.

Les styles de fond restent communs aux supports, comme auparavant ; les géométries et les bordures responsive existantes restent indépendantes. Le helper partagé recalcule l'application pour la largeur/hauteur effective de chaque support. Le rendu normal par opacité est retenu, sans modes de fusion. L'import de textures personnalisées n'est pas ajouté dans cette version.

## Données

```ts
// SectionElement — propriétés facultatives
background: { type: "color", color: "#ead9c2" }; // structure existante inchangée
backgroundType?: "color" | "texture" | "color-texture";
textureId?: string;
textureOpacity?: number; // 0..1 ; défaut 0.3
textureScale?: number;   // 0.125..4 ; défaut 1
textureFit?: "cover" | "contain" | "repeat"; // défaut repeat
```

Sans backgroundType, le fond actuel (couleur, dégradé ou image) est rendu strictement comme avant. Le mode Texture n'affiche pas le fond de couleur ; le mode Couleur + texture conserve la couleur sous la matière. Sans texture sélectionnée, aucune matière n'est rendue. La palette accepte toujours les couleurs alpha existantes.

Une tuile a une taille logique de 256 × 256, multipliée par textureScale. Couvrir et Contenir utilisent respectivement le plus grand / le plus petit côté de la section, puis appliquent cette échelle, avec centrage. L'échelle est un zoom volontaire : une valeur inférieure à 100 % peut laisser de l'espace en mode Couvrir, une valeur supérieure peut déborder en mode Contenir ; les découpes limitent toujours le dessin à la section.

## Implémentation et fichiers

- `src/types/editor.ts` : propriétés facultatives de SectionElement.
- `src/config/sectionTextures.ts` : catalogue et helper `resolveSectionTexture` partagé.
- `src/features/elements/SectionBackgroundControls.tsx` : contrôles, miniatures lazy, opacité, échelle et application.
- `src/features/elements/RichElementProperties.tsx` : intégration dans Fond, conservation de l'upload de fond existant.
- `src/features/elements/SectionSurface.tsx` : couche SVG utilisée par Aperçu et Public.
- `src/features/elements/SectionCanvasSurface.tsx` : même source et géométrie dans Konva ; pattern natif pour les répétitions, dessin unique pour Couvrir/Contenir. La bounding box logique reste fixe même pour une texture seule ou transparente.
- `src/styles.css` : miniatures et contrôles.
- `tests/section-textures.test.mjs` : six tests de données, rendu réel React et persistance.
- `tests/section-textures.browser.html` / `.tsx` : vérifications locales des vrais EditorCanvas, PropertiesPanel et WeddingRenderer.
- Ce rapport et `docs/qa/20261006-section-textures/` : preuve visuelle et résultats des comparaisons.

## Validation

- **312 tests réussis**, zéro échec. Les nouveaux tests couvrent les onze sources autonomes, anciens fonds, texture seule/combinée/aucune, clamps/fallbacks, géométrie des trois modes, clips sur les trois supports, vrai store, undo/redo, duplication, sauvegarde locale/rechargement et instanciation de template.
- **65 configurations navigateur en Aperçu + 65 en Public** : trois supports × trois types × trois applications × avec/sans bordure basse déchirée (54), puis chaque texture intégrée (11). Comparaison pixel des surfaces Konva et SVG sérialisé : différence moyenne maximale **0.631 / 255**, attribuable aux interpolations/arrondis Canvas/SVG ; aucune différence de composition. Bounds Konva inchangés et texte lisible au-dessus.
- Onze miniatures chargées, chacune en 256 × 256.
- Sélection par le vrai panneau, opacité 0 % : texture invisible, texte et fond conservés ; comparaison parfaite.
- Opacité 60 % et échelle 400 % : rendu cohérent ; retour 100 % puis rechargement JSON : configuration et rendu conservés.
- `npm run build` : **OK** ; avertissement existant sur la taille du bundle > 500 kB, sans erreur.

Ces tests utilisent un projet en mémoire, sans autosave distant. Le renderer Public est vérifié localement, pas sur une publication de production. Aucune migration, modification de secrets, opération de paiement ou mise en production.
