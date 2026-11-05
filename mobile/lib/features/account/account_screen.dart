import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/account/account_api.dart';
import '../../core/account/account_context.dart';
import '../../core/dates/today.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../providers.dart';
import '../auth/auth_controller.dart';
import '../expenses/expense_providers.dart';
import '../premium/premium_providers.dart';
import '../premium/subscription_screen.dart';
import '../sync/sync_controller.dart';
import 'delete_account_dialog.dart';

final accountApiProvider = Provider<AccountApi>(
  (ref) => AccountApi(ref.watch(apiClientProvider)),
);

/// Attente entre deux interrogations de l'état d'un export (remplacée en test).
final exportSleepProvider = Provider<Future<void> Function(Duration)>(
  (ref) => Future<void>.delayed,
);

const _csvMime = 'text/csv';
const _xlsxMime =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/// Exports (F-EXP-01, F-AUTH-08), suppression du compte (F-AUTH-07) et
/// documents légaux (§6). En ligne seulement (ADR-057).
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final account = ref.watch(accountContextProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.accountTitle)),
      body: switch (account) {
        AsyncValue(:final value?) => _AccountBody(account: value),
        AsyncValue(hasError: true) => Center(child: Text(l10n.accountOffline)),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _AccountBody extends ConsumerStatefulWidget {
  const _AccountBody({required this.account});

  final AccountContext account;

  @override
  ConsumerState<_AccountBody> createState() => _AccountBodyState();
}

enum _Busy { none, expenses, personal, deleting }

class _AccountBodyState extends ConsumerState<_AccountBody> {
  late final String _today = todayIn(
    widget.account.timeZone,
    ref.read(clockProvider)(),
  );
  late String _from = '${_today.substring(0, 8)}01';
  late String _to = _today;
  ExportFormat _chosen = ExportFormat.csv;

  /// Hors Premium (droits lus sur l'API), l'Excel est en lecture seule :
  /// option désactivée, CSV retenu (§5, ADR-041). État inconnu : l'API tranche.
  /// Mis à jour par `build` depuis l'état observé.
  bool _excelLocked = false;

  ExportFormat get _format => _excelLocked ? ExportFormat.csv : _chosen;
  _Busy _busy = _Busy.none;

  void _snack(String text) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));

  Rect? _origin() {
    final box = context.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return null;
    return box.localToGlobal(Offset.zero) & box.size;
  }

  /// Une opération à la fois ; message d'erreur selon la cause.
  Future<void> _export(
    _Busy kind,
    ExportJob job,
    String fileName,
    String mime, {
    bool premium = false,
  }) async {
    if (_busy != _Busy.none) return;
    final l10n = AppLocalizations.of(context);
    final sharer = ref.read(fileSharerProvider);
    final sleep = ref.read(exportSleepProvider);
    setState(() => _busy = kind);
    try {
      final Uint8List bytes = await runExport(
        job,
        delays: exportPollDelays,
        sleep: sleep,
        cancelled: () => !mounted,
      );
      if (!mounted) return;
      await sharer.share(fileName, mime, bytes, origin: _origin());
    } on AccountApiException catch (e) {
      if (!mounted) return;
      _snack(switch (e.status) {
        null => l10n.accountOffline,
        403 when premium => l10n.exportPremiumOnly,
        _ => l10n.exportFailed,
      });
    } on Object {
      if (mounted) _snack(l10n.exportFailed);
    } finally {
      if (mounted) setState(() => _busy = _Busy.none);
    }
  }

  Future<void> _exportExpenses() {
    final l10n = AppLocalizations.of(context);
    if (_from.compareTo(_to) > 0) {
      _snack(l10n.exportPeriodInvalid);
      return Future.value();
    }
    final api = ref.read(accountApiProvider);
    final job = api.expenseExport(
      notebookId: widget.account.notebookId,
      id: ref.read(idGeneratorProvider)(),
      format: _format,
      from: _from,
      to: _to,
    );
    final xlsx = _format == ExportFormat.xlsx;
    return _export(
      _Busy.expenses,
      job,
      'depenseo-$_from-$_to.${xlsx ? 'xlsx' : 'csv'}',
      xlsx ? _xlsxMime : _csvMime,
      premium: xlsx,
    );
  }

  Future<void> _exportPersonal() {
    final job = ref
        .read(accountApiProvider)
        .personalExport(ref.read(idGeneratorProvider)());
    return _export(
      _Busy.personal,
      job,
      'depenseo-donnees-$_today.zip',
      'application/zip',
    );
  }

  Future<void> _delete() async {
    if (_busy != _Busy.none) return;
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final api = ref.read(accountApiProvider);
    final auth = ref.read(authControllerProvider.notifier);
    final sync = ref.read(syncControllerProvider.notifier);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => const DeleteAccountDialog(),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = _Busy.deleting);
    try {
      await api.deleteAccount();
    } on AccountApiException catch (e) {
      if (mounted) {
        setState(() => _busy = _Busy.none);
        _snack(e.status == null ? l10n.accountOffline : l10n.deleteFailed);
      }
      return;
    }
    // L'écran disparaît avec la session : message sur le messager racine.
    await auth.accountDeleted(settleSync: sync.settled);
    messenger.showSnackBar(SnackBar(content: Text(l10n.accountDeleted)));
  }

  /// Composantes d'une date `AAAA-MM-JJ`, sans fuseau (affichage, sélecteur).
  static DateTime _components(String date) {
    final p = date.split('-').map(int.parse).toList();
    return DateTime(p[0], p[1], p[2]);
  }

  Future<void> _pick(String current, void Function(String) apply) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _components(current),
      firstDate: DateTime(2000),
      lastDate: _components(_today),
    );
    if (picked != null && mounted) {
      setState(() => apply(formatPlainDate(picked)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final theme = Theme.of(context);
    String date(String d) => DateFormat.yMMMd(locale).format(_components(d));

    final idle = _busy == _Busy.none;
    final subscription = ref.watch(subscriptionStatusProvider).value;
    final plan = subscription?.plan;
    final excelLocked = _excelLocked = subscription?.premiumActive == false;
    Widget header(String text) => Semantics(
      header: true,
      child: ListTile(
        title: Text(text, style: TextStyle(color: theme.colorScheme.primary)),
      ),
    );
    Widget progress(_Busy kind) => _busy == kind
        ? Padding(
            key: Key('progress-${kind.name}'),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const LinearProgressIndicator(),
                const SizedBox(height: 4),
                Text(l10n.exportPreparing),
              ],
            ),
          )
        : const SizedBox.shrink();

    return ListView(
      children: [
        header(l10n.exportExpensesTitle),
        ListTile(
          key: const Key('export-from'),
          title: Text(l10n.exportFrom),
          trailing: Text(date(_from)),
          enabled: idle,
          onTap: () => _pick(_from, (d) => _from = d),
        ),
        ListTile(
          key: const Key('export-to'),
          title: Text(l10n.exportTo),
          trailing: Text(date(_to)),
          enabled: idle,
          onTap: () => _pick(_to, (d) => _to = d),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: SegmentedButton<ExportFormat>(
            key: const Key('export-format'),
            segments: [
              ButtonSegment(
                value: ExportFormat.csv,
                label: Text(l10n.exportCsv),
              ),
              ButtonSegment(
                value: ExportFormat.xlsx,
                label: Text(l10n.exportExcel),
                enabled: !excelLocked,
              ),
            ],
            selected: {_format},
            onSelectionChanged: idle
                ? (s) => setState(() => _chosen = s.single)
                : null,
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton.icon(
            key: const Key('export-expenses'),
            icon: const Icon(Icons.file_download_outlined),
            label: Text(l10n.exportExpensesAction),
            onPressed: idle ? _exportExpenses : null,
          ),
        ),
        if (excelLocked)
          Padding(
            key: const Key('excel-locked'),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(l10n.exportExcelLocked),
          ),
        progress(_Busy.expenses),
        header(l10n.subscriptionTitle),
        ListTile(
          key: const Key('open-subscription'),
          leading: const Icon(Icons.workspace_premium_outlined),
          title: Text(
            plan == null ? l10n.subscriptionTitle : planLabel(l10n, plan),
          ),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/settings/subscription'),
        ),
        header(l10n.accountDataTitle),
        ListTile(
          key: const Key('export-personal'),
          leading: const Icon(Icons.archive_outlined),
          title: Text(l10n.exportPersonalAction),
          subtitle: Text(l10n.exportPersonalHint),
          enabled: idle,
          onTap: _exportPersonal,
        ),
        progress(_Busy.personal),
        ListTile(
          key: const Key('open-legal'),
          leading: const Icon(Icons.gavel_outlined),
          title: Text(l10n.legalTitle),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/settings/legal'),
        ),
        ListTile(
          key: const Key('delete-account'),
          leading: Icon(
            Icons.delete_forever_outlined,
            color: theme.colorScheme.error,
          ),
          title: Text(
            l10n.deleteAccountAction,
            style: TextStyle(color: theme.colorScheme.error),
          ),
          subtitle: Text(l10n.deleteAccountHint),
          enabled: idle,
          onTap: _delete,
        ),
        if (_busy == _Busy.deleting)
          const Padding(
            key: Key('progress-deleting'),
            padding: EdgeInsets.all(16),
            child: LinearProgressIndicator(),
          ),
      ],
    );
  }
}
