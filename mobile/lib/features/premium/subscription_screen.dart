import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/account/account_context.dart';
import '../../core/dates/date_display.dart';
import '../../core/premium/subscription_api.dart';
import '../../l10n/generated/app_localizations.dart';
import '../expenses/expense_providers.dart';
import 'premium_providers.dart';

/// Libellé court de l'offre (écran Compte).
String planLabel(AppLocalizations l10n, Plan plan) => switch (plan) {
  Plan.free => l10n.planFree,
  Plan.trial => l10n.planTrial,
  Plan.premium => l10n.planPremium,
};

/// Offre en cours, essai de 14 jours, achat, restauration et résiliation
/// vers le store (F-ABO-01…03, §5, ADR-058). En ligne seulement.
class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final account = ref.watch(accountContextProvider).value;
    final status = ref.watch(subscriptionStatusProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.subscriptionTitle)),
      body: switch ((account, status)) {
        (final AccountContext a, AsyncValue(:final value?)) =>
          _SubscriptionBody(account: a, status: value),
        // Droits illisibles : restauration et résiliation restent accessibles.
        (final AccountContext a, AsyncValue(hasError: true)) =>
          _SubscriptionBody(account: a, status: null),
        (_, AsyncValue(hasError: true)) => Center(
          key: const Key('subscription-offline'),
          child: Text(l10n.subscriptionOffline),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _SubscriptionBody extends ConsumerStatefulWidget {
  const _SubscriptionBody({required this.account, required this.status});

  final AccountContext account;

  /// `null` : état inconnu (hors ligne).
  final SubscriptionStatus? status;

  @override
  ConsumerState<_SubscriptionBody> createState() => _SubscriptionBodyState();
}

class _SubscriptionBodyState extends ConsumerState<_SubscriptionBody> {
  StreamSubscription<PurchaseOutcome>? _outcomes;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _outcomes = ref.read(purchaseHandlerProvider).outcomes.listen(_onOutcome);
  }

  @override
  void dispose() {
    _outcomes?.cancel();
    super.dispose();
  }

  void _snack(String text) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));

  void _onOutcome(PurchaseOutcome outcome) {
    if (!mounted) return;
    final l10n = AppLocalizations.of(context);
    _snack(switch (outcome) {
      PurchaseOutcome.activated => l10n.purchaseActivated,
      PurchaseOutcome.restored => l10n.purchaseRestored,
      PurchaseOutcome.pending => l10n.purchasePending,
      PurchaseOutcome.invalid => l10n.purchaseInvalid,
      PurchaseOutcome.otherAccount => l10n.purchaseOtherAccount,
      PurchaseOutcome.retryLater => l10n.purchaseRetryLater,
      PurchaseOutcome.failed => l10n.purchaseFailed,
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _startTrial() => _run(() async {
    final l10n = AppLocalizations.of(context);
    try {
      await ref.read(subscriptionStatusProvider.notifier).startTrial();
      if (mounted) _snack(l10n.trialStarted);
    } on SubscriptionApiException catch (e) {
      if (!mounted) return;
      _snack(switch (e.status) {
        null => l10n.subscriptionOffline,
        409 => l10n.trialUsed,
        _ => l10n.subscriptionFailed,
      });
    }
  });

  Future<void> _buy(String productId) => _run(() async {
    final l10n = AppLocalizations.of(context);
    try {
      final started = await ref
          .read(storeGatewayProvider)
          .buy(productId, accountId: widget.account.userId);
      if (!started && mounted) _snack(l10n.purchaseFailed);
    } on Object {
      // Achat déjà en cours, store indisponible…
      if (mounted) _snack(l10n.purchaseFailed);
    }
  });

  Future<void> _restore() => _run(() async {
    final l10n = AppLocalizations.of(context);
    _snack(l10n.restoreRequested);
    try {
      await ref
          .read(storeGatewayProvider)
          .restore(accountId: widget.account.userId);
    } on Object {
      if (mounted) _snack(l10n.purchaseFailed);
    }
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final tz = widget.account.timeZone;
    final store = ref.watch(storeGatewayProvider);
    final manage = store.manageSubscriptionsUri;
    final status = widget.status;
    final storeTiles = [
      if (manage != null)
        ListTile(
          key: const Key('restore-purchases'),
          leading: const Icon(Icons.restore),
          title: Text(l10n.restorePurchases),
          enabled: !_busy,
          onTap: _restore,
        ),
      // Résiliation en un clic vers le store (§5), quel que soit l'état lu.
      if (manage != null)
        ListTile(
          key: const Key('manage-subscription'),
          leading: const Icon(Icons.open_in_new),
          title: Text(l10n.manageSubscription),
          subtitle: Text(l10n.manageSubscriptionHint),
          onTap: () => ref.read(urlOpenerProvider)(manage),
        ),
    ];
    if (status == null) {
      return ListView(
        children: [
          ListTile(
            key: const Key('subscription-offline'),
            leading: const Icon(Icons.cloud_off),
            title: Text(l10n.subscriptionOffline),
          ),
          ...storeTiles,
        ],
      );
    }
    final premium = status.plan == Plan.premium;

    final String summary = switch (status) {
      SubscriptionStatus(plan: Plan.premium, :final premiumUntil?) =>
        l10n.planPremiumUntil(formatInstantDate(tz, premiumUntil, locale)),
      // Fin = minuit local au début du jour 15 : le dernier jour inclus est la veille.
      SubscriptionStatus(plan: Plan.trial, :final trialEndsAt?) =>
        l10n.planTrialUntil(
          formatInstantDate(
            tz,
            trialEndsAt.subtract(const Duration(milliseconds: 1)),
            locale,
          ),
        ),
      _ => planLabel(l10n, status.plan),
    };

    return ListView(
      children: [
        ListTile(
          leading: Icon(
            status.premiumActive
                ? Icons.workspace_premium
                : Icons.workspace_premium_outlined,
          ),
          title: Text(summary, key: const Key('plan-status')),
          subtitle: Text(
            status.premiumActive ? l10n.premiumIncludes : l10n.planReadOnly,
          ),
        ),
        if (!premium) ...[
          if (status.trialAvailable)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: FilledButton(
                key: const Key('start-trial'),
                onPressed: _busy ? null : _startTrial,
                child: Text(l10n.trialStart),
              ),
            ),
          if (status.trialAvailable)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Text(l10n.trialHint),
            ),
          if (status.plan == Plan.free)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(l10n.premiumIncludes),
            ),
          ...switch (ref.watch(storeProductsProvider)) {
            AsyncValue(value: final products?) when products.isNotEmpty => [
              for (final p in products)
                ListTile(
                  key: Key('buy-${p.id}'),
                  title: Text(p.title),
                  trailing: Text(p.price),
                  enabled: !_busy,
                  onTap: () => _buy(p.id),
                ),
            ],
            AsyncValue(isLoading: true) => const [LinearProgressIndicator()],
            _ => [
              ListTile(
                key: const Key('store-unavailable'),
                title: Text(l10n.storeUnavailable),
              ),
            ],
          },
        ],
        ...storeTiles,
      ],
    );
  }
}
