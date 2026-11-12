# Feuille de route — Cyonima MD Editor

> État de départ : **v0.1.0** — éditeur WYSIWYG Markdown fonctionnel (Electron + React + Tiptap), ouverture/enregistrement `.md`, mise en forme riche, tableaux, export PDF, tests de conversion.
>
> Ce document liste les chantiers possibles et **l'ordre recommandé** pour les réaliser. L'ordre privilégie volontairement : **ne jamais perdre un document** → **rendre l'usage quotidien agréable** → **étendre le Markdown** → **organiser plusieurs documents** → **distribuer proprement**.

## Légende

| Priorité | Signification |
| --- | --- |
| **P0** | Fiabilité : perte de données, sécurité, intégrité des fichiers. À faire avant tout le reste. |
| **P1** | Fort impact : fonctionnalité attendue par la plupart des utilisateurs. |
| **P2** | Confort et différenciation. |
| **P3** | Exploratoire, à valider avec de vrais utilisateurs. |

| Effort | Ordre de grandeur (1 dev) |
| --- | --- |
| **S** | < 1 jour |
| **M** | 1 à 3 jours |
| **L** | 4 à 10 jours |
| **XL** | > 10 jours / chantier de fond |

## Vue d'ensemble

| Phase | Objectif | Contenu clé | Durée indicative |
| --- | --- | --- | --- |
| **0 — Protéger le document** | Zéro perte de données | Frontmatter, HTML brut, autosave, écriture atomique, tests, Electron à jour | ~2 à 3 semaines |
| **1 — Quotidien** | Rendre l'édition confortable | Recherche, fichiers récents, images locales, thème sombre, coloration code, liens | ~4 à 6 semaines |
| **2 — Markdown avancé** | Fidélité et puissance | Alignement, tableaux avancés, notes, mode source, sommaire, exports | ~4 à 6 semaines |
| **3 — Organisation** | Plusieurs documents | Onglets/fenêtres, espace de travail, historique, préférences, accessibilité, i18n | ~4 à 8 semaines |
| **4 — Distribution** | Produit fini | Icônes, associations de fichiers, CI multi-OS, signature, mises à jour, site | ~3 à 5 semaines |

**Estimation globale : 4 à 6 mois à temps partiel** pour aller jusqu'à une v1.0 solide. Les phases 0 et 1 suffisent déjà à faire un outil recommandable (≈ v0.3).

---

## Phase 0 — Protéger le document (v0.1.x)

> **Règle : aucun chantier de la phase 1 ne commence avant que cette phase soit terminée.** Un éditeur qui perd silencieusement du contenu n'a pas d'avenir, quelles que soient ses fonctionnalités.

- [x] **0.1 — Préserver le frontmatter YAML** · P0 · M · **fait**
  - Aujourd'hui, un bloc `---\ntitle: …\n---` est interprété comme un séparateur horizontal et **perdu à l'enregistrement**.
  - Détecter le frontmatter à l'ouverture, l'afficher dans un bloc dédié en haut du document (repliable), le réinjecter tel quel à la sauvegarde.
  - Ne jamais le faire passer par Turndown.
  - *Critère d'acceptation :* ouvrir puis enregistrer un fichier avec frontmatter ne modifie pas une seule ligne du bloc.
  - *Implémenté :* `splitFrontmatter` / `joinFrontmatter`, panneau `FrontmatterPanel`, 9 tests dédiés, vérifié dans Electron. Suite possible : édition du bloc (formulaire clé/valeur) en 2.11.

- [x] **0.2 — HTML brut et blocs exotiques** · P0 · M · **fait (blocs)**
  - Le nettoyage actuel supprime `iframe`, `style`, `script`, etc. : c'est bien pour la sécurité, mais la sauvegarde les fait disparaître **silencieusement**.
  - Choisir une stratégie explicite : préserver ces blocs en zones opaques (recommandé) ou avertir l'utilisateur avant l'écrasement.
  - *Critère d'acceptation :* aucun contenu supprimé sans avertissement clair.
  - *Implémenté :* les blocs HTML de premier niveau deviennent des nœuds opaques (`RawHtml`) affichés en code, jamais injectés comme markup, et restitués à l'identique à l'enregistrement. Les balises dangereuses ne sont ni exécutées ni chargées. Vérifié dans Electron. Le HTML **inline** non pris en charge (`span`, `mark`, `sub`…) conserve son texte mais perd sa mise en forme : voir 2.12.

- [x] **0.3 — Encodage, BOM et fins de ligne** · P0 · S · **fait**
  - Lire en UTF-8 avec détection de BOM, préserver le BOM et le style de fin de ligne (LF/CRLF) du fichier d'origine.
  - Gérer proprement les fichiers non-UTF-8 (avertissement plutôt que remplacement de caractères).
  - *Implémenté :* module `src/main/fileFormat.ts` ; UTF-8 (avec/sans BOM), UTF-16 LE/BE, détection LF/CRLF, normalisation en LF dans l'éditeur et réencodage à l'identique à l'enregistrement. Les fichiers non UTF-8 sont ouverts en Windows-1252 après un avertissement explicite, puis enregistrés en UTF-8. Le format courant est affiché dans la barre de statut. 15 tests dédiés ; aller-retour byte-à-byte vérifié dans Electron pour UTF-8 BOM + CRLF et UTF-16 LE.

- [x] **0.4 — Écriture atomique et permissions** · P0 · S · **fait**
  - Écrire dans un fichier temporaire puis renommer, pour éviter un fichier tronqué en cas de coupure.
  - Conserver les permissions existantes ; message d'erreur explicite si le fichier est en lecture seule.
  - *Implémenté :* module `src/main/atomicWrite.ts` ; écriture dans un fichier temporaire du même dossier, `fsync` du contenu puis `rename` atomique, synchronisation best-effort du dossier, permissions d'origine restaurées, liens symboliques préservés. Un fichier en lecture seule est refusé avec un message explicite invitant à modifier les permissions ou à utiliser « Enregistrer sous ». 6 tests dédiés.

- [x] **0.5 — Détection de conflit externe** · P0 · S/M · **fait**
  - Comparer la date de modification du fichier avant d'écraser ; proposer « Recharger / Écraser / Enregistrer sous » si le fichier a changé hors de l'application.
  - *Implémenté :* empreinte du fichier (date de modification + taille) mémorisée à l'ouverture et après chaque enregistrement, comparée avant tout écrasement en place. En cas de divergence, dialogue à quatre choix (Recharger / Écraser / Enregistrer sous / Annuler) ; « Recharger » relit le disque et met à jour l'éditeur, « Écraser » poursuit l'écriture. Module `src/main/fileStamp.ts` (4 tests). Vérifié dans Electron pour les trois branches.

- [x] **0.6 — Autosave et récupération après crash** · P0 · M · **fait**
  - Sauvegarde de secours périodique (5–10 s) dans `app.getPath('userData')`, pas dans le fichier source.
  - Au démarrage : proposer de restaurer les brouillons non enregistrés.
  - Garder l'enregistrement explicite (`Ctrl+S`) comme source de vérité ; l'autosave ne doit pas surprendre.
  - *Critère d'acceptation :* tuer l'application en pleine frappe puis la relancer propose de récupérer le texte.
  - *Implémenté :* sauvegarde JSON périodique (7 s) uniquement en cas de modifications, dans `userData/autosave.json` ; effacée après un enregistrement réussi, une ouverture, un nouveau document ou un abandon à la fermeture. Au démarrage, dialogue « Récupérer / Supprimer » ; la restauration recharge le brouillon et le marque comme non enregistré. Module `src/main/autosave.ts` (6 tests). Scénario kill/relance vérifié dans Electron.

- [x] **0.7 — Harnais de tests de non-régression Markdown** · P0 · M · **fait**
  - Ajouter des fixtures « fichier réel → HTML → Markdown » et vérifier la stabilité sur deux allers-retours.
  - Cas à couvrir : frontmatter, HTML inline, tableaux complexes (cellules vides, `|` échappés, colonnes alignées), listes imbriquées, listes de tâches, blocs de code avec/sans langage, fences `~~~`, code indenté, liens avec parenthèses, caractères Unicode/emoji, CRLF, hard breaks, citations imbriquées, images avec titre.
  - Ajouter un test de *fuzz* léger (génération de documents aléatoires) pour détecter les crashes de conversion.
  - *Implémenté :* 8 fixtures `src/renderer/src/editor/fixtures/*.md`, `regression.test.ts` (stabilité sur deux allers-retours + cas ciblés) et fuzz déterministe de 300 documents. Le harnais a révélé deux bugs réels, corrigés : listes de tâches « lâches » (avec sous-listes) qui perdaient leurs cases à cocher, et retours à la ligne forcés détruits par la suppression des espaces de fin de ligne. 72 tests au total.

- [x] **0.8 — Mise à jour d'Electron et de Node** · P0 · M · **fait (partiel, voir suite)**
  - Electron 33 et Node 18 ne sont plus maintenus : mettre à jour vers une version supportée, puis revalider `sandbox`, preload, IPC et packaging.
  - Vérifier les alertes `npm audit` et monter les dépendances majeures (Vite, Tiptap, Vitest).
  - *Implémenté :* Electron **33.4.11 → 39.8.10** (Node 22.22.1, Chromium 142), la version la plus récente installable sous le Node de dev 18.19.1. Revalidé : typecheck, 72 tests, build, packaging (`dist:dir`), et lancement de l'app empaquetée avec ouverture + `Ctrl+S` (sandbox/preload/IPC intacts).
  - *Suite requise :* Electron 40+ (donc les versions supportées 43/44/45) exige **Node ≥ 22.12** pour télécharger le binaire via `@electron/get@5`. Une fois Node 22+ installé, monter Electron à la dernière version supportée et revalider. Les 36 alertes `npm audit` restantes sont du ressort de **4.7** (montées `electron-builder` 26, `vitest` 5, `esbuild`, `tar`, etc.).

