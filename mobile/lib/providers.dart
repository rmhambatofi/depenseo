import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import 'config.dart';
import 'core/account/account_epoch.dart';
import 'core/api/api_client.dart';
import 'core/auth/auth_api.dart';
import 'core/auth/social_sign_in.dart';
import 'core/auth/token_store.dart';
import 'core/clock.dart';
import 'core/db/app_database.dart';
import 'core/db/database_key.dart';
import 'core/db/local_database.dart';
import 'core/files/file_sharer.dart';
import 'core/lock/biometric_auth.dart';
import 'core/lock/screen_security.dart';
import 'core/secure/secure_store.dart';
import 'features/auth/auth_controller.dart';

final secureStoreProvider = Provider<SecureStore>(
  (ref) => PlatformSecureStore(),
);

final accountEpochProvider = Provider<AccountEpoch>(
  (ref) => AccountEpoch(ref.watch(secureStoreProvider)),
);

final tokenStoreProvider = Provider<TokenStore>(
  (ref) => TokenStore(ref.watch(secureStoreProvider)),
);

/// Dossier privé de l'app (supprimé à la désinstallation).
final appSupportDirProvider = FutureProvider<Directory>(
  (ref) => getApplicationSupportDirectory(),
);

/// Transport HTTP : `null` = réseau réel ; remplacé par un faux serveur dans les tests.
final httpAdapterProvider = Provider<HttpClientAdapter?>((ref) => null);

final apiClientProvider = Provider<Dio>((ref) {
  final dio = createApiClient(
    baseUrl: apiBaseUrl,
    tokens: ref.watch(tokenStoreProvider),
    adapter: ref.watch(httpAdapterProvider),
    onSessionExpired: () =>
        ref.read(authControllerProvider.notifier).sessionExpired(),
  );
  ref.onDispose(dio.close);
  return dio;
});

final authApiProvider = Provider<AuthApi>(
  (ref) => AuthApi(ref.watch(apiClientProvider)),
);

final socialSignInProvider = Provider<SocialSignIn>(
  (ref) => PlatformSocialSignIn(),
);

final databaseProvider = FutureProvider<AppDatabase>((ref) async {
  final db = await openLocalDatabase(
    await ref.watch(appSupportDirProvider.future),
    DatabaseKeyProvider(ref.watch(secureStoreProvider)),
  );
  ref.onDispose(db.close);
  return db;
});

final clockProvider = Provider<Clock>((ref) => DateTime.now);

final biometricAuthProvider = Provider<BiometricAuth>(
  (ref) => PlatformBiometricAuth(),
);

final screenSecurityProvider = Provider<ScreenSecurity>(
  (ref) => PlatformScreenSecurity(),
);

/// Remise des fichiers exportés à l'utilisateur (feuille de partage).
final fileSharerProvider = Provider<FileSharer>(
  (ref) => const SystemFileSharer(),
);
