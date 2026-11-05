import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/password_reset_screens.dart';
import 'features/auth/register_screen.dart';
import 'features/auth/storage_error_screen.dart';
import 'features/auth/verify_email_screen.dart';
import 'features/expenses/quick_entry_screen.dart';
import 'features/home/home_screen.dart';
import 'features/settings/pin_setup_screen.dart';
import 'features/settings/settings_screen.dart';

/// Écrans réservés aux visiteurs non connectés.
const _signedOutOnly = {
  '/login',
  '/register',
  '/register/sent',
  '/forgot-password',
};

/// Liens reçus par e-mail : ouverts quel que soit l'état de session.
const _emailLinks = {'/verify-email', '/reset-password'};

/// Écrans d'attente ou d'erreur du démarrage, quittés dès que l'état est connu.
const _transient = {'/splash', '/storage-error'};

/// Destination imposée par l'état de session, ou `null` pour rester sur [path].
String? authRedirect(AsyncValue<AuthStatus> auth, String path) {
  if (_emailLinks.contains(path)) return null;
  return switch (auth) {
    AsyncError() => path == '/storage-error' ? null : '/storage-error',
    AsyncData(value: AuthStatus.signedOut) =>
      _signedOutOnly.contains(path) ? null : '/login',
    AsyncData(value: AuthStatus.signedIn) =>
      _signedOutOnly.contains(path) || _transient.contains(path) ? '/' : null,
    _ => path == '/splash' ? null : '/splash',
  };
}

/// Routes de l'application. Aucun écran d'administration (F-ADM-02).
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier(ref.read(authControllerProvider));
  ref.listen(authControllerProvider, (_, next) => refresh.value = next);
  final router = GoRouter(
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) => authRedirect(refresh.value, state.uri.path),
    routes: [
      GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
      GoRoute(
        path: '/expenses/new',
        builder: (context, state) => const QuickEntryScreen(),
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
        routes: [
          GoRoute(
            path: 'pin',
            builder: (context, state) => const PinSetupScreen(),
          ),
        ],
      ),
      GoRoute(
        path: '/splash',
        builder: (context, state) =>
            const Scaffold(body: Center(child: CircularProgressIndicator())),
      ),
      GoRoute(
        path: '/storage-error',
        builder: (context, state) => const StorageErrorScreen(),
      ),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/register/sent',
        builder: (context, state) => const RegisterSentScreen(),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/reset-password',
        builder: (context, state) =>
            ResetPasswordScreen(token: linkToken(state.uri)),
      ),
      GoRoute(
        path: '/verify-email',
        builder: (context, state) =>
            VerifyEmailScreen(token: linkToken(state.uri)),
      ),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});
