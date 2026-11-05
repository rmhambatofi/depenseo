import 'package:flutter/material.dart';

import '../../core/db/app_database.dart';

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

/// Pastille d'une catégorie : son icône (emoji) sur sa couleur.
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
  });

  final String icon;
  final String color;
  final bool faded;

  @override
  Widget build(BuildContext context) => Opacity(
    opacity: faded ? 0.5 : 1,
    child: CircleAvatar(
      backgroundColor: parseCategoryColor(color).withValues(alpha: 0.25),
      child: ExcludeSemantics(
        child: Text(icon, style: const TextStyle(fontSize: 20)),
      ),
    ),
  );
}
