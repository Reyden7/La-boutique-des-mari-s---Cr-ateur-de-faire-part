# Taille du cachet Smartphone — 7 octobre 2026

## Comportement

Dans Introduction > Enveloppe > Cachet, après les positions horizontale/verticale :
- Taille du cachet : slider 50–200 %, pas de 5 %, valeur numérique éditable.
- Mise à jour immédiate du slider et des valeurs numériques valides. Une saisie vide ou intermédiaire ne réduit pas brutalement le cachet ; validation des bornes au blur/Entrée.
- Réinitialiser le cachet remet X/Y à 0 et taille à 100 % en une seule mutation, sans changer Base/Rabat ni l'asset sélectionné.

```ts
opening.envelope = {
  // références et bibliothèques existantes conservées
  sealClosedOffset: { x: -6, y: 4 },
  sealScale: 1.6,
};
```

`sealScale` est un multiplicateur du projet, pas une propriété de l'asset. Valeur absente/invalide : 1 ; valeurs finies bornées entre 0.5 et 2. Changer de cachet conserve la taille.

## Rendu

Le helper partagé `getPngEnvelopeClosedLayout` redimensionne uniquement le rectangle local du PNG du cachet autour de son centre (largeur et hauteur multipliées uniformément, origine recalculée à partir du même centre). Les offsets sont appliqués indépendamment.

Le renderer `PngEnvelopeOpening` reste inchangé : cachet toujours enfant du groupe mobile avec le rabat. Les origines du groupe, positions Base/Rabat, distances d'ouverture, timings et transitions sont inchangés. Aucun zoom animé ni fade ajouté. Le canal alpha et les sources PNG/WebP restent intacts.

Editor Smartphone fermé, Preview Smartphone et Public Smartphone utilisent le même helper/composant. Le rendu Public suit toujours la largeur physique disponible (375 px utiles sur le test navigateur de 390 px avec scrollbar externe), tandis que l'Aperçu utilise son viewport logique de 390 px. Le multiplicateur relatif est identique. Tablette/PC conservent leur renderer antérieur, qui ignore ce réglage.

## Fichiers modifiés

- `src/types/editor.ts` : `EnvelopeConfig.sealScale`.
- `src/features/openings/pngEnvelopeLayout.ts` : normalisation et taille centrée.
- `src/features/openings/EnvelopePositionControls.tsx` : contrôle du cachet et reset atomique.
- `src/components/ui/DimensionInput.tsx` : callback optionnel de saisie live ; comportement des autres usages inchangé.
- `tests/png-envelope-opening.test.mjs` : taille, centre, SSR partagé, isolation responsive et UI.
- `tests/envelope-assets.test.mjs` : persistance, undo/redo, changements preset/custom/global et templates.
- `tests/envelope-opening.browser.tsx` : contrôle de stabilité de la taille pendant l'animation.

## Vérifications réalisées

Suite Node : **374 tests réussis, 0 échec, 0 ignoré**.

- Ratios 50/100/140/160/200 % à 320×568, 390×844 et 430×932 : même centre, proportions conservées, aucune modification des autres parties ni des déplacements d'ouverture.
- Ancien projet sans `sealScale` et valeur explicite 1 : géométrie exactement identique.
- Preset/custom/global : taille conservée lors du changement de référence, sérialisation sauvegarde/rechargement et instanciation de template ; copies indépendantes ; undo/redo.
- Sorties SSR Tablette/PC strictement identiques avec et sans offsets/taille Smartphone.

Navigateur local isolé utilisant les vrais composants applicatifs, Supabase/Auth simulés, aucune écriture en production :

- Editor sur PC avec Smartphone sélectionné : X=-6, Y=+4, 160 % immédiatement visible, sans blur obligatoire ; centre invariant à la précision de rasterisation (~0.02 px).
- Saisie effaçable puis `160` caractère par caractère : aucune réduction pendant la saisie intermédiaire.
- Slider clavier : 160 → 165 → 160, mise à jour immédiate.
- Or alliances → Bordeaux alliances : 160 % et offsets conservés.
- Sauvegarde et rechargement local : `sealScale: 1.6` et offsets restaurés.
- Preview Smartphone : même rectangle CSS que l'Editor à largeur logique égale.
- Ouverture Preview : 190 échantillons, ~1114 ms ; cachet solidaire, taille stable, translation uniquement horizontale, contenu déjà monté/stationnaire et overlay retiré en fin d'ouverture.
- Public responsive Smartphone : 189 échantillons, ~1113 ms ; mêmes invariants et multiplicateur 1.6.
- Reset : cachet X/Y=0, taille=100 %, tout en conservant Base X=5 et Rabat X=-2.
- Tablette/PC : absence du réglage de taille, renderer historique confirmé dans les Aperçus.

Captures : `qa/20261007-envelope-seal-size/editor-160.png`, `preview-160.png`, `public-160.png`.

`npm run build` : réussi. Warning Vite existant : bundle JavaScript supérieur à 500 kB.

Modifications locales uniquement : aucun déploiement Netlify/Supabase, aucun secret modifié. Pas de test sur un véritable smartphone physique ni de sauvegarde distante de production dans cette vérification.
