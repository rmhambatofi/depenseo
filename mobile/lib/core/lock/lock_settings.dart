/// Délai avant reverrouillage après passage en arrière-plan (F-AUTH-04).
enum LockDelay {
  immediate(Duration.zero),
  oneMinute(Duration(minutes: 1)),
  fiveMinutes(Duration(minutes: 5));

  const LockDelay(this.duration);

  final Duration duration;
}

/// Réglages du verrou. [enabled] découle de la présence d'un code (ADR-048).
class LockSettings {
  const LockSettings({
    this.enabled = false,
    this.delay = LockDelay.immediate,
    this.biometrics = false,
    this.blockScreenshots = false,
  });

  final bool enabled;
  final LockDelay delay;
  final bool biometrics;
  final bool blockScreenshots;

  LockSettings copyWith({
    bool? enabled,
    LockDelay? delay,
    bool? biometrics,
    bool? blockScreenshots,
  }) => LockSettings(
    enabled: enabled ?? this.enabled,
    delay: delay ?? this.delay,
    biometrics: biometrics ?? this.biometrics,
    blockScreenshots: blockScreenshots ?? this.blockScreenshots,
  );

  /// Préférences seules (sans [enabled]) : `v1;<délai>;<biométrie>;<captures>`.
  String encodePrefs() =>
      'v1;${delay.name};${biometrics ? 1 : 0};${blockScreenshots ? 1 : 0}';

  /// Préférences illisibles ou absentes → valeurs par défaut.
  static LockSettings decodePrefs(String? raw) {
    final parts = raw?.split(';');
    if (parts == null || parts.length != 4 || parts[0] != 'v1') {
      return const LockSettings();
    }
    final delay = LockDelay.values.where((d) => d.name == parts[1]);
    return LockSettings(
      delay: delay.isEmpty ? LockDelay.immediate : delay.first,
      biometrics: parts[2] == '1',
      blockScreenshots: parts[3] == '1',
    );
  }
}
