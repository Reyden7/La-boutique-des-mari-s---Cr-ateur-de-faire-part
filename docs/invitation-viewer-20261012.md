# Viewer immersif mobile — 12 octobre 2026

## Stratégie

`InvitationViewer` est le lecteur commun à l'Aperçu et au Public sur téléphone/tablette. Il est rendu dans un portail sous `body`, hors du layout du site et de ses éventuels parents transformés. Il occupe toute la largeur disponible et la hauteur visible, sans cadre, ombre, rayon ou marge autour du document.

Activation : viewport de moins de 1 024 px ou appareil tactile principal (`hover: none` / `pointer: coarse`). Sur appareil tactile, le support de design se détermine par le côté court : tourner le téléphone ne sélectionne pas accidentellement le design Tablette. Les dimensions/positions sauvegardées et les animations d'ouverture ne sont pas modifiées.

Sur PC à pointeur classique, l'éditeur et le simulateur d'Aperçu existant sont conservés, ainsi que l'ancien layout Public desktop. Le plein écran demandé ici concerne la consultation mobile/tablette.

## Body / root / viewport

- Le viewer est fixe, avec `100dvh` et fallback `100vh`. `VisualViewport` affine hauteur et décalage quand les barres du navigateur ou le clavier changent la zone visible.
- Le pinch zoom reste autorisé et ne redimensionne pas le design.
- Une classe de session verrouille `html`, `body` et `#root` : aucun scroll du site derrière.
- `#root` est temporairement `inert`, pour éviter le focus/clic sur l'interface cachée derrière le portail.
- Le verrou est compté et restauré proprement à la fermeture : état `inert` et position de scroll précédents récupérés. Aucune règle globale permanente sur l'éditeur.
- Safe areas appliquées seulement aux contrôles flottants et au lecteur audio ; pas de padding blanc imposé au faire-part.

## Scroll et contenu

Un seul propriétaire du scroll : `.invitation-viewer-scroll`. Il défile verticalement, bloque le débordement horizontal et contient l'overscroll. Le document long garde ses proportions et sa hauteur éditée ; il n'est pas aplati pour rentrer sur un seul écran.

Le scroll du viewer est verrouillé pendant Enveloppe/Porte fermées et la couverture d'accueil, puis libéré lorsque le contenu est révélé. Les ouvertures existantes mesurent le viewport réel via leur logique inchangée. L'AnimationViewportProvider reçoit cette même zone de scroll pour les effets d'apparition et le texte courbé.

Le menu « Ajouter à mon agenda », rendu lui aussi dans un portail, a un ordre de couche adapté au viewer. Les textes, bordures de section, RSVP, polices et autres éléments restent rendus par le WeddingRenderer existant. Le fond principal est repris derrière les parties plus courtes que le viewport, sans cadre de site visible.

## Aperçu / Public

- Aperçu mobile : pas de barre ni de place réservée à une toolbar. Un bouton discret « … » ouvre les contrôles Retour/Rejouer et les actions d'aperçu éventuelles. Le Public n'affiche aucun de ces contrôles.
- Public : même viewer, mais mode `public` inchangé pour les éléments interactifs/RSVP. Les vérifications de lien, publication et expiration existantes sont conservées. Chargement et erreurs ont aussi un conteneur mobile dédié.
- Aucun achat, abonnement, droit d'accès ou publication n'a été modifié.
- Pas de demande automatique Fullscreen : l'immersion ne dépend pas d'une API non uniformément disponible sur téléphone.

## Préparation standalone

- `manifest.webmanifest` : `display: standalone`, scope `/`, nom, langue et couleurs de thème/fond.
- Icônes PNG 192/512, maskable 512 et Apple 180, générées depuis la géométrie/couleurs du favicon existant, sans nouvelle dépendance.
- Metas mobiles Apple/standard, `theme-color`, `viewport-fit=cover`, lien Apple touch icon et manifest dans `index.html`.
- `start_url` n'est pas fixé à `/` pour ne pas forcer une invitation épinglée à ouvrir le dashboard. Le fallback est la page qui référence le manifest. Certains navigateurs demandent toutefois une URL de démarrage explicite pour leur installation PWA : la préparation standalone ne garantit donc pas une invite d'installation partout. [Référence MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/start_url).
- Aucun service worker/cache offline ajouté : les invitations privées/achetées ne sont pas conservées hors ligne, et le serveur reste consulté pour leur disponibilité/expiration.

La barre d'adresse et les boutons système restent contrôlés par le navigateur. Le mode installé/ajout à l'écran d'accueil dépend de ses capacités ; aucune disparition forcée ou hack navigateur n'est utilisé.

## Fichiers

Modifiés :

- `src/components/preview/PreviewMode.tsx`
- `src/pages/PublicInvitePage.tsx`
- `src/components/renderer/WeddingRenderer.tsx` (export du helper de fond existant uniquement)
- `index.html`

Ajoutés :

- `src/features/viewer/InvitationViewer.tsx`
- `src/features/viewer/invitationViewer.css`
- `src/features/viewer/useViewerViewport.ts`
- `src/features/viewer/viewerViewport.ts`
- `public/manifest.webmanifest`
- `public/icons/icon-192.png`
- `public/icons/icon-512.png`
- `public/icons/icon-maskable-512.png`
- `public/icons/apple-touch-icon.png`
- `scripts/generate-pwa-icons.mjs`
- `tests/invitation-viewer.test.mjs`
- `tests/invitation-viewer.browser.html`
- `tests/invitation-viewer.browser.tsx`
- ce rapport et les deux captures `docs/invitation-viewer-*-20261012.jpg`

## Vérifications

- `npm run build` : **réussi**, Node **22.23.3**, TypeScript + Vite. Avertissement existant de taille du bundle, non bloquant.
- **475 tests réussis**, 0 échec/ignoré, dont 6 tests ajoutés : support portrait/paysage tactile, clavier/pinch, verrou/restauration/ref-count/inert, intégration des deux modes, styles/scroll et PNG/manifest.
- Contrôles visuels avec le skill **Computer Use**, dans un navigateur local Chromium, Supabase/écritures distantes désactivés par la fixture.
- 390 × 844 : viewport et document bord à bord ; faire-part de 2 760 px scrollé jusqu'à la fin (scroll interne 1 916 px), body à 0, largeur sans débordement.
- Aperçu et Public : mêmes dimensions ; absence de contrôles d'Aperçu en Public et absence de header/footer du site.
- 844 × 390, 768 × 1 024 et 1 024 × 768 : viewport à la taille attendue, pas de débordement horizontal/body. Le support tactile paysage est testé unitairement ; le navigateur local reste à pointeur souris.
- Enveloppe et Porte fermées : stage à 390 × 844, scroll interne verrouillé. Après ouverture : document long et scroll interne disponibles. Porte tablette paysage : stage à 1 024 × 768.
- Couverture d'accueil : plein viewport sans scroll utilisateur ; après Entrer, couverture retirée et scroll du document disponible.
- Sortie de l'Aperçu : body redevient statique et scrollable. À 1 440 × 900, retour au simulateur desktop existant, sans viewer mobile.
- Aucun message console de niveau erreur pendant ces contrôles.

Pas d'appareils Android/iPhone physiques, Brave Android ou Safari iOS disponibles pour valider leurs barres d'adresse, clavier natif, safe areas et installation réelle. Ces contrôles restent à faire après déploiement. Aucun déploiement production effectué.
