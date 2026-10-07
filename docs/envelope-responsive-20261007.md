# Enveloppe responsive — validation du 7 octobre 2026

## Résultat

Le renderer PNG commun est maintenant utilisé sur les trois supports. La géométrie et les déplacements Smartphone existants sont conservés : base vers la gauche, rabat et cachet vers la droite. Tablette et PC utilisent une composition horizontale centrée : base vers le bas, rabat et cachet vers le haut, sans déplacement horizontal animé. Le cachet reste enfant du groupe du rabat, avec une taille constante pendant l'ouverture.

Après correction du rendu immersif, Tablette et PC utilisent un **cover plein viewport**, sans limite de largeur ni de hauteur de la composition. Le ratio est uniforme, basé sur les dimensions logiques Smartphone 390 × 844 retournées. Le scale commun vaut `max(viewportWidth / 844, viewportHeight / 390)` ; la composition est centrée dans un conteneur exactement à la taille du viewport. Le dépassement est recadré symétriquement, sans étirer les PNG. Seuls les PNG de papier ont une rotation statique de -90° ; le cachet reste droit. Les durées paysage sont comprises entre 0,9 et 1,2 seconde, avec le même easing. Le contenu réel reste monté et immobile derrière l'ouverture.

La structure paysage est `Viewport > Composition > Base + Groupe(Rabat, Cachet)`. Les positions utilisateur restent relatives à la composition entière. La taille du cachet cumule l'agrandissement commun et son réglage utilisateur. Les distances d'ouverture tiennent compte de la taille rendue, du centrage et des offsets afin que toutes les couches quittent le viewport. La mesure utilise la hauteur du viewport d'introduction, jamais celle du document complet. Le `ResizeObserver` existant recalcule la couverture lorsque le viewport change.

## Données

Les assets et les bibliothèques restent communs. Seuls les réglages de position fermée et la taille du cachet sont indépendants par support :

```ts
envelope: {
  baseAsset: EnvelopeAssetRef,
  flapAsset: EnvelopeAssetRef,
  sealAsset: EnvelopeAssetRef,
  customBases?: EnvelopeAssetRef[],
  customFlaps?: EnvelopeAssetRef[],
  customSeals?: EnvelopeAssetRef[],
  responsive?: {
    mobile?: EnvelopeDeviceSettings,
    tablet?: EnvelopeDeviceSettings,
    desktop?: EnvelopeDeviceSettings,
  },
  // Anciennes propriétés conservées comme fallback Smartphone uniquement :
  baseClosedOffset?: { x: number; y: number },
  flapClosedOffset?: { x: number; y: number },
  sealClosedOffset?: { x: number; y: number },
  sealScale?: number,
}

type EnvelopeDeviceSettings = {
  baseClosedOffset?: { x: number; y: number };
  flapClosedOffset?: { x: number; y: number };
  sealClosedOffset?: { x: number; y: number };
  sealScale?: number;
};
```

Les offsets sont des pourcentages de l'enveloppe sur les axes horizontaux/verticaux de l'écran, limités à ±50 %. La taille du cachet va de 50 à 200 % et conserve son centre. Les anciennes propriétés à plat ne sont jamais héritées par Tablette/PC. Sans réglage, les positions valent zéro et la taille 100 %. Les contrôles indiquent le support actif et le reset ne touche que la partie et le support concernés.

La sélection des presets, les imports, les références globales, les suppressions et la logique de templates existantes sont réutilisés. Aucun asset n'est dupliqué pour un support supplémentaire. L'ancienne animation CSS n'est plus appelée pour l'enveloppe Tablette/PC ; ses fichiers historiques sont conservés.

## Fichiers modifiés

- `src/types/editor.ts` : configuration par support.
- `src/features/openings/pngEnvelopeLayout.ts` : résolution des réglages et géométrie commune.
- `src/features/openings/animations/PngEnvelopeOpening.tsx` : composition paysage et animation verticale.
- `src/features/openings/animations/ResponsiveEnvelopeOpening.tsx` : sélection du support et renderer commun.
- `src/features/openings/EnvelopePositionControls.tsx` : position/taille/reset pour le support actif.
- `src/features/openings/EnvelopeAssetControls.tsx` : explication des assets communs.
- `src/features/openings/OpeningProperties.tsx` : mêmes galeries et réglages sur les trois supports.
- `src/features/openings/registry/openingRegistry.ts` : description adaptée.
- `src/components/editor/EditorCanvas.tsx` : aperçu fermé commun sur les trois supports.
- `src/styles.css` : cadre paysage isolé et découpe des PNG sortants.
- `tests/png-envelope-opening.test.mjs`, `tests/envelope-assets.test.mjs`, `tests/envelope-opening.browser.tsx` : régressions et fixture navigateur.

