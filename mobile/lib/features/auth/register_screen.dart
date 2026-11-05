import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_api.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../providers.dart';
import 'auth_widgets.dart';

/// Inscription par e-mail (F-AUTH-01) : consentement CGU + confidentialité obligatoire (ADR-017).
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _acceptTerms = false;
  bool _termsMissing = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final valid = _form.currentState!.validate();
    setState(() => _termsMissing = !_acceptTerms);
    if (!valid || !_acceptTerms) return;
    final l10n = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(authApiProvider)
          .register(
            email: _email.text.trim(),
            password: _password.text,
            language: accountLanguage(context),
          );
      if (mounted) context.go('/register/sent');
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = failureMessage(l10n, e.failure));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Form(
      key: _form,
      child: AuthScaffold(
        title: l10n.registerTitle,
        children: [
          EmailField(controller: _email),
          PasswordField(
            controller: _password,
            label: l10n.passwordLabel,
            newPassword: true,
            validator: (v) => validateNewPassword(l10n, v),
          ),
          CheckboxListTile(
            key: const Key('acceptTerms'),
            value: _acceptTerms,
            onChanged: (v) => setState(() => _acceptTerms = v ?? false),
            title: Text(l10n.acceptTermsLabel),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
          ),
          if (_termsMissing) FormMessage(l10n.termsRequired),
          if (_error != null) FormMessage(_error!),
          SubmitButton(
            label: l10n.registerSubmit,
            busy: _busy,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

class RegisterSentScreen extends StatelessWidget {
  const RegisterSentScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return AuthScaffold(
      title: l10n.registerSentTitle,
      children: [
        Text(l10n.registerSentBody),
        FilledButton(
          onPressed: () => context.go('/login'),
          child: Text(l10n.goToLogin),
        ),
      ],
    );
  }
}
