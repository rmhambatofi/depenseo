import 'package:depenseo/features/auth/auth_controller.dart';
import 'package:depenseo/router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const loading = AsyncLoading<AuthStatus>();
  final failed = AsyncError<AuthStatus>(
    Exception('keychain'),
    StackTrace.empty,
  );
  const out = AsyncData(AuthStatus.signedOut);
  const signedIn = AsyncData(AuthStatus.signedIn);

  final cases = <(AsyncValue<AuthStatus>, String, String?)>[
    // Chargement : écran d'attente, sauf liens e-mail.
    (loading, '/', '/splash'),
    (loading, '/splash', null),
    (loading, '/verify-email', null),
    (loading, '/reset-password', null),
    // Stockage illisible.
    (failed, '/', '/storage-error'),
    (failed, '/login', '/storage-error'),
    (failed, '/storage-error', null),
    (failed, '/reset-password', null),
    // Sans session : jamais l'accueil ni une route inconnue.
    (out, '/', '/login'),
    (out, '/splash', '/login'),
    (out, '/storage-error', '/login'),
    (out, '/inconnue', '/login'),
    (out, '/login', null),
    (out, '/register', null),
    (out, '/register/sent', null),
    (out, '/forgot-password', null),
    (out, '/verify-email', null),
    // Avec session : pas d'écran de visiteur.
    (signedIn, '/', null),
    (signedIn, '/login', '/'),
    (signedIn, '/register', '/'),
    (signedIn, '/forgot-password', '/'),
    (signedIn, '/splash', '/'),
    (signedIn, '/storage-error', '/'),
    (signedIn, '/reset-password', null),
  ];

  for (final (auth, path, expected) in cases) {
    test('$auth sur $path → ${expected ?? 'reste'}', () {
      expect(authRedirect(auth, path), expected);
    });
  }
}
