# Enveloppe immersive — 6 octobre 2026

## Analyse des vidéos avant modification

Les deux MP4 fournis ont été décodés localement dans le navigateur, avec 20 images réparties sur chaque vidéo. Aucun transfert externe.

- Vidéo actuelle : 6,13 s, 838 × 1044. Petite enveloppe avec marges importantes ; rabat qui pivote, puis carte qui monte à partir d’environ 1,8 s. À partir d’environ 4 s, changement brutal d’échelle/layout avant le retour dans le téléphone.
- Référence : 3,13 s, 700 × 1268. La démonstration montre d’abord l’invitation, puis une enveloppe remplissant le téléphone vers 0,47 s. Entre environ 0,78 et 2,2 s, les pans s’écartent et révèlent l’image déjà en place, sans extraction d’une petite carte. Le mouvement de référence est asymétrique ; l’implémentation reprend son principe immersif avec la séquence de quatre pans explicitement demandée.

## Structure et animation

Ordre : invitation → intérieur → gauche → droite → bas → rabat supérieur → cachet → bouton d’ouverture transparent.

L’invitation est montée une seule fois, dans une couche isolée de z-index 0. L’enveloppe est dans une couche isolée supérieure. Ses triangles utilisent des coordonnées en pourcentage et couvrent tout le viewport. Le contenu ne change jamais de taille pendant la révélation.

Durée par défaut : 1,6 s, réglable de 1,2 à 1,8 s. Courbe douce, sans rebond.

| Couche | Début | Durée à 1,6 s | Mouvement |
| --- | --- | --- | --- |
| Cachet | 0 ms | 280 ms | Léger détachement, réduction, fondu |
| Rabat supérieur | 150 ms | 600 ms | Pivot rotateX −175° autour de la charnière supérieure |
| Intérieur | 150 ms | 300 ms | Fondu, avant la révélation latérale |
| Gauche | 450 ms | 700 ms | Sortie à gauche |
| Droite | 500 ms | 700 ms | Sortie à droite |
| Bas | 700 ms | 900 ms | Sortie vers le bas |

La fin du pan inférieur termine la séquence. Le groupe de papier est démonté, `inert` est retiré du contenu et le document peut défiler normalement. Deux refs empêchent les doubles déclenchements et doubles callbacks. Le replay remonte l’expérience complète dans le viewport existant.

Le papier réutilise `resolveSectionTexture` / Papier doux : matière neutre teintée par les couleurs de l’enveloppe. SVG légers et cache existant ; aucun traitement pixel par pixel pendant l’animation.

Les animations des éléments du document démarrent au clic derrière les pans, plutôt qu’après leur disparition. Les délais configurés sont conservés. Le contenu n’est pas recréé à la fin.

`prefers-reduced-motion` : fondu de 180 ms, sans translation ni pivot.

## Cachet personnalisé

Dans les paramètres de l’enveloppe : Importer mon cachet / Remplacer / Revenir au cachet de cire.

Configuration dans `opening.customSettings` :

```ts
{
  // Réglages existants conservés
  sealImageUrl?: string;
  sealImageName?: string;
  sealAssetId?: string;
}
```

- PNG, WebP et JPEG ; extension et MIME concordants ; maximum 10 Mo.
- Décodage de l’image avant upload ; aucun fond forcé, masque alpha ou recolorisation.
- Uploader partagé `uploadProjectAsset(project, file, "image")` : `wedding-assets/{ownerId}/{projectId}/images/{uuid}-{filename}`.
- L’asset est sélectionné uniquement si le projet et l’ouverture sont toujours actifs après l’upload.
- Retour au cachet par défaut : détache la référence sans supprimer physiquement un fichier potentiellement utilisé ailleurs.
- Si l’image ne charge pas, cachet SVG de cire en fallback.
- Le collecteur récursif de templates existant détecte cette URL imbriquée et la réécrit : test local des helpers réels réussi. Aucun changement backend nécessaire.

