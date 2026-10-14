# Historique des versions

Toutes les évolutions notables de ZackPDF sont listées ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet utilise le [versionnage sémantique](https://semver.org/lang/fr/).

## [1.1.0] — 2026-10-14

### Ajouté

- Mode **Annoter** : surlignage, soulignement et barré du texte sélectionné, zones de texte libres (police, taille, gras, italique, couleur), dessin à main levée, rectangles, ellipses, lignes, flèches et images
- Mode **Édition ultra** : clic sur une ligne du PDF pour en modifier ou supprimer le texte, avec reprise de la police, de la taille et des couleurs d'origine ; gomme pour effacer une zone
- Le texte modifié reprend la police d'origine quand elle est installée sur l'ordinateur (intégrée au PDF enregistré) ; sinon, une police standard calibrée pour garder la largeur de la ligne
- Le texte remplacé ou effacé est retiré du flux de contenu du PDF : il n'est plus ni visible, ni copiable, ni extractible
- Sélecteur de police avec recherche : les trois polices PDF standard et toutes les polices installées sur l'ordinateur, chacune affichée dans son propre style, avec leurs variantes grasses et italiques ; la police choisie est intégrée au PDF enregistré
- Sélection, déplacement et redimensionnement des éléments ajoutés, annulation et rétablissement
- Enregistrement en place ou sous un nouveau nom, avertissement avant de fermer un document modifié
- Collage d'images depuis le presse-papiers

## [1.0.2] — 2026-10-14

### Corrigé

- L'icône de ZackPDF s'affiche dans le menu des applications et le dock sous Linux

## [1.0.1] — 2026-10-14

### Modifié

- L'application s'appelle désormais **ZackPDF** (nom, paquets, site et dépôt GitHub)

## [1.0.0] — 2026-10-13

Première version publique.

### Ajouté

- Lecture de PDF avec onglets et panneaux côte à côte
- Glisser-déposer des onglets entre panneaux et de fichiers PDF dans la fenêtre
- Recherche dans tout le document avec surlignage des occurrences
- Miniatures des pages, zoom à la molette et au clavier
- Thème clair et sombre
- Ouverture des PDF par double-clic et « Ouvrir avec »
- Restauration de la session (onglets, panneaux, page courante) au redémarrage
- Paquets pour Windows (installateur et portable), macOS (Apple Silicon et Intel) et Linux (AppImage, .deb, .rpm, .tar.gz)

[1.1.0]: https://github.com/codeByDarknet/zackpdf/releases/tag/v1.1.0
[1.0.2]: https://github.com/codeByDarknet/zackpdf/releases/tag/v1.0.2
[1.0.1]: https://github.com/codeByDarknet/zackpdf/releases/tag/v1.0.1
[1.0.0]: https://github.com/codeByDarknet/zackpdf/releases/tag/v1.0.0
