# Génération administrative de codes en lot

Implémentation locale du 2 novembre 2026. Aucun déploiement Supabase/Edge/Netlify, aucun commit ou push. Aucune requête SQL sur la production pour cette fonctionnalité ; les essais utilisent des données synthétiques.

## Interface

`/admin/promo-codes` conserve le formulaire individuel et propose « Génération en lot ».

Le lot sélectionne un partenaire actif existant, propose son nom commercial comme préfixe, puis permet de régler le département (2–3 caractères alphanumériques), la quantité (1–100), la réduction (1–100 %, deux décimales), la commission (0–100 %, deux décimales), la limite commune (1 par défaut, ou multiusage avec plafond facultatif) et l’activation initiale.

L’aperçu est calculé côté serveur sans écriture. Il montre le partenaire, les paramètres et tous les codes proposés. La confirmation utilise un identifiant de requête stable : une réponse perdue peut être réessayée avec le même aperçu sans dupliquer le lot.

Après confirmation, l’interface affiche exclusivement la liste réellement retournée par Supabase. La copie et le CSV utilisent cette liste, jamais celle de l’aperçu. Modifier les paramètres invalide l’aperçu. L’historique conserve les codes utilisés/désactivés et offre des filtres par partenaire et lot. Une création manuelle réinitialise les filtres pour rendre le nouveau code immédiatement visible.

## Migration nécessaire — non appliquée

`20261102125927_promo_code_batches.sql`

Dépendances : schéma des codes, limites d’utilisation et partenaires/commissions déjà existants. La migration ne modifie aucune fonction de tarification, paiement, consommation, commission ou publication.

Objets ajoutés :

- `promo_code_batches` : identifiant de requête/lot, partenaire et nom au moment de la création, préfixe, département, quantité, paramètres communs, administrateur et date.
- `promo_code_batch_sequences` : compteur persistant par partenaire/préfixe/département, inaccessible au navigateur.
- Colonnes facultatives `batch_id`, `batch_prefix`, `department`, `batch_number` dans `promo_codes`. Les codes historiques restent intacts avec ces colonnes à `NULL`.
- RPC `admin_preview_promo_batch(uuid,text,text,integer,numeric,numeric,integer,boolean)`.
- RPC `admin_generate_promo_batch(uuid,uuid,text,text,integer,numeric,numeric,integer,boolean)`.
- Helpers privés de normalisation, validation et lecture du prochain numéro.

Aucun changement des Edge Functions n’est nécessaire.

## Numérotation et concurrence

Format : préfixe normalisé + département distinct dans les données + numéro avec au moins deux chiffres. `99` est suivi de `100`, sans troncature. Accents décomposés en Unicode NFKD, ligatures françaises traitées, espaces/signes supprimés, résultat limité à A–Z/0–9. Aucun ajout d’extension PostgreSQL nécessaire.

Le prochain numéro tient compte du compteur persistant, des métadonnées de lots et des suffixes numériques des codes existants, **tous partenaires/statuts confondus** pour prévenir les collisions du code final. Les anciens codes manuels, utilisés, désactivés ou sans métadonnées sont donc conservés et pris en compte. Un code hors format est laissé intact. Renommer un code ne fait pas reculer le compteur d’un lot déjà généré.

La génération prend un verrou consultatif transactionnel par préfixe+département concaténés, y compris si deux partenaires partagent ce même début de code. Le compteur est verrouillé par ligne. L’index unique existant sur `promo_codes.code` reste l’autorité finale.

Une insertion manuelle concurrente peut encore prendre un numéro après le scan initial : `INSERT ... ON CONFLICT(code) DO NOTHING` attend sa résolution puis essaie le numéro suivant. Le serveur doit créer la quantité complète. Les autres erreurs sont propagées et annulent les codes, le lot et le compteur dans la même transaction. Aucune suppression/remplacement/réactivation d’un code existant.

La clé UUID du lot rend les requêtes répétées idempotentes. Une tentative de réutiliser cette clé avec d’autres paramètres est refusée. Le serveur revalide le rôle, le partenaire actif et tous les paramètres. Les numéros trop grands ou un code dépassant 64 caractères sont refusés explicitement sans lot partiel.

## Sécurité et exports

