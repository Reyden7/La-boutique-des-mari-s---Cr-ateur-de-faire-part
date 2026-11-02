# SEO et Google Search Console — préparation locale

Audit et validation du 2 novembre 2026. **Aucun déploiement, commit ou push. Google Analytics n’a pas été ajouté.** Aucune migration, Edge Function, donnée de projet, réponse RSVP ou configuration de paiement modifiée.

## État observé sur le site existant

| URL / élément | Résultat observé avant correction |
| --- | --- |
| `https://www.laboutiquedesmaries.fr/` | 301 vers `https://laboutiquedesmaries.fr/` |
| `http://laboutiquedesmaries.fr/` | 301 vers HTTPS sans www |
| `https://laboutiquedesmaries.fr/` | 200 HTML, title générique, aucune canonical |
| `/robots.txt` | 200 **HTML de l’application**, pas un robots.txt |
| `/sitemap.xml` | 200 **HTML de l’application**, pas un sitemap XML |
| URL inexistante de contrôle | 200 HTML, puis ancien renvoi React vers l’accueil |
| `/auth` | 200 HTML commun, sans directive HTTP noindex |

Le domaine canonique retenu est **https://laboutiquedesmaries.fr**, conformément à la redirection déjà effective. Les paramètres du domaine principal Netlify et les liens existants n’ont pas été changés. L’image de marque `/icons/icon-512.png`, utilisée pour les partages, répond 200 `image/png`.

## Périmètre des pages indexables

L’application possède actuellement une seule véritable page publique de présentation : `/`. Les modèles mariage/naissance sont proposés dans une fenêtre, sans pages publiques dédiées. Aucun faux lien de galerie ou page marketing inexistante n’a été inventé.

Le sitemap contient donc uniquement **https://laboutiquedesmaries.fr/**, sans query string, fragment, identifiant de projet, invitation ou token. Il n’y a pas de date `lastmod` artificielle.

L’accueil sert aussi de tableau de bord après connexion : son HTML serveur est une présentation publique, sans données personnelles ; après authentification, les métadonnées deviennent `noindex` et ne reprennent aucun nom de projet ou invité. Aucun déplacement des tableaux de bord ni changement du parcours de connexion n’a été introduit.

## Ce qui est préparé

- `public/sitemap.xml` et `public/robots.txt`, copiés dans `dist` par Vite.
- Titre et description publics couvrant faire-part numérique de mariage, naissance et invitation interactive, sans prix ou promesse commerciale nouvelle.
- Contenu public visible : titre H1, sections H2 mariage/naissance/interactivité, liens d’ancrage HTML. Même contenu éditorial dans le rendu React et le HTML initial ; aucun texte réservé aux robots.
- Canonical unique, absolue, HTTPS, sans www et sans paramètres, sur l’accueil public.
- Open Graph et Twitter : titre, description, marque, locale française, image publique absolue. Les invitations restent génériques : aucune donnée familiale dans le head, aucune canonical/og:url contenant leur lien.
- Données structurées `WebSite` sur l’accueil public uniquement, sans faux avis, prix ou fonction de recherche inexistante.
- Métadonnées mises à jour lors des navigations React. Pas de multiplication des balises au retour vers l’accueil.

## HTML initial et Netlify

Le build reste sous Node 22 :

```text
tsc -b && vite build && node --experimental-strip-types scripts/build-seo.mjs
```

Le script n’appelle aucun service et ne lit aucun projet. À partir du HTML Vite et d’un contenu éditorial constant, il produit :

- `dist/index.html` : présentation publique lisible sans JavaScript, balises SEO, canonical et données structurées ;
- `dist/_app.html` : shell React vide, métadonnées génériques **noindex**, sans canonical ni données personnelles ;
- `dist/404.html` : contenu « Page introuvable », **noindex**, sans canonical, avec retour vers l’accueil.

Le build échoue si le sitemap contient autre chose que la page publique canonique. Une balise de vérification Google ajoutée ultérieurement au head est conservée.

`public/_redirects` conserve les URLs connues de connexion/récupération, éditeur/découverte, administration, paiement et invitations, réécrites en interne vers `_app.html` avec statut 200. Les adresses visibles et les paramètres des liens familiaux restent inchangés. La règle finale utilise **404** pour les routes inconnues. Le shadowing Netlify normal laisse les vrais fichiers statiques (JS/CSS, images, robots.txt, sitemap.xml) être servis directement.

`public/_headers` ajoute `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` sur les routes applicatives sensibles. Les invitations ont aussi `Referrer-Policy: no-referrer` et `Cache-Control: private, no-store`. Il n’y a pas de règle globale noindex bloquant l’accueil.

`netlify.toml` précise `npm run build`, publication `dist` et conserve `NODE_VERSION = "22"`. Aucun changement distant de Netlify n’a été effectué.

### Limites HTTP à connaître

Les réponses HTTP 404 prévues par les nouvelles règles Netlify n’ont **pas encore été observées sur l’hébergement**, puisque le déploiement est interdit pour cette intervention. Les règles sont testées localement ; il faudra vérifier les réponses réelles après publication.

Les invitations utilisent des données dynamiques : une URL de forme valide `/i/...` mais inconnue peut encore répondre HTTP 200 avec le shell, puis afficher « faire-part indisponible ». Elle reste noindex dans le HTML initial et les headers. Aucun accès serveur supplémentaire aux projets n’a été ajouté pour transformer ces erreurs dynamiques en 404.

Le simple serveur Vite de développement ne reproduit pas les statuts et headers de Netlify. Un 200 sur une route inconnue sous `localhost:5173` n’invalide donc pas les règles de production préparées.

