import 'dart:io';

import 'token_store.dart';

/// Témoin d'installation, dans le dossier de l'app (supprimé à la désinstallation).
const installMarkerName = '.depenseo-installed';

/// Le trousseau iOS survit à la désinstallation de l'app : au premier lancement d'une
/// installation (témoin absent), les jetons hérités d'une installation précédente sont purgés.
Future<void> purgeTokensAfterReinstall(
  Directory appSupportDir,
  TokenStore tokens,
) async {
  final marker = File('${appSupportDir.path}/$installMarkerName');
  if (marker.existsSync()) return;
  await tokens.clear();
  await appSupportDir.create(recursive: true);
  await marker.writeAsString('1', flush: true);
}
