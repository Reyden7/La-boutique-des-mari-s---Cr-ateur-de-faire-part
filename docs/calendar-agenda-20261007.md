# Calendrier — Ajouter à mon agenda

## Fonctionnement livré

Le Calendrier possède un bouton associé sous sa grille, avec une icône calendrier. Le menu propose Google Agenda (nouvel onglet) ou Apple / Outlook / autre (fichier `.ics`). Aucun OAuth, Calendar API, token Google ou accès aux calendriers personnels. L’invité valide lui-même l’ajout.

La date reste exclusivement `year` + `month` + `highlightedDay`. La section « Ajout à l’agenda » permet de choisir visibilité, texte, titre de l’événement, heures facultatives, lieu, description, fuseau et style du bouton. FontPicker et ColorAlphaInput partagés sont réutilisés.

Dans l’Editor, le bouton est dessiné dans la scène Konva sans action de navigation ; ses clics restent ceux du Calendrier. Dans Aperçu et Public, le même dessin reçoit un vrai bouton HTML. Le menu utilise un portail pour ne pas être coupé par la boîte du Calendrier ou les Sections ; clic extérieur, Échap, sortie du focus, scroll et resize le ferment.

## Données

Champ optionnel ajouté à `CalendarElement` :

```ts
calendarEvent?: {
  enabled: boolean;
  buttonLabel: string;
  title: string;
  startTime?: string;       // HH:MM
  endTime?: string;         // HH:MM
  location?: string;
  description?: string;
  timezone?: string;        // Europe/Paris par défaut
  buttonFontFamily?: string;
  buttonFontSize?: number;
  buttonTextColor?: string;
  buttonBackgroundColor?: string;
  buttonBorderColor?: string;
  buttonBorderWidth?: number;
  buttonRadius?: number;
  buttonGap?: number;
}
```

Pas de seconde date. Les données et styles sont conservés dans les projets et snapshots de templates, et lors des duplications/transferts. Le bouton suit l’ajustement uniforme de la scène Calendrier à la boîte responsive : aucune double multiplication de sa typographie.

Nouveaux calendriers : bouton activé, titre « Notre mariage », texte « Ajouter à mon agenda », Montserrat 13, texte blanc, fond/bordure `#795746`, bordure 1, rayon 8, espacement 12. Ancien calendrier sans `calendarEvent` : bouton absent, rendu antérieur inchangé. Il peut être activé dans les propriétés.

## Dates et exports

- Sans heure de début : journée entière, avec fin exclusive le lendemain ; aucune conversion UTC de la date.
- Avec début sans fin : durée de deux heures.
- Fin antérieure ou égale au début : fin le lendemain, comme indiqué dans l’UI.
- Horaires : conversion du fuseau IANA configuré vers UTC, partagée par Google et ICS, indépendante du fuseau du visiteur. Par défaut Europe/Paris.
- Heure inexistante au passage à l’heure d’été : message explicite et bouton désactivé. Heure répétée en automne : première occurrence, indiquée dans l’UI.
- Aucun jour mis en avant / date invalide : message dans les propriétés et bouton désactivé ; aucune date inventée.

Google : `https://calendar.google.com/calendar/render?action=TEMPLATE...`, construit avec URLSearchParams, titres/lieux/descriptions encodés. Le format de lien est illustré dans la [communauté Google Calendar](https://support.google.com/calendar/thread/81344786/how-do-i-generate-add-to-calendar-link-from-our-own-website?hl=en). Aucune création API ; seul l’éditeur d’événement de Google est ouvert.

ICS : UID stable de l’élément, DTSTAMP, DTSTART/DTEND, SUMMARY, LOCATION et DESCRIPTION. Sauts de ligne CRLF, textes échappés, pliage des lignes à 75 octets UTF-8 sans couper les caractères, conformément aux règles de la [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545). Nom de fichier nettoyé. Génération locale par Blob `text/calendar;charset=utf-8`, URL temporaire révoquée après téléchargement. Aucune donnée personnelle de calendrier transmise à Supabase.

## Fichiers applicatifs

- `src/types/editor.ts` : CalendarEventConfig et propriété optionnelle.
- `src/utils/calendarEvent.ts` : données communes, validation, fuseaux, lien Google et génération ICS.
- `src/utils/calendarLayout.ts` : géométrie, texte, icône et style du bouton dans la scène commune.
- `src/features/elements/CalendarAgendaMenu.tsx` : interaction et téléchargement.
- `src/features/elements/CalendarRenderer.tsx` : bouton HTML aligné sur la scène.
- `src/features/elements/CalendarProperties.tsx` : réglages agenda et style.
- `src/features/elements/elementFactories.ts` : valeurs des nouveaux calendriers.
- `src/styles.css` : bouton et popover.

Tests : `tests/calendar-event.test.mjs`, `tests/calendar-agenda-renderer.test.mjs`, extension de `tests/calendar-persistence.test.mjs` ; fixture navigateur Calendrier existante réutilisée. Capture : `docs/qa/20261007-calendar-agenda/editor-public-menu.jpg`.

## Résultats des tests

- 15 nouveaux tests automatisés : journées entières, horaires été/hiver, durée par défaut, passage au lendemain, fuseaux à demi-heure, indépendance du fuseau visiteur, DST, limites de dates, mauvais formats, injection ICS, accents/apostrophes/ampersands/multiligne, pliage UTF-8, nom/UID, rendu DOM réel, compatibilité anciens calendriers, style/alpha, save/reload, duplication, template et transfert.
- Suite complète : **419 tests réussis**, aucun échec.
- Navigateur local, composants réels : **210 comparaisons Konva/DOM réussies** (5 styles × 7 décorations × 3 supports × Aperçu/Public), bouton inclus.
- Modifications réelles dans les propriétés : titre accentué, lieu, description multiligne, année 2027, 14:00–23:59 ; rechargement JSON conserve les données.
- Menu : ouverture, clic extérieur, Échap, désactivation sans jour choisi, checkbox visibilité et interaction Tablette validés.
- Téléchargement réel : `C:/Users/quent/Downloads/mariage-d-emma-lucas.ics`, 388 octets, contenu relu. DTSTART `20270815T120000Z`, DTEND `20270815T215900Z`, titre/lieu/description exacts.
- Google Agenda desktop réellement ouvert dans un autre onglet : formulaire prérempli « Mariage d’Emma & Lucas », 15 août 2027, 14:00–23:59, fuseau Paris, lieu et description corrects. **Aucun clic sur Enregistrer, aucun événement ajouté.**
- `npm run build` final réussi. Avertissement Vite préexistant : bundle principal supérieur à 500 kB.

## Limites

Tests des formats Smartphone/Tablette/PC dans le navigateur, pas sur appareils physiques. Import natif Apple Calendar/iPhone, Google Agenda Android et Outlook non exécuté : compatibilité du format testée, mais pas validation native dans ces applications. Aucun déploiement de production, changement Supabase/secret ou installation OAuth. Les sauvegardes testées sont locales ; aucune donnée d’audit persistée en production.
