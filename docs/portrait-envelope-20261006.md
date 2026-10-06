# Enveloppe portrait avec lettre verticale — 6 octobre 2026

Cette version remplace l’ouverture diagonale précédente suivant la nouvelle demande : objet enveloppe identifiable, rabats articulés et lettre verticale distincte.

## Comparaison des vidéos

Analyse réelle dans le navigateur, avec décodage vidéo natif et extraction de 24 images par vidéo :

- Actuelle : `20261006-1500-51.9439036.mp4`, 2,43 s, 790 × 1156.
- Référence fournie : `20261006-1404-23.6056268.mp4`, 3,13 s, 700 × 1268.

L’actuelle couvre le téléphone avec des pans formant un X : ils se séparent en diagonale et révèlent directement le document, sans contenant ni lettre distincts. Le document devient visible autour de 1,1–1,4 s dans l’enregistrement.

La référence montre un objet portrait, un papier plus texturé, un cachet en relief et une photo portrait qui reste verticale pendant la révélation. Entre environ 0,79 et 2,11 s, les pans révèlent progressivement la photo sans carte paysage ni projection vers quatre coins.

La vidéo de référence montre aussi un glissement asymétrique et un déplacement latéral du cachet ; elle ne permet pas d’isoler une charnière 3D supérieure de façon certaine. La nouvelle mécanique suit donc les instructions explicites du texte : cachet, rabat articulé, côtés, bas, lettre puis contenu. Elle ne prétend pas reproduire chaque image de la référence à l’identique.

Les planches de comparaison et les captures du nouveau rendu sont conservées dans `docs/qa/20261006-portrait-envelope/`.

## Géométrie

`getEnvelopeFrame()` est la source de vérité partagée par Aperçu/Public. Ratio largeur/hauteur de l’enveloppe et de la lettre : **0,52** (environ **1:1,92**).

Pour un viewport logique W × H :

```ts
envelopeWidth = min(W * 0.92, H * 0.82 * 0.52, 440)
envelopeHeight = envelopeWidth / 0.52
letterWidth = envelopeWidth * 0.94
letterHeight = envelopeHeight * 0.94
letterScale = letterWidth / W
letterLift = min(12, envelopeHeight * 0.02)
```

L’enveloppe reste centrée, avec ses propres bords et ombre. Sur Smartphone 390×844 : enveloppe 358,8×690, soit 92% de la largeur et environ 82% de la hauteur. Sur Tablette 768×1024 : environ 436,6×839,7. Sur PC 1440×900 : environ 383,8×738 ; elle n’est jamais élargie en paysage.

Les dimensions sont lues via `ResizeObserver.contentRect` et `clientWidth/clientHeight`, sans utiliser un rectangle écran affecté par le zoom du Preview. Le viewport physique, pas la hauteur du document, détermine la géométrie.

## Structure DOM / SVG et couches

```text
portrait-envelope-stage
├─ mesure du viewport (invisible, aucun Pointer Event)
├─ motion.envelope-invitation : un seul document vivant (z=0)
└─ envelope-overlay (z=5, contexte extérieur)
   └─ envelope-object : objet portrait centré, perspective
      ├─ dos intérieur                     z=2
      ├─ panneau avant inférieur           z=3
      ├─ rabat gauche                      z=4
      ├─ rabat droit                       z=5
      ├─ rabat supérieur, deux faces        z=6
      ├─ bouton transparent d’ouverture    z=8
      ├─ indication                        z=9
      └─ cachet de cire SVG / image         z=10
```

Les rabats sont de vrais panneaux DOM animés, avec des surfaces triangulaires en `clip-path`. Le haut pivote sur la ligne de pli `transform-origin: 50% 0`. Il possède deux faces : extérieur et intérieur retourné de 180°, avec `backface-visibility: hidden`. Les côtés pivotent sur les bords gauche/droit ; le bas sur son bord inférieur.

Le SVG local du cachet reste disponible, ainsi que l’image personnalisée originale avec couleurs et transparence, en `object-fit: contain`. Le cachet possède le z-index interne le plus élevé.

Les surfaces réutilisent la matière « Papier doux », teintée suivant Papier / Intérieur / Rabat. Le calcul de texture est mémorisé par couleur, jamais effectué à chaque frame. Ombres fines sur les plis, shadow propre à l’enveloppe et shadow distincte de la lettre.

## Animation à la durée par défaut de 1,5 seconde

| Élément | Timing | Mouvement |
| --- | --- | --- |
| Cachet | 0 → 250 ms | Scale 0,85, léger détachement 8 px, fade |
| Rabat supérieur | 200 → 700 ms | Pivot `rotateX(-110°)` ; intérieur visible |
| Dos intérieur | 350 → 700 ms | Se dégage progressivement pour révéler la lettre |
| Gauche | 500 → 1000 ms | `rotateY(-58°)`, translation de -8% de sa propre largeur |
| Droite | 540 → 1040 ms | `rotateY(+58°)`, translation de +8% de sa propre largeur |
| Panneau inférieur | 800 → 1200 ms | `rotateX(58°)`, abaissement de 6% de sa hauteur |
| Lettre | 700 → 1200 ms | Remontée douce de 12 px maximum |
| Transition vers le faire-part | 1200 → 1500 ms | Enveloppe fondue, lettre uniformément agrandie vers le document |

