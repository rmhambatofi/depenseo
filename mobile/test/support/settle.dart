import 'package:flutter_test/flutter_test.dart';

final uuidV7 = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
);

/// Requête Dio puis écriture en base : le minuteur zéro de Dio n'avance
/// qu'avec une durée simulée, la base qu'avec de vraies E/S.
Future<void> settle(WidgetTester tester, Finder until) =>
    settleUntil(tester, () => until.evaluate().isNotEmpty);

Future<void> settleUntil(WidgetTester tester, bool Function() done) async {
  for (var i = 0; i < 100 && !done(); i++) {
    await tester.pump(const Duration(milliseconds: 10));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
  }
  await tester.pumpAndSettle();
  expect(done(), isTrue);
}
