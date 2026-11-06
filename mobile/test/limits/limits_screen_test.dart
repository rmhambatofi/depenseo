// Écran des limites (P6-08, F-LIM-01/02/03/05/09, ADR-053) : jauge lue
// depuis l'API, réglages écrits en ligne.
import 'package:depenseo/ui/limit_progress_bar.dart';
import 'package:depenseo/ui/tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/settle.dart';
import '../support/style_finders.dart';
import 'limit_harness.dart';

void main() {
  for (final (limit, over) in [(50000, false), (20000, true)]) {
    testWidgets(
      'jauge en carte, barre arrondie ${over ? 'rouge au-delà' : 'verte sous'} '
      'de la limite, réglages titrés',
      (tester) async {
        await openLimits(tester, current: summary(limit: limit));
        expect(cardOf(byKey('limit-spent')), findsOneWidget);
        final bar = find.descendant(
          of: byKey('limit-summary'),
          matching: find.byType(LimitProgressBar),
        );
        expect(bar, findsOneWidget);
        final indicator = tester.widget<LinearProgressIndicator>(
          find.descendant(
            of: bar,
            matching: find.byType(LinearProgressIndicator),
          ),
        );
        final t = AppTokens.light;
        expect(indicator.color, over ? t.danger : t.success);
        expectSection('Réglages de la limite', Icons.tune_rounded);
        expect(cardOf(byKey('limit-kind')), findsOneWidget);
      },
    );
  }

  testWidgets('type de limite sur 390 points : « Hebdomadaire » sur une '
      'ligne, pas coupé au milieu (P8-08)', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await openLimits(tester, current: summary());
    final label = byKey('limit-kind-week');
    await tester.ensureVisible(label);
    await tester.pump();
    // Ni coupé en deux lignes, ni rogné : la case le réduit en entier.
    expect(
      tester.renderObject<RenderParagraph>(label).didExceedMaxLines,
      isFalse,
    );
  });

  testWidgets('aucune limite : dépensé seul, puis limite mensuelle au 28 '
      'sans récurrences', (tester) async {
    final (app, server) = await openLimits(tester, current: summary());
    expect(byKey('limit-none'), findsOneWidget);
    expect(textOf(tester, 'limit-spent'), contains('310,00'));
    expect(byKey('limit-amount'), findsNothing);

    await tester.tap(byKey('limit-kind-month'));
    await tester.pumpAndSettle();
    await tester.enterText(byKey('limit-amount'), '500');
    await chooseStartDay(tester, 'month', 'Le 28');
    await tester.tap(byKey('limit-include-recurring'));
    await tester.pumpAndSettle();
    server.current = summary(
      limit: 50000,
      startDay: 28,
      start: '2026-10-28',
      end: '2026-11-27',
      elapsed: 29,
    );
    await saveLimit(tester);
    await settle(tester, byKey('limit-pace'));

    final post = app.api.calls('POST $base').single.body! as Map;
    final id = post['id'] as String;
    expect(id, matches(uuidV7));
    expect({...post}..remove('id'), {
      'amount': 50000,
      'periodKind': 'month',
      'startDay': 28,
      'includeRecurring': false,
    });
    expect(find.text('Limite enregistrée.'), findsOneWidget);
    expect(
      textOf(tester, 'limit-spent'),
      matches(r'^310,00.€ dépensés sur 500,00.€$'),
    );
    expect(
      textOf(tester, 'limit-remaining'),
      matches(r'^Reste 190,00.€ avant la limite$'),
    );
    expect(
      textOf(tester, 'limit-pace'),
      '62 % de la limite consommée à 29 % du mois',
    );
    // Formulaire rechargé : la version du jour se modifie désormais.
    app.api.on(
      'PATCH $base/$id',
      (r) => FakeResponse(200, {
        ...server.versions.last,
        ...r.body! as Map<String, dynamic>,
      }),
    );
    await tester.enterText(byKey('limit-amount'), '450');
    await saveLimit(tester);
    await settleUntil(
      tester,
      () => app.api.calls('PATCH $base/$id').isNotEmpty,
    );
    expect(app.api.calls('PATCH $base/$id').single.body, {'amount': 45000});
    expect(app.api.calls('POST $base'), hasLength(1));
  });

  testWidgets('version du jour : PATCH des seuls champs modifiés', (
    tester,
  ) async {
    const todayId = '0190a000-0000-7000-8000-000000000200';
    final (app, server) = await openLimits(
      tester,
      current: summary(limit: 50000),
      versions: [
        version(),
        version(id: todayId, effectiveDate: today),
      ],
    );
    app.api.on(
      'PATCH $base/$todayId',
      (r) => FakeResponse(200, {
        ...version(id: todayId, effectiveDate: today),
        ...r.body! as Map<String, dynamic>,
      }),
    );
    expect(
      tester.widget<TextField>(byKey('limit-amount')).controller!.text,
      '500,00',
    );
    await tester.enterText(byKey('limit-amount'), '420,50');
    await saveLimit(tester);
    await settle(tester, find.text('Limite enregistrée.'));
    expect(app.api.calls('PATCH $base/$todayId').single.body, {
      'amount': 42050,
    });
    expect(app.api.calls('POST $base'), isEmpty);
    expect(server.versions, hasLength(2));
  });

  testWidgets('passage à l’hebdomadaire le mercredi : nouvelle version, '
      'appliquée à la prochaine période', (tester) async {
    final (app, server) = await openLimits(
      tester,
      current: summary(limit: 50000),
      versions: [version()],
    );
    await tester.tap(byKey('limit-kind-week'));
    await tester.pumpAndSettle();
    // Lundi par défaut (NF-FMT-04).
    expect(find.text('Lundi'), findsOneWidget);
    await chooseStartDay(tester, 'week', 'Mercredi');
    await tester.enterText(byKey('limit-amount'), '120');
    // Le serveur rattache la nouvelle règle à la période suivante (F-LIM-09).
    app.api.on('POST $base', (r) {
      final created = {
        ...version(
          id: (r.body! as Map)['id'] as String,
          effectiveDate: today,
          appliesFrom: '2026-12-01',
        ),
        ...r.body! as Map<String, dynamic>,
      };
      server.versions.add(created);
      return FakeResponse(201, created);
    });
    await saveLimit(tester);
    await settle(tester, byKey('limit-upcoming'));

    final post = app.api.calls('POST $base').single.body! as Map;
    expect(post['periodKind'], 'week');
    expect(post['startDay'], 3);
    expect(post['amount'], 12000);
    expect(
      textOf(tester, 'limit-upcoming'),
      "Ces réglages s'appliquent à partir du 1 déc. 2026.",
    );
    // La jauge en cours garde la limite mensuelle (en haut de la liste
    // paresseuse : y revenir).
    await tester.scrollUntilVisible(
      byKey('limit-pace'),
      -200,
      scrollable: find
          .ancestor(of: byKey('save-limit'), matching: find.byType(Scrollable))
          .first,
    );
    expect(textOf(tester, 'limit-pace'), contains('du mois'));
  });

  testWidgets('retirer la limite : version sans montant, jauge sans limite', (
    tester,
  ) async {
    final (app, server) = await openLimits(
      tester,
      current: summary(limit: 50000, spent: 61000),
      versions: [version(startDay: 28)],
    );
    expect(
      textOf(tester, 'limit-remaining'),
      matches(r'^Limite dépassée de 110,00.€$'),
    );
    await tester.tap(byKey('limit-kind-none'));
    await tester.pumpAndSettle();
    expect(byKey('limit-amount'), findsNothing);
    server.current = summary(spent: 61000);
    await saveLimit(tester);
    await settle(tester, byKey('limit-none'));
    final post = app.api.calls('POST $base').single.body! as Map;
    expect(post['amount'], isNull);
    // Règles de période gardées.
    expect(post['startDay'], 28);
    expect(post['periodKind'], 'month');
  });

  testWidgets('anglais : rythme hebdomadaire', (tester) async {
    await openLimits(
      tester,
      locale: const Locale('en'),
      current: summary(
        limit: 10000,
        spent: 4000,
        kind: 'week',
        start: '2026-11-02',
        end: '2026-11-08',
        elapsed: 57,
      ),
      versions: [version(kind: 'week', amount: 10000)],
    );
    expect(
      textOf(tester, 'limit-pace'),
      '40% of the limit used at 57% of the week',
    );
    expect(find.text('Monday'), findsOneWidget);
  });

  testWidgets('retour au type enregistré : son jour de début', (tester) async {
    await openLimits(
      tester,
      current: summary(limit: 50000, startDay: 15),
      versions: [version(startDay: 15)],
    );
    expect(find.text('Le 15'), findsOneWidget);
    await tester.tap(byKey('limit-kind-week'));
    await tester.pumpAndSettle();
    expect(find.text('Lundi'), findsOneWidget);
    await tester.tap(byKey('limit-kind-none'));
    await tester.pumpAndSettle();
    await tester.tap(byKey('limit-kind-month'));
    await tester.pumpAndSettle();
    expect(find.text('Le 15'), findsOneWidget);
  });
}
