# Changelog

Toutes les modifications notables de Cyonima MD Editor sont consignées ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
versionnage sémantique.

## [Unreleased]

### Ajouté

- Rapports de crash opt-in, locaux, nettoyés des chemins, URL, e-mails et noms
  de fichiers Markdown.
- Audit de sécurité automatisé, SBOM CycloneDX et vérification des signatures
  d’installation dans le workflow de release.
- Documentation de contribution, politique de sécurité et modèle de pull
  request.

### Corrigé

- Compatibilité Windows des tests : permissions POSIX ignorées, séparateur
  `XDG_DATA_DIRS` adapté au système, nom de dossier via `basename()` et
  normalisation des fins de ligne CRLF des fixtures Git.

### Modifié

- CSP de production resserrée : `connect-src` n’autorise plus `http:` ni `ws:`.
- Nettoyage HTML renforcé : balises de formulaire et attributs `on*` retirés.
- Outillage de développement mis à jour (Vite 6, Vitest 3, electron-builder 26,
  Playwright 1.55.1).

## [0.1.0] - 2026-11-16

Première version de développement publique.

### Ajouté

- Éditeur Markdown WYSIWYG basé sur Tiptap/ProseMirror.
- Fichiers Markdown, onglets, fenêtres multiples et récupération après crash.
- Historique local, préférences versionnées, recherche/remplacement.
- Exports HTML et PDF, import Word via Pandoc.
- Accessibilité clavier, thème clair/sombre, interface française et anglaise.
- Associations de fichiers, icônes multi-plateformes et écran À propos.
- Mises à jour automatiques opt-in et canaux stable/bêta.