- [x] **0.9 — Gestion d'erreurs et observabilité locale** · P0 · S · **fait**
  - `ErrorBoundary` React pour éviter l'écran blanc, remplacement progressif des `dialog.showErrorBox` bloquants par des notifications non bloquantes, journal local consultable.
  - Débouncer le calcul des statistiques (actuellement recalculé à chaque frappe sur tout le document).
  - *Implémenté :* `ErrorBoundary` autour de l'espace de travail (fallback + bouton « Recharger »), notifications non bloquantes (`Notifications.tsx` + événement `app:notify`) remplaçant les trois `dialog.showErrorBox`, journal local `userData/logs/app.log` (`logger.ts`, 4 tests) consultable via le menu « Aide → Ouvrir le journal », et débounce (300 ms) du comptage mots/caractères. Vérifié dans Electron : erreur d'écriture → toast non bloquant + trace dans le journal, éditeur toujours réactif.

- [x] **0.10 — Correctifs de robustesse divers** · P1 · S · **fait**
  - `findFileArgument` : parsing plus strict des arguments.
  - Deuxième instance : ouvrir le fichier passé en argument dans la fenêtre existante (aujourd'hui elle se contente de prendre le focus).
  - Arrêter d'envoyer `path` dans `doc:set-meta` s'il n'est pas utilisé.
  - *Implémenté :* extraction d'argument dédiée `extractFileArgument` (ignore les drapeaux, résout en absolu, vérifie `isFile()` et l'extension), utilisée pour l'ouverture CLI et la seconde instance. La seconde instance envoie `app:open-file` à la fenêtre existante, qui ouvre le fichier via `openFileAt` (avec la même garde de modifications non enregistrées). Le champ `path` a été retiré de `DocumentMeta`. Vérifié dans Electron : seconde instance ouvre bien le fichier dans la fenêtre existante.

**Definition of done de la phase 0 :** un fichier ouvert puis enregistré sans modification est **identique octet pour octet** (hors normalisation explicitement choisie), et une fermeture brutale ne fait perdre aucun texte.

---

## Phase 1 — Confort d'écriture quotidien (v0.2)

> Objectif : que l'application soit celle qu'on ouvre par défaut pour prendre des notes.

### Recherche et navigation

- [x] **1.1 — Rechercher / remplacer** · P1 · M · **fait**
  - Barre `Ctrl+F`, navigation précédent/suivant, compteur de résultats, remplacement simple et global, option casse/expression régulière.
  - Mise en évidence des occurrences dans l'éditeur.
  - `Échap` ferme la barre et rend le focus au document.
  - *Critère d'acceptation :* remplacer 50 occurrences dans un document de 10 000 lignes reste fluide.
  - *Implémenté :* barre `FindReplaceBar` (`Ctrl+F`, précédent/suivant, compteur `n/m`, casse, expression régulière, remplacement unique et global), surbrillance via l'extension Tiptap `SearchHighlight` (décorations inline, occurrence active distincte), module pur `lib/search.ts` (12 tests). Le remplacement global s'effectue en **une seule transaction** ProseMirror. Vérifié dans Electron : 5 occurrences → compteur `1/5`, 5 surlignages, remplacement global en `bar`. L'expression régulière s'applique à la recherche ; le texte de remplacement est littéral.

- [x] **1.2 — Fichiers récents et réouverture de session** · P1 · S · **fait**
  - Mémoriser les 10 derniers fichiers, les afficher dans le menu natif « Fichier → Ouvrir récent » et sur l'écran d'accueil.
  - Proposer de rouvrir le dernier document au lancement (option désactivable).
  - Nettoyer les entrées dont le fichier n'existe plus.
  - *Implémenté :* modules `recentFiles.ts` (10 max, dédup, nettoyage) et `settings.ts`, menu « Fichier → Ouvrir récent » (avec « Effacer la liste »), réouverture du dernier document au lancement désactivable via le menu, entrées nettoyées à l'ouverture du menu. 11 tests. Vérifié dans Electron : ouverture CLI → liste persistée → relance sans argument → réouverture du dernier fichier. L'affichage sur un « écran d'accueil » est reporté (aucun écran d'accueil pour l'instant).

- [x] **1.3 — Glisser-déposer et ouverture multiple** · P1 · S/M · **fait (fichiers .md)**
  - Déposer un `.md` sur la fenêtre l'ouvre (avec garde-fou sur les modifications en cours).
  - Accepter les images déposées (voir 1.4).
  - *Implémenté :* dépôt d'un fichier Markdown sur la fenêtre → récupération du chemin via `webUtils.getPathForFile` (exposé par le preload), ouverture via le flux existant `openDocumentAt` (même garde de modifications non enregistrées). Le `dragover` n'intercepte que les dépôts de fichiers (le glisser de texte reste intact). Module `lib/fileTypes.ts` (3 tests). Vérifié dans Electron : dépôt de `drop-b.md` → titre et contenu mis à jour. Le dépôt d'images est reporté à 1.4.

### Images et liens

