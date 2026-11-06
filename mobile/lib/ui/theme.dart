import 'package:flutter/material.dart';

import 'tokens.dart';

/// Police embarquée (assets/fonts, SIL OFL 1.1, ADR-069).
const appFontFamily = 'PlusJakartaSans';

/// Thème complet de la charte (docs/dev/UI.md) pour [brightness].
ThemeData buildTheme(Brightness brightness) {
  final t = brightness == Brightness.dark ? AppTokens.dark : AppTokens.light;
  final scheme =
      ColorScheme.fromSeed(
        seedColor: t.primary,
        brightness: brightness,
      ).copyWith(
        primary: t.primary,
        onPrimary: t.onPrimary,
        secondary: t.primary,
        onSecondary: t.onPrimary,
        surface: t.surface,
        onSurface: t.text,
        onSurfaceVariant: t.textMuted,
        surfaceContainerLowest: t.surface,
        surfaceContainerLow: t.surface,
        surfaceContainer: t.surface,
        surfaceContainerHigh: t.surfaceHigh,
        surfaceContainerHighest: t.surfaceHigh,
        error: t.danger,
        onError: t.onPrimary,
        outline: t.textMuted,
        outlineVariant: t.surfaceHigh,
      );
  final base = ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    fontFamily: appFontFamily,
  );
  final text = base.textTheme.apply(
    bodyColor: t.text,
    displayColor: t.text,
    fontFamily: appFontFamily,
  );
  final buttonShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(AppRadius.button),
  );
  const buttonText = TextStyle(
    fontFamily: appFontFamily,
    fontSize: 16,
    fontWeight: FontWeight.w600,
  );
  const buttonSize = Size(64, 52);
  OutlineInputBorder field([BorderSide side = BorderSide.none]) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.field),
        borderSide: side,
      );

  return base.copyWith(
    scaffoldBackgroundColor: t.background,
    canvasColor: t.background,
    textTheme: text,
    extensions: [t],
    appBarTheme: AppBarTheme(
      backgroundColor: t.background,
      foregroundColor: t.text,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: text.titleLarge?.copyWith(
        fontSize: 20,
        fontWeight: FontWeight.w600,
      ),
    ),
    cardTheme: CardThemeData(
      color: t.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: buttonSize,
        shape: buttonShape,
        textStyle: buttonText,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: buttonSize,
        shape: buttonShape,
        textStyle: buttonText,
        elevation: 0,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: buttonSize,
        shape: buttonShape,
        textStyle: buttonText,
        side: BorderSide(color: t.surfaceHigh, width: 1.5),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        shape: buttonShape,
        textStyle: buttonText.copyWith(fontSize: 14),
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        backgroundColor: t.surface,
        foregroundColor: t.text,
        selectedBackgroundColor: t.primary.withValues(alpha: 0.18),
        selectedForegroundColor: t.text,
        side: BorderSide(color: t.surfaceHigh, width: 1.5),
        shape: buttonShape,
        textStyle: buttonText.copyWith(fontSize: 14),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: t.surfaceHigh,
      border: field(),
      enabledBorder: field(),
      disabledBorder: field(),
      focusedBorder: field(BorderSide(color: t.primary, width: 1.5)),
      errorBorder: field(BorderSide(color: t.danger)),
      focusedErrorBorder: field(BorderSide(color: t.danger, width: 1.5)),
      labelStyle: TextStyle(color: t.textMuted),
      hintStyle: TextStyle(color: t.textMuted),
      helperStyle: TextStyle(color: t.textMuted),
      errorStyle: TextStyle(color: t.danger),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? t.onPrimary : t.textMuted,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? t.primary : t.surfaceHigh,
      ),
      trackOutlineColor: WidgetStateProperty.resolveWith(
        (s) =>
            s.contains(WidgetState.selected) ? Colors.transparent : t.textMuted,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      indicatorColor: t.primary.withValues(alpha: 0.15),
      indicatorShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.navIndicator),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(
          color: s.contains(WidgetState.selected) ? t.primary : t.textMuted,
        ),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontFamily: appFontFamily,
          fontSize: 12,
          fontWeight: s.contains(WidgetState.selected)
              ? FontWeight.w600
              : FontWeight.w500,
          color: s.contains(WidgetState.selected) ? t.primary : t.textMuted,
        ),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: t.surface,
      showDragHandle: true,
      dragHandleColor: t.textMuted,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppRadius.card),
        ),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: t.textMuted,
      textColor: t.text,
      subtitleTextStyle: text.bodyMedium?.copyWith(color: t.textMuted),
    ),
    dividerTheme: DividerThemeData(color: t.surfaceHigh, thickness: 1),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: t.primary,
      linearTrackColor: t.surfaceHigh,
      borderRadius: BorderRadius.circular(8),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: t.surfaceHigh,
      side: BorderSide.none,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.field),
      ),
    ),
  );
}
