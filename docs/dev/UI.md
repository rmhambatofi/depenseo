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
- Navigation : barre du bas (Accueil, Dépenses, **« + » central rond** en dégradé, Limites, Récurrentes),
  onglet actif = icône sur pastille primaire pâle + libellé primaire. Avatar d'en-tête à droite de chaque onglet
  (réglages et compte). Fait en P8-03 (`features/shell/`, voir ADR-069).
- Depenseo n'a ni revenus, ni solde, ni virements, ni objectifs : **ne pas** reproduire ces blocs. La carte d'en-tête
  affiche dépensé / limite / reste de la période (ou total sans limite), lus depuis `/dashboard`.

## Jetons (`mobile/lib/ui/tokens.dart`)

Valeurs retenues en P8-01 (entre parenthèses, la valeur de départ ajustée pour passer 4,5:1 sur `background`,
`surface` et `surfaceHigh`). Tout couple texte/fond est vérifié par `test/ui/tokens_test.dart` (calcul) et
`test/a11y/guidelines_test.dart` (rendu). Si un couple échoue, foncer (clair) ou éclaircir (sombre) la couleur du
texte, pas la surface. Accès : `AppTokens.of(context)` (extension de thème), rayons `AppRadius`, espacements `AppSpacing`.

| Jeton | Clair | Sombre |
| --- | --- | --- |
| `primary` | `#6355E0` (`#6D5DF6`) | `#8C7EFF` (`#7C6CFF`) |
| `onPrimary` (texte sur `primary`) | `#FFFFFF` | `#0F1020` |
| `primaryGradient` | `#5B4BEA` → `#7B6BF5` (`#9A8CFF`) (135°) | `#4F3FD8` → `#6E5EF0` (`#7C6CFF`) |
| `background` | `#F5F4FB` | `#0F1020` |
| `surface` (cartes) | `#FFFFFF` | `#1A1B2E` |
| `surfaceHigh` (tuiles, champs) | `#EFEDFB` | `#23253B` |
| `text` | `#17162A` | `#F2F1FA` |
| `textMuted` | `#6B6881` (`#6E6B85`) | `#A3A0BC` |
| `success` (sous la limite) | `#0B7A59` (`#0E9F74`) | `#2FD3A0` |
| `danger` (dépassement, texte) | `#C13840` (`#D93F48`) | `#FF7A80` |
| `warning` (seuil d'alerte) | `#926119` (`#B7791F`) | `#F5B547` |

Dégradé : texte blanc ≥ 4,5:1 sur le départ, ≥ 3:1 sur l'arrivée (grands montants seulement de ce côté).

Widgets communs (`mobile/lib/ui/`) : `AppCard` (surface, rayon 24, ombre en clair, `onTap` optionnel), `IconTile`
(tuile teintée, `fallbackText` pour un emoji hors catalogue, décorative pour les lecteurs d'écran), `SectionHeader`
(titre 18 annoncé comme en-tête + lien optionnel), `AmountText` (chiffres tabulaires, tailles `hero` 40 / `card` 28 /
`list` 17 ; le texte arrive déjà formaté par `core/money`).

Rayons : carte 24, tuile 16, bouton 16, champ 14, pastille de navigation 20. Espacements : 8 / 12 / 16 / 24.

Lignes groupées (P8-06) : `GroupedCard` (lignes dans une seule `AppCard`, filet aligné sur le texte), tuile de ligne
`AppSizes.rowTile` = **40** (comme les badges de catégorie des listes ; 48–56 pour les tuiles mises en avant),
`SectionHeader(icon:)` pour les sections titrées des réglages, `LimitProgressBar` (barre arrondie, verte sous la
limite, rouge dès 100 %) partagée par l'accueil et l'écran Limites.
Entrée (P8-07) : `BrandTile` (`lib/ui/`, carré en dégradé primaire, icône blanche, décoratif) en tête de la connexion,
de l'inscription et du verrouillage ; montant de saisie en `AmountSize.hero` centré ; catégories de saisie en tuiles
(`CategoryChoiceTile`, 88 px de large suivant le texte jusqu'à ×1,8, sélection = fond `surfaceHigh` + bord primaire).
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
  dans la même tuile. Voir ADR-069. Affichage : `CategoryIconBadge(icon, color, size)` (`features/categories/`)
  sur `IconTile` ; sélecteur en grille dans `category_edit_screen.dart` (clés `icon-<clé>`, `icon-custom`).
  Ajouter une clé : `category_icons.dart` + `categoryIconName` dans les deux `.arb` (test de noms distincts).

## Mode sombre

Choix Clair / Auto / Sombre dans les réglages (préférence locale de l'appareil, pas synchronisée), Auto par défaut.
Clé `ui.theme` du coffre (`ThemePreference`, `themeModeProvider`) : **jamais effacée** à la déconnexion (aucune donnée
de compte).

## Captures (recette visuelle)

`flutter test test/screenshots --dart-define=CAPTURE=../design-ref/captures/<nom>` : chaque parcours de `journeys`
(`test/a11y/guidelines_test.dart`) en clair/sombre × texte ×1/×2, rendu réel (polices chargées, vraies ombres) sur le
faux serveur des tests, 390×844 points. Sans `CAPTURE`, le fichier ne déclare aucun test (rien d’ignoré dans la suite). Captures « avant » (thème MVP) :
`design-ref/captures/avant/`, ignorées par git comme le reste de `design-ref/`.

## Hors périmètre de la phase 8

Totaux par jour dans la liste (calcul côté client, invariant 8) ; projection de fin de période (F-LIM-06, backlog) ;
accueil réordonnable (F-TB-04, backlog).
