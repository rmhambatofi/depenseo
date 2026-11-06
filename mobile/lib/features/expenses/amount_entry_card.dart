import 'package:flutter/material.dart';

import '../../core/money/amount_input.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../ui/amount_text.dart';
import '../../ui/app_card.dart';
import '../../ui/tokens.dart';

/// Carte du montant de la saisie rapide (P8-07) : clavier décimal, montant en
/// grand et centré, devise dans le libellé (F-DEP-01, F-DEP-02).
class AmountEntryCard extends StatelessWidget {
  const AmountEntryCard({
    super.key,
    required this.controller,
    required this.autofocus,
    required this.separator,
    required this.currency,
    this.errorText,
  });

  final TextEditingController controller;
  final bool autofocus;

  /// Séparateur décimal de la langue (le point saisi y est converti).
  final String separator;
  final String currency;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final t = AppTokens.of(context);
    return AppCard(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.xs,
        AppSpacing.md,
        AppSpacing.md,
      ),
      child: TextField(
        key: const Key('expense-amount'),
        controller: controller,
        autofocus: autofocus,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [AmountInputFormatter(separator)],
        textInputAction: TextInputAction.done,
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: AmountSize.hero.fontSize,
          fontWeight: AmountSize.hero.weight,
          color: t.text,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
        decoration: InputDecoration(
          // Devise dans le libellé : un suffixe resterait collé au bord
          // droit, loin du montant centré.
          labelText: '${l10n.amountLabel} ($currency)',
          floatingLabelAlignment: FloatingLabelAlignment.center,
          floatingLabelBehavior: FloatingLabelBehavior.always,
          hintText: '0',
          errorText: errorText,
          filled: false,
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          errorBorder: InputBorder.none,
          focusedErrorBorder: InputBorder.none,
        ),
      ),
    );
  }
}
