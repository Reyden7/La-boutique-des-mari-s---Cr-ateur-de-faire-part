# Enveloppe Smartphone personnalisable — 7 octobre 2026

## Résultat

La nouvelle `base1.png` a remplacé l’ancien fichier, sans retouche. Les neuf PNG sont intégrés : trois bases, trois rabats et trois cachets. Les trois choix sont indépendants. Les bibliothèques et imports se trouvent dans **Introduction > Enveloppe**, sous trois `PropertySection` (Base, Rabat, Cachet).

La fonction `getPngEnvelopeLayout`, les dimensions des groupes, leurs positions, leurs déplacements, le délai de 0,08 s, la durée Smartphone et l’easing n’ont pas été modifiés. Le cachet reste une image enfant du groupe droit. Le contenu réel reste monté une seule fois derrière les images. Tablette et PC utilisent toujours `VerticalEnvelopeOpening` et leurs anciens réglages.

## Données sauvegardées

```ts
opening.envelope?: {
  baseAsset?: EnvelopeAssetRef;
  flapAsset?: EnvelopeAssetRef;
  sealAsset?: EnvelopeAssetRef;
  customBases?: EnvelopeAssetRef[];
  customFlaps?: EnvelopeAssetRef[];
  customSeals?: EnvelopeAssetRef[];
}

type EnvelopeAssetRef = {
  type: "preset" | "custom" | "global";
  id?: string;
  url: string;
  name?: string;
  assetId?: string;
  width?: number;
  height?: number;
};
```

Les IDs des presets sont explicites (`base-natural`, `flap-olive`, `seal-gold-rings`, etc.) et ne reposent pas sur la reconnaissance du nom du fichier. Les anciens projets sans configuration utilisent `base1 / rabat1 / cachet1`. Les listes absentes valent `[]`.

`type: "global"` et les URL globales sont pris en charge par le résolveur et conservés dans les snapshots. L’ajout des catégories `envelope_base / envelope_flap / envelope_seal` à la bibliothèque générale et à son schéma reste une future étape : aucune migration ni publication globale n’a été faite ici.

## Imports et suppression

PNG et WebP uniquement, validation de l’extension ET du MIME, taille de 1 octet à 5 MiB, décodage avant upload et dimensions non nulles. Les fichiers sont envoyés tels quels : aucune compression, recolorisation ou suppression du canal alpha. La miniature affiche directement l’image originale, en lazy loading.

Chemins du véritable uploader, testés avec Auth/Storage simulés :

```text
wedding-assets/{userId}/{projectId}/envelope/bases/{uuid}-{filename}
wedding-assets/{userId}/{projectId}/envelope/flaps/{uuid}-{filename}
wedding-assets/{userId}/{projectId}/envelope/seals/{uuid}-{filename}
```

Les contrôles de session, de propriétaire de projet et les policies existantes sont réutilisés. Les sous-dossiers autorisés sont explicitement listés ; aucun chemin arbitraire n’est accepté. Aucune clé privilégiée ajoutée.

L’import ajoute et sélectionne automatiquement le fichier. Des dimensions différentes sont acceptées avec un avertissement ; `object-fit: contain` conserve le ratio dans les boîtes existantes, sans recalculer l’animation.

Une suppression d’image utilisée nécessite une confirmation intégrée au panneau. Annuler ne change rien. Confirmer retire l’image de la liste et rétablit le preset correspondant si nécessaire. Les références sont enregistrées avant la suppression physique ; si l’URL subsiste ailleurs dans le projet, le fichier reste en Storage. Un échec d’enregistrement/suppression est signalé, sans suppression aveugle. Presets et assets globaux n’ont pas d’action de suppression.

Les trois images sélectionnées sont chargées avant l’ouverture. Un échec déclenche le fallback correspondant. Si un fallback échoue également, l’ouverture reste possible une fois les trois tentatives terminées. Les autres images encore en chargement ne sont pas ignorées.

## Gabarits réellement téléchargeables

| Partie | Canvas | Fichier |
| --- | --- | --- |
| Base | 941 × 1672 | `public/envelope-templates/envelope-base-template.png` |
| Rabat | 941 × 1672 | `public/envelope-templates/envelope-flap-template.png` |
| Cachet | 1254 × 1254 | `public/envelope-templates/envelope-seal-template.png` |

`scripts/generate-envelope-templates.mjs` extrait exactement les canaux alpha des assets par défaut, conserve le canvas et remplace seulement les RGB par un gris neutre. Aucun dessin approximatif ou texture générée. Les tests comparent chaque pixel alpha. Les trois téléchargements navigateur ont été réalisés et leurs SHA-256 correspondent aux fichiers source du projet. Ils sont disponibles dans le dossier Downloads, sous les noms `modele-{base|rabat|cachet}-enveloppe-laboutiquedesmaries.png`.

