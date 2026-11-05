import 'package:local_auth/local_auth.dart';

/// Authentification biométrique de l'appareil (Face ID, Touch ID, empreinte).
abstract interface class BiometricAuth {
  Future<bool> isAvailable();

  /// `true` seulement si l'utilisateur est reconnu ; annulation ou erreur → `false`.
  Future<bool> authenticate(String reason);
}

class PlatformBiometricAuth implements BiometricAuth {
  final _auth = LocalAuthentication();

  @override
  Future<bool> isAvailable() async {
    try {
      return await _auth.canCheckBiometrics &&
          (await _auth.getAvailableBiometrics()).isNotEmpty;
    } on Exception {
      return false;
    }
  }

  @override
  Future<bool> authenticate(String reason) async {
    try {
      // Le code de l'app sert de repli, jamais celui de l'appareil (ADR-048).
      return await _auth.authenticate(
        localizedReason: reason,
        biometricOnly: true,
      );
    } on Exception {
      return false;
    }
  }
}
