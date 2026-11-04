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

- [ ] **0.3 — Encodage, BOM et fins de ligne** · P0 · S
  - Lire en UTF-8 avec détection de BOM, préserver le BOM et le style de fin de ligne (LF/CRLF) du fichier d'origine.
  - Gérer proprement les fichiers non-UTF-8 (avertissement plutôt que remplacement de caractères).

- [ ] **0.4 — Écriture atomique et permissions** · P0 · S
  - Écrire dans un fichier temporaire puis renommer, pour éviter un fichier tronqué en cas de coupure.
  - Conserver les permissions existantes ; message d'erreur explicite si le fichier est en lecture seule.

- [ ] **0.5 — Détection de conflit externe** · P0 · S/M
  - Comparer la date de modification du fichier avant d'écraser ; proposer « Recharger / Écraser / Enregistrer sous » si le fichier a changé hors de l'application.

- [ ] **0.6 — Autosave et récupération après crash** · P0 · M
  - Sauvegarde de secours périodique (5–10 s) dans `app.getPath('userData')`, pas dans le fichier source.
  - Au démarrage : proposer de restaurer les brouillons non enregistrés.
  - Garder l'enregistrement explicite (`Ctrl+S`) comme source de vérité ; l'autosave ne doit pas surprendre.
  - *Critère d'acceptation :* tuer l'application en pleine frappe puis la relancer propose de récupérer le texte.

- [ ] **0.7 — Harnais de tests de non-régression Markdown** · P0 · M
  - Ajouter des fixtures « fichier réel → HTML → Markdown » et vérifier la stabilité sur deux allers-retours.
  - Cas à couvrir : frontmatter, HTML inline, tableaux complexes (cellules vides, `|` échappés, colonnes alignées), listes imbriquées, listes de tâches, blocs de code avec/sans langage, fences `~~~`, code indenté, liens avec parenthèses, caractères Unicode/emoji, CRLF, hard breaks, citations imbriquées, images avec titre.
  - Ajouter un test de *fuzz* léger (génération de documents aléatoires) pour détecter les crashes de conversion.

- [ ] **0.8 — Mise à jour d'Electron et de Node** · P0 · M
  - Electron 33 et Node 18 ne sont plus maintenus : mettre à jour vers une version supportée, puis revalider `sandbox`, preload, IPC et packaging.
  - Vérifier les alertes `npm audit` et monter les dépendances majeures (Vite, Tiptap, Vitest).

- [ ] **0.9 — Gestion d'erreurs et observabilité locale** · P0 · S
  - `ErrorBoundary` React pour éviter l'écran blanc, remplacement progressif des `dialog.showErrorBox` bloquants par des notifications non bloquantes, journal local consultable.
  - Débouncer le calcul des statistiques (actuellement recalculé à chaque frappe sur tout le document).