## Vérifications

**349 tests locaux passent, 0 échec. `npm run build` passe.** Avertissement Vite existant : bundle JavaScript supérieur à 500 kB. Aucune nouvelle dépendance.

| Cas | Résultat / portée |
| --- | --- |
| Modèles mélangés : base bordeaux, rabat olive, cachet doré | Vérifié dans le navigateur, vrai Preview |
| Neuf combinaisons base/rabat, 320×568 / 390×844 / 430×932 | Contrôle alpha échantillonné : aucun interstice détecté |
| Base personnalisée, rabat personnalisé, cachet personnalisé | Imports de vrais PNG via les contrôles ; Storage localhost en mémoire |
| Trois imports sélectionnés ensemble | Vrai Preview et vrai renderer Public local, images chargées et colorées |
| WebP transparent | Import, sélection immédiate, avertissement de dimensions et rendu Preview vérifiés avec un bitmap synthétique |
| MIME / extension incorrects | Tests unitaires ; refus visible dans l’UI avec un fichier JSON |
| Fichier >5 MiB / vide | Refus testé unitairement |
| Sauvegarde/rechargement | Références actives et bibliothèques conservées : vrai stockage local + tests normalisation |
| Animation et rejeu | Aperçu rejoué ; 189–190 échantillons sur environ 1111–1112 ms, document stationnaire, même nœud, cachet attaché, translations horizontales, overlay retiré |
| Suppression | Annulation puis confirmation testées ; retour au rabat par défaut, liste retirée |
| Référence utilisée ailleurs | Véritable helper testé avec fixtures : aucune suppression ni écriture quand l’URL reste utilisée |
| Asset inaccessible | URL locale 404 : remplacement par `base1`, ouverture complète sans blocage |
| Ancien projet | Defaults testés, aucun nouveau champ obligatoire |
| Tablette / PC | Vérification navigateur : renderer historique présent, renderer PNG absent |
| Template | Véritable handler `publish-template` exécuté avec Auth/DB/Storage simulés : copie des trois sous-dossiers, réécriture des références actives et listes, déduplication, URL globale/preset conservée |
| Instanciation / indépendance | Véritable helper de snapshot et instanciation testé ; les changements de la copie ne modifient pas le template |
| Téléchargements | Trois fichiers téléchargés dans le navigateur, contenu identique aux gabarits par SHA-256 |

### Limites explicites

Pas d’upload, suppression, publication de template ni test de policies contre le Supabase de production. Ces opérations ont été testées avec services simulés et code réel. Le rendu Public est celui de l’application, exécuté dans une fixture locale, pas une nouvelle publication en production. Aucun déploiement Netlify ou Supabase, changement de secret, de paiement ou de flux Stripe/RSVP.

Le skill Supabase a guidé la réutilisation du chemin d’upload authentifié, la vérification du propriétaire et l’absence de changement de RLS pour ces sous-dossiers.

## Fichiers de cette évolution

- `src/types/editor.ts` : configuration et références typées.
- `src/features/openings/envelopeAssets.ts` : catalogues, résolution, validation, retrait de références.
- `src/features/openings/EnvelopeAssetControls.tsx` : trois sections, imports, choix, téléchargements, confirmation et suppression sûre.
- `src/features/openings/OpeningProperties.tsx` : intégration Smartphone seulement.
- `src/features/openings/animations/PngEnvelopeOpening.tsx` : URLs sélectionnées, readiness et fallbacks ; mouvement inchangé.
- `src/services/assetRepository.ts` : extension allowlist des sous-dossiers image, contrôles existants conservés.
- `src/styles.css` : galeries et confirmation.
- `public/assets/openings/envelope/` : PNG originaux copiés, dont nouvelle base1.
- `public/envelope-templates/` et `scripts/generate-envelope-templates.mjs` : guides exacts et génération reproductible.
- `tests/envelope-assets.test.mjs`, `tests/envelope-upload.test.mjs`, `tests/png-envelope-opening.test.mjs`, `tests/program-icon-edge.test.mjs` : couverture automatique.
- `tests/envelope-opening.browser.tsx`, `tests/envelope-assets.vite.mjs`, `tests/envelope-assets.mock.ts` : fixture locale, aucune dépendance du build de production.

Captures : `docs/qa/20261007-envelope-composer/`.

![Nouvelle base, rabat olive et cachet doré](C:/Users/quent/Documents/repos/La-boutique-des-mari-s---Cr-ateur-de-faire-part/docs/qa/20261007-envelope-composer/nouvelle-base-rabat-olive.jpg)

![Trois images importées en Preview](C:/Users/quent/Documents/repos/La-boutique-des-mari-s---Cr-ateur-de-faire-part/docs/qa/20261007-envelope-composer/trois-custom-preview.jpg)
