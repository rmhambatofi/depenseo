// Interrogation d'un export (P6-12 ; ADR-036/057) et configuration légale.
import 'dart:typed_data';

import 'package:depenseo/core/account/account_api.dart';
import 'package:depenseo/features/account/legal_texts.dart';
import 'package:flutter_test/flutter_test.dart';

class _Job implements ExportJob {
  _Job(this.states);

  final List<ExportState> states;
  final List<String> calls = [];

  @override
  Future<ExportState> start() async {
    calls.add('start');
    return ExportState.pending;
  }

  @override
  Future<ExportState> status() async {
    calls.add('status');
    return states.length > 1 ? states.removeAt(0) : states.single;
  }

  @override
  Future<Uint8List> download() async {
    calls.add('download');
    return Uint8List.fromList([1]);
  }
}

void main() {
  Future<void> noSleep(Duration _) async {}

  test('attend l’état prêt puis télécharge', () async {
    final job = _Job([ExportState.pending, ExportState.ready]);
    final bytes = await runExport(
      job,
      delays: exportPollDelays,
      sleep: noSleep,
      cancelled: () => false,
    );
    expect(bytes, [1]);
    expect(job.calls, ['start', 'status', 'status', 'download']);
  });

  test('écran quitté : plus aucune requête', () async {
    final job = _Job([ExportState.pending]);
    var closed = false;
    final future = runExport(
      job,
      delays: exportPollDelays,
      sleep: (_) async => closed = true,
      cancelled: () => closed,
    );
    await expectLater(future, throwsA(isA<ExportCancelled>()));
    expect(job.calls, ['start']);
  });

  test('toujours en attente après la dernière interrogation', () async {
    final job = _Job([ExportState.pending]);
    final delays = <Duration>[];
    await expectLater(
      runExport(
        job,
        delays: exportPollDelays,
        sleep: (d) async => delays.add(d),
        cancelled: () => false,
      ),
      throwsA(
        isA<ExportUnavailable>().having(
          (e) => e.state,
          'state',
          ExportState.pending,
        ),
      ),
    );
    expect(job.calls, isNot(contains('download')));
    // ~5 min : la file des tâches est traitée chaque minute par le cron.
    final total = delays.fold(Duration.zero, (a, b) => a + b);
    expect(total, greaterThanOrEqualTo(const Duration(minutes: 5)));
  });

  test('release : éditeur et contact légaux obligatoires', () {
    expect(
      () => checkLegalConfig(release: true, publisher: '', contact: 'a@b.fr'),
      throwsStateError,
    );
    expect(
      () => checkLegalConfig(release: true, publisher: 'X', contact: ' '),
      throwsStateError,
    );
    checkLegalConfig(release: true, publisher: 'X', contact: 'a@b.fr');
    checkLegalConfig(release: false, publisher: '', contact: '');
  });
}