Durée configurable de 1,3 à 1,6 s ; tous les timings suivent proportionnellement. Les anciennes durées hors plage utilisent le fallback 1,5 s, sans réécriture destructive des projets.

Pas de déplacements ±104%, pas de mouvement vers quatre coins, pas d’éjection brutale d’une carte. La lettre reste portrait jusqu’à la transition vers le vrai document. Elle affiche sa première portion visible, puisque le faire-part complet peut être beaucoup plus long qu’une lettre/écran.

## Préservation du document et fin

Le document réel est monté **une seule fois**. Aucun clone des formulaires, cartes, audio ou autres composants interactifs. Ses coordonnées responsive et sa largeur logique restent inchangées ; seul le wrapper extérieur est uniformément mis à l’échelle pour former la lettre. Pas d’étirement X/Y indépendant.

À la fin du mouvement de la lettre : callback protégé contre les doubles déclenchements, suppression de l’overlay, retrait de `inert`, taille naturelle et scroll restaurés. Le fond crème, le rayon et l’ombre temporaires de la lettre sont retirés pour ne pas modifier un design transparent.

« Rejouer » remonte la même expérience : lettre derrière, rabat/côtés/bas fermés, cachet présent. Les gardes synchrones maintiennent un seul `onInteract` et un seul `onComplete` en cas de double clic.

## Fichiers modifiés dans cette correction

- `src/features/openings/animations/VerticalEnvelopeOpening.tsx`
- `src/features/openings/envelopeSettings.ts`
- `src/features/openings/OpeningProperties.tsx`
- `src/features/openings/registry/openingRegistry.ts`
- `src/styles.css`
- `tests/envelope-opening.test.mjs`
- `tests/envelope-opening.browser.tsx`
- Ce rapport et les captures QA.

Les importeurs de cachets, les flows Storage/templates, les types de données, Stripe/RSVP et les autres ouvertures n’ont pas été modifiés dans cette correction.

## Vérifications réalisées

- **328 tests automatisés réussis**, 0 échec, 0 ignoré ; dont 13 tests de l’enveloppe.
- Ratio et limites de l’enveloppe/lettre : Smartphone, Tablette, PC, grand écran, viewport paysage et très petit viewport. L’objet reste portrait dans tous les cas.
- Preview réel pour les trois formats : ratio mesuré environ 0,52, lettre et enveloppe centrées, phases de rabats visibles et contenu final correct.
- Renderer Public réel exécuté localement aux viewports 390×844, 768×1024, 1440×900 : bon breakpoint automatique et même mécanique.
- Pendant les animations, mesures DOM : même nœud du document, largeur logique stable, rotation 3D du haut, côtés qui se dégagent, bas qui s’abaisse, overlay final absent.
- Mesures Preview à 1,5 s : environ 1514 ms Smartphone, 1514 ms Tablette, 1516 ms PC, incluant le rendu navigateur.
- Durées extrêmes via le slider : 1314 ms à 1,3 s ; 1609 ms à 1,6 s.
- Double clic sur les trois supports : un seul démarrage et une seule fin. Action du faire-part utilisable après ouverture.
- Rejouer en Preview et Public : quatre panneaux fermés, cachet rétabli, lettre non interactive derrière.
- Cachet PNG transparent, palette olive/intérieur distinct, ouverture au clavier, contenu configuré en fondu, sauvegarde/rechargement local de la configuration : vérifications réussies.
- Console de la fixture : aucune erreur ni warning pendant les contrôles.
- Compatibilité anciens paramètres et cachet conservé dans un snapshot indépendant ; collecteur des assets de template vérifié sans appel réseau.
- **`npm run build` réussi** (`tsc -b` puis Vite). Seul avertissement non bloquant : bundle JavaScript supérieur à 500 Ko.

## Limites et nettoyage

Vérifications visuelles réalisées avec le skill Computer Use. Le mode réduction des animations est testé au niveau de sa logique (pas de rotations ni de déplacement des rabats, séquence raccourcie), sans émulation système. Pas de test sur un appareil tactile physique ; les vrais boutons React et événements tactiles existants restent utilisés.

Aucun déploiement Netlify/Supabase, aucune donnée distante créée, aucun secret modifié et aucun paiement. Les confirmations Public concernent son renderer exécuté localement, pas une nouvelle version déployée du site.

Les copies temporaires des vidéos et la page d’extraction ont été retirées de `public` avant le build. Les vidéos originales sont conservées.
