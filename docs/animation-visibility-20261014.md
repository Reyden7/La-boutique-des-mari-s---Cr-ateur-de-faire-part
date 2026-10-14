# Apparition initiale et animations au scroll — 14 octobre 2026

## Résultat

Seuls le déclenchement des animations et le paramètre de délai sont modifiés. Les effets, géométries et timings des ouvertures Enveloppe/Porte restent inchangés. Aucun fichier de leurs animations n’a été modifié. Pas de migration SQL ni de déploiement.

### Visibilité initiale et scroll

- Tous les éléments passent par `AnimatedElement`, y compris les sections et le formulaire invité.
- `useEntranceVisibility` observe leur **boîte de placement**, indépendante des transformations et de l’opacité animées. Une entrée initiale est délivrée dès l’observation : aucun premier événement scroll n’est nécessaire. Ce fonctionnement suit l’[API Intersection Observer documentée par MDN](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API).
- L’observation commence uniquement lorsque le document est prêt et que la section parente a elle-même été admise. Les effets texte droits et courbés partagent cette admission au lieu d’utiliser leurs propres détecteurs indépendants.
- Seuil de 18 %, réduit pour les éléments plus grands que le viewport : 18 % de leur empreinte maximale visible suffit. Une grande section ne peut donc pas rester bloquée parce que 18 % de sa hauteur totale dépasse l’écran.
- Preview simulé : racine `.preview-device-viewport`. Lecteur immersif Preview/Public : `.invitation-viewer-scroll`. Public ordinateur : viewport de la fenêtre.
- `ResizeObserver` adapte les seuils des éléments encore en attente lors des changements de taille. Pas de parcours des éléments à chaque pixel de scroll. Chaque observer et ses listeners sont nettoyés dès le déclenchement ou le démontage ; les callbacks périmés sont ignorés.

### Introduction et lecture unique

- Sans introduction : `documentAnimationReady` est vrai dès le montage.
- Enveloppe/Porte et autres ouvertures classiques : activation via leur callback existant `onComplete`, **plus au clic sur l’enveloppe**. La musique garde son déclenchement d’interaction existant.
- Page d’accueil : activation après `AnimatePresence.onExitComplete`.
- Les éléments suivants attendent leur propre visibilité. Les enfants d’une section animée attendent aussi le déclenchement de leur parent, sans délai ajouté ni obligation d’attendre la fin de l’effet de section.
- Une fois déclenché, un élément reste admis. Un historique par consultation évite les redémarrages lors du remontage de dispositions responsives. Les textes courbés conservent leur horloge lors des changements de taille/densité.
- « Rejouer » remonte le lecteur existant : introduction fermée, nouvelle racine de scroll en haut, nouveaux états et nouvel historique. Le changement de support en Preview réinitialise également la consultation ; le lecteur immersif revient en haut.

### Délai, données et état final

- Champ « Délai (s) » retiré du panneau commun ; seuls effet et durée restent, avec les options propres aux effets texte.
- `AnimationConfig`, factories et templates ne créent plus de délai utilisateur.
- Les anciens `animation.delay` sont ignorés au rendu et retirés de façon ciblée, sans mutation de l’objet source, lors du chargement, de la sauvegarde locale, de la synchronisation et des snapshots clients de templates. Aucune réécriture destructive de la base existante.
- Les petits timings internes entre caractères et ceux du soulignement dessiné sont conservés : ils constituent l’effet visuel, pas un délai de démarrage configurable entre éléments. Les timings internes des ouvertures sont également conservés.
- Opacité personnalisée, rotation, placement et styles finaux sont préservés. L’opacité d’une section reste appliquée à sa surface, pas durablement à ses enfants.
- Le canvas d’édition reste inchangé et visible dans son état final. Le rendu d’accueil utilisé dans l’éditeur désactive explicitement les animations, y compris les masques texte.
- Avec mouvement réduit : rendu final direct, sans attente de visibilité ni écriture progressive.

## Fichiers modifiés

Déclenchement / rendu :

