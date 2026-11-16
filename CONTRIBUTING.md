# Contribuer à Cyonima MD Editor

Merci pour votre intérêt. Les contributions sont bienvenues sous forme de
correctifs, tests, traductions ou documentation.

## Prérequis

- Node.js 22 recommandé (le workflow CI utilise Node 22) ;
- npm 9 ou plus récent ;
- Linux, macOS ou Windows.

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
```

Les tests E2E pilotent Electron et n’ont pas besoin des navigateurs Playwright.

## Commandes utiles

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Application Electron en développement. |
| `npm run typecheck` | Types du processus principal, du rendu et des tests E2E. |
| `npm test` | Tests unitaires Vitest. |
| `npm run test:e2e` | Build + tests Playwright/Electron. |
| `npm run lint` | ESLint. |
| `npm run benchmark` | Mesures de performance (après un build). |
| `npm run sbom` | Génère `sbom.cdx.json` (CycloneDX). |

## Style

- TypeScript strict, React fonctionnel, commentaires utiles en français dans le
  code existant ;
- pas de point-virgule, guillemets simples, Prettier (`npm run format`) ;
- le Markdown reste la source de vérité : ne jamais introduire de format
  propriétaire dans les fichiers enregistrés ;
- toute nouvelle chaîne d’interface doit être ajoutée aux dictionnaires
  `fr` et `en` dans `src/shared/i18n.ts`.

## Tests

Les changements de comportement doivent être couverts par un test unitaire ou
E2E. Avant une pull request :

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

## Pull requests

- une pull request par sujet ;
- décrire le problème, la solution et les risques ;
- joindre les commandes exécutées ;
- ne pas inclure de données personnelles, de documents réels ou de secrets ;
- pour une faille de sécurité, suivre [SECURITY.md](SECURITY.md) au lieu
  d’ouvrir une issue publique.

## Versionnage

Le projet suit SemVer (`MAJOR.MINOR.PATCH`). Avant la 1.0, les changements
incompatibles incrémentent `MINOR` et les nouveautés/correctifs `PATCH`.
Les tags `v1.2.3` déclenchent une release stable ; `v1.2.3-beta.1` déclenche une
préversion destinée au canal bêta.

## Publication

Le processus de release, les secrets de signature et le retour arrière sont
documentés dans [.github/RELEASING.md](.github/RELEASING.md).
