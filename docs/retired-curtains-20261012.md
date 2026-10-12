# Suppression de l'ouverture Rideau — 12 octobre 2026

L'entrée `curtains` (Rideaux) est retirée du registre des ouvertures et du type TypeScript éditable. Son composant `CurtainsOpening.tsx`, les styles CSS dédiés, les variantes Velours/Tissu doux et la description dans le panneau Introduction ont été supprimés. Le README a été actualisé.

Les autres entrées du registre restent Sans animation, Enveloppe et Porte, avec leurs configurations et composants inchangés. Les types réservés `scroll`, `book`, `veil` et `floral-gates` sont conservés ; aucun nouveau style n'a été imposé.

## Compatibilité

`src/features/openings/legacyOpening.ts` contient une normalisation non destructive :

- reconnaît `curtain`, `curtains`, `rideau`, `rideaux` (avec tolérance espaces/casse) ;
- couvre `opening.type`, `introductionMode` et l'ancien `openingAnimation` quand aucune configuration `opening` actuelle n'existe ;
- ramène ces anciennes ouvertures à `opening.type = "none"`, durée 0, `introductionMode = "none"` ;
- conserve les autres propriétés héritées, notamment `customSettings`, sans les utiliser ;
- n'écrase pas une ouverture actuelle valide avec un ancien alias obsolète ;
- préserve une page d'accueil explicitement sélectionnée si seul un ancien Rideau inutilisé demeure dans `opening`.

Ce helper intervient dans le parser de stockage et dans le store éditeur. L'instanciation des templates utilise déjà ce parser. Il est également appliqué défensivement dans `InvitationExperience`, partagé par Aperçu et Public, afin qu'un projet legacy non normalisé affiche immédiatement le document **avec ses animations de contenu activées**, sans attendre une animation Rideau supprimée. Le registre dispose aussi de son fallback Sans animation.

Aucune migration ni écriture distante n'a été réalisée. Aucun projet/template sauvegardé n'a été supprimé. Les images d'arches `white-curtain`, `white-curtain-2` et `pink-curtain` restent utilisées par la page d'accueil : elles ont été conservées, car ce sont des décors indépendants de l'ouverture supprimée.

## Fichiers

- `src/types/editor.ts`
- `src/features/openings/registry/openingRegistry.ts`
- `src/features/openings/OpeningProperties.tsx`
- `src/features/introduction/IntroductionPanel.tsx`
- `src/features/openings/legacyOpening.ts` (ajout)
- `src/utils/storage.ts`
- `src/stores/editorStore.ts`
- `src/features/music/InvitationExperience.tsx`
- `src/styles.css`
- `README.md`
- `src/features/openings/animations/CurtainsOpening.tsx` (suppression, récupérable dans Git)
- `tests/retired-opening.test.mjs` (ajout)
- ce rapport

## Vérifications locales

- `npm run build` réussi sous Node 22.23.3. Avertissement Vite existant sur les gros chunks, non bloquant.
- **469 tests réussis**, 0 échec, 0 ignoré, dont 5 nouveaux tests de compatibilité/suppression.
- Variantes legacy dans les trois champs, absence de mutation des données sources, conservation des autres types/modes.
- Store éditeur réel, sauvegarde/rechargement local, templates anciens utilisables.
- Rendu HTML réel du registre/sélecteur/panneau : aucune option Rideau.
- Routing réel `InvitationExperience` et `OpeningRenderer` en rendu serveur, Aperçu/Public, Smartphone/Tablette/PC, données brutes et normalisées. Les renderers de contenu et autres ouvertures sont isolés dans ce test pour contrôler la disponibilité du contenu et l'absence de couche d'ouverture.
- Audit des références : seules les valeurs du parser legacy, les tests de régression et les arches de page d'accueil subsistent dans le code actif.

Pas de contrôle navigateur/appareil physique ni de déploiement production sur cette modification.