- `src/components/renderer/AnimatedElement.tsx`
- `src/components/renderer/useEntranceVisibility.ts` — nouveau
- `src/utils/animationVisibility.ts` — nouveau
- `src/components/renderer/WeddingRenderer.tsx`
- `src/components/renderer/TextEntrance.tsx`
- `src/features/text/CurvedTextRenderer.tsx`
- `src/features/text/curvedTextAnimation.ts`
- `src/features/music/InvitationExperience.tsx`
- `src/features/viewer/InvitationViewer.tsx`
- `src/features/welcome/WelcomePageRenderer.tsx`

Propriétés, valeurs par défaut et compatibilité :

- `src/components/properties/AnimationProperties.tsx`
- `src/types/editor.ts`
- `src/utils/elementAnimation.ts`
- `src/utils/textAnimation.ts`
- `src/utils/animationData.ts` — nouveau
- `src/utils/storage.ts`
- `src/utils/templateSnapshot.ts`
- `src/templates/templates.ts`
- `src/stores/editorStore.ts`
- `src/components/sidebar/LeftSidebar.tsx`
- `src/features/elements/elementFactories.ts`
- `src/features/hearts/heartRegistry.ts`
- `src/features/welcome/WelcomePageEditor.tsx`
- `src/features/welcome/welcomeDefaults.ts`

Tests : nouveaux `animation-visibility.test.mjs`, `animation-renderer.test.mjs`, `animation-visibility.browser.html`, `animation-visibility.browser.tsx`. Adaptation des assertions devenues obsolètes dans `element-animation`, `curved-text`, `doors-and-text`, `countdown-persistence`, `envelope-opening` et du loader dans `guest-project-data`.

## Vérifications

- **495 tests réussis**, aucun échec, aucun test ignoré. Tests SQL existants exécutés avec PGlite ; aucun appel cloud.
- Tests unitaires : observation initiale sans scroll, seuil, lecture unique, section surdimensionnée, resize, callbacks périmés, nettoyage, fallback sans API, compatibilité et immutabilité des données.
- Rendu HTML réel de tous les types d’éléments sur Smartphone/Tablette/PC ; formulaire dans le même pipeline. Remontage de textes déjà joués : état final immédiat, sans relance. La mesure Konva du formulaire est simulée dans ce test HTML Node uniquement.
- Skill Computer Use utilisé pour les vérifications navigateur sur une fixture locale avec les vrais renderers et les vrais composants Enveloppe/Porte. Données synthétiques en mémoire, ancien délai de 99 s volontairement conservé dans les exemples pour prouver qu’il est ignoré.
- Sans introduction : trois éléments visibles démarrent à scrollTop = 0 ; section suivante en attente.
- Enveloppe et Porte : six admissions en attente à l’état fermé et pendant l’ouverture ; trois éléments initiaux démarrent après `complete`, sans scroll.
- Preview Smartphone/Tablette/PC : ouverture et première section vérifiées. Scroll interne : section et enfant admis, texte plus bas encore en attente ; remontée/redescente sans relance. Rejouer : retour à zéro, section suivante remise en attente ; introduction réinitialisée.
- Public ordinateur : racine fenêtre et scroll vérifiés. Public mobile à 390×844 : racine interne et scroll vérifiés. Replay du Preview immersif également vérifié à cette largeur.
- Editor : rendu d’accueil final des trois éléments, textes complets et courbure à progression 1. Le canvas Konva et ses outils n’ont pas été modifiés.
- Mouvement réduit simulé uniquement dans la fixture : tous les éléments immédiatement finaux, textes complets et courbure à progression 1.
- Ce sont des vérifications navigateur à tailles de viewport contrôlées, **pas des tests sur téléphones/tablettes physiques** ni une publication distante.
- **`npm run build` passe** avec Node 22. Avertissement existant sur la taille du bundle ; pas d’erreur TypeScript.
- `git diff --check` passe. Les changements préexistants de la tâche précédente sont préservés.

Captures : `animation-visibility-preview-20261014.jpg`, `animation-visibility-mobile-20261014.jpg`.