Les anciens projets gardent leurs couleurs et leur texte d’indication. Les anciennes durées de l’animation « carte montante » utilisent 1,6 s au rendu, sans migration ni écriture automatique dans les données.

## Vérifications réalisées

- 12 nouveaux tests automatisés : paramètres, anciens projets, timing, reduced motion, calques, matière teintée, original du cachet, validation fichiers, garde anti-double clic, aperçu partagé, sauvegarde locale, snapshot indépendant et collecteur/réécriture template.
- Suite complète : **327 tests réussis**, 0 échec, 0 ignoré.
- **`npm run build` réussi** (`tsc -b && vite build`). Avertissement existant : bundle principal supérieur à 500 ko.
- Aperçu principal et aperçu de l’ouverture : Smartphone 390 × 844, Tablette 768 × 1024, PC 1440 × 900. Taille des pans = taille physique du viewport, pas hauteur du document.
- Renderer Public réel testé localement avec largeurs navigateur 390, 768 et 1440 : breakpoint automatique correct, contenu et pans de même largeur.
- Clic et Entrée clavier : ouverture complète ; double clic : une interaction et un callback de fin.
- 275 mesures pendant une ouverture : même nœud, largeur 390 inchangée, position verticale inchangée ; fin mesurée à environ 1612 ms.
- Après ouverture, action de bouton du document fonctionnelle. Replay : quatre pans + cachet restaurés.
- Scroll initial de l’aperçu : 0. Après ouverture : viewport 844 px, document 1270 px, défilement interne conservé.
- Cachet PNG transparent multicolore : couleurs et alpha conservés, pas de carré opaque ; palette olive avec matière visible ; sauvegarde/relecture locale réussie.
- Élément texte avec fondu 1 s : opacité initiale 0 derrière les pans, finale 1 lors de la fin de l’ouverture, sans remontage ni changement d’échelle.
- Dernier passage dans un onglet frais : aucun warning ni erreur console. Le serveur et les onglets locaux créés pour les essais ont été fermés.

Limites explicites : aucun upload réel ni test Storage distant effectué pour ce changement ; le chemin existant et ses contrôles d’accès sont réutilisés. Aucun déploiement ou test sur le site de production. Reduced motion vérifié par tests de timeline et de code, pas par changement du réglage système. Aucun essai tactile sur appareil physique.

## Fichiers de cette modification

- `src/features/openings/animations/VerticalEnvelopeOpening.tsx` — nouveau renderer.
- `src/features/openings/envelopeSettings.ts` — fallbacks, timeline et validation.
- `src/features/openings/EnvelopeSealControls.tsx` — import du cachet.
- `src/features/openings/OpeningProperties.tsx` — contrôle du cachet et durée.
- `src/features/openings/OpeningPreview.tsx` — réutilisation du vrai viewport.
- `src/features/openings/registry/openingRegistry.ts` — description et durée par défaut.
- `src/components/preview/PreviewMode.tsx` — emplacement optionnel pour l’action Utiliser.
- `src/features/music/InvitationExperience.tsx` — animations du document dès le clic pour Enveloppe seulement.
- `src/types/editor.ts` — trois propriétés optionnelles de cachet.
- `src/styles.css` — géométrie plein viewport, matière, relief, calques et suppression des règles de carte montante.
- `tests/envelope-opening.test.mjs`, `tests/envelope-opening.browser.html`, `tests/envelope-opening.browser.tsx` — tests.

Les modifications de textures de Section déjà présentes dans le workspace sont conservées ; leur helper est réutilisé sans le modifier pour cette tâche.

Captures : `docs/qa/20261006-immersive-envelope/`.

## Nettoyage et production

Les deux copies temporaires de MP4 dans `public/__qa-envelope` et la page de décodage temporaire ont été retirées. Les originaux dans Téléchargements restent intacts. Le build final ne contient aucun de ces MP4.

Aucun secret, schéma Supabase, fonction Stripe/RSVP ou déploiement Netlify modifié.
