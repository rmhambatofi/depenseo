import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_api.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../providers.dart';
import 'auth_controller.dart';
import 'auth_widgets.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  /// Exécute [action] en gérant l'indicateur et le message d'échec.
  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final l10n = AppLocalizations.of(context);
    try {
      await action();
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = failureMessage(l10n, e.failure));
    } on Object {
      if (mounted) setState(() => _error = l10n.errorUnknown);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _login() {
    if (!_form.currentState!.validate()) return;
    _run(
      () => ref
          .read(authControllerProvider.notifier)
          .login(_email.text.trim(), _password.text),
    );
  }

  void _social(SocialProvider provider) => _run(() async {
    final language = accountLanguage(context);
    final credential = await ref.read(socialSignInProvider).signIn(provider);
    if (credential == null) return; // annulé dans le SDK natif
    final auth = ref.read(authControllerProvider.notifier);
    try {
      await auth.socialLogin(provider, credential, language: language);
    } on AuthException catch (e) {
      if (e.failure != AuthFailure.termsRequired) rethrow;
      if (!mounted || !await _confirmTerms()) return;
      await auth.socialLogin(
        provider,
        credential,
        language: language,
        acceptTerms: true,
      );
    }
  });

  Future<bool> _confirmTerms() async {
    final l10n = AppLocalizations.of(context);
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.socialTermsTitle),
        content: Text(l10n.socialTermsBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(l10n.socialTermsAccept),
          ),
        ],
      ),
    );
    return accepted ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final social = ref.watch(socialSignInProvider);
    return Form(
      key: _form,
      child: AuthScaffold(
        title: l10n.loginTitle,
        footer: [
          if (social.isAvailable(SocialProvider.apple))
            OutlinedButton.icon(
              icon: const Icon(Icons.apple),
              label: Text(l10n.loginWithApple),
              onPressed: _busy ? null : () => _social(SocialProvider.apple),
            ),
          if (social.isAvailable(SocialProvider.google))
            OutlinedButton(
              onPressed: _busy ? null : () => _social(SocialProvider.google),
              child: Text(l10n.loginWithGoogle),
            ),
          TextButton(
            onPressed: () => context.push('/register'),
            child: Text(l10n.goToRegister),
          ),
        ],
        children: [
          EmailField(controller: _email),
          PasswordField(controller: _password, label: l10n.passwordLabel),
          if (_error != null) FormMessage(_error!),
          SubmitButton(label: l10n.loginSubmit, busy: _busy, onPressed: _login),
          TextButton(
            onPressed: () => context.push('/forgot-password'),
            child: Text(l10n.goToForgotPassword),
          ),
        ],
      ),
    );
  }
}
