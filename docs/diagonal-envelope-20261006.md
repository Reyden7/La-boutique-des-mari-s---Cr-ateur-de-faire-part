# Enveloppe : fermeture diagonale à quatre pans — 6 octobre 2026

## Comparaison effectuée avant modification

Vidéos analysées par décodage natif du navigateur et extraction de 24 images par vidéo :

- Référence : `20261006-1404-23.6056268.mp4`, 3,13 s, 700 × 1268.
- Vidéo actuelle effectivement jointe : `20261006-1448-55.1788751.mp4`, 3,73 s, 822 × 1064.

Le fichier nommé initialement `20261006-1438-52.7167161.mp4` n’était pas accessible. La nouvelle pièce jointe a permis la comparaison réelle.

La vidéo actuelle montre un grand triangle supérieur, avec une révélation commençant en haut, puis des pans latéraux et inférieurs. Le renderer utilisait effectivement `rotateX: -175`, une face avant/arrière du rabat et une doublure couvrant le contenu.

La référence révèle la photo par une séparation oblique directement dans les plis. Son mouvement est asymétrique, notamment celui du cachet ; ce n’est pas exactement le mouvement à quatre coins demandé dans le texte. La nouvelle version reprend la fermeture graphique croisée et applique les quatre directions expressément demandées, sans prétendre copier chaque image de la vidéo.

## Nouvelle géométrie

`ENVELOPE_PANELS` définit quatre quadrilatères normalisés. Tous rejoignent exactement le centre `(50%, 50%)`. Les quatre formes couvrent toute la surface fermée, sans rectangle visible, sans rabat supérieur à charnière et sans doublure.

| Pan | Sommets en % | Translation finale | z-index interne |
| --- | --- | --- | --- |
| Haut-gauche | (0,0), (90,0), (50,50), (0,10) | (-104%, -104%) | 2 |
| Haut-droit | (90,0), (100,0), (100,90), (50,50) | (+104%, -104%) | 3 |
| Bas-gauche | (0,10), (50,50), (10,100), (0,100) | (-104%, +104%) | 4 |
| Bas-droit | (50,50), (100,90), (100,100), (10,100) | (+104%, +104%) | 5 |

Les wrappers occupent le viewport physique de l’introduction, jamais la hauteur totale du document. Le `clip-path` est porté par l’enfant papier : l’ombre légère de son parent peut déborder sur les pans voisins. Le grain mat utilise le système existant de matière teintée.

Le faire-part reste à z-index 0 dans un contexte isolé. L’overlay est à z-index 5 dans le contexte extérieur. À l’intérieur de l’overlay : pans 2–5, bouton transparent 8, indication 9, cachet 10. Le cachet a donc réellement le plus haut z-index interne. Le bouton invisible intercepte le clic sur toute la surface ; les éléments visuels du cachet et de l’indication ont `pointer-events: none`.

## Séquence et durée

Durée par défaut : **1,2 s**, réglable de **1,0 à 1,4 s**. Une ancienne durée hors de cette plage utilise le fallback 1,2 s sans migration destructive.

À 1,2 s :

- Cachet : réaction douce, scale à 0,85, léger déplacement de 8 px et disparition entre 0 et 0,26 s.
- Haut-gauche : 0,14 → 1,06 s.
- Haut-droit : 0,16 → 1,12 s.
- Bas-gauche : 0,18 → 1,14 s.
- Bas-droit : 0,20 → 1,20 s.

Les quatre translations se chevauchent. Aucun `rotateX`, aucun flip 3D, aucune carte montante. Le papier reste opaque pendant son déplacement : la révélation provient du déplacement des formes, pas d’un fondu artificiel du papier. Seul le mode de réduction des animations utilise un court fondu de 0,18 s sans déplacement.

Le callback final du dernier pan démonte tout l’overlay, restaure les interactions et le scroll. Les gardes synchrones empêchent un double clic de déclencher deux ouvertures. « Rejouer » remonte l’expérience avec les quatre pans et le cachet fermés, comme auparavant.

## Contenu et cachet personnalisé

