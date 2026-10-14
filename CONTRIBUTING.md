# Contribuer à ZackPDF

Merci de vouloir améliorer ZackPDF ! Toutes les contributions sont les bienvenues : signalement de bugs, idées, corrections, traductions, documentation.

## Signaler un bug ou proposer une idée

Ouvrez une [issue](https://github.com/codeByDarknet/zackpdf/issues/new/choose) en choisissant le modèle adapté. Pour un bug, précisez votre système, la version de l'application et les étapes pour le reproduire.

Pour une faille de sécurité, suivez plutôt la [politique de sécurité](SECURITY.md).

## Proposer une modification

1. Forkez le dépôt et créez une branche depuis `main` :
   ```bash
   git checkout -b correction/zoom-molette
   ```
2. Installez les dépendances et lancez l'application :
   ```bash
   npm install
   npm run dev
   ```
3. Faites vos modifications, puis vérifiez que tout compile :
   ```bash
   npm run typecheck
   npm run build
   ```
4. Ouvrez une pull request en décrivant le changement et comment le tester.

Pour une modification importante, ouvrez d'abord une issue pour en discuter : cela évite de travailler sur quelque chose qui ne pourra pas être intégré.

## Conventions

- **Code** : TypeScript strict, composants React fonctionnels, état global dans `src/store/useAppStore.ts`. Suivez le style du code existant (2 espaces, pas de point-virgule).
- **Commentaires et textes de l'interface** : en français.
- **Messages de commit** : au format `type(portée): description`, par exemple :
  - `feat(recherche): rechercher en ignorant les accents`
  - `fix(onglets): garder l'ordre après un glisser-déposer`
  - `docs: compléter le guide d'installation`

  Types courants : `feat`, `fix`, `perf`, `refactor`, `docs`, `build`, `ci`, `chore`.

## Code de conduite

En participant, vous acceptez de respecter le [code de conduite](CODE_OF_CONDUCT.md).
