# Sélecteurs de couleur unifiés — 6 octobre 2026

## Implémentation

L’ancien contrôle était un `input[type=color]` natif : ses formats et son format initial dépendaient du navigateur. Il est remplacé par une palette applicative commune, sans nouvelle dépendance.

- `ColorPicker` : popup en portal, palette saturation/luminosité, teinte, opacité lorsque disponible, format et saisie manuelle.
- À chaque ouverture : **HEX**. Ordre : **HEX, RGB, RGBA, HSL, HSLA**.
- L’ouverture, la lecture d’un champ et le changement de format ne déclenchent pas `onChange`, donc ni historique, ni autosave.
- HEX affiché en majuscules : six chiffres si opaque, huit chiffres sinon. Les quatre longueurs #RGB/#RGBA/#RRGGBB/#RRGGBBAA sont acceptées.
- RGB/HSL sans alpha conservent l’opacité actuelle. RGBA/HSLA permettent sa saisie explicite. Une saisie invalide reste locale et affiche une erreur ; elle ne remplace pas la couleur par du noir.
- `ColorAlphaInput` garde la convention existante de stockage HEX avec alpha. `StableColorInput` réutilise la même palette pour les champs historiquement opaques et conserve leur stockage HEX à six chiffres.
- Les anciennes données ne sont ni migrées, ni normalisées au simple affichage. Les renderers Editor/Preview/Public et les données métier ne sont pas modifiés.
- Capture du pointeur sur la palette, même nœud DOM pendant les mises à jour, indépendance du hue aux passages noir/blanc, protection des clics internes, fermeture au clic extérieur après relâchement ou avec Escape. Pas de `key` dépendante de la couleur.

## Fichiers applicatifs

- `src/components/ui/ColorPicker.tsx` — nouveau contrôle partagé.
- `src/components/ui/ColorAlphaInput.tsx` — réutilisation avec alpha.
- `src/components/ui/StableColorInput.tsx` — adaptateur opaque.
- `src/utils/colorFormats.ts` — conversions et validation stricte.
- `src/features/backgrounds/BackgroundPanel.tsx` — remplacement des contrôles natifs.
- `src/features/openings/OpeningProperties.tsx` — idem.
- `src/features/welcome/WelcomePageEditor.tsx` — idem.
- `src/features/particles/ParticlePanel.tsx` — idem.
- `src/styles.css` — palette/popup et conservation de la disposition compacte.

Tous les autres panneaux utilisaient déjà `ColorAlphaInput` : texte, formes/décorations, sections, programme, bouton, carte, scratch/indicateur, calendrier, formulaire et cadres d’image bénéficient automatiquement du changement. L’audit automatisé ne trouve plus aucun contrôle couleur natif dans les fichiers TSX.

## Tests réalisés

- **300 tests automatisés réussis**, dont sept nouveaux tests de formats, validation, alpha, conversions, compatibilité et inventaire des contrôles. Tests RSVP existants inchangés.
- Navigateur, fixtures locales sans EditorPage ni autosave distant : **15 panneaux** (Texte, Forme, Programme, Scratch, Section, Calendrier, Bouton, Carte, Cœur, Image/cadre, Fond, Formulaire, Ouverture, Page d’accueil, Particules). HEX initial, changement HEX/RGB/HEX sans entrée dans l’historique, modification réelle enregistrée, popup restant ouvert.
- **11 couleurs du Formulaire** : saisie #12345680, alpha à environ 50 %, popup stable après chaque modification.
- Codes incomplets rejetés sans modification ; #RGBA développé correctement ; opacité à 100 % ; saisie RGB conservant l’alpha ; Escape ; réouverture sur HEX ; clic extérieur validant un brouillon correct et fermant le popup.
- **Glissement simulé dans le navigateur** : 25 événements pointermove avec rerenders React, conservation du même nœud, popup ouvert pendant le mouvement et au relâchement, clic extérieur ignoré pendant la capture, fermeture après relâchement. La demande de capture est vérifiée avec un stub dans la fixture. **Ce n’est pas un test de glissement matériel souris/tactile réel.**
- `npm run build` réussi après les dernières corrections. Avertissement existant concernant un bundle de plus de 500 kB ; pas d’erreur de compilation.

Fixtures : `tests/color-picker.browser.{html,tsx}` et `tests/color-panels.browser.{html,tsx}`. Tests unitaires : `tests/color-formats.test.mjs`. Capture : `docs/qa/20261006-color-picker/formulaire-hex-alpha.jpg`.

Une sélection de formulaire désactivé dans la fixture a initialement été effacée par le comportement normal du store ; la fixture a été corrigée pour activer le formulaire avant de le sélectionner. Ce n’était pas un bug du picker. Les warnings de re-création de root pendant le HMR de la fixture ne concernent pas le montage de l’application.

## Périmètre

Aucun déploiement, aucun paiement, aucune modification de secret ou de données de production. Aucune régression détectée dans les contrôles testés ; le glissement réel souris/tactile reste à contrôler manuellement.
