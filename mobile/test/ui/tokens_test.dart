// Jetons de la charte (docs/dev/UI.md, ADR-069) : tout couple texte/fond
// passe le contraste WCAG AA (4,5:1) dans les deux thèmes (NF-QUA-04).
import 'dart:math';

import 'package:depenseo/ui/theme.dart';
import 'package:depenseo/ui/tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  return (max(la, lb) + 0.05) / (min(la, lb) + 0.05);
}

void main() {
  for (final (name, tokens) in [
    ('clair', AppTokens.light),
    ('sombre', AppTokens.dark),
  ]) {
    group('thème $name', () {
      final surfaces = {
        'background': tokens.background,
        'surface': tokens.surface,
        'surfaceHigh': tokens.surfaceHigh,
      };
      final texts = {
        'text': tokens.text,
        'textMuted': tokens.textMuted,
        'primary': tokens.primary,
        'success': tokens.success,
        'danger': tokens.danger,
        'warning': tokens.warning,
      };
      for (final MapEntry(key: t, value: fg) in texts.entries) {
        for (final MapEntry(key: s, value: bg) in surfaces.entries) {
          test('$t sur $s ≥ 4,5:1', () {
            expect(contrast(fg, bg), greaterThanOrEqualTo(4.5));
          });
        }
      }

      // Icône d'une tuile (WCAG 1.4.11, 3:1) : couleur saturée sur sa teinte
      // (15 % en clair, 25 % en sombre) posée sur une carte.
      for (final MapEntry(key: t, value: c) in {
        'primary': tokens.primary,
        'success': tokens.success,
        'danger': tokens.danger,
        'warning': tokens.warning,
      }.entries) {
        test('icône $t sur sa tuile ≥ 3:1', () {
          final alpha = tokens == AppTokens.dark ? 0.25 : 0.15;
          final tile = Color.alphaBlend(
            c.withValues(alpha: alpha),
            tokens.surface,
          );
          expect(contrast(c, tile), greaterThanOrEqualTo(3));
        });
      }

      test('texte des boutons pleins ≥ 4,5:1', () {
        expect(
          contrast(tokens.onPrimary, tokens.primary),
          greaterThanOrEqualTo(4.5),
        );
      });

      test('texte blanc sur le départ du dégradé ≥ 4,5:1', () {
        expect(
          contrast(tokens.onGradient, tokens.primaryGradient.colors.first),
          greaterThanOrEqualTo(4.5),
        );
        // Grands montants (≥ 24 px) sur l'arrivée : 3:1 suffit (WCAG 1.4.3).
        expect(
          contrast(tokens.onGradient, tokens.primaryGradient.colors.last),
          greaterThanOrEqualTo(3),
        );
      });

      test('petits libellés : 4,5:1 jusqu’au milieu du dégradé (P8-04)', () {
        // Carte d'en-tête : libellés dans la moitié du départ (haut gauche).
        final gradient = tokens.primaryGradient.colors;
        for (final t in [0.25, 0.5]) {
          expect(
            contrast(
              tokens.onGradient,
              Color.lerp(gradient.first, gradient.last, t)!,
            ),
            greaterThanOrEqualTo(4.5),
          );
        }
      });
    });
  }

  test('le thème expose les jetons de sa luminosité', () {
    expect(
      buildTheme(Brightness.light).extension<AppTokens>(),
      AppTokens.light,
    );
    expect(buildTheme(Brightness.dark).extension<AppTokens>(), AppTokens.dark);
  });

  test('jetons interpolés (animation de changement de thème)', () {
    final mid = AppTokens.light.lerp(AppTokens.dark, 0.5);
    expect(
      mid.background,
      Color.lerp(AppTokens.light.background, AppTokens.dark.background, 0.5),
    );
    expect(AppTokens.light.lerp(null, 0.5), AppTokens.light);
  });
}