- [x] **1.4 — Images locales vraiment utilisables** · P1 · M · **fait**
  - **Bug actuel :** une image `./photo.png` ne s'affiche pas, car le chemin est résolu depuis l'application et non depuis le fichier Markdown.
  - Résoudre les chemins relatifs par rapport au dossier du document (protocole custom ou réécriture vers `file://`).
  - À l'insertion ou au collage : copier l'image dans `assets/` à côté du document et écrire un chemin relatif portable.
  - Coller une image depuis le presse-papiers (capture d'écran) et glisser-déposer.
  - Éditer l'alternative (alt) et la légende ; redimensionnement visuel (largeur en attribut HTML, pas de perte Markdown).
  - *Implémenté :* protocole custom `local-file://` (lecture directe du fichier, restreint aux extensions image, MIME correct) + ajout de `local-file:` à la CSP `img-src`/`connect-src`. `resolveLocalImages`/`unresolveLocalImages` (normalisation des chemins) convertissent les chemins relatifs ↔ `local-file://` à l'ouverture/enregistrement. Copie dans `assets/` (`imageAssets.ts` : `importImageFile`/`importImageBuffer`, dédup, MIME→extension) pour le parcours, le glisser-déposer et le collage presse-papiers (`handlePaste`). Boîte d'image enrichie : alt, légende (titre) et largeur (attribut `width` via `CustomImage`, purement visuel, abandonné à l'enregistrement). 15 nouveaux tests (résolution + `imageAssets`). Vérifié dans Electron : image relative affichée (`naturalWidth > 0`) et dépôt d'image copié dans `assets/`. Le collage presse-papiers est couvert par le code + tests unitaires (non automatisable en E2E sans presse-papiers réel) ; le redimensionnement est un champ de largeur, pas des poignées de glisser.

- [x] **1.5 — Popover de lien** · P1 · S/M · **fait**
  - Cliquer sur un lien (sans `Ctrl`) ouvre un popover : URL, boutons « Ouvrir », « Modifier », « Copier », « Supprimer ».
  - Évite le comportement actuel où un clic ne fait rien, ce qui peut sembler cassé.
  - Gérer aussi les liens internes `#ancre` (défilement dans le document).
  - *Implémenté :* `LinkPopover` flottant au clic (URL + Ouvrir/Modifier/Copier/Supprimer), `Ctrl`/`Cmd`+clic ouvre toujours directement, « Modifier » sélectionne le lien et ouvre la boîte de dialogue, « Copier » via le presse-papiers système (`clipboard` en main). Liens `#ancre` : « Ouvrir » défile vers l'élément portant l'id correspondant. Fermeture au clic extérieur, `Échap` et à l'édition. Vérifié dans Electron : clic → popover avec la bonne URL → « Supprimer » retire le lien en conservant le texte. Les ancres automatiques de titres (ids de rubriques) restent un sujet séparé.

### Apparence et concentration

- [x] **1.6 — Thème sombre et thème système** · P1 · M · **fait**
  - Thèmes clair / sombre / automatique, mémorisés ; adapter l'éditeur, la barre d'outils, les dialogues et l'export PDF.
  - Passer la couleur de fond de `BrowserWindow` en dynamique pour éviter le flash blanc au lancement.
  - *Implémenté :* préférence `theme` (`system` | `light` | `dark`) persistée dans `settings.json` et synchronisée avec `nativeTheme.themeSource`. Jetons CSS sémantiques (`--ink`, `--page`, `--hover`, `--code-bg`…) et palette sombre sous `:root[data-theme='dark']`, avec repli `prefers-color-scheme` pour le tout premier rendu. Sélecteur de thème dans l'en-tête et sous-menu « Affichage → Thème » (radio synchronisé). `BrowserWindow` reçoit la couleur de fond résolue et la met à jour à chaque changement. L'impression et l'export PDF forcent la palette claire via `@media print`. Vérifié dans Electron : bascule sombre/clair, persistance après redémarrage, couleurs calculées, et rendu d'impression clair même en thème sombre.

- [x] **1.7 — Mode concentration et mise en page** · P1 · S/M · **fait**
  - Masquer en-tête, barre d'outils et barre d'état ; largeur de page réglable ; mode « machine à écrire » (ligne active centrée).
  - Mémoriser le choix par document ou globalement.
  - *Implémenté :* préférences `focusMode`, `pageWidth` (`narrow` | `normal` | `wide` | `full`) et `typewriterMode` persistées **globalement** dans `settings.json` et exposées via l'IPC `view:get` / `view:set` (`view:changed` pour la synchronisation). Menu « Affichage » dans l'en-tête (`LayoutMenu`) et sous-menu natif synchronisé (radio de largeur, cases concentration et machine à écrire, `Ctrl/Cmd+Shift+F`). Le mode concentration masque l'en-tête, la barre d'outils et la barre d'état, avec bouton flottant et sortie par `Échap`. La largeur s'applique à la page (`.page--narrow` … `.page--full`). La machine à écrire ajoute un rembourrage vertical et recentre la ligne du curseur à chaque déplacement (`coordsAtPos` + `scrollTo`). 13 tests ajoutés (validation des réglages côté main, normalisation/persistance côté rendu), soit 126 au total. Vérifié dans Electron : bascule concentration et sortie `Échap`, largeur large, centrage du curseur sur un document de 60 paragraphes, persistance après redémarrage.

- [x] **1.8 — Confort typographique** · P2 · S · **fait**
  - Choix police (serif / sans / mono), taille de texte, interligne, largeur de colonne.
  - Espacement des paragraphes et styles de titres cohérents avec l'export.
  - *Implémenté :* réglages `fontFamily` (`serif` | `sans` | `mono`), `fontSize` (14–24 px), `lineHeight` (1,30–2,20) et `paragraphSpacing` (0,40–1,80 em) ajoutés à `ViewSettings` et persistés dans `settings.json`. Normalisation partagée dans `shared/typography.ts` (police inconnue ou nombre hors bornes → valeur par défaut). Contrôles dans le menu « Affichage » de l'en-tête : police en segments, taille/interligne/espacement par pas de 1 px / 0,05, bouton « Réinitialiser la typographie ». Sous-menu natif « Affichage → Typographie » synchronisé (polices, tailles et presets). Les valeurs sont appliquées par variables CSS sur l'application, donc l'éditeur, l'impression et l'export PDF restent cohérents ; le Markdown enregistré n'est pas modifié. La largeur de colonne est couverte par 1.7. 5 tests ajoutés (normalisation typographique et validation des réglages), soit 131 au total. Vérifié dans Electron : bascule serif/sans/mono (y compris les titres en mono), taille 17 → 19 px, interligne 1,70 → 1,85, espacement 1,00 → 0,80 em, réinitialisation, rendu d'impression conservé et persistance après redémarrage.

### Blocs de code et statistiques

- [x] **1.9 — Coloration syntaxique des blocs de code** · P1 · M · **fait**
  - Intégrer `lowlight`/`highlight.js`, sélecteur de langage, bouton « Copier ».
  - Conserver le langage dans les fences Markdown (déjà géré par Turndown).
  - Prévoir un thème de coloration compatible clair/sombre.
  - *Implémenté :* `@tiptap/extension-code-block-lowlight` + `lowlight` (jeu `common`, 37 langages) remplacent le bloc de code de StarterKit. Une barre contextuelle « Code » apparaît lorsque le curseur est dans un bloc : sélecteur de langage (libellés français, alias existants conservés, langage inconnu toujours sélectionnable) et bouton « Copier » avec retour « Copié ». Les fences sans langage ou avec un langage inconnu restent en texte brut au lieu d'être colorées comme un autre langage. Palette de jetons `.hljs-*` dédiée (commentaires, mots-clés, chaînes, nombres, titres, variables, balises, diff) sur fond de code sombre, avec variante lisible pour l'impression/PDF. Le langage est conservé à l'enregistrement. 5 tests ajoutés (liste des langages, alias/inconnus, fences), soit 136 au total. Vérifié dans Electron : coloration JS, alias `js`, bloc inconnu non coloré, bloc sans langage, changement vers Python, copie dans le presse-papiers, sauvegarde de la fence, thème sombre et palette d'impression.

- [x] **1.10 — Barre d'état enrichie** · P2 · S/M · **fait**
  - Statistiques de la sélection, objectif de mots avec progression, temps de lecture restant, position ligne/colonne, encodage, fin de ligne.
  - Compter les caractères avec `Intl.Segmenter` (graphèmes) plutôt que `String.length` (UTF-16).
  - Mot Count : mieux gérer apostrophes, traits d'union et nombres.
  - *Implémenté :* `lib/documentStats.ts` compte les mots avec les règles ICU (`l'homme` et `aujourd’hui` restent un mot, `peut-être` et `c'est-à-dire` comptent un mot, `3,14` un nombre) et les caractères en graphèmes, sans les sauts de ligne. La barre affiche la position « Ligne L, col. C » (calculée sur le texte rendu, pas sur les lignes du fichier Markdown) et les mots/caractères de la sélection. Un objectif de mots (`wordGoal`, 10 à 100 000, ou aucun) se règle en cliquant sur le compteur de mots ; il affiche `mots / objectif`, une barre de progression et le reste à écrire, puis « Objectif atteint ». L'objectif est persisté dans `settings.json`. Vérifié dans Electron (position, sélection, objectif, persistance après redémarrage, suppression).

- [x] **1.11 — Orthographe et langue** · P2 · S/M · **fait (sauf liste/suppression du dictionnaire)**
  - Configurer la langue du correcteur (`fr-FR` par défaut), dictionnaire personnel, activation/désactivation.
  - Electron expose nativement le correcteur : vérifier le rendu des suggestions sous Linux/Windows/macOS.
  - *Implémenté :* menu « Édition → Orthographe » avec activation de la correction et choix de la langue parmi huit (français par défaut, anglais, allemand, espagnol, italien, portugais du Brésil, néerlandais). Réglages `spellCheck` et `spellLanguage` persistés dans `settings.json` ; une langue inconnue retombe sur `fr-FR`. Menu contextuel au clic droit : suggestions (six au maximum) pour un mot mal orthographié, « Ajouter au dictionnaire », puis couper / copier / coller / tout sélectionner. Les blocs de code ne sont pas soulignés (`spellcheck="false"`). Vérifié sous Linux : dictionnaire `fr-FR` chargé, réglages appliqués au démarrage, clic droit sans erreur.
  - *Limites :* Electron ne permet ni de lister ni de retirer les mots du dictionnaire personnel (ajout uniquement) ; sur macOS, la langue est gérée par le système (l'API de langue est sans effet) ; le dictionnaire est téléchargé à la première utilisation, donc hors ligne le correcteur reste inactif. Rendu des suggestions et du menu à confirmer sous Windows et macOS.

### Raccourcis et aide

- [x] **1.12 — Aide-mémoire des raccourcis** · P2 · S · **fait**
  - Dialogue `Ctrl+/` ou `F1` listant les raccourcis et la syntaxe Markdown acceptée.
  - Résout la découvrabilité des fonctions actuelles.
  - *Implémenté :* panneau « Raccourcis et syntaxe » ouvert par `Ctrl+/` (entrée « Aide » du menu et renfort côté rendu) ou `F1`, fermé par `Échap` ou un clic à l'extérieur. Il liste les raccourcis du menu, de l'éditeur et de l'application par groupes (fichier, édition, mise en forme, affichage), puis la syntaxe Markdown reconnue. Les deux listes sont dans `lib/shortcuts.ts`, à maintenir avec les raccourcis réels. Vérifié dans Electron : `F1`, `Ctrl+/` et `Échap`.

- [x] **1.13 — Collage propre** · P2 · S · **fait**
  - `Ctrl+Shift+V` : coller sans mise en forme.
  - Normaliser le Markdown collé (listes, tableaux, titres) au lieu de le traiter comme du texte brut.
  - *Implémenté :* `editor/paste.ts`. `Ctrl+Maj+V` insère le texte brut tel quel (`Markdown` littéral). Un texte brut collé avec `Ctrl+V` qui présente une structure Markdown (titres, listes, tâches, citations, blocs de code, séparateurs, tableaux) est converti avec le même convertisseur qu'à l'ouverture ; la prose ordinaire garde son comportement actuel. Le HTML copié (pages web, Word) est nettoyé : styles, métadonnées, balises `o:` et `style` en ligne sont retirés. Pas de conversion Markdown dans les blocs de code ni dans les tableaux. Les images relatives collées sont résolues par rapport au document. Vérifié dans Electron : titre et liste collés en structure, `Ctrl+Maj+V` littéral, prose inchangée.
  - *Limites :* la détection repose sur les marqueurs de bloc en début de ligne ; un texte purement inline (`**gras**` seul) reste littéral. Le HTML de Word est nettoyé mais pas reconstruit (listes à numérotation Word, styles de couleur).

**Definition of done de la phase 1 :** ouvrir, écrire, illustrer, retrouver et enregistrer un document se fait sans friction, en clair comme en sombre.

---

## Phase 2 — Fidélité et puissance Markdown (v0.3)

### Décider du contrat de fidélité

- [x] **2.1 — Alignement de paragraphe : persister ou retirer** · P1 · S/M · **fait (persisté)**
  - Aujourd'hui le bouton existe mais l'alignement est **perdu à l'enregistrement** : c'est une promesse non tenue.
  - Recommandation : persister en HTML explicite (`<p align="center">…</p>`) avec une règle Turndown dédiée, et le documenter comme extension.
  - Alternative assumée : retirer les boutons d'alignement pour ne promettre que du Markdown strict.
  - *Critère d'acceptation :* plus aucune mise en forme visible ne disparaît sans explication.
  - *Implémenté :* le choix retenu est la persistance. Les paragraphes et titres centrés ou à droite sont écrits `<p align="center">…</p>` (`<h2 align="right">…</h2>` pour les titres), le Markdown à l'intérieur restant éditable. Le HTML est relu comme un bloc Markdown ordinaire, donc l'alignement revient à l'ouverture. L'alignement à gauche (valeur par défaut) n'est pas écrit. Un bloc sur plusieurs paragraphes applique l'alignement à chacun. Vérifié dans Electron : centrage, enregistrement, réouverture.
  - *Limites :* l'alignement d'un paragraphe placé dans une liste n'est pas encore écrit ; le HTML alterne avec le Markdown, donc un outil qui ignore le HTML verra le texte sans l'alignement.

- [x] **2.2 — Tables avancées** · P2 · M · **fait (sauf largeurs et fusion)**
  - Alignement par colonne (`:---`, `:---:`, `---:`) réellement enregistré.
  - En-tête activable/désactivable, redimensionnement des colonnes, fusion de cellules si supportée.
  - Coller un tableau CSV/TSV → tableau Markdown.
  - Meilleure gestion des cellules vides et des `|` échappés.
  - *Implémenté :* l'alignement est lu et écrit par colonne (`:---`, `:---:`, `---:`), avec des boutons Gauche / Centre / Droite dans la barre contextuelle du tableau qui alignent toute la colonne (Markdown ne stocke qu'un alignement par colonne). L'en-tête est activable/désactivable : GFM exige une ligne d'en-tête, donc « désactivé » insère une ligne d'en-tête vide et transforme l'ancien en-tête en première ligne de données ; « activé » retire cette ligne vide et promeut la première ligne de données en en-tête. Le collage CSV/TSV crée un tableau dont la première ligne devient l'en-tête. Les cellules vides et les `|` échappés sont préservés dans les deux sens. Tests unitaires et vérification dans Electron (alignement, enregistrement, réouverture, en-tête, TSV, CSV).
  - *Limites :* le redimensionnement des colonnes n'est pas proposé : les largeurs n'ont pas de représentation Markdown et seraient perdues à l'enregistrement. La fusion de cellules n'est pas proposée non plus : GFM ne la représente pas, elle serait aplatie à la sauvegarde. Le collage CSV reste prudent : de la prose contenant des virgules n'est pas convertie (séparateurs serrés ou champs entre guillemets requis).

- [x] **2.3 — Notes de bas de page et références** · P2 · M · **fait**
  - Syntaxe `[^1]` / définitions, liens de référence `[texte][id]` et définitions associées.
  - Conversion aller-retour stable ; rendu lisible dans l'éditeur.
  - *Implémenté :* `marked` ne gère pas les notes de bas de page et supprime l'identifiant des liens de référence ; des extensions de lecture les reconnaissent. Une note est une marque `[^id]` (exposant) et une définition `[^id]:` éditable comme un bloc (paragraphes et listes compris, indentation de continuation restaurée). Le bouton « Insérer une note de bas de page » ajoute la marque au curseur et la définition en fin de document, avec numéro libre. Les liens de référence gardent leur identifiant et leur forme (`[texte][id]`, `[texte][]`, `[id]`) ; les définitions restent à leur place, affichées comme une ligne compacte. Les définitions ne sont reconnues qu'en début de bloc et jamais dans un bloc de code. Modifier l'URL d'un lien de référence le convertit en lien en ligne, pour ne pas réécrire l'ancienne définition. Une définition supprimée ne laisse que des liens en ligne. Un document contenant une note ou une définition de lien était marqué modifié dès l'ouverture : Tiptap ajoute un paragraphe vide en fin de document après un bloc qui n'est pas un paragraphe, et cette insertion déclenchait la mise à jour. Corrigé : ce paragraphe n'est plus compté comme une modification (`editor/documentChanges.ts`). Tests unitaires et de round-trip, 208 tests au total. Vérifié dans Electron : insertion d'une note via la barre d'outils, saisie dans la définition, enregistrement, réouverture avec notes et lien de référence reconnus, rendu visuel. Un bug trouvé pendant cette vérification a été corrigé : les définitions de lien suivant une note étaient écrites sans ligne vide et n'étaient plus reconnues à la réouverture ; chaque définition est maintenant un bloc séparé.
  - *Limites :* les notes sont numérotées dans l'ordre du texte mais ne sont pas renumérotées automatiquement si l'on supprime une marque. Les liens de référence insérés depuis la boîte de dialogue restent en ligne.

### Édition avancée

- [x] **2.4 — Mode source Markdown** · P2 · M/L · **fait (bascule simple)**
  - Bascule éditeur / source, ou vue côte à côte synchronisée.
  - Détecter les modifications non représentables en WYSIWYG et prévenir plutôt que perdre.
  - Utile aux utilisateurs avancés et pour diagnostiquer les problèmes de conversion.
  - *Implémenté :* le choix retenu est la bascule simple, avec un bouton « Source » dans l'en-tête et `Ctrl+Maj+M`. Le mode source affiche le Markdown complet, frontmatter compris, dans une zone de texte brut ; l'enregistrement écrit ce texte tel quel. Au retour vers l'éditeur, le texte n'est relu que s'il a été modifié : une simple entrée puis sortie ne réécrit rien. Les balises HTML en ligne que l'éditeur ne représente pas (`<sub>`, `<sup>`, `<span>` sans couleur…) sont listées dans un avertissement : « Rester dans la source » garde le texte, « Passer à l'éditeur quand même » accepte la perte de leur mise en forme. Les blocs HTML, eux, restent intacts. Détection testée unitairement ; vérifié dans Electron : entrée/sortie sans modification, édition puis retour, avertissement et ses deux choix, enregistrement depuis la source à l'octet près, raccourci.
  - *Limites :* pas de vue côte à côte. Pendant l'édition du source, la barre d'état (mots, ligne et colonne) reflète le dernier passage dans l'éditeur. Seules les balises HTML en ligne sont signalées ; les autres écarts de Markdown (variantes de syntaxe) sont normalisés à la sauvegarde depuis l'éditeur, sans perte de sens.

- [x] **2.5 — Sommaire et plan du document** · P2 · M · **fait**
  - Panneau latéral listant les titres, navigation au clic, titre actif pendant le défilement.
  - Base naturelle pour un futur espace de travail.
  - *Implémenté :* bouton « Plan » dans l'en-tête (état mémorisé entre les sessions). Le panneau liste les titres 1 à 4 avec une indentation par niveau, dans l'ordre du document, et se met à jour à chaque modification (y compris à l'ouverture d'un fichier). Un clic amène le titre en haut de la zone de travail et place le curseur dessus. Le titre actif est le dernier titre passé au-dessus d'une ligne de lecture, et le dernier titre en fin de document. Le panneau est masqué en mode concentration et en mode source (le plan reflète alors l'éditeur, qui est à jour seulement hors source), et à l'impression. La logique de titre actif est testée unitairement ; vérifié dans Electron : ouverture, clic, titre actif au défilement, fin de document, ajout d'un titre, persistance après redémarrage, rendu sombre.
  - *Limites :* pas de réorganisation par glisser-déposer du plan, pas de raccourci clavier pour le panneau. Un titre n'est pas repris dans le plan en mode source tant que le texte n'est pas revenu dans l'éditeur.

- [x] **2.6 — Modèles, extraits et insertion rapide** · P2 · S/M · **fait**
  - Modèles de documents (note de réunion, article, README), snippets réutilisables, insertion date/heure.
  - Modèles stockés dans `userData`, éditables.
  - *Implémenté :* une bibliothèque de fichiers `.md` dans `userData/library`, avec deux dossiers. `templates/` contient les modèles de document (Note de réunion, Article, README) ; ouvrir « Modèles » (en-tête) crée un nouveau document à partir de l'un d'eux, après confirmation si le document courant est modifié. `snippets/` contient les extraits : « Date », « Heure », « Date et heure » (marqueurs `{{date}}` et `{{heure}}` remplacés à l'insertion, en français, par exemple « 9 novembre 2026 » et « 14:05 ») et tout fichier ajouté par l'utilisateur. Le bouton « Insérer un extrait ou la date » de la barre d'outils insère l'extrait au curseur ; un extrait Markdown devient de la structure. Les fichiers sont créés au premier besoin, n'écrasent jamais les modifications, et « Ouvrir le dossier » donne accès à leur édition. Les modèles et extraits par défaut sont vérifiés par un aller-retour Markdown sans altération.
  - *Corrigé au passage :* `Ctrl+Maj+V` ne convertissait pas le Markdown collé en structure, car `view.pasteText` ne transmet pas le contenu du presse-papiers au gestionnaire de collage. La logique est désormais une fonction commune (`insertPlainText`) utilisée par le raccourci et par les extraits. Vérifié dans Electron : un titre et une liste collés via `Ctrl+Maj+V` deviennent de la structure.
  - *Limites :* les modèles ne s'éditent pas dans une fenêtre dédiée : on les modifie comme des fichiers, ouverts dans l'éditeur. Les marqueurs de date sont limités à `{{date}}` et `{{heure}}`. Supprimer un dossier de la bibliothèque le recrée avec les contenus par défaut au prochain usage. Pas de raccourci clavier pour les extraits.

- [x] **2.7 — Import et normalisation** · P2 · M · **fait**
  - Coller/convertir du HTML ou du RTF en Markdown.
  - Import `.docx` via Pandoc si disponible (dépendance externe à rendre optionnelle et détectée).
  - *Implémenté :* le collage convertit désormais trois formes de texte enrichi. Le HTML copié depuis un navigateur ou une suite bureautique est nettoyé (styles, métadonnées, éléments Word) puis intégré à la structure ; le HTML collé comme texte brut est interprété au lieu d'être inséré littéralement ; le RTF (exposé par le presse-papiers ou collé comme texte) est converti en paragraphes, gras, italique, souligné, barré, sauts de ligne, tabulations et caractères encodés (Windows-1252, Unicode). Le tout devient du Markdown à l'enregistrement. Vérifié dans Electron : collages HTML, RTF et HTML riche, puis inspection du `.md` écrit.
  - *Import Word :* menu Fichier → « Importer un document Word (.docx)… ». Pandoc est détecté à la demande (`pandoc --version`) ; s'il manque, une boîte explique l'installation et propose la page officielle, sans bloquer le reste de l'application. Après choix du `.docx` et de l'emplacement du `.md`, Pandoc convertit en GFM sans retour à la ligne forcé, les images sont extraites dans un dossier voisin (`<nom>_media`) et référencées relativement, puis le fichier est écrit atomiquement et ouvert. Les balises `<img>` produites par Pandoc pour les images dimensionnées sont normalisées en syntaxe Markdown, hors blocs de code. Un import vide ou contenant des images EMF/WMF/TIFF déclenche un avertissement. Conversion vérifiée avec un vrai Pandoc 3.13 (structure, tableau, image extraite).
  - *Limites :* l'import `.docx` exige Pandoc installé ; le document est enregistré immédiatement à l'emplacement choisi (deux boîtes de dialogue), les styles Word non représentables sont perdus, les dimensions d'image ne sont pas conservées (Markdown ne les stocke pas) et les images EMF/WMF/TIFF ne s'affichent pas. La conversion RTF ne restitue pas les listes, tableaux ni hyperliens structurés (leur texte est conservé).

### Exports

- [x] **2.8 — Export HTML autonome** · P2 · S/M · **fait**
  - HTML complet avec CSS embarquée et images en données ou dossier copié ; idéal pour partage.
  - *Implémenté :* menu Fichier → « Exporter en HTML… ». Le document courant (y compris les modifications en cours en mode source) est reconstruit depuis le Markdown, sans le frontmatter : page HTML complète avec feuille de style embarquée, titre repris du frontmatter ou du nom de fichier, typographie courante, tableaux, listes de tâches avec cases cochées, notes de bas de page transformées en ancres, liens de référence résolus et blocs HTML brut restitués. Les images locales (chemins relatifs, absolus ou déjà résolus) sont incorporées en data URI par le processus principal ; les images distantes restent des URL. Les scripts, styles, cadres, gestionnaires d'événements et URL `javascript:` du HTML brut sont retirés à l'export. L'écriture est atomique et une notification indique le fichier créé ou les images introuvables, remplacées dans la page par un texte de remplacement. Vérifié hors Electron en ouvrant l'export dans un navigateur : CSS, image JPEG en data URI, notes, cases à cocher, tableau et HTML brut rendus sans erreur.
  - *Limites :* les images distantes ne sont pas téléchargées : la page dépend alors d'une connexion. Les images très volumineuses augmentent fortement la taille du fichier. La coloration syntaxique des blocs de code n'est pas recalculée à l'export (le code reste lisible mais sans couleurs). Les liens relatifs vers d'autres fichiers Markdown ne sont pas réécrits.

- [x] **2.9 — Export PDF avancé** · P2 · M · **fait**
  - En-tête/pied de page (titre, numérotation), sauts de page, table des matières, pagination fiable.
  - Vérifier le rendu des tableaux et blocs de code longs.
  - *Implémenté :* menu Fichier → « Exporter en PDF… » ouvre un dialogue d'options (en-tête avec le titre, numéros « Page X sur Y », table des matières, saut de page avant chaque titre de niveau 1) ; les choix sont mémorisés. Le PDF est rendu A4 dans une fenêtre isolée à partir du même HTML d'impression que l'export HTML (typographie de l'éditeur, frontmatter exclu, notes, tâches, tableaux, HTML brut). La table des matières ne liste que les titres de niveau 1 à 3, avec liens internes. Les tableaux longs répètent leur en-tête sur chaque page et les blocs de code longs passent à la ligne au lieu d'être coupés. Les images locales sont incorporées avant le rendu, et l'attente des images et polices évite une première page incomplète. Vérifié dans Electron : 8 pages A4 pour un document de test, en-tête et pieds de page présents, en-tête de tableau répété page 3, fin du document et du code présentes.
  - *Limites :* la table des matières n'affiche pas de numéros de page (elle reste cliquable). En-tête et pied de page sont ceux de Chromium : polices système, pas de logo ni de mise en page personnalisée. Le rendu n'est vérifié que sous Linux ; Windows et macOS restent à confirmer. Les images distantes ne sont pas téléchargées ; une image très haute peut être coupée par le saut de page.

- [ ] **2.10 — Export DOCX / EPUB (Pandoc)** · P3 · M
  - À faire seulement si le besoin est confirmé ; dépendance externe, qualité variable.

- [x] **2.11 — Édition du frontmatter** · P2 · S/M · **fait**
  - Le bloc YAML est aujourd'hui affiché en lecture seule et préservé tel quel.
  - Ajouter un formulaire clé/valeur ou un éditeur YAML avec validation, sans jamais réécrire les lignes non modifiées.
  - Prévoir l'ajout d'un frontmatter à un document qui n'en a pas.
  - *Implémenté :* éditeur YAML (choix retenu : texte brut plutôt que formulaire, pour garder les commentaires et l'ordre des clés). Bouton « Modifier… » dans le panneau, ou menu Fichier → « Métadonnées du document… » (crée un bloc `title` à partir du nom du fichier si le document n'en a pas). Le YAML est validé pendant la saisie avec `js-yaml` : syntaxe, niveau racine en paires clé/valeur, et refus d'une ligne `---` qui fermerait le bloc ; « Enregistrer » reste désactivé tant que le texte est invalide. Enregistrer sans modification ne touche pas au bloc (espaces de fin de ligne compris), une valeur vide supprime le bloc. Vérifié dans Electron : ajout sur un document nu, YAML invalide refusé, enregistrement dans le fichier, réouverture, suppression.
  - *Limites :* en mode source, le YAML se modifie directement dans le texte brut (le menu ne fait rien). Pas de formulaire clé/valeur ni de complétion de clés. Le YAML est validé, mais son sens n'est pas vérifié (par exemple une date mal formée reste acceptée tant qu'elle est du YAML valide).