## Confidentialité et robots

`robots.txt` autorise le crawl pour laisser les moteurs lire les directives noindex. Le fichier n’énumère aucun lien privé ni token.

**robots.txt et noindex ne protègent pas les données.** Le shell HTML et les assets JavaScript restent publics ; les données des projets nécessitent les contrôles Auth/ownership/RLS existants. Les pages protégées gardent `ProtectedRoute` et les contrôles Supabase préexistants. Les invitations restent accessibles selon leur lien/token prévu, sans obligation de connexion ajoutée. Aucun de ces mécanismes n’a été affaibli ou remplacé par du SEO.

Une URL déjà indexée doit pouvoir être recrawlée pour que Google constate noindex : ne pas ajouter `Disallow: /i/` ou un blocage global empêchant cette lecture. Pour un contenu réellement sensible, conserver les contrôles d’accès effectifs ; une URL partagée à son destinataire reste une autorisation de consultation dans le modèle existant.

## Validation réalisée

- Audit HTTP en lecture seule de la production, sans consultation de vrai lien familial.
- Sitemap parsé avec le parseur XML standard Python : XML valide, namespace sitemap reconnu et une seule URL canonique. Cette URL répond actuellement 200.
- Tests de politique SEO : routes privées, accueil connecté, paramètres sensibles, absence de tokens/identifiants dans le head, canonical/description/title uniques, Open Graph et échappement HTML.
- Tests du build : HTML public lisible, shell privé noindex, page 404, conservation du script Vite et d’une balise de vérification Google, refus d’un sitemap accidentellement privé.
- Tests des règles Netlify : toutes les routes déclarées dans le routeur React restent prises en charge, liens familiaux inclus ; URL inconnue vers le fichier 404 ; protections HTTP et absence de blocage de l’accueil.
- Navigateur, fixture sans Supabase : navigation accueil → invitation synthétique → accueil connecté → accueil public ; noindex et absence de canonical/og:url sur l’invitation ; token absent du head ; restauration d’un seul title/description/canonical au retour.
- **632 tests réussis, 0 échec, 0 ignoré sous Node 22.23.4**.
- **`npm run build` : code 0**. Avertissement préexistant de bundle supérieur à 500 ko ; aucune refonte du chargement de l’éditeur effectuée.
- **`git diff --check` : code 0**.

## Actions Google Search Console — sans Analytics

1. Ouvrir [Google Search Console](https://search.google.com/search-console/welcome) avec le compte Google du propriétaire.
2. Ajouter une propriété de type **Domaine** pour `laboutiquedesmaries.fr`, sans protocole ni chemin. Elle couvre les variantes www/sans www et HTTP/HTTPS.
3. Copier le TXT de validation fourni par Google et l’ajouter dans le DNS faisant autorité pour ce domaine. Ne pas remplacer les autres TXT, SPF, MX ou réglages de domaine existants. Attendre sa propagation, puis cliquer sur Valider. Conserver cet enregistrement après validation.
4. **Après accord et déploiement des fichiers SEO**, vérifier dans le navigateur/réseau que `/sitemap.xml` renvoie du XML et `/robots.txt` du texte, et non le HTML de l’application. Ne pas soumettre le sitemap HTML actuel.
5. Dans **Sitemaps**, soumettre `https://laboutiquedesmaries.fr/sitemap.xml`.
6. Dans **Inspection de l’URL**, inspecter `https://laboutiquedesmaries.fr/`, lancer le test en direct, vérifier le contenu rendu et la canonical, puis demander l’indexation.
7. Dans les rapports **Indexation des pages**, contrôler que connexion, administration, éditeur, paiements et invitations sont exclus par noindex ; que les URLs réellement inexistantes sont 404 ; et que www redirige vers le domaine canonique.
8. Ne jamais soumettre de liens familiaux/tokenisés ni de fichiers contenant des invités à Search Console pour « tester » le sitemap.

Alternative si la validation DNS n’est pas disponible : propriété **Préfixe d’URL** exactement `https://laboutiquedesmaries.fr/`, puis balise `google-site-verification` réellement fournie par Google dans le head de `index.html`, ou fichier de validation sous `public/`. Ne pas inventer de valeur. Cette vérification nécessite alors un futur déploiement autorisé. Aucun compte Search Console n’a été connecté ni validé automatiquement ici.

La validation DNS et le sitemap ne nécessitent pas Google Analytics. Aucun gtag, gestionnaire de tags ou script de suivi n’a été ajouté. L’indexation et les positions ne sont pas garanties ni immédiates.

Références officielles : [JavaScript et SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro), [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [validation de propriété](https://support.google.com/webmasters/answer/9008080?hl=fr), [règles Netlify](https://docs.netlify.com/manage/routing/redirects/redirect-options/).

## Fichiers modifiés / nouveaux

- `index.html`
- `netlify.toml`
- `package.json`
- `public/_redirects`
- `public/_headers` (nouveau)
- `public/robots.txt` (nouveau)
- `public/sitemap.xml` (nouveau)
- `scripts/build-seo.mjs` (nouveau)
- `src/App.tsx`
- `src/pages/HomePage.tsx`
- `src/pages/NotFoundPage.tsx` (nouveau)
- `src/features/seo/seo.ts` (nouveau)
- `src/features/seo/RouteSeo.tsx` (nouveau)
- `src/features/seo/PublicHomeContent.tsx` (nouveau)
- `src/styles.css`
- `tests/seo.test.mjs` (nouveau)
- `tests/seo.browser.html` et `.tsx` (nouveaux)
- `docs/seo-search-console.md` (nouveau)
