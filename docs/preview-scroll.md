# Défilement automatique de l’Aperçu

Fonction exclusivement liée à `PreviewMode`, sans champ dans `project_data` ni activation publique.

## Fichiers ajoutés / modifiés

- `src/components/preview/PreviewMode.tsx` : surfaces simulées, contrôles et sessions.
- `src/components/preview/PreviewScroll.tsx` : état UI, branchement des surfaces et écouteurs.
- `src/components/preview/previewScrollEngine.ts` : horloge et calcul du scroll.
- `src/components/preview/previewScroll.css` : sélection et contrôles Preview uniquement.
- `src/features/music/InvitationExperience.tsx` : notification de disponibilité du document.
- `src/features/viewer/InvitationViewer.tsx` : surface immersive et espace réservé aux contrôles.
- `tests/preview-scroll.test.mjs` : tests du moteur et de l’intégration.
- `tests/preview-scroll.browser.html` et `tests/preview-scroll.browser.tsx` : fixture navigateur isolée.
- `tests/animation-visibility.test.mjs` : assertion de la clé de rejeu complétée par l’identité du projet.
- `docs/preview-scroll.md` et `docs/preview-scroll.png` : documentation et capture de vérification.

## Rendu et sélection

`preview-scroll-surface` désactive la sélection visuelle uniquement dans l’Aperçu. Les inputs, textarea, select et contenus éditables conservent `user-select: text`. Un gestionnaire `dragstart` empêche le drag des images décoratives, pas celui des widgets interactifs. Le simulateur conserve son glissement souris Smartphone/Tablette (y compris sur les images décoratives), ainsi que le défilement natif.

## Défilement

Le moteur `previewScrollEngine.ts` accumule une position décimale et applique `vitesse × temps écoulé` avec un unique `requestAnimationFrame`. Delta plafonné à 50 ms ; aucun intervalle, lissage CSS ou rendu React par frame. La vitesse va de 10 à 150 px/s, initialement 35 ; elle reste en mémoire de l’interface seulement.

Les surfaces sont `.preview-device-viewport` pour les supports simulés et `.invitation-viewer-scroll` pour l’Aperçu immersif. La limite provient de `scrollHeight - clientHeight`. La conversion logique utilise la largeur réelle non transformée du document / largeur du support auteur : le zoom externe du cadre ne modifie pas la vitesse logique.

Démarrer/Reprendre repartent du scroll courant ; Pause annule immédiatement la frame sans changer le scroll ; Arrêter revient à l’état inactif sans remonter. Retour en haut arrête puis écrit zéro. En bas (ou sans débordement), le moteur s’arrête automatiquement. Les changements de vitesse s’appliquent à la prochaine frame.

Molette, touchstart, pointerdown, touches de défilement, changement externe du scroll et masquage de l’onglet mettent en pause. Les événements de scroll produits par le moteur ne l’interrompent pas. Les contrôles sont extérieurs au conteneur du faire-part ; en immersif, la hauteur réelle de la barre est réservée et mesurée par ResizeObserver.

## Introduction, apparitions et cycle de vie

La disponibilité suit `documentAnimationReady` : fin d’ouverture réelle ou fin de sortie de la page d’accueil. Aucune temporisation reproduisant arbitrairement la durée de l’introduction. Les animations d’apparition continuent à utiliser leur véritable racine IntersectionObserver et le scroll natif. Aucune modification des animations Enveloppe/Porte.

Chaque support/rejeu/projet remonte sa surface et dispose du moteur précédent. Une nouvelle révision `updatedAt` du projet réinitialise aussi le fournisseur. Le démontage, la sortie, l’arrêt et la pause annulent la frame et les écouteurs sont retirés. Le Public ne possède ni fournisseur, ni contrôles, ni écouteurs, ni classe bloquant la sélection.

## Vérifications

`tests/preview-scroll.test.mjs` : 60/90/120 Hz, arrondi DOM sans dérive, pause/reprise/arrêt, démarrage au milieu/en bas, vitesse live, conversion logique, plafond temporel, scroll externe, annulation et intégration Preview uniquement.

`tests/preview-scroll.browser.html` : fixture locale utilisant les vrais Preview/Viewer/introductions/formulaire et animations, sans sauvegarde ni soumission réseau. Mesures de scroll/sélection affichées pour vérification manuelle ; ses intervalles de diagnostic ne font pas partie du moteur de production.