- [x] **2.12 — HTML inline non pris en charge** · P2 · M · **fait**
  - Les balises inline sans équivalent Tiptap (`span`, `mark`, `sub`, `sup`, `kbd`, etc.) conservent leur texte mais perdent leurs attributs à l'enregistrement.
  - Options : nœud inline opaque (même principe que 0.2), extensions dédiées pour les balises courantes, ou avertissement explicite au moment de l'ouverture.
  - *Cadre (décision sur le contrat de fidélité) :* le HTML inline correctement interprété par la majorité des éditeurs Markdown (`sub`, `sup`, `kbd`, `mark`, `br`, etc.) doit être préservé ; seul le HTML sans support courant peut être signalé.
  - *Critère d'acceptation :* aucune mise en forme HTML inline ne disparaît sans que l'utilisateur en soit informé.
  - *Implémenté :* `<sub>`, `<sup>` et `<kbd>` deviennent des marques Tiptap (`inlineHtmlMarks.ts`) et sont réécrits à l'identique. Indice `Ctrl+,` et exposant `Ctrl+.` (ajoutés à l'aide des raccourcis). Les appels de note `<sup data-footnote-ref>` restent gérés par les notes. Les autres balises inline sans support (`abbr`, `small`, `span` sans couleur…) déclenchent à l'ouverture, et au rechargement, une notification non bloquante qui les nomme : leur texte est conservé, leur balise disparaît à l'enregistrement. Le mode source garde son avertissement avant bascule. Vérifié dans Electron : un document avec `sub`, `sup`, `kbd`, une note et `abbr` affiche l'avertissement pour `<abbr>` seul, et l'enregistrement ne change que la balise `abbr`.
  - *Limites :* pas de bouton dans la barre d'outils pour indice, exposant ou `kbd` (raccourcis clavier seulement pour indice et exposant). Les balises non prises en charge ne sont pas conservées : seul l'utilisateur peut décider de les retirer ou de les réécrire en Markdown. Un nœud inline opaque (conservation complète) reste une piste si ce cas devient fréquent.