## Tests réalisés

Suite complète après correction cover : **382 tests réussis, zéro échec, zéro test ignoré**.

Les tests couvrent notamment la non-régression numérique Smartphone, la couverture paysage sans plafonds aux formats 768 × 1 024, 1 440 × 900, 3 840 × 1 080 et 900 × 300, le ratio uniforme et le centrage, les axes des offsets, l'indépendance des supports, le centre du cachet après changement de taille, la sortie complète des PNG, la couverture alpha de l'enveloppe fermée, les références preset/custom/global, la sauvegarde/relecture, undo/redo et les snapshots templates. Un doublement du viewport vérifie explicitement le doublement uniforme des trois couches et de leurs offsets.

Contrôles dans un navigateur local avec les vrais composants Editor, OpeningPreview, PreviewMode et InvitationExperience, sur une fixture isolée avec Auth/Supabase simulés :

| Vérification | Résultat |
| --- | --- |
| Editor Tablette et « Voir l'ouverture » | Même support et mêmes dimensions/positions du cachet |
| Aperçu Tablette et PC | Composition paysage ; base vers le bas, rabat/cachet vers le haut |
| Animation paysage | Environ 189–190 mesures par ouverture ; translation verticale uniquement, cachet attaché sur les deux axes, taille stable |
| Replay | Retour à l'état fermé avec le bon support |
| Réglages indépendants | Smartphone 120 %, Tablette 160 %, PC 90 %, sans contamination |
| Sauvegarde/relecture | Réglages responsive conservés |
| Reset Tablette | Cachet remis à zéro/100 % ; Base/Rabat et les autres supports conservés |
| Renderer public à 390 × 844 | Smartphone automatique, ouverture horizontale conservée |
| Renderer public à 768 × 1 024 | Tablette automatique, ouverture verticale |
| Renderer public à 1 440 × 900 | PC automatique, ouverture verticale |
| Support public | Indépendant du dernier support sélectionné dans l'éditeur |
| Asset inaccessible | Fallback vers le PNG intégré chargé ; ouverture fonctionnelle |
| Document derrière l'ouverture | Même nœud, largeur stable et position immobile ; overlay retiré à la fin |

Captures enregistrées dans `docs/qa/20261007-envelope-responsive/` : Editor Tablette réglé à 160 %, Aperçu fermé Tablette/PC et renderer public aux trois dimensions.

### Nouvelle passe navigateur — cover immersif

- « Voir l'ouverture » PC : conteneur 1 408 × 880, composition 1 904,41 × 880 centrée et recadrée, aucun espace autour du papier dans le viewport.
- Aperçu complet Tablette : conteneur affiché 684 × 912, composition affichée 1 973,65 × 912 (après scale de présentation du device), papier sur toute la surface du device.
- Ouvertures PC et Tablette : 189–190 mesures, environ 1 111–1 116 ms ; uniquement translation verticale, cachet attaché, taille stable, document immobile, overlay retiré.
- Public après resize 768 × 1 024 puis 1 440 × 900 : support automatique Tablette puis PC, cadre plein viewport et composition cover recalculée ; ouverture PC validée.
- Public Smartphone 390 × 844 : aucune composition paysage ajoutée, ouverture horizontale et invariants conservés, 189 mesures en environ 1 112 ms.
- État fermé Editor PC : cadre et canvas de mêmes dimensions affichées (989 × 618,125), composition débordante centrée, pas de miniature différente.
- Réglages PC cachet 120 %, X = 2 %, Y = -3 % : sauvegarde/relecture locale confirmée et « Voir l'ouverture » fonctionnel.
- Nouvelles captures : `desktop-cover.jpg` et `tablet-cover.jpg`. Les anciennes captures `*-closed.png` documentent la première version centrée, remplacée par le cover.

Ces contrôles simulent les dimensions dans un navigateur ; ils ne constituent pas des tests sur des appareils physiques. Les uploads globaux réels et les écritures Supabase de production n'ont pas été rejoués : leurs mécanismes existants restent inchangés.

## Build et périmètre

`npm run build` : **réussi**. Avertissement Vite existant sur un bundle supérieur à 500 kB. `git diff --check` ne signale aucune erreur de whitespace (avertissements de conversion LF/CRLF uniquement).

Modifications locales uniquement : aucun déploiement Netlify ou Supabase, aucun secret modifié et aucun paiement effectué.
