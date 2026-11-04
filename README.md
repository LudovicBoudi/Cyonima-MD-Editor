# Cyonima MD Editor

Un éditeur **Markdown WYSIWYG** pour le bureau : on écrit et on met en forme directement dans la page, comme dans un traitement de texte, et le fichier enregistré reste du **Markdown propre et portable**.

![Aperçu de l'éditeur](docs/screenshot.jpg)

## Pourquoi ?

Les éditeurs Markdown classiques séparent l'écriture (le code source) et l'aperçu. Cyonima MD Editor inverse la logique : la page est le document, la barre d'outils fait la mise en forme, et le Markdown est généré à l'enregistrement. Pas de syntaxe à mémoriser, pas de fichier propriétaire.

## Fonctionnalités

- **Édition WYSIWYG** propulsée par Tiptap / ProseMirror.
- **Mise en forme riche** : gras, italique, souligné, barré, code en ligne, titres 1 à 4.
- **Structure** : listes à puces, listes numérotées, listes de tâches, citations, blocs de code, séparateurs.
- **Tableaux éditables** : insertion, ajout/suppression de lignes et de colonnes.
- **Liens et images** : insertion par boîte de dialogue, ouverture des liens avec `Ctrl`/`Cmd` + clic.
- **Fichiers Markdown** : nouveau document, ouverture, enregistrement, « Enregistrer sous ».
- **Frontmatter YAML préservé** : le bloc de métadonnées est affiché dans un panneau repliable et réinjecté à l'identique à l'enregistrement.
- **HTML brut préservé** : les blocs HTML sans équivalent Markdown (iframes, styles, scripts, div personnalisés…) sont affichés comme des blocs opaques, jamais exécutés, et restitués tels quels à l'enregistrement.
- **Encodage et fins de ligne préservés** : UTF-8 avec ou sans BOM, UTF-16 LE/BE, LF ou CRLF. Le format d'origine est réappliqué à l'enregistrement et affiché dans la barre de statut.
- **Enregistrement sûr** : écriture atomique via fichier temporaire puis renommage, permissions d'origine conservées, refus explicite des fichiers en lecture seule.
- **Conflits externes détectés** : si le fichier a changé en dehors de l'éditeur, proposition « Recharger / Écraser / Enregistrer sous / Annuler » avant d'écraser.
- **Récupération après crash** : sauvegarde de secours périodique des brouillons non enregistrés, proposition de récupération au démarrage.
- **Export PDF** et impression (mise en page A4, sans l'interface).
- **Statut du document** : nombre de mots, caractères, temps de lecture, chemin du fichier, encodage, fins de ligne et état d'enregistrement.
- **Robustesse** : garde-fou de rendu (pas d'écran blanc), notifications non bloquantes en cas d'erreur, journal local consultable (menu Aide → Ouvrir le journal).
- **Garde-fou** : confirmation avant de perdre des modifications non enregistrées, y compris à la fermeture.
- Interface en français, thème clair et typographie de document.

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

- L'alignement de paragraphe n'a pas d'équivalent Markdown standard : il est visible à l'écran, mais perdu à l'enregistrement.
- Les images sont référencées par URL ou chemin ; les fichiers locaux ne sont pas copiés automatiquement dans un dossier `assets/`.
- Les blocs HTML de premier niveau sont conservés sous forme de blocs opaques (code), pas rendus dans la page. Le HTML inline non pris en charge (`span`, `mark`, `sub`…) conserve son texte mais perd sa mise en forme.
- Un fichier non UTF-8 valide est ouvert en Windows-1252 avec un avertissement, puis enregistré en UTF-8 : son encodage d'origine n'est pas conservé.
- Les fichiers UTF-16 sans BOM et les fichiers UTF-32 ne sont pas détectés automatiquement.
- La détection de conflit externe repose sur la date de modification et la taille du fichier ; une modification externe qui ne change ni l'une ni l'autre (cas rare) ne serait pas détectée.
- L'ouverture de fichiers via le menu natif « Ouvrir avec » n'est pas encore gérée lorsqu'une instance est déjà lancée.

## Feuille de route

Les chantiers prévus, leur priorité et l'ordre recommandé sont détaillés dans **[roadmap.md](roadmap.md)**.

En résumé : fiabiliser la conservation des fichiers (frontmatter, autosave), puis le confort quotidien (recherche, images locales, thème sombre), les fonctions Markdown avancées, l'organisation multi-documents, et enfin la distribution signée.

## Licence

MIT.
