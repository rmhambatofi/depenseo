// Export des données personnelles (P6-12 ; F-AUTH-08 ; ADR-038/057).
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import '../support/settle.dart';
import 'account_harness.dart';

void main() {
  testWidgets('archive zip demandée, attendue puis partagée', (tester) async {
    late ExportServer server;
    final app = await openAccount(
      tester,
      configure: (app) => server = ExportServer(
        app,
        create: 'POST /me/export',
        base: '/me/export',
      ),
    );
    server
      ..file = Uint8List.fromList([0x50, 0x4b, 0x03, 0x04])
      ..mime = 'application/zip';

    await tapUntil(
      tester,
      'export-personal',
      () => app.files.shared.isNotEmpty,
    );

    final body = app.api.calls('POST /me/export').single.body! as Map;
    expect(body.keys, ['id']);
    expect(body['id'], matches(uuidV7));
    expect(app.api.calls('GET /me/export/${body['id']}'), hasLength(2));
    final shared = app.files.shared.single;
    expect(shared.name, 'depenseo-donnees-2026-11-05.zip');
    expect(shared.mime, 'application/zip');
    expect(shared.bytes, server.file);
  });

  testWidgets('lien expiré avant le téléchargement : message', (tester) async {
    final app = await openAccount(
      tester,
      configure: (app) => ExportServer(
        app,
        create: 'POST /me/export',
        base: '/me/export',
        states: ['pending', 'expired'],
      ),
    );

    await tapUntil(
      tester,
      'export-personal',
      () => snack('n’a pas pu être préparé').evaluate().isNotEmpty,
    );

    expect(app.files.shared, isEmpty);
  });

  testWidgets('stockage non configuré (503) : message', (tester) async {
    final app = await openAccount(
      tester,
      configure: (app) => ExportServer(
        app,
        create: 'POST /me/export',
        base: '/me/export',
        createStatus: 503,
      ),
    );

    await tapUntil(
      tester,
      'export-personal',
      () => snack('n’a pas pu être préparé').evaluate().isNotEmpty,
    );

    expect(app.files.shared, isEmpty);
  });
}
