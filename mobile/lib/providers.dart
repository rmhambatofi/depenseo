import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import 'config.dart';
import 'core/api/api_client.dart';
import 'core/auth/token_store.dart';
import 'core/db/app_database.dart';
import 'core/db/database_key.dart';
import 'core/db/local_database.dart';
import 'core/secure/secure_store.dart';

final secureStoreProvider = Provider<SecureStore>(
  (ref) => PlatformSecureStore(),
);

final tokenStoreProvider = Provider<TokenStore>(
  (ref) => TokenStore(ref.watch(secureStoreProvider)),
);

final apiClientProvider = Provider<Dio>((ref) {
  final dio = createApiClient(
    baseUrl: apiBaseUrl,
    tokens: ref.watch(tokenStoreProvider),
  );
  ref.onDispose(dio.close);
  return dio;
});

final databaseProvider = FutureProvider<AppDatabase>((ref) async {
  final db = await openLocalDatabase(
    await getApplicationSupportDirectory(),
    DatabaseKeyProvider(ref.watch(secureStoreProvider)),
  );
  ref.onDispose(db.close);
  return db;
});
