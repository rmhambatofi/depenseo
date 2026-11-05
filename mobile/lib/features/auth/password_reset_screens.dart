import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_api.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../providers.dart';
import 'auth_widgets.dart';

/// Demande de lien (F-AUTH-03) : même message que l'adresse existe ou non (ADR-019).
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _busy = false;
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    final l10n = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authApiProvider).requestPasswordReset(_email.text.trim());
      if (mounted) setState(() => _sent = true);
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
        title: l10n.forgotTitle,
        children: [
          if (_sent)
            FormMessage(l10n.forgotSent, error: false)
          else ...[
            EmailField(controller: _email),
            if (_error != null) FormMessage(_error!),
            SubmitButton(
              label: l10n.forgotSubmit,
              busy: _busy,
              onPressed: _submit,
            ),
          ],
        ],
      ),
    );
  }
}

/// Jeton d'un lien e-mail `…/reset-password#token=…` ou `…/verify-email#token=…`
/// (fragment, ADR-017/019) ; repli sur `?token=`.
String? linkToken(Uri uri) {
  final fromFragment = Uri.splitQueryString(uri.fragment)['token'];
  final token = fromFragment ?? uri.queryParameters['token'];
  return token == null || token.isEmpty ? null : token;
}

/// Choix du nouveau mot de passe depuis le lien reçu (usage unique, 30 min).
class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key, required this.token});

  final String? token;

  @override
  ConsumerState<ResetPasswordScreen> createState() =>
      _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _password = TextEditingController();
  bool _busy = false;
  bool _done = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    final l10n = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(authApiProvider)
          .confirmPasswordReset(widget.token!, _password.text);
      if (mounted) setState(() => _done = true);
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = failureMessage(l10n, e.failure));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final toLogin = FilledButton(
      onPressed: () => context.go('/login'),
      child: Text(l10n.goToLogin),
    );
    return Form(
      key: _form,
      child: AuthScaffold(
        title: l10n.resetTitle,
        children: [
          if (widget.token == null) ...[
            FormMessage(l10n.errorInvalidLink),
            toLogin,
          ] else if (_done) ...[
            FormMessage(l10n.resetDone, error: false),
            toLogin,
          ] else ...[
            PasswordField(
              controller: _password,
              label: l10n.newPasswordLabel,
              newPassword: true,
              validator: (v) => validateNewPassword(l10n, v),
            ),
            if (_error != null) FormMessage(_error!),
            SubmitButton(
              label: l10n.resetSubmit,
              busy: _busy,
              onPressed: _submit,
            ),
          ],
        ],
      ),
    );
  }
}
