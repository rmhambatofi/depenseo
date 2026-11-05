import 'dart:io';

import 'package:depenseo/core/db/app_database.dart';
import 'package:flutter_test/flutter_test.dart';

const keyA = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const keyB = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';

void main() {
  late Directory dir;
  late File file;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('depenseo-db-');
    file = File('${dir.path}/depenseo.sqlite');
  });
  tearDown(() => dir.deleteSync(recursive: true));

  test(
    'la base locale est chiffrée par SQLCipher et relisible avec la même clé',
    () async {
      final db = AppDatabase(openEncrypted(file, keyA));
      await db.writeMeta('schema_check', 'ok');
      expect(await db.cipherVersion(), isNotEmpty);
      await db.close();

      final header = file.readAsBytesSync().sublist(0, 16);
      expect(
        String.fromCharCodes(header),
        isNot(startsWith('SQLite format 3')),
      );

      final reopened = AppDatabase(openEncrypted(file, keyA));
      expect(await reopened.readMeta('schema_check'), 'ok');
      await reopened.close();
    },
  );

  test('une mauvaise clé ne permet pas de lire la base', () async {
    final db = AppDatabase(openEncrypted(file, keyA));
    await db.writeMeta('k', 'v');
    await db.close();

    final wrong = AppDatabase(openEncrypted(file, keyB));
    await expectLater(wrong.readMeta('k'), throwsA(anything));
    await wrong.close();
  });

  test('refuse une clé qui n’est pas 64 caractères hexadécimaux', () {
    expect(() => openEncrypted(file, "abc'; --"), throwsArgumentError);
  });
}
