# Particules personnalisées : image d’origine — 6 octobre 2026

## Cause et correction

`ParticleContent`, dans `src/features/particles/ParticleRenderer.tsx`, rendait un span avec `maskImage`/`WebkitMaskImage` pointant vers l’asset et `backgroundColor: currentColor`. Le canal alpha devenait ainsi une silhouette remplie avec la palette du projet.

Quand `shape === "custom"` et `customImageUrl` existe, le composant rend désormais directement un `<img src={customImageUrl}>`. Le CSS utilise `object-fit: contain`, centré dans une boîte de 1em × 1em. Aucun masque, filtre, fond monochrome ou mélange de couleurs n’est appliqué. Le ratio interne, les couleurs, les détails et l’alpha du fichier restent ceux de la source.

Les presets simples continuent de rendre leur symbole avec la couleur choisie. Les images personnalisées ignorent entièrement la palette, même si elle est encore présente dans les données d’un ancien projet. Un changement de palette ne régénère pas leurs positions/trajectoires et ne teinte pas les images. Le recyclage à chaque boucle continue de régler taille/rotation/trajectoire, sans appliquer de couleur aux images.

Le panneau affiche une indication « couleurs et transparence de votre image conservées » à la place des réglages de couleur quand le motif est personnalisé. Les couleurs enregistrées restent en mémoire et reviennent en choisissant un preset. Les vignettes utilisaient déjà la vraie image et sont conservées.

## Fichiers de cette correction

- `src/features/particles/ParticleRenderer.tsx`
- `src/features/particles/ParticlePanel.tsx`
- `src/styles.css`
- `tests/custom-particles.test.mjs`
- `tests/custom-particles.browser.html`
- `tests/custom-particles.browser.tsx`
- Ce rapport et `docs/qa/20261006-custom-particles/`.

Les autres modifications déjà présentes dans le worktree (unification des color pickers) n’ont pas été annulées.

## Validation

- **306 tests automatisés réussis**, dont six nouveaux tests du vrai composant compilé avec Vite : sources PNG/WebP inchangées, absence de masque/recolorisation, flottement et déplacement, taille/opacité/quantité, presets colorés, états désactivés/vides et renderer commun aux trois modes.
- Vérification navigateur de **quatre sources dans les trois modes** : arche florale PNG existante, illustration colorée PNG, WebP transparent, PNG détaillé de test. Les deux illustrations sont des bitmaps de fixture créés localement, sans upload.
- Le test monte le vrai `EditorCanvas` et le vrai `InvitationExperience` en mode Preview puis Public, dans un projet temporaire en mémoire. Dans les 12 combinaisons : 12 images chargées, même URL que la source, `object-fit: contain`, aucun masque ni filtre.
- Passage de palette rouge à bleue sur une image personnalisée : styles des particules inchangés, aucune recolorisation ni réinitialisation des positions.
- Options : vitesse 65, direction haut-gauche, taille 48 px, quantité 6, opacité 35 % : appliquées, source conservée.
- Retour au preset cœur : symbole rendu sans image, couleur bleue appliquée et palette de nouveau disponible.
- `npm run build` : **OK**. Avertissement de taille du bundle déjà existant, sans erreur.

## Périmètre

Parité de rendu vérifiée localement dans les composants réels Editor/Preview/Public ; pas de publication ni test sur un faire-part de production. Aucun upload Storage, changement de données distantes ou déploiement. Le schéma `ParticleConfig` et les URLs des assets existants ne changent pas.

Captures : `editor-arche.png.jpg`, `preview-arche.jpg`, `public-arche.jpg` dans le dossier QA indiqué ci-dessus.
