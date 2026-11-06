import 'package:flutter/material.dart';

/// Jetons de couleur de la charte (docs/dev/UI.md, ADR-069), lus par
/// `AppTokens.of(context)`. Les couleurs de texte ont été foncées (clair) ou
/// éclaircies (sombre) par rapport aux valeurs de départ pour passer 4,5:1 sur
/// toutes les surfaces (`test/ui/tokens_test.dart`).
@immutable
class AppTokens extends ThemeExtension<AppTokens> {
  const AppTokens({
    required this.primary,
    required this.onPrimary,
    required this.primaryGradient,
    required this.background,
    required this.surface,
    required this.surfaceHigh,
    required this.text,
    required this.textMuted,
    required this.success,
    required this.danger,
    required this.warning,
    required this.cardShadow,
  });

  /// Couleur d'accent (boutons pleins, liens, onglet actif).
  final Color primary;

  /// Texte posé sur [primary].
  final Color onPrimary;

  /// Carte d'en-tête de l'accueil et bouton « + » (135°).
  final LinearGradient primaryGradient;

  /// Texte et icônes sur [primaryGradient] (blanc dans les deux thèmes :
  /// ≥ 4,5:1 au départ, ≥ 3:1 à l'arrivée).
  Color get onGradient => const Color(0xFFFFFFFF);

  /// Fond des écrans.
  final Color background;

  /// Cartes, feuilles, barre de navigation.
  final Color surface;

  /// Tuiles, champs, éléments posés dans une carte.
  final Color surfaceHigh;

  final Color text;
  final Color textMuted;

  /// Sous la limite.
  final Color success;

  /// Dépassement (texte).
  final Color danger;

  /// Seuil d'alerte atteint.
  final Color warning;

  /// Ombre des cartes ; vide en sombre (surface plus claire que le fond).
  final List<BoxShadow> cardShadow;

  static const light = AppTokens(
    primary: Color(0xFF6355E0),
    onPrimary: Color(0xFFFFFFFF),
    primaryGradient: LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFF5B4BEA), Color(0xFF7B6BF5)],
    ),
    background: Color(0xFFF5F4FB),
    surface: Color(0xFFFFFFFF),
    surfaceHigh: Color(0xFFEFEDFB),
    text: Color(0xFF17162A),
    textMuted: Color(0xFF6B6881),
    success: Color(0xFF0B7A59),
    danger: Color(0xFFC13840),
    warning: Color(0xFF926119),
    cardShadow: [
      BoxShadow(
        color: Color(0x146D5DF6), // rgba(109, 93, 246, 0.08)
        offset: Offset(0, 8),
        blurRadius: 24,
      ),
    ],
  );

  static const dark = AppTokens(
    primary: Color(0xFF8C7EFF),
    onPrimary: Color(0xFF0F1020),
    primaryGradient: LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFF4F3FD8), Color(0xFF6E5EF0)],
    ),
    background: Color(0xFF0F1020),
    surface: Color(0xFF1A1B2E),
    surfaceHigh: Color(0xFF23253B),
    text: Color(0xFFF2F1FA),
    textMuted: Color(0xFFA3A0BC),
    success: Color(0xFF2FD3A0),
    danger: Color(0xFFFF7A80),
    warning: Color(0xFFF5B547),
    cardShadow: [],
  );

  static AppTokens of(BuildContext context) =>
      Theme.of(context).extension<AppTokens>() ??
      (Theme.of(context).brightness == Brightness.dark ? dark : light);

  @override
  AppTokens copyWith({
    Color? primary,
    Color? onPrimary,
    LinearGradient? primaryGradient,
    Color? background,
    Color? surface,
    Color? surfaceHigh,
    Color? text,
    Color? textMuted,
    Color? success,
    Color? danger,
    Color? warning,
    List<BoxShadow>? cardShadow,
  }) => AppTokens(
    primary: primary ?? this.primary,
    onPrimary: onPrimary ?? this.onPrimary,
    primaryGradient: primaryGradient ?? this.primaryGradient,
    background: background ?? this.background,
    surface: surface ?? this.surface,
    surfaceHigh: surfaceHigh ?? this.surfaceHigh,
    text: text ?? this.text,
    textMuted: textMuted ?? this.textMuted,
    success: success ?? this.success,
    danger: danger ?? this.danger,
    warning: warning ?? this.warning,
    cardShadow: cardShadow ?? this.cardShadow,
  );

  @override
  AppTokens lerp(covariant AppTokens? other, double t) {
    if (other == null) return this;
    Color c(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppTokens(
      primary: c(primary, other.primary),
      onPrimary: c(onPrimary, other.onPrimary),
      primaryGradient: LinearGradient.lerp(
        primaryGradient,
        other.primaryGradient,
        t,
      )!,
      background: c(background, other.background),
      surface: c(surface, other.surface),
      surfaceHigh: c(surfaceHigh, other.surfaceHigh),
      text: c(text, other.text),
      textMuted: c(textMuted, other.textMuted),
      success: c(success, other.success),
      danger: c(danger, other.danger),
      warning: c(warning, other.warning),
      cardShadow: BoxShadow.lerpList(cardShadow, other.cardShadow, t)!,
    );
  }
}

/// Rayons de la charte.
abstract final class AppRadius {
  static const double card = 24;
  static const double tile = 16;
  static const double button = 16;
  static const double field = 14;
  static const double navIndicator = 20;
}

/// Espacements de la charte.
abstract final class AppSpacing {
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 24;
}

/// Tailles d'éléments répétés (UI.md) : tuile d'icône des lignes de réglages
/// et de listes groupées (40, comme les badges de catégorie des listes ;
/// 48–56 réservé aux tuiles mises en avant).
abstract final class AppSizes {
  static const double rowTile = 40;

  /// Retrait du filet d'une carte groupée : aligné sur le texte après la
  /// tuile (marge de `ListTile` + tuile + marge).
  static const double rowTextInset = AppSpacing.md + rowTile + AppSpacing.md;

  /// Espace libre en bas d'une liste pour le bouton flottant.
  static const double fabClearance = 88;
}
