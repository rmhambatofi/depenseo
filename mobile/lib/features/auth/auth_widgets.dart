import 'package:flutter/material.dart';

import '../../core/auth/auth_api.dart';
import '../../l10n/generated/app_localizations.dart';

String failureMessage(AppLocalizations l10n, AuthFailure failure) =>
    switch (failure) {
      AuthFailure.invalidCredentials => l10n.errorInvalidCredentials,
      AuthFailure.emailNotVerified => l10n.errorEmailNotVerified,
      AuthFailure.invalidLink => l10n.errorInvalidLink,
      AuthFailure.invalidInput => l10n.errorInvalidInput,
      AuthFailure.identityRejected => l10n.errorIdentityRejected,
      AuthFailure.accountNotLinkable => l10n.errorAccountNotLinkable,
      AuthFailure.providerUnavailable => l10n.errorProviderUnavailable,
      AuthFailure.network => l10n.errorNetwork,
      AuthFailure.termsRequired || AuthFailure.unknown => l10n.errorUnknown,
    };

/// Contrôle de forme seulement ; l'API reste juge (ADR-015).
String? validateEmail(AppLocalizations l10n, String? value) {
  final v = value?.trim() ?? '';
  return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v)
      ? null
      : l10n.invalidEmail;
}

/// Règles de l'inscription : 8 à 128 caractères, sans règle de composition (ADR-017).
String? validateNewPassword(AppLocalizations l10n, String? value) {
  final length = value?.length ?? 0;
  if (length < 8) return l10n.passwordTooShort;
  if (length > 128) return l10n.passwordTooLong;
  return null;
}

/// Langue du compte transmise à l'API : celle de l'interface.
String accountLanguage(BuildContext context) =>
    Localizations.localeOf(context).languageCode == 'en' ? 'en' : 'fr';

/// Gabarit commun des écrans d'authentification : titre, formulaire défilant.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({super.key, required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(title)),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          for (final child in children)
            Padding(padding: const EdgeInsets.only(bottom: 16), child: child),
        ],
      ),
    ),
  );
}

class EmailField extends StatelessWidget {
  const EmailField({super.key, required this.controller});

  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return TextFormField(
      key: const Key('email'),
      controller: controller,
      decoration: InputDecoration(labelText: l10n.emailLabel),
      keyboardType: TextInputType.emailAddress,
      autocorrect: false,
      autofillHints: const [AutofillHints.email],
      validator: (v) => validateEmail(l10n, v),
    );
  }
}

class PasswordField extends StatelessWidget {
  const PasswordField({
    super.key,
    required this.controller,
    required this.label,
    this.validator,
    this.newPassword = false,
  });

  final TextEditingController controller;
  final String label;
  final FormFieldValidator<String>? validator;
  final bool newPassword;

  @override
  Widget build(BuildContext context) => TextFormField(
    key: const Key('password'),
    controller: controller,
    decoration: InputDecoration(labelText: label),
    obscureText: true,
    autocorrect: false,
    enableSuggestions: false,
    autofillHints: [
      newPassword ? AutofillHints.newPassword : AutofillHints.password,
    ],
    validator: validator,
  );
}

/// Message d'erreur ou d'information sous un formulaire.
class FormMessage extends StatelessWidget {
  const FormMessage(this.text, {super.key, this.error = true});

  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(color: error ? Theme.of(context).colorScheme.error : null),
  );
}

/// Bouton principal avec indicateur pendant l'appel.
class SubmitButton extends StatelessWidget {
  const SubmitButton({
    super.key,
    required this.label,
    required this.busy,
    required this.onPressed,
  });

  final String label;
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => FilledButton(
    onPressed: busy ? null : onPressed,
    child: busy
        ? const SizedBox.square(
            dimension: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : Text(label),
  );
}
