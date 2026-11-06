# UI — charte visuelle de l'app mobile (phase 8, ADR-069)

Référence demandée : le style de BilliTime (captures locales, non committées : `design-ref/billitime/1.jpg` à `15.jpg` ;
1–5 accueil clair, 6 menu, 7–8 réglages clairs, 9 réglages sombres, 10 liste sombre, 11–13 accueil sombre, 14 en-tête
sombre, 15 menu sombre). On reprend un **style**, jamais les éléments propres à BilliTime : ni nom, ni logo, ni images,
ni textes. Palette, icônes et police sont les nôtres ou sous licence libre.

## Principes

- Fond très pâle (clair) ou bleu nuit (sombre), contenu dans des **cartes** arrondies sans bordure, ombre très douce
  (clair) ou surface un peu plus claire que le fond (sombre).
- Une seule **carte d'en-tête** en dégradé violet sur l'accueil, avec deux cercles translucides décoratifs.
- **Tuile d'icône** : carré arrondi (rayon 16, 48–56 px), fond = couleur de la catégorie à 15 % (clair) ou 25 % sur
  fond sombre, icône pleine arrondie dans la couleur saturée.
- Titres de section hors des cartes (texte 18, gras moyen), lien « Voir tout » en couleur primaire à droite.
- Montants en gros (accueil 40, cartes 28, listes 17) ; libellés secondaires en gris atténué.
- Navigation : barre du bas (Accueil, Dépenses, **« + » central rond** surélevé en dégradé, Limites, Récurrentes),
  onglet actif = icône pleine sur pastille primaire pâle + libellé primaire.
- Depenseo n'a ni revenus, ni solde, ni virements, ni objectifs : **ne pas** reproduire ces blocs. La carte d'en-tête
  affiche dépensé / limite / reste de la période (ou total sans limite), lus depuis `/dashboard`.

## Jetons (`mobile/lib/ui/tokens.dart`)

Valeurs de départ ; tout couple texte/fond doit passer les tests de contraste (`test/a11y/guidelines_test.dart`).
Si un couple échoue, foncer (clair) ou éclaircir (sombre) la couleur du texte, pas la surface.

| Jeton | Clair | Sombre |
| --- | --- | --- |
| `primary` | `#6D5DF6` | `#7C6CFF` |
| `primaryGradient` | `#5B4BEA` → `#9A8CFF` (135°) | `#4F3FD8` → `#7C6CFF` |
| `background` | `#F5F4FB` | `#0F1020` |
| `surface` (cartes) | `#FFFFFF` | `#1A1B2E` |
| `surfaceHigh` (tuiles, champs) | `#EFEDFB` | `#23253B` |
| `text` | `#17162A` | `#F2F1FA` |
| `textMuted` | `#6E6B85` | `#A3A0BC` |
| `success` (sous la limite) | `#0E9F74` | `#2FD3A0` |
| `danger` (dépassement, texte) | `#D93F48` | `#FF7A80` |
| `warning` (seuil d'alerte) | `#B7791F` | `#F5B547` |

Rayons : carte 24, tuile 16, bouton 16, champ 14, pastille de navigation 20. Espacements : 8 / 12 / 16 / 24.
Ombre carte claire : `0 8 24 rgba(109, 93, 246, 0.08)` ; aucune en sombre.

## Typographie

**Plus Jakarta Sans** (SIL OFL 1.1), fichiers `.ttf` embarqués dans `mobile/assets/fonts/` (pas de `google_fonts` :
hors ligne et sans appel réseau), licence ajoutée au `LicenseRegistry` et citée dans les mentions légales.
Graisses : 400, 500, 600, 700. Chiffres tabulaires (`FontFeature.tabularFigures()`) pour les montants.

## Icônes

- Interface : icônes Material **rounded** (`Icons.*_rounded`), déjà incluses dans Flutter ; pleines pour l'état actif
  et les tuiles, `*_outlined` arrondies évitées.
- Catégories : catalogue fermé de clés (`cart`, `home`, `car`, `restaurant`…) → `IconData`, dans
  `mobile/lib/ui/category_icons.dart`. Une valeur hors catalogue (emoji d'une ancienne version) s'affiche en texte
  dans la même tuile. Voir ADR-069.

## Mode sombre

Choix Clair / Auto / Sombre dans les réglages (préférence locale de l'appareil, pas synchronisée), Auto par défaut.

## Hors périmètre de la phase 8

Totaux par jour dans la liste (calcul côté client, invariant 8) ; projection de fin de période (F-LIM-06, backlog) ;
accueil réordonnable (F-TB-04, backlog).
