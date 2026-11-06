import 'package:flutter/material.dart';

import '../../core/db/app_database.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../ui/tokens.dart';
import '../categories/category_badge.dart';

/// Racines en tuiles ; les sous-catégories de la racine choisie apparaissent
/// dessous (une racine reste un choix valide).
class CategoryPicker extends StatelessWidget {
  const CategoryPicker({
    super.key,
    required this.categories,
    required this.selectedId,
    required this.onSelected,
  });

  final List<Category> categories;
  final String? selectedId;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    if (categories.isEmpty) {
      return Text(AppLocalizations.of(context).categoriesUnavailable);
    }
    final roots = categories.where((c) => c.parentId == null).toList();
    final selected = categories.where((c) => c.id == selectedId).firstOrNull;
    final rootId = selected?.parentId ?? selected?.id;
    final children = categories.where((c) => c.parentId == rootId).toList();
    Widget grid(List<Category> items) => Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      children: [
        for (final c in items)
          CategoryChoiceTile(
            key: Key('category-${c.id}'),
            category: c,
            selected: c.id == selectedId,
            onTap: () => onSelected(c.id),
          ),
      ],
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        grid(roots),
        if (rootId != null && children.isNotEmpty) ...[
          const Divider(height: AppSpacing.lg),
          grid(children),
        ],
      ],
    );
  }
}

/// Tuile d'une catégorie à choisir : icône teintée au-dessus du nom ; la
/// sélection est un fond `surfaceHigh` cerclé de la couleur primaire.
class CategoryChoiceTile extends StatelessWidget {
  const CategoryChoiceTile({
    super.key,
    required this.category,
    required this.selected,
    required this.onTap,
  });

  final Category category;
  final bool selected;
  final VoidCallback onTap;

  /// Largeur à l'échelle 1 ; suit la taille du texte (jusqu'à ×1,8) pour
  /// garder deux lignes lisibles en texte agrandi.
  static const double baseWidth = 88;

  @override
  Widget build(BuildContext context) {
    final t = AppTokens.of(context);
    final width = MediaQuery.textScalerOf(context)
        .scale(baseWidth)
        .clamp(baseWidth, baseWidth * 1.8);
    final radius = BorderRadius.circular(AppRadius.tile);
    final style = TextStyle(
      fontSize: 12,
      height: 1.2,
      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
      color: selected ? t.primary : t.text,
    );
    return Semantics(
      button: true,
      enabled: true,
      selected: selected,
      inMutuallyExclusiveGroup: true,
      label: category.name,
      excludeSemantics: true,
      onTap: onTap,
      child: Material(
        color: selected ? t.surfaceHigh : Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(
            color: selected ? t.primary : Colors.transparent,
            width: 2,
          ),
        ),
        child: InkWell(
          borderRadius: radius,
          onTap: onTap,
          child: SizedBox(
            width: width,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: 4,
                vertical: AppSpacing.xs,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CategoryIconBadge(
                    icon: category.icon,
                    color: category.color,
                    size: 48,
                  ),
                  const SizedBox(height: 6),
                  _label(category.name, style),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Un seul mot : réduit pour tenir sur une ligne (sinon Flutter le coupe
  /// au milieu) ; plusieurs mots : deux lignes au plus.
  static Widget _label(String name, TextStyle style) {
    final text = Text(
      name,
      maxLines: name.trim().contains(' ') ? 2 : 1,
      overflow: TextOverflow.ellipsis,
      textAlign: TextAlign.center,
      style: style,
    );
    return name.trim().contains(' ')
        ? text
        : FittedBox(fit: BoxFit.scaleDown, child: text);
  }
}
