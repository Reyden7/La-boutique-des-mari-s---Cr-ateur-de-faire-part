# Sections repliables dans CALQUES — 5 octobre 2026

## Comportement implémenté

- Chaque Section possède un chevron toujours visible. Les Sections sont ouvertes par défaut.
- Le clic sur le chevron ne sélectionne pas la Section et ne déclenche pas son déplacement. Les événements de pointeur et de double clic sont isolés.
- Replier une Section retire ses lignes enfants du DOM de la hiérarchie, y compris le Formulaire invité lorsqu'il lui appartient. Aucun élément du document n'est supprimé ou masqué.
- « Tout replier » et « Tout déplier » agissent sur les Sections de la page affichée, même masquées sur le support actif.
- Une Section repliée reste une cible de dépôt. Après un dépôt effectivement accepté dans cette Section, elle s'ouvre automatiquement. Le survol temporisé optionnel n'a pas été ajouté.
- La sélection d'une Section, depuis le canvas ou la liste, ne change pas son état replié.
- Les commandes existantes de renommage, verrouillage, visibilité, ordre et suppression restent disponibles.

## État UI et responsive

Un store Zustand séparé, `hierarchyUiStore`, conserve `collapsedSectionsByProject[projectId][sectionId]`. Une valeur absente signifie « ouverte ». L'état survit au changement d'élément, de page ou de format pendant la session. La séparation par projet évite de partager involontairement cet état lorsque deux projets réutilisent les mêmes identifiants.

Ce store n'utilise aucune persistance et n'écrit ni dans `project_data`, ni dans l'historique d'édition, ni dans Supabase. Un rechargement complet de l'application retrouve les valeurs par défaut.

La liste des enfants utilise la résolution d'appartenance existante pour Smartphone, Tablette ou PC. Le Formulaire suit la même règle. Supprimer une Section nettoie son entrée UI ; une copie ou une nouvelle Section commence ouverte. Le nettoyage tient compte de toutes les pages et de la Page d'accueil afin de ne pas oublier l'état d'une Section simplement absente de la vue actuelle.

Le calcul métier de l'ordre des calques reste inchangé : `getVisibleHierarchyRows` filtre uniquement l'affichage de la hiérarchie. Les renderers Editor, Preview et Public ne consultent pas l'état de repli.

## Vérifications réalisées

- Suite Node complète : **123 tests passés, aucun échec, aucun test ignoré**, dont 7 tests spécifiques à cette fonctionnalité. Les tests SQL locaux existants utilisent PGlite, pas la base de production.
- Navigateur local, composants réels : repli/dépli, sélection conservée, changement Smartphone/Tablette/PC, actions globales, renommage, verrouillage, Section masquée, duplication, nouvelle Section, suppression et nettoyage de l'état.
- Liste longue : replier une Section retire réellement ses **102 lignes enfants** du DOM.
- Dépôt d'un texte et du Formulaire dans une Section repliée : appartenance correcte et ouverture automatique. Déplacement d'une Section : pas d'imbrication involontaire.
- Les tests de dépôt utilisent des événements DOM `DragEvent` simulés sur les vrais gestionnaires de la hiérarchie ; ils ne constituent pas un test de drag physique à la souris. La sélection depuis le canvas est simulée par l'action de sélection du store.
- Repli seul : projet, sélection, historique, hauteur calculée du document et contenu rendu inchangés. Vérification également avec le renderer en mode public dans le banc local.
- Panneau réduit à 240 px : chevron visible et aucune barre de défilement horizontale dans le cas testé.
- Aucune erreur ou alerte console pendant ces vérifications navigateur.
- **`npm run build` passe** (TypeScript et Vite). L'avertissement de taille du bundle supérieur à 500 kB reste non bloquant.
- `git diff --check` passe.

## Fichiers

### Application

- `src/stores/hierarchyUiStore.ts` : état UI isolé.
- `src/utils/hierarchyOrder.ts` : filtrage des lignes enfants repliées.
- `src/components/sidebar/HierarchyList.tsx` : chevrons, Formulaire, dépôt, nettoyage et actions globales.
- `src/components/sidebar/LeftSidebar.tsx` : actions à côté de CALQUES.
- `src/styles.css` : présentation compacte des contrôles.

### Tests et preuve

- `tests/hierarchy-collapse.test.mjs`.
- `tests/hierarchy-collapse.browser.html` et `tests/hierarchy-collapse.browser.tsx` : banc local sans sauvegarde distante.
- `docs/layout-evidence-20261005/sections-repliables.jpg` : capture de vérification locale.

## Limites et déploiement

Aucun déploiement, aucune modification Supabase, aucun Checkout ou paiement, et aucune écriture sur un projet de production n'ont été effectués. Les vérifications visuelles sont locales ; le parcours sur le site de production reste à vérifier après un déploiement autorisé.
