import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/categories/category_api.dart';
import '../../core/db/app_database.dart';
import '../../l10n/generated/app_localizations.dart';
import '../expenses/expense_providers.dart';
import 'categories_screen.dart';
import 'category_badge.dart';
import 'category_providers.dart';

/// Icône par défaut d'une nouvelle catégorie.
const _defaultIcon = '🏷️';

/// Création ou personnalisation (nom, icône, couleur) d'une catégorie
/// (F-CAT-02). [categoryId] `null` : création, racine ou sous-catégorie.
class CategoryEditScreen extends ConsumerWidget {
  const CategoryEditScreen({super.key, this.categoryId});

  final String? categoryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final data = ref.watch(categoryEditDataProvider(categoryId));
    return Scaffold(
      appBar: AppBar(
        title: Text(categoryId == null ? l10n.categoryAdd : l10n.categoryEdit),
      ),
      body: switch (data) {
        // Formulaire gardé pendant un éventuel rechargement.
        AsyncValue(:final value?) => _CategoryForm(
          key: ValueKey(value.category?.id),
          data: value,
        ),
        AsyncError(:final error) => Padding(
          padding: const EdgeInsets.all(24),
          child: error is CategoryWriteError
              ? Text(l10n.categoryWriteGone, key: const Key('category-gone'))
              : TextButton(
                  onPressed: () =>
                      ref.invalidate(categoryEditDataProvider(categoryId)),
                  child: Text(l10n.retry),
                ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _CategoryForm extends ConsumerStatefulWidget {
  const _CategoryForm({super.key, required this.data});

  final CategoryEditData data;

  @override
  ConsumerState<_CategoryForm> createState() => _CategoryFormState();
}

class _CategoryFormState extends ConsumerState<_CategoryForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _icon;
  late String _color;
  String? _parentId;
  bool _busy = false;

  /// Tiré une fois : un nouvel essai après une réponse perdue rejoue la même
  /// création (POST idempotent), sans doublon.
  late final String _newId = ref.read(idGeneratorProvider)();

  Category? get _existing => widget.data.category;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: _existing?.name ?? '');
    _icon = TextEditingController(text: _existing?.icon ?? _defaultIcon);
    _color = _existing?.color.toUpperCase() ?? categoryPalette[8];
    _icon.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _name.dispose();
    _icon.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final name = _name.text.trim();
    final icon = _icon.text.trim();
    final existing = _existing;
    final router = GoRouter.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final l10n = AppLocalizations.of(context);
    if (existing != null &&
        existing.name == name &&
        existing.icon == icon &&
        existing.color.toUpperCase() == _color) {
      router.pop();
      return;
    }
    setState(() => _busy = true);
    try {
      if (existing == null) {
        final id = _newId;
        await writeCategory(
          ref,
          (api, notebookId) => api.create(
            notebookId,
            id: id,
            name: name,
            icon: icon,
            color: _color,
            parentId: _parentId,
          ),
        );
      } else {
        await writeCategory(
          ref,
          (api, notebookId) => api.update(
            notebookId,
            existing.id,
            name: name == existing.name ? null : name,
            icon: icon == existing.icon ? null : icon,
            color: _color == existing.color.toUpperCase() ? null : _color,
          ),
        );
      }
      if (mounted) router.pop();
    } on CategoryWriteError catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(categoryWriteMessage(l10n, e.failure))),
      );
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = [
      ...categoryPalette,
      if (!categoryPalette.contains(_color)) _color,
    ];
    final creating = _existing == null;
    return Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              CategoryIconBadge(icon: _icon.text.trim(), color: _color),
              const SizedBox(width: 16),
              Expanded(
                child: TextFormField(
                  key: const Key('category-icon'),
                  controller: _icon,
                  decoration: InputDecoration(
                    labelText: l10n.categoryIconLabel,
                  ),
                  validator: (v) {
                    final icon = (v ?? '').trim();
                    if (icon.isEmpty) return l10n.categoryIconRequired;
                    // Limite de l'API en unités UTF-16 (ADR-023).
                    if (icon.length > 32) return l10n.categoryIconTooLong;
                    return null;
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextFormField(
            key: const Key('category-name'),
            controller: _name,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: l10n.categoryNameLabel),
            validator: (v) {
              final name = (v ?? '').trim();
              if (name.isEmpty) return l10n.categoryNameRequired;
              if (name.length > 100) return l10n.categoryNameTooLong;
              return null;
            },
          ),
          if (creating) ...[
            const SizedBox(height: 16),
            DropdownButtonFormField<String?>(
              key: const Key('category-parent'),
              initialValue: _parentId,
              decoration: InputDecoration(labelText: l10n.categoryParentLabel),
              items: [
                DropdownMenuItem(child: Text(l10n.categoryParentNone)),
                for (final root in widget.data.roots)
                  DropdownMenuItem(
                    value: root.id,
                    child: Text('${root.icon} ${root.name}'),
                  ),
              ],
              onChanged: (v) => setState(() => _parentId = v),
            ),
          ],
          const SizedBox(height: 24),
          Text(
            l10n.categoryColorLabel,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [for (final hex in colors) _swatch(hex, l10n)],
          ),
          const SizedBox(height: 32),
          FilledButton(
            key: const Key('save-category'),
            onPressed: _busy ? null : _save,
            child: _busy
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(l10n.save),
          ),
        ],
      ),
    );
  }

  Widget _swatch(String hex, AppLocalizations l10n) {
    final selected = hex == _color;
    final fill = parseCategoryColor(hex);
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: l10n.categoryColorOption(hex),
      selected: selected,
      button: true,
      child: InkWell(
        key: Key('color-${hex.substring(1)}'),
        customBorder: const CircleBorder(),
        onTap: () => setState(() => _color = hex),
        // Cible tactile de 48 dp autour d'une pastille de 40.
        child: SizedBox.square(
          dimension: 48,
          child: Center(
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: fill,
                shape: BoxShape.circle,
                border: Border.all(
                  width: selected ? 3 : 1,
                  color: selected ? scheme.onSurface : scheme.outlineVariant,
                ),
              ),
              child: selected
                  ? Icon(
                      Icons.check,
                      size: 20,
                      // Coche lisible sur les teintes claires (jaune, citron).
                      color: fill.computeLuminance() > 0.4
                          ? Colors.black
                          : Colors.white,
                    )
                  : null,
            ),
          ),
        ),
      ),
    );
  }
}