- [ ] **0.10 — Correctifs de robustesse divers** · P1 · S
  - `findFileArgument` : parsing plus strict des arguments.
  - Deuxième instance : ouvrir le fichier passé en argument dans la fenêtre existante (aujourd'hui elle se contente de prendre le focus).
  - Arrêter d'envoyer `path` dans `doc:set-meta` s'il n'est pas utilisé.

**Definition of done de la phase 0 :** un fichier ouvert puis enregistré sans modification est **identique octet pour octet** (hors normalisation explicitement choisie), et une fermeture brutale ne fait perdre aucun texte.

---

## Phase 1 — Confort d'écriture quotidien (v0.2)

> Objectif : que l'application soit celle qu'on ouvre par défaut pour prendre des notes.

### Recherche et navigation

- [ ] **1.1 — Rechercher / remplacer** · P1 · M
  - Barre `Ctrl+F`, navigation précédent/suivant, compteur de résultats, remplacement simple et global, option casse/expression régulière.
  - Mise en évidence des occurrences dans l'éditeur.
  - `Échap` ferme la barre et rend le focus au document.
  - *Critère d'acceptation :* remplacer 50 occurrences dans un document de 10 000 lignes reste fluide.

- [ ] **1.2 — Fichiers récents et réouverture de session** · P1 · S
  - Mémoriser les 10 derniers fichiers, les afficher dans le menu natif « Fichier → Ouvrir récent » et sur l'écran d'accueil.
  - Proposer de rouvrir le dernier document au lancement (option désactivable).
  - Nettoyer les entrées dont le fichier n'existe plus.

- [ ] **1.3 — Glisser-déposer et ouverture multiple** · P1 · S/M
  - Déposer un `.md` sur la fenêtre l'ouvre (avec garde-fou sur les modifications en cours).
  - Accepter les images déposées (voir 1.4).

### Images et liens

- [ ] **1.4 — Images locales vraiment utilisables** · P1 · M
  - **Bug actuel :** une image `./photo.png` ne s'affiche pas, car le chemin est résolu depuis l'application et non depuis le fichier Markdown.
  - Résoudre les chemins relatifs par rapport au dossier du document (protocole custom ou réécriture vers `file://`).
  - À l'insertion ou au collage : copier l'image dans `assets/` à côté du document et écrire un chemin relatif portable.
  - Coller une image depuis le presse-papiers (capture d'écran) et glisser-déposer.
  - Éditer l'alternative (alt) et la légende ; redimensionnement visuel (largeur en attribut HTML, pas de perte Markdown).

- [ ] **1.5 — Popover de lien** · P1 · S/M
  - Cliquer sur un lien (sans `Ctrl`) ouvre un popover : URL, boutons « Ouvrir », « Modifier », « Copier », « Supprimer ».
  - Évite le comportement actuel où un clic ne fait rien, ce qui peut sembler cassé.
  - Gérer aussi les liens internes `#ancre` (défilement dans le document).

### Apparence et concentration

- [ ] **1.6 — Thème sombre et thème système** · P1 · M
  - Thèmes clair / sombre / automatique, mémorisés ; adapter l'éditeur, la barre d'outils, les dialogues et l'export PDF.
  - Passer la couleur de fond de `BrowserWindow` en dynamique pour éviter le flash blanc au lancement.

- [ ] **1.7 — Mode concentration et mise en page** · P1 · S/M
  - Masquer en-tête, barre d'outils et barre d'état ; largeur de page réglable ; mode « machine à écrire » (ligne active centrée).
  - Mémoriser le choix par document ou globalement.

- [ ] **1.8 — Confort typographique** · P2 · S
  - Choix police (serif / sans / mono), taille de texte, interligne, largeur de colonne.
  - Espacement des paragraphes et styles de titres cohérents avec l'export.

### Blocs de code et statistiques

- [ ] **1.9 — Coloration syntaxique des blocs de code** · P1 · M
  - Intégrer `lowlight`/`highlight.js`, sélecteur de langage, bouton « Copier ».
  - Conserver le langage dans les fences Markdown (déjà géré par Turndown).
  - Prévoir un thème de coloration compatible clair/sombre.

- [ ] **1.10 — Barre d'état enrichie** · P2 · S/M
  - Statistiques de la sélection, objectif de mots avec progression, temps de lecture restant, position ligne/colonne, encodage, fin de ligne.
  - Compter les caractères avec `Intl.Segmenter` (graphèmes) plutôt que `String.length` (UTF-16).
  - Mot Count : mieux gérer apostrophes, traits d'union et nombres.

- [ ] **1.11 — Orthographe et langue** · P2 · S/M
  - Configurer la langue du correcteur (`fr-FR` par défaut), dictionnaire personnel, activation/désactivation.
  - Electron expose nativement le correcteur : vérifier le rendu des suggestions sous Linux/Windows/macOS.

### Raccourcis et aide

- [ ] **1.12 — Aide-mémoire des raccourcis** · P2 · S
  - Dialogue `Ctrl+/` ou `F1` listant les raccourcis et la syntaxe Markdown acceptée.
  - Résout la découvrabilité des fonctions actuelles.

- [ ] **1.13 — Collage propre** · P2 · S
  - `Ctrl+Shift+V` : coller sans mise en forme.
  - Normaliser le Markdown collé (listes, tableaux, titres) au lieu de le traiter comme du texte brut.

**Definition of done de la phase 1 :** ouvrir, écrire, illustrer, retrouver et enregistrer un document se fait sans friction, en clair comme en sombre.

---

## Phase 2 — Fidélité et puissance Markdown (v0.3)

### Décider du contrat de fidélité

- [ ] **2.1 — Alignement de paragraphe : persister ou retirer** · P1 · S/M
  - Aujourd'hui le bouton existe mais l'alignement est **perdu à l'enregistrement** : c'est une promesse non tenue.
  - Recommandation : persister en HTML explicite (`<p align="center">…</p>`) avec une règle Turndown dédiée, et le documenter comme extension.
  - Alternative assumée : retirer les boutons d'alignement pour ne promettre que du Markdown strict.
  - *Critère d'acceptation :* plus aucune mise en forme visible ne disparaît sans explication.

- [ ] **2.2 — Tables avancées** · P2 · M
  - Alignement par colonne (`:---`, `:---:`, `---:`) réellement enregistré.
  - En-tête activable/désactivable, redimensionnement des colonnes, fusion de cellules si supportée.
  - Coller un tableau CSV/TSV → tableau Markdown.
  - Meilleure gestion des cellules vides et des `|` échappés.

- [ ] **2.3 — Notes de bas de page et références** · P2 · M
  - Syntaxe `[^1]` / définitions, liens de référence `[texte][id]` et définitions associées.
  - Conversion aller-retour stable ; rendu lisible dans l'éditeur.

### Édition avancée

- [ ] **2.4 — Mode source Markdown** · P2 · M/L
  - Bascule éditeur / source, ou vue côte à côte synchronisée.
  - Détecter les modifications non représentables en WYSIWYG et prévenir plutôt que perdre.
  - Utile aux utilisateurs avancés et pour diagnostiquer les problèmes de conversion.

- [ ] **2.5 — Sommaire et plan du document** · P2 · M
  - Panneau latéral listant les titres, navigation au clic, titre actif pendant le défilement.
  - Base naturelle pour un futur espace de travail.

- [ ] **2.6 — Modèles, extraits et insertion rapide** · P2 · S/M
  - Modèles de documents (note de réunion, article, README), snippets réutilisables, insertion date/heure.
  - Modèles stockés dans `userData`, éditables.

- [ ] **2.7 — Import et normalisation** · P2 · M
  - Coller/convertir du HTML ou du RTF en Markdown.
  - Import `.docx` via Pandoc si disponible (dépendance externe à rendre optionnelle et détectée).

### Exports

- [ ] **2.8 — Export HTML autonome** · P2 · S/M
  - HTML complet avec CSS embarquée et images en données ou dossier copié ; idéal pour partage.

- [ ] **2.9 — Export PDF avancé** · P2 · M
  - En-tête/pied de page (titre, numérotation), sauts de page, table des matières, pagination fiable.
  - Vérifier le rendu des tableaux et blocs de code longs.

- [ ] **2.10 — Export DOCX / EPUB (Pandoc)** · P3 · M
  - À faire seulement si le besoin est confirmé ; dépendance externe, qualité variable.

- [ ] **2.11 — Édition du frontmatter** · P2 · S/M
  - Le bloc YAML est aujourd'hui affiché en lecture seule et préservé tel quel.
  - Ajouter un formulaire clé/valeur ou un éditeur YAML avec validation, sans jamais réécrire les lignes non modifiées.
  - Prévoir l'ajout d'un frontmatter à un document qui n'en a pas.

- [ ] **2.12 — HTML inline non pris en charge** · P2 · M
  - Les balises inline sans équivalent Tiptap (`span`, `mark`, `sub`, `sup`, `kbd`, etc.) conservent leur texte mais perdent leurs attributs à l'enregistrement.
  - Options : nœud inline opaque (même principe que 0.2), extensions dédiées pour les balises courantes, ou avertissement explicite au moment de l'ouverture.
  - *Critère d'acceptation :* aucune mise en forme HTML inline ne disparaît sans que l'utilisateur en soit informé.

**Definition of done de la phase 2 :** tout ce qui est visible à l'écran a une représentation Markdown documentée et stable — ou est explicitement signalé comme non exportable.

---

## Phase 3 — Organisation, échelle et accessibilité (v0.4)

- [ ] **3.1 — Onglets multi-documents** · P1 · L
  - Ouvrir plusieurs fichiers dans des onglets, indicateur de modifications par onglet, fermeture avec garde-fou.
  - Décider tôt : onglets dans une fenêtre **ou** multi-fenêtres. Recommandation : onglets d'abord, multi-fenêtres ensuite (le modèle de données est le même).

- [ ] **3.2 — Espace de travail / dossier** · P2 · XL
  - Arborescence de fichiers, création/renommage/suppression, recherche plein texte dans le dossier.
  - Décision produit majeure : reste-t-on sur « un fichier à la fois » ou devient-on un « coffre » façon Obsidian ? À valider avec des utilisateurs avant développement.

- [ ] **3.3 — Historique de versions local** · P2 · M
  - Instantanés automatiques à l'enregistrement, liste, aperçu et restauration.
  - Complète l'autosave sans dépendre d'un cloud.

- [ ] **3.4 — Préférences persistantes et migrables** · P1 · M
  - Fichier `preferences.json` versionné dans `userData`, schéma de migration, écran de réglages.
  - Regrouper : thème, largeur, autosave, langue, correcteur, récents, dernière session.

- [ ] **3.5 — Multi-fenêtres et « Ouvrir avec »** · P2 · M
  - Nouvelle fenêtre (`Ctrl+Shift+N`), ouverture d'un fichier dans une fenêtre existante ou nouvelle.
  - Corriger la limite macOS/Linux documentée : gérer l'argument de la deuxième instance.

- [ ] **3.6 — Accessibilité** · P2 · M
  - Navigation clavier complète de la barre d'outils, ordre de focus logique, labels ARIA, contrastes AA, respect de `prefers-reduced-motion`, tests lecteur d'écran.
  - Les boutons ont déjà `aria-label`/`aria-pressed` : bon point de départ.

- [ ] **3.7 — Internationalisation (fr/en)** · P3 · M/L
  - Extraire les chaînes, mettre en place un système de traduction, détecter la langue système.
  - À faire avant que l'interface ne grossisse trop ; le français reste la langue par défaut.

- [ ] **3.8 — Performance et gros documents** · P2 · M
  - Benchmarks sur 1 000 / 10 000 / 50 000 lignes, temps d'ouverture, frappe, recherche.
  - Découper le bundle (le rendu pèse ~1,35 Mo et déclenche l'avertissement Vite) via `manualChunks` (Tiptap/ProseMirror, Lucide, Markdown).
  - Charger les extensions lourdes à la demande ; mesurer le démarrage à froid.

- [ ] **3.9 — Tests d'intégration et E2E** · P2 · L
  - Playwright + Electron : ouvrir, modifier, enregistrer, rouvrir ; simuler les dialogues natifs.
  - Tests des handlers IPC et du preload.
  - Ajouter ESLint + Prettier et un script `npm run lint`.

**Definition of done de la phase 3 :** l'application reste fluide et organisée avec des dizaines de documents et des fichiers volumineux, et son interface est utilisable au clavier.

---

## Phase 4 — Distribution et professionnalisation (v1.0)

- [ ] **4.1 — Identité visuelle et icônes** · P1 · S/M
  - Icônes macOS (`.icns`), Windows (`.ico`), Linux (`.png` multi-tailles), logo de la barre de titre, écran « À propos ».
  - Aujourd'hui le packaging n'embarque aucune icône applicative.

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

1. **Contrat de fidélité Markdown.** Markdown strict (on retire ce qui ne s'exprime pas) ou Markdown + HTML assumé (alignement, blocs bruts, frontmatter) ? Recommandation : Markdown strict par défaut, HTML explicitement préservé et documenté.
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
- [ ] **Electron/Node** : versions en fin de support ; mise à jour à planifier avec les dépendances.
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
