# Renommage des calques — 5 octobre 2026

Implémentation locale, sans déploiement, migration, paiement ni mutation de projet distant.

## Fonctionnement

- `BaseElement.editorName?: string` partagé par tous les types ; `RsvpFormConfig.editorName?: string` pour le bloc Formulaire unique. Le nom est global, hors overrides responsive.
- L'ancien `name` reste le libellé automatique ; `editorName` ne remplace jamais le texte, le titre, le nom du fichier ou l'alt de l'image. Les renderers ne lisent pas cette nouvelle propriété.
- Résolution commune : nom personnalisé normalisé, sinon nom automatique actuel. Fallback Formulaire : `Formulaire invité`.
- Normalisation : trim, 80 caractères maximum, nom vide supprimé pour retrouver le libellé automatique.
- Double-clic sur le nom dans CALQUES ; même contrôle dans la liste de la Page d'accueil. Le panneau de propriétés propose un crayon. Accessibilité clavier : Entrée, Espace ou F2 sur le nom ouvre la saisie.
- Brouillon local uniquement : Entrée ou perte de focus valide ; Échap annule. Aucun enregistrement du brouillon à chaque caractère, aucune double validation Enter/blur.
- Pointer/click/keydown de la saisie ne remontent pas au canvas. Handles de drag désactivés pendant le renommage dans CALQUES, réactivés ensuite.
- Correction liée au double-clic : les boutons de ligne réservent maintenant leur place même quand ils sont invisibles. Leur apparition au survol ne déplace plus le nom sous la souris, ce qui pouvait envoyer le deuxième clic sur un cadenas.
- Action store `renameElement` : une entrée undo au commit réel, aucune mutation si nom inchangé ou ID absent. Fonctionne sur les éléments verrouillés et les éléments de la Page d'accueil.
- Duplication/coller : suffixes uniques `copie`, `copie 2`, etc., y compris les enfants dupliqués avec leur Section ; longueur maximale conservée. Les libellés automatiques des éléments sans nom personnalisé conservent le fonctionnement historique.
- Les chemins de sauvegarde JSON et de templates existants conservent la propriété imbriquée sans migration. Aucun changement du moteur de rendu ni des droits.

## Vérifications

- Suite Node complète : **116/116 réussis**, zéro test ignoré, PGlite local ; aucun appel Stripe.
- 15 tests dédiés avec vrai store/normalisation/persistance locale, réseau désactivé : tous les types, verrouillage, responsive, contenu inchangé, undo/redo, vide, limite, no-op, mouvements dans la hiérarchie, visibilité, duplication/coller avec enfants, sauvegarde/rechargement et snapshot/instanciation template.
- Test supplémentaire du véritable adaptateur de sauvegarde distante, avec transport simulé : `editorName` présent dans `project_data` et relu sans changer le texte ou le titre du Formulaire.
- Navigateur local : Section/Texte/Image/Formulaire, double-clic sur élément non sélectionné, crayon, Entrée, Échap, clic extérieur, brouillon sans écriture store, nom vide, noms longs tronqués sans scroll horizontal, duplication et suffixes, nom conservé sur Smartphone/Tablette/PC, verrouillage/déverrouillage, masquage/réaffichage, Page d'accueil, sauvegarde locale/rechargement.
- Le contenu visible du renderer reste `Emma & Lucas` et `Confirmez votre présence`, malgré les noms organisationnels `Titre principal` et `Réponses invités`. Console du banc sans erreur ni warning.
- Drag : handles vérifiés désactivés pendant la saisie puis réactivés, reparenting testé via le vrai store. Le geste natif essayé dans le navigateur n'a pas changé la destination ; le drag & drop physique n'est donc pas déclaré validé de bout en bout par ce test.
- Aucun template publié ni projet de production modifié pour les vérifications. Réouverture depuis Supabase réelle non effectuée ; adaptateur et sauvegarde/rechargement locaux testés.
- `npm run build` : réussi. Warning de chunk JavaScript > 500 kB préexistant, non bloquant.
- Capture : `layout-evidence-20261005/renommage-calques.jpg`.

## Fichiers concernés par ce changement

- `src/types/editor.ts`
- `src/utils/editorNames.ts` (nouveau)
- `src/stores/editorStore.ts`
- `src/components/ui/EditableElementName.tsx` (nouveau)
- `src/components/sidebar/HierarchyList.tsx`
- `src/components/properties/PropertiesPanel.tsx`
- `src/features/welcome/WelcomePageEditor.tsx`
- `src/styles.css`
- `tests/editor-names.test.mjs` (nouveau)
- `tests/guest-project-data.test.mjs`
- `tests/editor-names.browser.html` et `.tsx` (nouveaux)

Les modifications antérieures du Formulaire et de fin de document restent conservées dans le worktree.
