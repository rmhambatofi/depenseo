import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_api.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../providers.dart';
import 'auth_widgets.dart';

/// Ouverture du lien de vérification (F-AUTH-01) : consommé dès l'arrivée sur l'écran.
class VerifyEmailScreen extends ConsumerStatefulWidget {
  const VerifyEmailScreen({super.key, required this.token});

  final String? token;

  @override
  ConsumerState<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends ConsumerState<VerifyEmailScreen> {
  late final Future<void> _verification = _verify();

  Future<void> _verify() async {
    final token = widget.token;
    if (token == null) throw const AuthException(AuthFailure.invalidLink);
    await ref.read(authApiProvider).verifyEmail(token);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return FutureBuilder<void>(
      future: _verification,
      builder: (context, snapshot) => AuthScaffold(
        title: l10n.verifyTitle,
        children: [
          if (snapshot.connectionState != ConnectionState.done)
            const Center(child: CircularProgressIndicator())
          else ...[
            if (snapshot.error case final AuthException e)
              FormMessage(failureMessage(l10n, e.failure))
            else if (snapshot.hasError)
              FormMessage(l10n.errorUnknown)
            else
              FormMessage(l10n.verifyDone, error: false),
            FilledButton(
              onPressed: () => context.go('/login'),
              child: Text(l10n.goToLogin),
            ),
          ],
        ],
      ),
    );
  }
}