**Definition of done de la phase 2 :** tout ce qui est visible à l'écran a une représentation Markdown documentée et stable — ou est explicitement signalé comme non exportable.

---

## Phase 3 — Organisation, échelle et accessibilité (v0.4)

- [x] **3.1 — Onglets multi-documents** · P1 · L · **fait**
  - Ouvrir plusieurs fichiers dans des onglets, indicateur de modifications par onglet, fermeture avec garde-fou.
  - Décider tôt : onglets dans une fenêtre **ou** multi-fenêtres. Recommandation : onglets d'abord, multi-fenêtres ensuite (le modèle de données est le même).
  - *Implémenté :* barre d'onglets au-dessus de l'éditeur (point d'avertissement pour les modifications non enregistrées, fermeture par × ou Ctrl+W, onglet suivant/précédent Ctrl+Tab / Ctrl+Maj+Tab, bouton +). Un seul éditeur existe : chaque onglet inactif garde son état exact (JSON du document, Markdown, frontmatter, mode source, défilement). Ouvrir un fichier déjà ouvert active son onglet ; ouvrir depuis une fenêtre vierge remplace l'onglet vide. Fermer un onglet modifié demande Enregistrer / Ne pas enregistrer / Annuler. Le processus principal suit les empreintes de fichiers par chemin, et la sauvegarde de secours contient un brouillon par onglet modifié : après un plantage, tous les brouillons sont proposés. Fermer la fenêtre enregistre chaque onglet modifié à tour de rôle. Vérifié dans Electron : deux fichiers ouverts, modifications dans les deux, bascules sans perte, autosave des deux, enregistrement de l'onglet actif, fermeture avec abandon, nouvel onglet fermé, remplacement de la fenêtre vierge, et restauration de deux brouillons au démarrage.
  - *Limites :* l'historique d'annulation (Ctrl+Z) est propre à l'éditeur : il est perdu lors d'une bascule d'onglet. Le garde-fou de fermeture de fenêtre (plusieurs onglets modifiés) n'est pas vérifié automatiquement. Les onglets sont dans une seule fenêtre ; le multi-fenêtres reste à faire (3.5). La recherche se ferme lors d'un changement d'onglet.

- [ ] **3.2 — Espace de travail / dossier** · P2 · XL
  - Arborescence de fichiers, création/renommage/suppression, recherche plein texte dans le dossier.
  - Décision produit majeure : reste-t-on sur « un fichier à la fois » ou devient-on un « coffre » façon Obsidian ? À valider avec des utilisateurs avant développement.
  - *Périmètre retenu : dossier minimal (première étape faite).* Menu Fichier → « Ouvrir un dossier… » (Ctrl+Maj+O) affiche à gauche l'arborescence des fichiers Markdown (`.md`, `.markdown`, `.mdown`, `.mkd`, `.txt`) : dossiers repliables, dossiers d'abord, ordre français. Un clic ouvre le fichier dans un onglet (ou active l'onglet déjà ouvert) ; le fichier courant est mis en évidence. Les dossiers cachés (`.git`…) et les autres fichiers sont ignorés. La liste se rafraîchit après chaque enregistrement et sur le bouton « Actualiser ». Le processus principal ne liste que le dossier choisi par l'utilisateur. Vérifié dans Electron : arborescence, dossiers repliables, exclusions, ouverture depuis l'arbre sans doublon, fermeture du dossier.
  - *Reste à faire :* création, renommage et suppression de fichiers depuis l'arbre ; recherche plein texte dans le dossier ; mémorisation du dossier entre les sessions (il faut le rouvrir à chaque lancement) ; surveillance du disque (pas de rafraîchissement automatique si un fichier est créé en dehors de l'éditeur).

- [x] **3.3 — Historique de versions local** · P2 · M · **fait**
  - Instantanés automatiques à l'enregistrement, liste, aperçu et restauration.
  - Complète l'autosave sans dépendre d'un cloud.
  - *Implémenté :* à chaque enregistrement qui remplace un fichier existant, la version remplacée est copiée dans `userData/history/` (dossier par document, nommé d'après un hachage du chemin absolu), puis l'écriture a lieu. Une modification faite hors de l'éditeur, écrasée après conflit, est donc aussi conservée. Pas de copie si le contenu est identique à la dernière version. 100 versions au plus par document. Menu Fichier → « Historique des versions… » liste les versions (date, taille), affiche l'aperçu du texte et ouvre la version choisie dans un nouvel onglet **modifié, non enregistré** : rien n'est écrit tant que l'utilisateur n'enregistre pas. Vérifié dans Electron : deux enregistrements donnent deux versions, les aperçus montrent les bons textes, l'ouverture crée un onglet modifié et le fichier sur disque reste la dernière version. 7 tests (stockage, doublons, ordre, limite, isolement entre fichiers homonymes, ids invalides refusés).
  - *Limites :* les versions sont locales (pas de synchronisation) et stockées en texte ; les images d'`assets/` ne sont pas versionnées. Pas de vue de comparaison (diff), pas de suppression de versions depuis l'interface. Une version est conservée lorsqu'elle est remplacée : la version courante n'apparaît qu'après le prochain enregistrement. Un « Enregistrer sous » vers un nouveau fichier n'enregistre rien dans l'historique.

- [x] **3.4 — Préférences persistantes et migrables** · P1 · M · **fait**
  - Fichier `preferences.json` versionné dans `userData`, schéma de migration, écran de réglages.
  - Regrouper : thème, largeur, autosave, langue, correcteur, récents, dernière session.
  - *Implémenté :* `preferences.json` porte un numéro de version (`{ version: 3, settings }`, version 2 avant l'ajout de la langue d'interface en 3.7). L'ancien `settings.json` (version 1, sans numéro) est repris au premier lancement, puis laissé en place. Un fichier d'une version plus récente est lu avec les valeurs par défaut et **verrouillé** : l'application ne l'écrase jamais. Un fichier endommagé donne les valeurs par défaut sans reprendre l'ancien. Nouveau réglage `autosaveSeconds` (intervalle de la copie de secours, 2 à 120 s, 7 par défaut), appliqué à chaud. Écran « Fichier → Préférences… » : thème, largeur de page, correction orthographique et langue, intervalle de secours, rouverture du dernier document. Chaque réglage est enregistré immédiatement, et les changements faits dans les menus apparaissent aussi dans l'écran. Les valeurs invalides envoyées par le rendu sont ignorées, sans réinitialiser le réglage. 12 tests ajoutés (migration, verrou, endommagement, intervalles, validation), soit 22 pour le fichier de réglages. Vérifié dans Electron : migration d'un `settings.json` (thème sombre, langue anglaise conservés), intervalle de 3 s écrit et utilisé par la copie de secours réelle, orthographe désactivée qui grise la langue.
  - *Limites :* la langue d'interface est désormais un réglage (voir 3.7). Les récents et la dernière session restent dans leurs propres fichiers (`recent.json`) au lieu d'être regroupés dans les préférences. Pas de réglage de la police ou de l'interligne dans cet écran : ils restent dans le panneau Affichage.

- [x] **3.5 — Multi-fenêtres et « Ouvrir avec »** · P2 · M · **fait**
  - Nouvelle fenêtre (`Ctrl+Shift+N`), ouverture d'un fichier dans une fenêtre existante ou nouvelle.
  - Corriger la limite macOS/Linux documentée : gérer l'argument de la deuxième instance.
  - *Implémenté :* l'état de l'application est réparti par fenêtre (document actif, onglets, dossier de travail, modifications non enregistrées, garde de fermeture, titre), indexé par `webContents.id`. Menu Fichier → « Nouvelle fenêtre » (`Ctrl+Maj+N`) et « Ouvrir dans une nouvelle fenêtre… ». Le fichier est lu **avant** la création de la fenêtre, afin que le rendu trouve toujours son document initial. Les arguments d'une seconde instance et l'événement macOS `open-file` ouvrent le fichier en onglet dans la fenêtre active, ou créent une fenêtre si aucune n'existe ; un second lancement sans fichier ramène seulement la fenêtre au premier plan. Les dialogues (ouverture, enregistrement, conflit, brouillon, import Word, images, dossier) sont rattachés à la fenêtre demandeuse, et les notifications y restent localisées. Thème, préférences et réglages d'affichage sont communs et synchronisés entre les fenêtres. La copie de secours fusionne les brouillons de toutes les fenêtres ; fermer une fenêtre ne supprime que ses propres brouillons, et la fermeture de la dernière efface le fichier de secours. Chaque fenêtre déclare les fichiers qu'elle tient ouverts : si une autre fenêtre a le même fichier ouvert, l'enregistrement affiche un avertissement explicite (recharger, écraser, enregistrer sous, annuler) avant d'écraser son travail.
  - *Vérifié dans Electron :* nouvelle fenêtre par le menu (vide), ouverture d'un fichier dans la seconde fenêtre (titre et contenu corrects), titres et marqueurs de modification indépendants, copie de secours contenant les deux brouillons, enregistrement dans une fenêtre qui ne retire que son brouillon, seconde instance ouvrant un fichier en onglet dans la fenêtre active sans toucher à l'autre, « Ouvrir dans une nouvelle fenêtre… » avec le dialogue neutralisé (contenu prêt avant affichage), fermeture annulée / « Ne pas enregistrer » / « Enregistrer » avec nettoyage de la copie de secours, même fichier ouvert dans deux fenêtres avec l'avertissement explicite (écrasement confirmé d'un côté, annulation de l'autre laissant le disque intact).
  - *Limites :* « Ouvrir avec » par `open-file` est implémenté mais n'a pas pu être vérifié sur macOS. La disposition des fenêtres n'est pas restaurée au redémarrage (les brouillons reviennent dans une seule fenêtre). Un même fichier ouvert dans deux fenêtres n'est pas rafraîchi dans l'autre fenêtre après un enregistrement : chaque enregistrement demande donc confirmation tant que l'autre fenêtre garde le fichier ouvert.

- [x] **3.6 — Accessibilité** · P2 · M · **fait**
  - Navigation clavier complète de la barre d'outils, ordre de focus logique, labels ARIA, contrastes AA, respect de `prefers-reduced-motion`, tests lecteur d'écran.
  - Les boutons ont déjà `aria-label`/`aria-pressed` : bon point de départ.
  - *Implémenté :* les boîtes de dialogue partagent un composant `Modal` (portail dans `<body>`, piège de focus Tab/Shift+Tab, focus initial, restitution du focus au déclencheur, Échap réservé au dialogue le plus haut, arrière-plan `inert`). Les sept dialogues existants ont été migrés, sans double écouteur d'Échap. La barre d'outils se parcourt aux flèches avec retour aux extrémités (Home/End), et sa palette de couleurs suit le même modèle avec restitution du focus. Les onglets utilisent un `tabindex` mobile : seule l'onglet actif est dans l'ordre de tabulation, les flèches/Home/End changent d'onglet et déplacent le focus ; l'état « modifications non enregistrées » est annoncé. Les menus Thème et Affichage sont des dialogues/popovers : focus sur l'option courante à l'ouverture, flèches, Échap et retour au déclencheur ; les options utilisent `aria-pressed`. Un lien « Aller au contenu » précède l'en-tête, la page est un `tabpanel` relié à l'onglet actif, l'éditeur est un `textbox` multiligne nommé, et l'en-tête regroupe ses actions. La barre d'état et le compteur de recherche sont des régions `status` `aria-live` (« Prêt », « Enregistré », « Modifications non enregistrées », « Résultat X sur Y », « Aucun résultat »). Les libellés des options de recherche sont explicites. Les jetons de contraste ont été corrigés (texte secondaire, texte indicatif, anneau de focus, bordures de contrôles) et les transitions/animations sont neutralisées sous `prefers-reduced-motion`. 15 tests unitaires couvrent les utilitaires de focus (ordre, inertie, piège, pas de navigation, extrémités).
  - *Vérifié dans Electron (CDP + arbre d'accessibilité) :* rôles et noms exposés — dialogue « Insérer un lien » `dialog` modal nommé par son titre, barre d'outils « Mise en forme », liste d'onglets « Documents ouverts », éditeur `textbox` « Document Markdown ». Le lien d'évitement apparaît au focus et place le focus dans l'éditeur. Les onglets exposent un `tabindex` 0/-1 correct, la flèche droite active et focalise l'onglet voisin, et `aria-controls` pointe vers `editor-panel`. Dans la barre d'outils, la flèche droite passe du bouton « Annuler » au sélecteur de style et le dernier bouton revient au premier. Les menus Thème et Affichage prennent le focus à l'ouverture, la flèche descendante change d'option, Échap ferme et rend le focus au déclencheur. Le dialogue de lien piège Tab et Shift+Tab (bouclage premier/dernier), pose `inert` sur `#root`, puis le retire à la fermeture en restituant le focus. Le compteur de recherche est une région `status` polie avec ses libellés, et la barre d'état passe de « Prêt » à « Modifications non enregistrées » après la frappe. Sous mouvement réduit, les durées d'animation et de transition tombent à 1 µs. Contrastes mesurés : clair — texte secondaire 5,47:1, indicatif 4,92:1, anneau de focus 5,78:1, bordure de contrôle 3,35:1 ; sombre — 5,01:1, 4,84:1, 4,91:1 et 3,30:1. `typecheck`, 370 tests (41 fichiers) et `build` passent.
  - *Limites :* la vérification s'appuie sur l'arbre d'accessibilité de Chromium et sur des événements clavier simulés, pas sur un lecteur d'écran réel (NVDA, VoiceOver) ni sur un audit automatisé type axe. Les contrastes portent sur l'interface : les couleurs de texte choisies par l'utilisateur et le HTML importé peuvent rester sous AA. Dans la barre d'outils, les flèches s'arrêtent sur le `<select>` natif, qui conserve ensuite ses propres flèches (comportement volontaire). Le mouvement réduit est global et ne peut pas être réactivé depuis l'interface.

- [x] **3.7 — Internationalisation (fr/en)** · P3 · M/L · **fait**
  - Extraire les chaînes, mettre en place un système de traduction, détecter la langue système.
  - À faire avant que l'interface ne grossisse trop ; le français reste la langue par défaut.
  - *Implémenté :* dictionnaire partagé et typé (`src/shared/i18n.ts`) : le français est la source de vérité, l'anglais est exhaustif au niveau du type (`TranslationKey`), avec interpolation `{nom}` et clés singulier/pluriel. Un réglage `language` (`system`, `fr`, `en`) est ajouté aux préférences (version 3, migration depuis la version 2 et l'ancien `settings.json`). `resolveLanguage()` détecte la langue du système via `app.getLocale()` : `en*` donne l'anglais, `fr*` le français, et toute autre langue retombe sur le français. Le rendu reçoit l'état de langue par IPC (`locale:get` / `locale:changed`), l'applique dès le premier rendu grâce à `navigator.language`, et met à jour `<html lang>` et `dir`. Changement de langue à chaud : interface React, menus natifs reconstruits, dialogues, notifications, menu contextuel, filtres de fichiers, placeholder de l'éditeur, aide-mémoire (libellés et touches : `Maj` → `Shift`, `Échap` → `Esc`), barre d'état, exports HTML/PDF (attribut `lang`, table des matières, « Page X sur Y »). Les dates, tailles et nombres utilisent la locale résolue. Sélecteur « Langue de l'interface » dans Préférences (Automatique / Français / English), langues de correction orthographique traduites.
  - *Vérifié dans Electron (CDP) :* système en `fr_FR` → interface française par défaut (`html lang="fr"`, « Aller au contenu », menus Fichier/Édition/Format/Affichage/Aide) ; bascule vers l'anglais par IPC → `html lang="en-US"`, en-tête, onglets, barre d'outils, statut, placeholder et menus natifs en anglais, dialogue Préférences traduit avec « Automatic / Français / English » et langue de correction « French » ; retour au français immédiat. Second lancement avec `LANG=en_US.UTF-8` et préférences neuves → `getLocale()` renvoie `system` / `en` / `en-US` et l'interface démarre en anglais. `typecheck`, 387 tests (42 fichiers) et `build` passent.
  - *Limites :* les messages d'erreur bas niveau de modules comme `atomicWrite` ou `pandoc` restent en français à l'intérieur d'un message traduit. La détection de la langue système et le rendu PDF n'ont été vérifiés que sous Linux ; le comportement macOS/Windows reste à confirmer. Aucune prise en charge des langues droite-à-gauche ni d'une troisième langue : `languageDirection()` renvoie toujours `ltr`.

- [x] **3.8 — Performance et gros documents** · P2 · M · **fait**
  - Benchmarks sur 1 000 / 10 000 / 50 000 lignes, temps d'ouverture, frappe, recherche.
  - Découper le bundle (le rendu pèse ~1,35 Mo et déclenche l'avertissement Vite) via `manualChunks` (Tiptap/ProseMirror, Lucide, Markdown).
  - Charger les extensions lourdes à la demande ; mesurer le démarrage à froid.
  - *Implémenté :* script `npm run benchmark` (`scripts/benchmark.mjs`) qui lance l'application réelle avec un profil temporaire isolé (`CYONIMA_USER_DATA`), génère des documents de 1 000, 10 000 et 50 000 lignes et mesure via CDP le démarrage à froid, la frappe, la recherche et un enregistrement sur place. Des marques `performance` (`cyonima:renderer-boot`, `document-loaded`, `editor-ready`, `editor-boot`) exposent le détail du démarrage. Le bundle est découpé par `manualChunks` (React, éditeur Tiptap/ProseMirror, Markdown, icônes, syntaxe, vendor) : les 37 grammaires highlight.js (287 Ko) sont maintenant chargées **à la demande**, après l'affichage de l'éditeur, au lieu de bloquer le démarrage ; les blocs de code sont recolorés une fois les grammaires prêtes, sans marquer le document modifié ni ajouter d'étape d'annulation.
    - **Correction majeure d'ouverture :** l'analyseur de notes de bas de page découpait tout le reste du document à chaque bloc (quadratique), et ProseMirror ralentissait quadratiquement sur les nœuds texte d'indentation entre blocs. Le tokenizer vérifie maintenant le préfixe avant de découper, le Markdown n'est analysé qu'une fois (lexer puis parser), et l'indentation entre blocs est retirée de façon sûre. **50 000 lignes : 104 s → 1,8 s** (10 000 : 4,9 s → 0,8 s).
    - **Autosave sans blocage :** les brouillons stockent désormais le HTML de l'éditeur et le frontmatter séparément, restaurés directement au démarrage. La copie de secours et le changement d'onglet ne lancent plus Turndown sur tout le document (auparavant ~8,5 s pour 50 000 lignes toutes les 7 s). Les anciens brouillons Markdown restent lus normalement. Vérifié dans Electron : brouillon HTML restauré avec frontmatter, texte et état modifié, puis enregistré en Markdown propre.
    - **Recherche :** seules 500 occurrences autour du résultat actif sont décorées ; le compteur et « Tout remplacer » continuent d'utiliser toutes les occurrences. **50 000 lignes : 1,86 s → 0,09 s**.
    - Vérifications : `typecheck`, 391 tests (43 fichiers) et `build` passent ; coloration différée vérifiée dans Electron (3 mots-clés et 1 nombre colorés, document non modifié), ainsi que le cycle autosave HTML → plantage simulé → restauration → enregistrement Markdown.
  - *Résultats mesurés sous Linux (Electron 39, CDP, profil neuf) :*
    - 1 000 lignes (30 Ko) : démarrage 0,51 s, éditeur prêt 0,13 s, frappe p50 29 ms, recherche 0,02 s, enregistrement 0,05 s, mémoire JS 8,5 Mo.
    - 10 000 lignes (308 Ko) : démarrage 0,79 s, éditeur prêt 0,34 s, frappe p50 31 ms, recherche 0,04 s, enregistrement 0,31 s, mémoire JS 11,3 Mo.
    - 50 000 lignes (1 553 Ko) : démarrage 1,83 s, éditeur prêt 1,02 s, frappe p50 67 ms, recherche 0,09 s, enregistrement 6,49 s, mémoire JS 123 Mo.
  - *Limites :* l'enregistrement explicite d'un document de 50 000 lignes reste dominé par Turndown (~6,5 s) ; l'autosave ne bloque plus, mais le rendu peut encore être brièvement occupé par la sérialisation Markdown au moment d'enregistrer. La frappe reste à 60–100 ms p50 sur 50 000 lignes, contre ~30 ms sur 10 000. Le benchmark et les mesures n'ont été validés que sous Linux ; le chunk de l'éditeur reste le plus gros (~950 Ko) et le découpage améliore surtout le cache et le chargement différé des grammaires. Les images et les blocs HTML complexes n'ont pas été benchmarkés séparément.

- [x] **3.9 — Tests d'intégration et E2E** · P2 · L · **fait**
  - Playwright + Electron : ouvrir, modifier, enregistrer, rouvrir ; simuler les dialogues natifs.
  - Tests des handlers IPC et du preload.
  - Ajouter ESLint + Prettier et un script `npm run lint`.
  - *Implémenté :* suite Playwright/Electron (`tests/e2e`, `playwright.config.ts`) avec `_electron`, un profil isolé par test (`CYONIMA_USER_DATA`) et un seul worker pour éviter les collisions. Trois scénarios couvrent : ouverture d'un fichier, frappe, `Ctrl+S`, vérification du Markdown écrit sur disque, fermeture puis réouverture ; ouverture et « Enregistrer sous » via des dialogues natifs simulés en remplaçant `dialog.showOpenDialog` / `showSaveDialog` dans le processus principal, puis déclenchement des mêmes actions que le menu ; surface du preload (`window.api`), préférences, locale, `openFileAt` invalide, `confirmDiscard` avec `showMessageBoxSync` simulé, cycle autosave (`saveAutosave` → fichier JSON → `clearAutosave`) et enregistrement IPC direct. Les tests utilisent les fichiers réels, l'écriture atomique et l'historique comme l'application.
    - ESLint 9 en configuration plate (`eslint.config.mjs`) avec `@eslint/js`, `typescript-eslint` et les règles classiques des hooks React ; Prettier 3 (`prettier.config` via `.prettierrc.json`) et scripts `lint`, `lint:fix`, `format`, `test:e2e`, `test:all`. `tsconfig.e2e.json` vérifie aussi les types des tests, et `npm run typecheck` inclut désormais l'E2E.
  - *Vérifié :* `npm run test:e2e` (build + 3 tests Playwright) passe en ~3,2 s, `npm run lint` est propre, `npm run typecheck` couvre le rendu, le processus principal et l'E2E. Les dialogues natifs sont remplacés par des stubs dans le processus principal ; les tests n'ouvrent aucune fenêtre système et nettoient leurs profils temporaires.
  - *Limites :* la suite E2E n'a été exécutée que sous Linux ; elle ne teste pas encore le glisser-déposer, les conflits multi-fenêtres, l'historique de versions ni les captures visuelles. Les stubs de dialogues remplacent les méthodes Electron pour la durée d'un test et ne reproduisent pas l'apparence des boîtes natives. Playwright est installé sans navigateurs téléchargés : seul Electron est piloté. `npm run format` reformate l'ensemble du dépôt (il n'est pas encore imposé en CI).

**Definition of done de la phase 3 :** l'application reste fluide et organisée avec des dizaines de documents et des fichiers volumineux, et son interface est utilisable au clavier.

---

## Phase 4 — Distribution et professionnalisation (v1.0)

- [x] **4.1 — Identité visuelle et icônes** · P1 · S/M · **fait**
  - Icônes macOS (`.icns`), Windows (`.ico`), Linux (`.png` multi-tailles), logo de la barre de titre, écran « À propos ».
  - Aujourd'hui le packaging n'embarque aucune icône applicative.
  - *Implémenté :* icône applicative dessinée à partir du monogramme « C » de l'en-tête (fond encre dégradé, C crème sérif, curseur terre cuite) et générée dans toutes les tailles par `scripts/generate-icons.py` (Python + Pillow) : master 1024 px, jeu Linux `resources/icons/{16,24,32,48,64,128,256,512,1024}`, `icon.ico` Windows (7 tailles) et `icon.icns` macOS (entrées PNG modernes). `electron-builder` déclare `buildResources: resources` et les icônes Linux/Windows/macOS ; `extraResources` embarque le PNG utilisé au runtime. La fenêtre Electron reçoit `icon`, et le dock macOS est mis à jour au démarrage. `src/renderer/public/icon.png` sert de favicon à l'aperçu navigateur. Nouvel écran **À propos** (menu natif sur toutes les plateformes) : logo, version de l'application, description bilingue, versions Electron/Chromium/Node, licence MIT et copyright, fermeture accessible. Nouveau canal IPC `app:info` typé et exposé par le preload.
  - *Vérifié :* `npm run dist:dir` produit `release/linux-unpacked` avec `resources/icon.png` en extraResource et les icônes dans l'ASAR ; le PNG de l'écran À propos se charge dans Electron ; 4 tests E2E Playwright passent (dont le nouveau scénario À propos avec version, runtime et icône chargée), `typecheck`, `lint` et 391 tests unitaires passent.
  - *Limites :* le rendu des icônes n'a été vérifié que sous Linux ; les fichiers `.ico`/`.icns` sont valides et acceptés par electron-builder mais n'ont pas été testés sur Windows/macOS réels. Le script de génération demande Python 3 et Pillow (les binaires générés sont commités). L'écran À propos n'affiche pas de lien externe ni de remerciements tant qu'un site officiel n'existe pas.

- [ ] **4.2 — Associations de fichiers** · P1 · S/M
  - Déclarer `.md`, `.markdown`, `.mdown`, `.mkd` dans electron-builder, gérer « Ouvrir avec » sur les trois plateformes.
  - Enregistrer l'application comme éditeur par défaut (sans l'imposer).

- [ ] **4.3 — CI/CD multi-OS et artefacts signés** · P1 · L
  - GitHub Actions : `typecheck`, `test`, `build`, packaging Linux/Windows/macOS à chaque tag.
  - Signature Windows, notarisation macOS, AppImage + `.deb` + `.rpm` (et éventuellement Flatpak/Snap).
  - Vérifier la taille de l'AppImage et le temps de démarrage.

- [ ] **4.4 — Mises à jour automatiques** · P2 · M
  - `electron-updater`, canaux stable/beta, notes de version, retour arrière possible.
  - À n'activer qu'une fois la signature en place.

- [ ] **4.5 — Site web et documentation utilisateur** · P2 · M
  - Page de téléchargement, captures, guide « premiers pas », FAQ, politique de confidentialité.
  - README déjà solide : le transformer en vitrine et déplacer le détail technique dans `docs/`.

- [ ] **4.6 — Rapport de crash opt-in** · P3 · S/M
  - Sentry ou équivalent, consentement explicite, aucune donnée de document envoyée.

- [ ] **4.7 — Audit sécurité et dépendances** · P1 · S/M
  - `npm audit`, revue de la CSP (aujourd'hui `connect-src` autorise `http:`/`ws:` même en production), test de la sanitisation HTML, SBOM.
  - Vérifier que les mises à jour sont signées.

- [ ] **4.8 — Gouvernance du projet** · P2 · S
  - `CHANGELOG.md`, versionnage sémantique, `CONTRIBUTING.md`, modèle de PR, releases GitHub.

**Definition of done de la v1.0 :** un utilisateur peut télécharger, installer, associer ses `.md`, être notifié des mises à jour et désinstaller proprement, sur les trois systèmes.

---

## Backlog exploratoire (P3, non ordonné)

À ne planifier qu'après validation du besoin. Classé par thème, sans engagement.

**Écriture et connaissance**
- Liens wiki `[[…]]`, tags, backlinks, graph de notes.
- Diagrammes Mermaid, formules LaTeX (KaTeX).
- Citations bibliographiques (Pandoc/Zotero), bibliographie.
- Correcteur de style, lint Markdown, détection de liens morts.

**Collaboration et synchronisation**
- Synchronisation cloud (WebDAV, Nextcloud, Dropbox) ou Git.
- Collaboration temps réel (Yjs/CRDT) — chantier XL, change l'architecture.
- Partage d'un document en lecture seule (HTML ou lien).

**Plateformes**
- Version web/PWA, application mobile ou tablette.
- Extension navigateur « clipper » vers Markdown.

**Intelligence artificielle**
- Assistant de rédaction, résumé, reformulation, traduction — opt-in, respect de la vie privée, coût API à cadrer.

**Formats et diffusion**
- Présentations (Marp/Reveal), export EPUB, export image, publication statique.
- Lecture audio (synthèse vocale), dictée.

**Personnalisation**
- API de plugins/extensions, thèmes communautaires, raccourcis personnalisables, statistiques d'écriture.
- Objectifs et suivi de productivité (série de jours, graphiques).

---

## Décisions à prendre avant de coder

Ces choix conditionnent plusieurs chantiers ; mieux vaut les trancher tôt.

1. **Contrat de fidélité Markdown.** *Décidé :* Markdown + HTML assumé. Le HTML qui est correctement interprété par la majorité des éditeurs Markdown est considéré comme valide et doit être conservé à l'enregistrement ; le reste est signalé (voir 2.12). Les blocs bruts, l'alignement et le frontmatter entrent dans ce contrat.
2. **Modèle d'organisation.** Un document à la fois, des onglets, des fenêtres, ou un espace de travail type « coffre » ? Recommandation : onglets (3.1) avant tout espace de travail (3.2).
3. **Autosave.** Sauvegarde de secours uniquement (recommandé) ou écriture automatique du fichier source ? Si écriture automatique : fréquence, conflits, annulation.
4. **Langues.** Français seul jusqu'à la v1.0, ou i18n dès la phase 3 ? Plus on attend, plus l'extraction coûte cher.
5. **Distribution.** Signature/notarisation et auto-update dès la première release publique, ou téléchargement manuel assumé au début ? La signature est fortement recommandée avant toute diffusion large.
6. **Public cible.** Grand public « Word du Markdown » ou utilisateurs techniques ? Cela départage notamment le mode source, les liens wiki et les exports avancés.

---

## Dette technique et qualité (transverse)

À traiter au fil de l'eau, pas dans une phase dédiée.

- [ ] **Bundle** : ~1,35 Mo pour le rendu, avertissement Vite ; découper les vendors et évaluer le chargement différé.
- [ ] **Lint/format** : aucun ESLint ni Prettier aujourd'hui ; ajouter les règles React/TypeScript et un script CI.
- [ ] **Tests** : 8 tests de conversion seulement ; aucune couverture UI, IPC, packaging. Viser un test par bug corrigé.
- [ ] **CI** : aucune automatisation ; à mettre en place dès la phase 0 (typecheck + tests + build).
- [ ] **Icônes et métadonnées** : absentes du packaging.
- [x] **Electron/Node** : Electron monté à **39.8.10** (Node 22.22.1 embarqué). Le Node de dev est en 18.19.1 ; passer à **Node ≥ 22.12** pour débloquer Electron 40+ (versions supportées).
- [ ] **CSP** : `connect-src 'self' ws: http:` est trop permissif en production ; restreindre selon l'environnement.
- [ ] **Statistiques** : recalcul complet à chaque frappe, comptage UTF-16 ; débouncer et utiliser `Intl.Segmenter`.
- [ ] **Conversion** : `DOMParser` + Turndown singleton, pas de validation de schéma ; centraliser et documenter les règles.
- [ ] **i18n** : chaînes françaises codées en dur dans le rendu, le menu et les dialogues.
- [ ] **Accessibilité** : pas d'audit clavier/lecteur d'écran ni de test de contraste.
- [ ] **Documentation** : README et roadmap risquent de diverger ; garder une seule source de vérité pour la feuille de route.

---

## Si je ne devais retenir que cinq chantiers

1. **Frontmatter + HTML brut préservés** (0.1, 0.2) — éviter la perte silencieuse de contenu.
2. **Autosave et récupération** (0.6) — le filet de sécurité qui autorise tout le reste.
3. **Rechercher/remplacer** (1.1) — la fonctionnalité manquante la plus criante au quotidien.
4. **Images locales et collage** (1.4) — sans cela, l'édition d'images reste théorique.
5. **Thème sombre + mode concentration** (1.6, 1.7) — ce qui fait qu'on garde l'application ouverte.

Ensuite seulement : onglets, mode source et exports avancés.
