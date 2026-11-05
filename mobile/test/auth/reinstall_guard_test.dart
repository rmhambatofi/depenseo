import 'dart:io';

import 'package:depenseo/core/auth/reinstall_guard.dart';
import 'package:depenseo/core/auth/token_store.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/memory_secure_store.dart';

void main() {
  late Directory dir;
  late TokenStore tokens;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('depenseo_install');
    tokens = TokenStore(MemorySecureStore());
    await tokens.save(const SessionTokens(accessToken: 'a', refreshToken: 'r'));
  });

  tearDown(() => dir.delete(recursive: true));

  test('premier lancement (trousseau iOS survivant à la désinstallation) : jetons purgés', () async {
    await purgeTokensAfterReinstall(dir, tokens);

    expect(await tokens.read(), isNull);
    expect(File('${dir.path}/$installMarkerName').existsSync(), isTrue);
  });

  test('lancements suivants : session conservée', () async {
    await purgeTokensAfterReinstall(dir, tokens);
    await tokens.save(const SessionTokens(accessToken: 'b', refreshToken: 's'));

    await purgeTokensAfterReinstall(dir, tokens);

    expect(await tokens.read(), isNotNull);
  });
}
