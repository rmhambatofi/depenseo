import 'package:flutter/material.dart';

import '../../core/db/app_database.dart';
import '../../l10n/generated/app_localizations.dart';

/// Racines en puces ; les sous-catégories de la racine choisie apparaissent
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
    Widget chip(Category c) => ChoiceChip(
      key: Key('category-${c.id}'),
      label: Text('${c.icon} ${c.name}'),
      selected: c.id == selectedId,
      onSelected: (_) => onSelected(c.id),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(spacing: 8, runSpacing: 4, children: roots.map(chip).toList()),
        if (rootId != null && children.isNotEmpty) ...[
          const Divider(),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: children.map(chip).toList(),
          ),
        ],
      ],
    );
  }
}
