import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/categories/category_api.dart';
import '../../core/db/app_database.dart';
import '../../l10n/generated/app_localizations.dart';
import 'category_badge.dart';
import 'category_providers.dart';

/// Plan de catégories du carnet (F-CAT-01) : plan par défaut et catégories
/// personnelles, masquables (F-CAT-02). Consultable hors connexion ; les
/// modifications exigent le réseau (ADR-052).
class CategoriesScreen extends ConsumerStatefulWidget {
  const CategoriesScreen({super.key});

  @override
  ConsumerState<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends ConsumerState<CategoriesScreen> {
  /// Catégories dont le masquage est en cours d'envoi.
  final _busy = <String>{};

  Future<void> _setHidden(Category c, bool hidden) async {
    final messenger = ScaffoldMessenger.of(context);
    final l10n = AppLocalizations.of(context);
    setState(() => _busy.add(c.id));
    try {
      await writeCategory(
        ref,
        (api, notebookId) => api.update(notebookId, c.id, hidden: hidden),
      );
    } on CategoryWriteError catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(categoryWriteMessage(l10n, e.failure))),
      );
    } finally {
      if (mounted) setState(() => _busy.remove(c.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final tree = ref.watch(categoryTreeProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.categoriesTitle)),
      floatingActionButton: FloatingActionButton(
        key: const Key('add-category'),
        tooltip: l10n.categoryAdd,
        onPressed: () => context.push('/settings/categories/new'),
        child: const Icon(Icons.add_rounded),
      ),
      body: switch (tree) {
        AsyncData(:final value) when value.isEmpty => Padding(
          padding: const EdgeInsets.all(24),
          child: Text(l10n.categoriesUnavailable),
        ),
        AsyncData(:final value) => ListView(
          padding: const EdgeInsets.only(bottom: 88),
          children: [
            for (final node in value) ...[
              _tile(node.category),
              for (final child in node.children)
                _tile(child, hiddenParent: node.category.hidden),
            ],
          ],
        ),
        AsyncError() => Center(
          child: TextButton(
            onPressed: () => ref.invalidate(categoryTreeProvider),
            child: Text(l10n.retry),
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }

  /// [hiddenParent] : `null` pour une racine ; pour une sous-catégorie, sa
  /// racine est-elle masquée (elle n'est alors pas proposée non plus) ?
  Widget _tile(Category c, {bool? hiddenParent}) {
    final l10n = AppLocalizations.of(context);
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final notOffered = c.hidden || (hiddenParent ?? false);
    return ListTile(
      key: Key('category-tile-${c.id}'),
      contentPadding: EdgeInsetsDirectional.only(
        start: hiddenParent == null ? 16 : 56,
        end: 8,
      ),
      leading: CategoryBadge(category: c, faded: notOffered),
      title: Text(c.name, style: notOffered ? TextStyle(color: muted) : null),
      subtitle: c.hidden
          ? Text(l10n.categoryHidden)
          : notOffered
          ? Text(l10n.categoryHiddenWithParent)
          : null,
      trailing: Semantics(
        label: l10n.categoryShownInEntry(c.name),
        child: Switch(
          key: Key('category-visible-${c.id}'),
          value: !c.hidden,
          onChanged: _busy.contains(c.id)
              ? null
              : (visible) => _setHidden(c, !visible),
        ),
      ),
      onTap: () => context.push('/settings/categories/${c.id}'),
    );
  }
}

String categoryWriteMessage(
  AppLocalizations l10n,
  CategoryWriteFailure failure,
) => switch (failure) {
  CategoryWriteFailure.offline => l10n.categoryWriteOffline,
  CategoryWriteFailure.invalid => l10n.categoryWriteInvalid,
  CategoryWriteFailure.gone => l10n.categoryWriteGone,
};
