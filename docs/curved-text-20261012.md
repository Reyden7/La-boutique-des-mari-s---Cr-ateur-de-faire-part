# Texte courbé — 12 octobre 2026

## Fonctionnalité

Section **Courbure** dans les propriétés des éléments Texte : activation, arc vers le haut/bas, slider et valeur numérique de 0 à 100 %, mise à jour immédiate, réinitialisation.

```ts
curve?: {
  enabled: boolean;
  amount: number; // 0–100
  direction: "up" | "down";
}
```

Sans configuration, désactivé, ou à 0 : les anciens renderers sont conservés intégralement. La valeur par défaut/réinitialisée est `{ enabled: false, amount: 0, direction: "up" }`.

La courbure est globale. Les overrides de position, dimensions et taille de police par support ne sont pas modifiés. La sauvegarde, les templates, l'annulation/rétablissement utilisent le stockage existant : aucune migration nécessaire.

## Rendu partagé

Konva et le Canvas web utilisent les mêmes mesures de police, positions de graphèmes Unicode et fonction de dessin. Les polices existantes, y compris les alias de polices importées/globales, passent par le chargement de polices partagé et `document.fonts`. Pas de logique spécifique à une police.

L'intensité règle l'angle de l'arc, jusqu'à un demi-cercle ; un rayon minimal protège les textes très courts. Espacement des lettres, couleur/alpha, soulignement, alignement et sauts de ligne sont pris en compte. Chaque ligne explicite a son arc. La rotation et l'opacité globales restent appliquées par les wrappers existants.

Pour éviter de couper les caractères dans un bloc trop petit, le rendu est réduit **uniformément** sans changer la taille de police enregistrée. Les limites mesurées restent dans le rectangle de sélection/Transformer. L'utilisateur peut agrandir ce bloc pour retrouver la taille complète.

Les effets fade/slide/zoom restent délégués au wrapper existant. Les effets machine à écrire, lettre/mot par lettre, écriture manuscrite simulée et soulignement dessiné ont une progression adaptée aux graphèmes placés sur l'arc. L'effet manuscrit est une apparition progressive, pas un tracé réel de chaque lettre. Les positions ne bougent pas pendant ces effets. Le calcul de géométrie est mémorisé ; aucun traitement pixel par pixel à chaque frame.

## Fichiers de cette modification

Modifiés :

- `src/types/editor.ts`
- `src/components/properties/PropertiesPanel.tsx`
- `src/components/editor/EditorCanvas.tsx`
- `src/components/renderer/WeddingRenderer.tsx`

Ajoutés :

- `src/features/text/TextCurveProperties.tsx`
- `src/features/text/curvedTextLayout.ts`
- `src/features/text/useCurvedTextLayout.ts`
- `src/features/text/CurvedTextCanvas.tsx`
- `src/features/text/CurvedTextRenderer.tsx`
- `src/features/text/curvedTextAnimation.ts`
- `tests/curved-text.test.mjs`
- `tests/curved-text.browser.html`
- `tests/curved-text.browser.tsx`
- `tests/curved-text.vite.mjs`
- ce rapport et `docs/curved-text-preview-20261012.jpg`

Les changements précédents concernant les portes et leurs effets texte ont été conservés.

## Vérifications

- `npm run build` : **réussi**, Node **22.23.3**. Avertissement Vite préexistant sur la taille du bundle, non bloquant.
- Suite complète : **464 tests réussis, 0 échec, 0 ignoré**.
- Tests de géométrie : 1 350 combinaisons de direction, intensité, largeur, hauteur, alignement et taille de police ; graphèmes Unicode, espacement, multiline et conservation d'alpha.
- Tests de données : état initial/anciens textes, courbure globale, overrides responsive inchangés, undo/redo, save/reload et templates.
- Tests des progressions des animations : délai, état intermédiaire/final, reduced-motion.
- QA locale avec le skill **Computer Use** : vrai panneau de propriétés, vrai EditorCanvas et Transformer, rotation, changement de largeur, Aperçu et InvitationExperience Public, supports Smartphone/Tablette/PC.
- Polices contrôlées : Georgia, Great Vibes manuscrite et une police TTF locale chargée via le système de polices importées du projet.
- Comparaison des pixels Konva/web, Georgia arc haut 50 %, 340 × 200 : **0 différence sur 272 000 composantes RGBA**. Police TTF locale, arc bas 100 % : 23 composantes différentes sur 272 000 (anticrénelage), résultat visuellement identique.
- Apparition machine à écrire observée à un état intermédiaire dans l'Aperçu ; progression complète mot par mot vérifiée dans le Public local. Réinitialisation vérifiée dans l'Aperçu : retour au renderer droit, aucun Canvas courbé.

Ces contrôles concernent le navigateur local et les dimensions simulées, pas des appareils physiques Safari/iOS/Android. Aucun déploiement en production, aucune modification du backend ni écriture distante n'a été effectué. La police Windows utilisée par la fixture QA n'est ni copiée ni distribuée dans l'application.
