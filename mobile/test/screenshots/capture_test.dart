// Captures d'écran des parcours clés (phase 8, recette visuelle) : rendu
// réel avec les polices, sur le faux serveur des tests. Sans `CAPTURE`, aucun
// test n'est déclaré (rien d'ignoré dans la suite). Voir docs/dev/UI.md.
//
//   flutter test test/screenshots --dart-define=CAPTURE=../design-ref/captures/<nom>
//
// Écrit `<parcours> (<clair|sombre>, texte ×<n>).png` (390×844 points, ×2).
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import '../a11y/guidelines_test.dart' show journeys;

const _out = String.fromEnvironment('CAPTURE');

/// Les tests n'affichent que la police Ahem : charger les vraies polices.
Future<void> _loadFonts() async {
  final sdk = File(Platform.resolvedExecutable).parent.parent.parent.parent;
  final material = '${sdk.path}/artifacts/material_fonts';
  Future<void> family(String name, List<String> files) async {
    final loader = FontLoader(name);
    for (final f in files) {
      final file = File(f.startsWith('assets/') ? f : '$material/$f');
      if (!file.existsSync()) {
        fail(
          'Police introuvable : ${file.path} (organisation du SDK changée ?)',
        );
      }
      final bytes = file.readAsBytesSync();
      loader.addFont(Future.value(ByteData.sublistView(bytes)));
    }
    await loader.load();
  }

  await family('MaterialIcons', ['MaterialIcons-Regular.otf']);
  await family('Roboto', [
    for (final w in ['Regular', 'Medium', 'Bold']) 'Roboto-$w.ttf',
  ]);
  if (File('assets/fonts/PlusJakartaSans-Regular.ttf').existsSync()) {
    await family('PlusJakartaSans', [
      for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold'])
        'assets/fonts/PlusJakartaSans-$w.ttf',
    ]);
  }
}

void main() {
  if (_out.isEmpty) return;
  setUpAll(_loadFonts);

  for (final MapEntry(key: name, value: open) in journeys.entries) {
    for (final dark in [false, true]) {
      for (final scale in [1.0, 2.0]) {
        final variant = '${dark ? 'sombre' : 'clair'}, texte ×${scale.toInt()}';
        testWidgets('$name ($variant)', (tester) async {
          tester.view.physicalSize = const Size(780, 1688);
          tester.view.devicePixelRatio = 2;
          tester.platformDispatcher.platformBrightnessTestValue = dark
              ? Brightness.dark
              : Brightness.light;
          tester.platformDispatcher.textScaleFactorTestValue = scale;
          addTearDown(tester.view.reset);
          addTearDown(tester.platformDispatcher.clearAllTestValues);
          // Vraies ombres (les tests les remplacent par un contour noir ;
          // la valeur est vérifiée avant les teardowns : `finally`).
          debugDisableShadows = false;
          final ui.Image? image;
          try {
            await open(tester);
            await tester.pump(const Duration(milliseconds: 500));
            // Couche racine (en pixels physiques) : inclut l'écran de
            // verrouillage, posé hors du Navigator.
            final layer = tester.binding.renderViews.first.debugLayer!;
            image = await tester.runAsync(
              () => (layer as OffsetLayer).toImage(
                Offset.zero & tester.view.physicalSize,
              ),
            );
          } finally {
            debugDisableShadows = true;
          }
          final png = await tester.runAsync(
            () => image!.toByteData(format: ui.ImageByteFormat.png),
          );
          File('$_out/$name ($variant).png')
            ..createSync(recursive: true)
            ..writeAsBytesSync(png!.buffer.asUint8List());
          // Laisse aboutir les requêtes encore en vol (minuteur zéro de Dio).
          for (var i = 0; i < 10; i++) {
            await tester.pump(const Duration(milliseconds: 10));
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(milliseconds: 10)),
            );
          }
        });
      }
    }
  }
}
