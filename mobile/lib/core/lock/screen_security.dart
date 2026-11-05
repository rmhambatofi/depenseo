import 'dart:io';

import 'package:flutter/services.dart';

/// Blocage des captures d'écran (NF-SEC-05). Android seulement : iOS n'offre pas d'API.
abstract interface class ScreenSecurity {
  bool get supported;
  Future<void> setSecure(bool secure);
}

class PlatformScreenSecurity implements ScreenSecurity {
  static const _channel = MethodChannel('fr.depenseo/screen_security');

  @override
  bool get supported => Platform.isAndroid;

  @override
  Future<void> setSecure(bool secure) async {
    if (!supported) return;
    await _channel.invokeMethod<void>('setSecure', secure);
  }
}
