# Sélecteur de format visible pendant le scroll

## Cause et correction

Le sélecteur était positionné en `absolute` dans `.editor-main`, qui est aussi le conteneur scrollable. Il défilait donc avec le document sur grand écran. Sur petit écran, une règle `fixed` séparée utilisait un décalage global de 66 px.

Le nouveau composant `EditorWorkspace` sépare le cadre central, son interface et son contenu :

```text
Topbar : première ligne du layout existant
Zone centrale : EditorWorkspace
  Sélecteur : ancré au cadre central, hors du scroll
  editor-main : scroll vertical/horizontal, EditorCanvas inchangé
  Contrôles de zoom existants
```

Il s'agit d'un équivalent propre au sticky : le sélecteur reste en `absolute` mais son parent ne défile plus. Cette séparation le garde également centré lors d'un débordement horizontal du document, ce qu'un sticky placé dans le contenu large ne garantit pas.

La zone centrale commence déjà sous la topbar grâce aux lignes de la grille. Le placement ne recalcule ni ne duplique sa hauteur : seul l'espacement décoratif existant (13 px, 8 px sur petit écran) est utilisé via `--editor-toolbar-gap`.

Le cadre possède un contexte de calques isolé. Le sélecteur conserve son z-index 20 local, son fond blanc semi-opaque, son ombre et son backdrop. Il reste au-dessus du canvas mais sous les interfaces globales, topbar, panneaux mobiles et modales. Aucun emplacement n'est ajouté au flux : padding et position initiale du canvas ne changent pas.

Les noms de page longs sont tronqués. Sur petit écran, les boutons compacts existants conservent leurs icônes, libellés accessibles et infobulles.

## Fichiers modifiés

- `src/components/editor/EditorWorkspace.tsx` : cadre central et interface hors scroll.
- `src/pages/EditorPage.tsx` : utilisation du cadre autour d'EditorCanvas.
- `src/styles.css` : ancrage, confinement et règle petits écrans.
- `tests/device-switcher.test.mjs` : trois tests de garde structurels.
- `tests/device-switcher.browser.html` et `.tsx` : banc local utilisant les vrais EditorCanvas, EditorWorkspace, PreviewDeviceSwitcher, ZoomControls et PreviewMode, sans autosave ni projet distant.
- `docs/layout-evidence-20261005/selecteur-format-scroll.jpg` : preuve visuelle locale, au milieu du document.

## Tests réalisés

- **126 tests Node passent**, zéro échec et zéro test ignoré. Les trois nouveaux tests sont structurels ; la géométrie est contrôlée dans le navigateur.
- **`npm run build` passe**. Avertissement existant de bundle supérieur à 500 kB, non bloquant.
- Navigateur local 1280 × 720 : Smartphone, Tablette et PC, tout en haut, au milieu et tout en bas d'un document d'environ 8 400 px logiques.
- Dans ces neuf cas, le sélecteur conserve exactement sa position (y = 81 px), reste centré dans la colonne centrale et ne chevauche pas la topbar (bas = 68 px). La position horizontale du canvas ne change pas pendant le scroll vertical.
- Changement de format alors que le document est déjà descendu : aucun déplacement du sélecteur.
- Canvas PC à zoom éditeur 100 %, avec scroll horizontal de 809 px : le sélecteur conserve son centre et sa position alors que le canvas se déplace.
- Panneaux latéraux présents dans leurs colonnes : le sélecteur reste entièrement dans le cadre central.
- Viewports 1024 × 576 et 853 × 480 (dimensions CSS correspondant approximativement à 125 % et 150 % sur une base 1280 × 720) : les trois formats restent accessibles, centrés et sous la topbar. **Le zoom natif du navigateur n'a pas été actionné** ; ces essais vérifient la réduction de l'espace disponible, pas tous les effets du zoom natif.
- Viewport 390 × 844 : haut et bas sur les trois formats. Sélecteur compact à y = 66 px, topbar terminant à 58 px, largeur 128 px, aucun débordement des boutons.
- Passage au vrai PreviewMode du banc local puis retour : absence du sélecteur d'édition dans Preview. Les renderers Public et Preview n'importent pas EditorWorkspace ; aucune modification de leur rendu.
- `git diff --check` passe.

Les boutons de scroll du banc changent le scroll du véritable conteneur central afin de vérifier précisément les extrêmes. Les essais ne sauvegardent rien à distance. Aucun changement Supabase, Netlify ou paiement n'a été effectué. La production n'a pas été déployée.