Les deux tables nouvelles ont RLS activée. Seuls les administrateurs peuvent lire les lots ; aucun accès navigateur aux compteurs ni écriture directe dans ces tables. Les RPC publics sont révoqués pour `PUBLIC`/`anon` et vérifient `private.is_admin()`. Les helpers privés ne sont pas exécutables par les clients. Les politiques des codes existantes sont conservées.

Le CSV contient partenaire, département, code réellement enregistré, réduction, commission, limite et statut. UTF-8 avec BOM, séparateur point-virgule, champs échappés et protection contre les formules de tableur. L’export refuse les lignes ne correspondant pas au partenaire et au lot attendus.

Les codes générés utilisent les mêmes lignes `promo_codes` que les codes manuels : réservation Stripe, usage confirmé, publication gratuite, commissions, limites, snapshot et droits historiques continuent de passer par les mécanismes existants. Générer/approuver un lot ne consomme aucun code et ne crée aucune commission.

## Validation effectuée

**Node 22.23.4 : 624 tests réussis, 0 échec, 0 ignoré.** `npm run build` : code 0, avertissement préexistant de bundle > 500 ko. `git diff --check` : code 0.

- PGlite avec la chaîne de migrations complète : 1/10/100 codes, départements 71/21/2A/2B/971, reprise à 11 après dix codes existants, codes manuels désactivés/consommés inchangés, compteur après renommage, normalisation et longueurs, plafonds, partenaire inactif, protection non-admin, rollback injecté, idempotence et publication gratuite/commission nulle avec taux figé à 15 %.
- **PostgreSQL natif 18 local**, cluster jetable lié exclusivement à 127.0.0.1 avec données synthétiques : six connexions indépendantes créent 120 codes sans doublons ; quatre requêtes concurrentes avec une même clé ne créent que dix codes ; une insertion manuelle non encore validée force l’attente et le saut de numéro sans perdre de code dans le lot ; échec SQL injecté avec rollback complet. Le serveur local est arrêté en fin de test. Le schéma minimal natif isole le mécanisme d’allocation ; les tests PGlite couvrent son intégration au reste du système.
- Tests du service : aucun code fourni par le frontend, aperçu distinct de la génération, clé de requête conservée, erreurs serveur et réponse incohérente traitées sans faux succès.
- Tests de normalisation et CSV, dont refus d’export d’un autre partenaire.
- Navigateur avec adaptateurs en mémoire seulement : formulaire individuel préservé, aperçu de dix codes, réponse définitive volontairement ajustée après collision simulée, copie exacte des dix codes enregistrés, bouton CSV, filtres, aperçu de cent codes et format smartphone sans débordement global.

Le test natif utilise les binaires déjà installés (`C:/Program Files/PostgreSQL/18/bin`) ou `PROMO_BATCH_PG_BIN`. Il est ignoré automatiquement sur une machine dépourvue de ces outils. Il n’était pas ignoré lors de cette validation. Les journaux/clusters synthétiques sont conservés dans `.sites-runtime/promo-batch-pg-*`, ignoré par Git ; aucun serveur local n’est laissé en fonctionnement.

## Fichiers modifiés / nouveaux

- `src/components/admin/PromoCodesManager.tsx`
- `src/components/admin/PromoBatchGenerator.tsx` (nouveau)
- `src/features/partners/promoBatchData.ts` (nouveau)
- `src/services/promoCodeRepository.ts`
- `src/services/promoBatchRepository.ts` (nouveau)
- `src/styles.css`
- `supabase/migrations/20261102125927_promo_code_batches.sql` (nouvelle)
- `tests/promo-batches-sql.test.mjs` (nouveau)
- `tests/promo-batches-postgres.test.mjs` (nouveau)
- `tests/promo-batch-data.test.mjs` (nouveau)
- `tests/promo-batch-repository.test.mjs` (nouveau)
- `tests/promo-batches.browser.html` et `.tsx` (nouveaux)
- `docs/promo-code-batches.md` (nouveau)

## Déploiement ultérieur

Après accord : vérifier l’historique distant et les dépendances, appliquer uniquement la nouvelle migration, contrôler RPC/RLS, puis publier le frontend existant. **Ne pas publier le formulaire en lot avant sa migration**, faute de quoi les nouvelles RPC seraient absentes. Aucun webhook ou checkout à redéployer pour cette fonctionnalité. L’écart tarifaire v2/v3 identifié précédemment reste hors de cette modification.
