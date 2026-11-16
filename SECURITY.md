# Sécurité

## Signaler une vulnérabilité

Merci de ne pas ouvrir d’issue publique pour une vulnérabilité. Utilisez les
[avis de sécurité GitHub](https://github.com/LudovicBoudi/Cyonima-MD-Editor/security/advisories/new)
ou contactez le mainteneur du dépôt avec :

- la version concernée ;
- les étapes de reproduction ;
- l’impact estimé ;
- une éventuelle preuve de concept, sans document personnel.

Un accusé de réception est envoyé dès que possible. Une correction et une
version de sécurité sont publiées avant la divulgation publique, si nécessaire.

## Versions prises en charge

Les versions stables publiées reçoivent les correctifs de sécurité. Les
préversions (canal bêta) sont fournies à titre de test.

## Mesures en place

- `npm audit --omit=dev` protège les dépendances npm déclarées en production ;
- le binaire Electron et l’outillage sont suivis séparément par Dependabot et
  l’audit complet ;
- les dépendances de développement sont suivies par Dependabot et CI ;
- une SBOM CycloneDX est générée et conservée comme artefact de CI ;
- la CSP de production n’autorise ni `http:` ni `ws:` dans `connect-src` ;
- le HTML importé est nettoyé et les blocs HTML bruts restent inertes ;
- les mises à jour automatiques sont désactivées par défaut jusqu’à la mise en
  place de la signature et de la notarisation.

Les rapports de vulnérabilité sont traités de manière confidentielle.