Le même nœud du faire-part reste monté pendant toute l’ouverture. Aucune translation, modification de largeur ou remontage du contenu. Les animations propres au contenu continuent à être déclenchées derrière les pans via la logique existante d’`InvitationExperience`.

Le cachet importé reste une image originale `object-fit: contain`, avec ses vraies couleurs et son alpha, et un fallback SVG en cas de chargement invalide. Les champs enregistrés et le workflow Storage existants sont inchangés. `flapColor` est conservé pour la compatibilité des données, mais désigne désormais la teinte des pans d’accent. L’ancienne couleur d’intérieur reste conservée dans les données, sans couche de doublure ni réglage trompeur « Intérieur » dans cette UI.

## Fichiers modifiés dans cette correction

- `src/features/openings/animations/VerticalEnvelopeOpening.tsx` — mécanique remplacée par quatre pans diagonaux.
- `src/features/openings/envelopeSettings.ts` — géométrie partagée, durée et séquence.
- `src/features/openings/OpeningProperties.tsx` — nouveaux libellés papier/pans d’accent et plage de durée.
- `src/features/openings/registry/openingRegistry.ts` — description et durée par défaut.
- `src/styles.css` — suppression du rabat/3D/doublure, masques polygonaux et couches.
- `tests/envelope-opening.test.mjs` — tests adaptés et couverture géométrique ajoutée.
- `tests/envelope-opening.browser.tsx` — relevés de directions, opacité du papier et suppression de l’overlay.
- Ce rapport et les captures dans `docs/qa/20261006-diagonal-envelope/`.

Les modifications antérieures de `OpeningPreview`, `PreviewMode`, `InvitationExperience`, des types et des textures sont conservées, sans nouveau changement de ces fichiers dans cette correction.

## Tests réalisés

- **328 tests automatisés réussis**, 0 échec, 0 test ignoré, dont 13 tests enveloppe.
- Couverture de toute la surface par les quatre quadrilatères, aire totale 100%, intersection du cachet, et sortie complète sur 390×844, 768×1024 et 1440×900.
- Trois formats du vrai `PreviewMode`, fermeture/ouverture et centrage exact du cachet.
- Renderer `InvitationExperience mode="public"` testé localement aux dimensions réelles 390×844, 768×1024 et 1440×900 : layout choisi automatiquement et viewport correspondant.
- Mesures DOM pendant les animations : même nœud du contenu, largeur et position verticale stables, quatre directions correctes, papier opaque et aucun overlay final.
- Durées mesurées dans la fixture : Smartphone 1223 ms, Tablette 1219 ms, PC 1220 ms (rendu navigateur inclus).
- Double clic : un seul `onInteract` et un seul `onComplete`. Clic interne du faire-part possible après ouverture.
- Rejouer en Aperçu et Public : quatre pans et un cachet restaurés.
- Cachet PNG transparent, palette olive, sauvegarde/rechargement local de la configuration, ouverture via Entrée et contenu avec fondus : vérifications visuelles réussies.
- Console navigateur testée : aucune erreur ni warning pendant ces contrôles.
- Validation de la plage de durée, du chemin réduit-motion et des anciens paramètres ; conservation du cachet dans un snapshot indépendant et détection/réécriture par le collecteur de templates existant, sans appel réseau.
- **`npm run build` réussi** (`tsc -b` + Vite). Avertissement non bloquant existant : bundle JavaScript supérieur à 500 Ko.

Vérification visuelle via le skill Computer Use. Les screenshots sont des captures du renderer réel local, pas des maquettes. Les copies temporaires des vidéos ont été retirées de `public` avant le build ; les originaux sont conservés.

## Limites / production

Aucun déploiement Netlify/Supabase, aucune modification de secret, aucun paiement. Les validations Public portent sur le renderer de production exécuté localement, pas sur une nouvelle version déployée du site. Aucun test sur appareil tactile physique ; le bouton React partagé et son fonctionnement tactile existant sont conservés. La variante reduced-motion est couverte par les tests de logique, pas par une émulation système en navigateur.
