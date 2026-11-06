import 'package:flutter/material.dart';

import '../../core/db/app_database.dart';
import '../../ui/category_icons.dart';
import '../../ui/icon_tile.dart';

/// Couleurs proposées pour une catégorie (`#RRGGBB`, ADR-023).
const categoryPalette = [
  '#E53935',
  '#D81B60',
  '#8E24AA',
  '#5E35B1',
  '#3949AB',
  '#1E88E5',
  '#00ACC1',
  '#00897B',
  '#43A047',
  '#C0CA33',
  '#FDD835',
  '#FB8C00',
  '#6D4C41',
  '#757575',
];

/// `#RRGGBB` → couleur opaque ; gris si la valeur est illisible.
Color parseCategoryColor(String hex) {
  final value = int.tryParse(hex.replaceFirst('#', ''), radix: 16);
  if (hex.length != 7 || value == null) return const Color(0xFF757575);
  return Color(0xFF000000 | value);
}

/// Pastille d'une catégorie : son icône (clé du catalogue, ou emoji en
/// texte) dans une tuile teintée de sa couleur (ADR-069).
class CategoryBadge extends StatelessWidget {
  const CategoryBadge({super.key, required this.category, this.faded});

  final Category category;

  /// Estompée ; par défaut si la catégorie est masquée.
  final bool? faded;

  @override
  Widget build(BuildContext context) => CategoryIconBadge(
    icon: category.icon,
    color: category.color,
    faded: faded ?? category.hidden,
  );
}

class CategoryIconBadge extends StatelessWidget {
  const CategoryIconBadge({
    super.key,
    required this.icon,
    required this.color,
    this.faded = false,
    this.size = 40,
  });

  /// Clé du catalogue (`category_icons.dart`) ou texte libre (emoji).
  final String icon;
  final String color;
  final bool faded;
  final double size;

  @override
  Widget build(BuildContext context) => Opacity(
    opacity: faded ? 0.5 : 1,
    child: IconTile(
      icon: categoryIconFor(icon),
      fallbackText: icon,
      color: parseCategoryColor(color),
      size: size,
    ),
  );
}
