# Enveloppe Smartphone — positions fermées

Implémenté et vérifié localement le 7 octobre 2026. Aucun déploiement Netlify,
aucune migration, aucun changement Supabase, Stripe, RSVP ou secret dans cette tâche.

## Données et UI

Configuration du projet, et non métadonnées des assets :

```ts
opening.envelope = {
  // Références et bibliothèques existantes conservées.
  baseClosedOffset: { x: -4, y: 2 },
  flapClosedOffset: { x: 3, y: -1 },
  sealClosedOffset: { x: -6, y: 4 },
};
```

Valeurs en pourcentage du viewport Smartphone : X relatif à sa largeur, Y à sa
hauteur. Plage -50 à +50, pas 1 ; valeurs absentes/non finies = 0. Aucune mutation
des paramètres d’un asset preset/custom/global. Les trois pièces sont indépendantes.

Après le choix/import/téléchargement de chaque pièce : « Position fermée »,
« Position horizontale », « Position verticale », slider + champ numérique,
« Réinitialiser la position ». Les sliders appliquent immédiatement ; les champs
utilisent le composant DimensionInput partagé pour pouvoir effacer entièrement et
saisir une valeur négative, validée par Entrée ou perte de focus. Le reset ne touche
que la pièce concernée. Le changement d’asset conserve ses offsets.

Le store existant gère sauvegarde, undo/redo et snapshots/templates sans nouveau
format parallèle. Aucune migration nécessaire pour ces champs de project_data.

## Rendu et animation

`getPngEnvelopeLayout()` conserve intégralement sa géométrie et ses déplacements.
`getPngEnvelopeClosedLayout()` lui ajoute les offsets locaux :

- Base : boîte normale + décalage ; translation d’ouverture gauche inchangée.
- Groupe droit : origine et translation d’ouverture inchangées.
- Rabat : image positionnée localement dans ce groupe, avec son propre offset.
- Cachet : position locale normale + offset, toujours enfant du même groupe.

Framer Motion anime uniquement la translation existante des groupes ; il ne peut
pas écraser les positions locales. Durée, délai, easing, gestion reduced-motion,
chargement/fallback des images, alpha et contenu derrière sont conservés.

En Introduction classique Smartphone, le canvas montre désormais ce renderer en
état fermé non interactif, dans un viewport de hauteur fixe et au zoom de l’éditeur.
Les modifications sont donc visibles directement, sans lancer « Voir l’ouverture ».
Les autres vues d’édition gardent le document complet. Aperçu/Public emploient le
même renderer animé. Tablette/PC gardent le renderer précédent et ignorent ces offsets.

## Vérifications

- Suite finale : **369 tests réussis, 0 échec, 0 ignoré**.
- Géométrie à zéro identique, offsets proportionnels (320×568, 390×844, 430×932),
  indépendance des pièces, validation bornes/NaN, deltas et timings inchangés.
- Store réel : changement d’asset, undo/redo, sauvegarde/rechargement et création
  de template/instanciation indépendante conservent les offsets.
- Rendu SSR réel : positions locales dans les styles des trois images ; comparaison
  Tablette/PC strictement identique avec/sans offsets.
- Navigateur local, Auth/Supabase simulés : scénario -4/+2, +3/-1, -6/+4 ; synchronisation
  slider/champ ; saisie après effacement ; reset Rabat seul ; changement Base ;
  sauvegarde/rechargement local ; retour Tablette → Smartphone ; zoom 100 → 80 %.
- Canvas et Aperçu Smartphone : mêmes boîtes CSS logiques. Public sur viewport
  390×844 : pourcentages appliqués à la largeur réelle disponible (375 px à cause
  du gutter de scrollbar desktop simulé), hauteur 844 px. Aucun pixel-écran absolu.
- Ouverture locale : environ **1110–1111 ms**, déplacements horizontaux uniquement,
  cachet attaché, document stationnaire et même nœud conservé ; overlay retiré à la fin.
- Public aux largeurs 768/1440 : ancien renderer présent, renderer PNG absent.
- `npm run build` OK ; avertissement existant de chunk JS >500 kB. Diff-check OK.

Preuves locales (pas production) :
`docs/qa/20261007-envelope-positions/editor-closed.png`, `preview-closed.png`,
`public-closed.png`. Les tests n’ont pas effectué de sauvegarde distante ni de
publication réelle d’asset/projet/template.

## Fichiers modifiés

- `src/types/editor.ts`
- `src/features/openings/pngEnvelopeLayout.ts`
- `src/features/openings/EnvelopePositionControls.tsx` (nouveau)
- `src/features/openings/EnvelopeAssetControls.tsx`
- `src/features/openings/animations/PngEnvelopeOpening.tsx`
- `src/components/editor/EditorCanvas.tsx`
- `src/styles.css`
- `tests/png-envelope-opening.test.mjs`
- `tests/envelope-assets.test.mjs`
- `tests/envelope-opening.browser.tsx`
