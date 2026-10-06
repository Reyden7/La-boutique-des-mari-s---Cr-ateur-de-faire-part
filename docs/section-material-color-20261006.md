# Couleur + texture : conservation de la teinte — 6 octobre 2026

## Cause

Le mode combiné utilisait la même texture beige/grise opaque que le mode Texture seule. Le slider réglait l'opacité brute de cette image. À 100 %, le bitmap cachait entièrement la couleur de fond.

## Correction

`resolveSectionTexture` produit désormais une surface SVG autonome uniquement pour Couleur + texture :

1. neutralisation du pigment de base de la matière en gris moyen ;
2. extraction de sa luminance avec `feColorMatrix` ;
3. transfert des ombres/lumières sur les trois composantes RGB de la couleur choisie, avec un même facteur scalaire ;
4. limitation de la variation à ±18 % à pleine intensité, avec une limite supplémentaire de luminosité empêchant l'écrêtage d'un seul canal et donc les dérives de teinte ;
5. rendu du fond et de la matière dans une surface achevée dont l'alpha du fond est appliqué une seule fois.

Cette technique de matière teintée par luminance remplace les modes CSS/Canvas distincts : Konva et SVG affichent **la même source générée**. Aucun `mix-blend-mode` dépendant du fond de page, aucun calcul de pixels JavaScript à chaque frame. Le cache des SVG est borné à 64 configurations ; les déplacements n'en changent pas la clé. La source change seulement avec la texture, la couleur/alpha, l'intensité, les dimensions ou l'application/échelle.

À 0 %, la matière produit exactement la couleur de base. À 25/50/100 %, seul le contraste tonal augmente. Texture seule continue d'afficher les couleurs originales avec une opacité normale. Les thumbnails de la bibliothèque restent les originaux.

Le champ existant `textureOpacity` est conservé : intensité de matière en mode combiné, opacité bitmap en mode Texture seule. Aucun nouveau format de sauvegarde ou migration. L'UI affiche « Intensité de la texture » pour le premier et « Opacité texture » pour le second.

## Fichiers concernés par cette correction

- `src/config/sectionTextures.ts` : neutralisation, transfert RGB, surface commune et cache borné.
- `src/features/elements/SectionSurface.tsx` : source matérielle complète dans les clips existants, sans seconde couche de couleur/alpha.
- `src/features/elements/SectionCanvasSurface.tsx` : même source complète en Konva, sans seconde couche de couleur/alpha.
- `src/features/elements/SectionBackgroundControls.tsx` : label et explication.
- `src/types/editor.ts` : commentaire sur les deux sens de textureOpacity.
- `tests/section-textures.test.mjs` : tests de neutralisation des onze matières, conservation des proportions RGB, intensité, alpha unique, couleurs saturées, cache et compatibilité/persistance.
- `tests/section-textures.browser.tsx` : cas vert olive, tests pixel, intensités, alpha et bordures haute/basse.
- Rapports et `docs/qa/20261006-section-material-color/`.

## Validation

- **315 tests automatisés réussis**, zéro échec.
- **92 comparaisons de surface Éditeur/Aperçu + 92 Éditeur/Public**, dans les composants réels, sur projet local en mémoire :
  - Smartphone, Tablette, PC ; Couleur / Texture / Couleur + texture ; Couvrir / Contenir / Répéter ; avec/sans bordure haute vague et basse déchirure (54 cas) ;
  - chacune des onze textures en olive à 100 % (11 cas) ;
  - Organique et Papier humide aux intensités 0/25/50/100 % sur les trois supports (24 cas) ;
  - alpha du fond à 128/255 sur les trois supports, sans cumul (3 cas).
- Comparaison Canvas/SVG : différence moyenne maximale de 0.631 / 255, liée aux interpolations du mode Texture seule. Le cas organique olive à 100 % donne une différence moyenne de 0.099 / 255 et un écart maximal de 1.
- Dans ce cas, les échantillons opaques gardent R = G, le rapport B/R du vert `#85855F`, des variations de 133 à 139 pour le canal vert et un alpha de 255 : la matière ne remplace pas la couleur. Tests automatiques vérifiant aussi les limites de variation, le fond semi-transparent, la couleur exacte à intensité 0 et les bounds du Transformer.
- Contenu texte lisible au-dessus et indépendant des clips.
- Build final : `npm run build` **OK** ; avertissement existant de bundle > 500 kB, aucune erreur.

Validation locale, sans publication distante : aucune modification de Supabase, Netlify, secrets ou paiements. Le mode Public est testé avec son renderer réel localement, pas sur un faire-part déployé.
