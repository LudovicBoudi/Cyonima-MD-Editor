# Cyonima MD Editor

Un éditeur **Markdown WYSIWYG** pour le bureau : on écrit et on met en forme directement dans la page, comme dans un traitement de texte, et le fichier enregistré reste du **Markdown propre et portable**.

![Aperçu de l'éditeur](docs/screenshot.jpg)

## Pourquoi ?

Les éditeurs Markdown classiques séparent l'écriture (le code source) et l'aperçu. Cyonima MD Editor inverse la logique : la page est le document, la barre d'outils fait la mise en forme, et le Markdown est généré à l'enregistrement. Pas de syntaxe à mémoriser, pas de fichier propriétaire.

## Fonctionnalités

- **Édition WYSIWYG** propulsée par Tiptap / ProseMirror.
- **Mise en forme riche** : gras, italique, souligné, barré, code en ligne, titres 1 à 4.
- **Structure** : listes à puces, listes numérotées, listes de tâches, citations, blocs de code, séparateurs.
- **Blocs de code colorés** : coloration syntaxique (une trentaine de langages), sélecteur de langage conservé dans les fences Markdown et bouton « Copier ».
- **Tableaux éditables** : insertion, ajout/suppression de lignes et de colonnes, alignement par colonne (gauche, centre, droite) enregistré en GFM, en-tête activable, collage CSV/TSV.
- **Notes de bas de page et références** : bouton d'insertion de note (`[^1]` et définition éditable), liens de référence `[texte][id]` et définitions conservés à l'enregistrement.
- **Modèles et extraits** : bouton « Modèles » pour créer un document (note de réunion, article, README) ; bouton « Insérer un extrait » pour insérer du texte, des dates et des heures (`{{date}}`, `{{heure}}`), ou un extrait Markdown. Ces fichiers `.md` se trouvent dans le dossier `library/` des données de l'application et se modifient librement (bouton « Ouvrir le dossier »).
- **Plan du document** : bouton « Plan » ouvrant un panneau latéral avec les titres (niveaux 1 à 4), navigation au clic et titre actif pendant la lecture. L'état du panneau est mémorisé.
- **Mode source** : bascule `Ctrl+Maj+M` (ou bouton « Source ») vers le Markdown brut, frontmatter compris. Le texte est relu dans l'éditeur seulement s'il a été modifié ; une balise HTML en ligne non représentée fait l'objet d'un avertissement avant la bascule.
- **Liens et images** : insertion par boîte de dialogue, popover au clic sur un lien (ouvrir / modifier / copier / supprimer), ouverture directe avec `Ctrl`/`Cmd` + clic.
- **Images locales** : chemins relatifs résolus par rapport au document, copie automatique dans `assets/` à l'insertion/au dépôt/au collage, alt, légende et largeur.
- **Fichiers Markdown** : nouveau document, ouverture, enregistrement, « Enregistrer sous ».
- **Fichiers récents** : menu « Fichier → Ouvrir récent » (10 derniers), réouverture du dernier document au lancement (désactivable).
- **Glisser-déposer** : déposer un fichier `.md` sur la fenêtre l'ouvre (avec confirmation si le document courant est modifié).
- **Rechercher / remplacer** : `Ctrl+F`, navigation, compteur de résultats, remplacement simple ou global, options casse et expression régulière, surbrillance des occurrences.
- **Frontmatter YAML préservé** : le bloc de métadonnées est affiché dans un panneau repliable et réinjecté à l'identique à l'enregistrement.
- **HTML brut préservé** : les blocs HTML sans équivalent Markdown (iframes, styles, scripts, div personnalisés…) sont affichés comme des blocs opaques, jamais exécutés, et restitués tels quels à l'enregistrement.
- **Encodage et fins de ligne préservés** : UTF-8 avec ou sans BOM, UTF-16 LE/BE, LF ou CRLF. Le format d'origine est réappliqué à l'enregistrement et affiché dans la barre de statut.
- **Enregistrement sûr** : écriture atomique via fichier temporaire puis renommage, permissions d'origine conservées, refus explicite des fichiers en lecture seule.
- **Conflits externes détectés** : si le fichier a changé en dehors de l'éditeur, proposition « Recharger / Écraser / Enregistrer sous / Annuler » avant d'écraser.
- **Récupération après crash** : sauvegarde de secours périodique des brouillons non enregistrés, proposition de récupération au démarrage.
- **Collage** : `Ctrl+Maj+V` colle sans mise en forme ; un Markdown collé (titres, listes, tableaux) devient de la structure ; le HTML copié est nettoyé.
- **Aide-mémoire** : `Ctrl+/` ou `F1` ouvre la liste des raccourcis et de la syntaxe Markdown reconnue.
- **Orthographe** : correction native d'Electron en français par défaut (sept autres langues disponibles), menu contextuel avec suggestions et ajout au dictionnaire, blocs de code exclus.
- **Export PDF** et impression (mise en page A4, sans l'interface).
- **Statut du document** : nombre de mots et caractères, mots et caractères de la sélection, position (ligne et colonne), objectif de mots avec progression, temps de lecture, chemin du fichier, encodage, fins de ligne et état d'enregistrement.
- **Robustesse** : garde-fou de rendu (pas d'écran blanc), notifications non bloquantes en cas d'erreur, journal local consultable (menu Aide → Ouvrir le journal).
- **Garde-fou** : confirmation avant de perdre des modifications non enregistrées, y compris à la fermeture.
- **Thèmes clair / sombre / automatique** : choix mémorisé dans les paramètres, accessible depuis l'en-tête et le menu « Affichage → Thème » ; l'impression et l'export PDF restent en clair.
- **Concentration et mise en page** : mode concentration (en-tête, barre d'outils et barre d'état masqués, sortie par `Échap` ou bouton flottant), largeur de page (étroite, normale, large, pleine largeur) et mode « machine à écrire » qui garde la ligne active centrée. Réglages globaux mémorisés, accessibles depuis le menu « Affichage » de l'en-tête et le menu natif.
- **Confort typographique** : police serif / sans / mono, taille du texte (14–24 px), interligne et espacement des paragraphes réglables, avec réinitialisation. L'aperçu, l'impression et l'export PDF partagent la même typographie ; le fichier Markdown enregistré reste inchangé.
- Interface en français et typographie de document soignée.

## Démarrage

Prérequis : **Node.js 18+** et npm.

```bash
npm install
npm run dev
```

L'application Electron s'ouvre avec un document vide. Utilisez `Ctrl+N` / `Ctrl+O` / `Ctrl+S`, la barre d'outils, ou les boutons en haut à droite.

### Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Lance l'application en mode développement (HMR). |
| `npm run dev:web` | Aperçu de l'interface dans un navigateur, avec un mock du système de fichiers. |
| `npm run build` | Vérifie les types et construit l'application dans `out/`. |
| `npm run preview` | Lance la version construite. |
| `npm run dist` | Construit un installeur (AppImage, NSIS ou DMG selon la plateforme). |
| `npm run dist:dir` | Construit un dossier d'application non empaqueté. |
| `npm test` | Lance les tests unitaires (conversion Markdown ↔ HTML, encodage et fins de ligne). |
| `npm run typecheck` | Vérifie les types du processus principal et du rendu. |

## Raccourcis

| Action | Raccourci |
| --- | --- |
| Nouveau document | `Ctrl/Cmd+N` |
| Ouvrir | `Ctrl/Cmd+O` |
| Enregistrer | `Ctrl/Cmd+S` |
| Enregistrer sous | `Ctrl/Cmd+Shift+S` |
| Rechercher | `Ctrl/Cmd+F` |
| Mode concentration | `Ctrl/Cmd+Shift+F` (sortie avec `Échap`) |
| Imprimer | `Ctrl/Cmd+P` |
| Gras / Italique / Souligné | `Ctrl/Cmd+B` / `I` / `U` |
| Barré | `Ctrl/Cmd+Shift+X` |
| Code en ligne | `Ctrl/Cmd+E` |
| Lien | `Ctrl/Cmd+K` |
| Annuler / Rétablir | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` (ou `Ctrl+Y`) |

Les raccourcis Markdown de Tiptap restent disponibles : `#` + espace pour un titre, `-` + espace pour une liste, `>` + espace pour une citation, ` ``` ` pour un bloc de code, etc.

## Architecture

```text
src/
├── main/        Processus principal Electron : fenêtres, menus, dialogues, accès disque
├── preload/     Pont sécurisé (contextBridge) exposant une API typée au rendu
├── renderer/    Interface React + Tiptap
│   ├── components/   En-tête, barre d'outils, barre de statut, dialogues
│   ├── editor/       Extensions Tiptap et conversion Markdown
│   └── lib/          Mock de développement pour l'aperçu navigateur
└── shared/      Types IPC partagés
```

### Conversion Markdown

Le Markdown est la source de vérité, mais il n'est jamais édité directement :

1. **Ouverture** : Markdown → `marked` → HTML → `editor.commands.setContent()`.
2. **Édition** : ProseMirror maintient un document HTML structuré.
3. **Enregistrement** : HTML → `Turndown` → Markdown.

Des règles Turndown dédiées garantissent un rendu propre des tableaux GFM, des listes (y compris imbriquées et de tâches), des blocs de code avec langage, du souligné et des liens. Les tests couvrent ces conversions et vérifient qu'un second aller-retour est stable.

Un harnais de non-régression (`src/renderer/src/editor/regression.test.ts`) valide la stabilité sur deux allers-retours de huit fixtures couvrant les cas délicats (tableaux, listes imbriquées, blocs de code, liens/images, Unicode, citations imbriquées, HTML inline, frontmatter), plus un fuzz léger de 300 documents générés aléatoirement.

### Encodage et fins de ligne

Le processus principal lit les fichiers en bytes et détecte l'encodage (UTF-8, UTF-16 LE/BE) ainsi que la présence d'un BOM. Le contenu est normalisé en LF pour l'édition, puis réencodé à l'enregistrement avec le BOM et le style de fin de ligne d'origine. Un fichier qui n'est pas de l'UTF-8 valide est ouvert en Windows-1252 après un avertissement explicite, plutôt que de voir ses caractères remplacés silencieusement ; il sera ensuite enregistré en UTF-8.

### Sécurité

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Aucun accès Node.js dans le rendu : tout passe par des canaux IPC explicites.
- Navigation et ouverture de fenêtres bloquées ; les liens externes passent par `shell.openExternal`.
- CSP restrictive dans `index.html`, nettoyage du HTML importé.

## Limites connues

- L'alignement de paragraphe (centré, à droite) est enregistré en HTML explicite (`<p align="center">…</p>`), qui est reconnu par la plupart des éditeurs Markdown mais n'a pas de syntaxe Markdown standard. L'alignement à gauche, valeur par défaut, n'est pas écrit.
- Les modèles et extraits se modifient comme des fichiers (pas d'éditeur dédié). Les marqueurs de date sont limités à `{{date}}` et `{{heure}}`.
- Le mode source est une bascule : il n'y a pas de vue côte à côte. Les balises HTML en ligne non représentées (`<sub>`, `<sup>`…) perdent leur mise en forme si l'on passe à l'éditeur malgré l'avertissement.
- Les notes de bas de page ne sont pas renumérotées automatiquement après suppression d'une marque. Les liens de référence créés depuis la boîte de dialogue sont enregistrés en ligne.
- Les largeurs de colonnes ne sont pas enregistrées (pas de syntaxe Markdown) et la fusion de cellules n'est pas proposée, car GFM ne la représente pas.
- Les images insérées par URL ou collage sont copiées dans `assets/` à côté du document ; les images référencées par un chemin externe (hors du dossier du document) restent liées par chemin.
- Les blocs HTML de premier niveau sont conservés sous forme de blocs opaques (code), pas rendus dans la page. Le HTML inline non pris en charge (`span`, `mark`, `sub`…) conserve son texte mais perd sa mise en forme.
- Un fichier non UTF-8 valide est ouvert en Windows-1252 avec un avertissement, puis enregistré en UTF-8 : son encodage d'origine n'est pas conservé.
- Les fichiers UTF-16 sans BOM et les fichiers UTF-32 ne sont pas détectés automatiquement.
- La détection de conflit externe repose sur la date de modification et la taille du fichier ; une modification externe qui ne change ni l'une ni l'autre (cas rare) ne serait pas détectée.

## Feuille de route

Les chantiers prévus, leur priorité et l'ordre recommandé sont détaillés dans **[roadmap.md](roadmap.md)**.

En résumé : fiabiliser la conservation des fichiers (frontmatter, autosave), puis le confort quotidien (recherche, images locales, thème sombre), les fonctions Markdown avancées, l'organisation multi-documents, et enfin la distribution signée.

## Licence

MIT.
