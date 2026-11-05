import 'dart:io';
import 'dart:typed_data';
import 'dart:ui';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Remet un fichier produit par l'app à l'utilisateur (feuille de partage du
/// système : enregistrer dans Fichiers, envoyer par e-mail…).
abstract interface class FileSharer {
  Future<void> share(
    String fileName,
    String mimeType,
    Uint8List bytes, {
    Rect? origin,
  });

  /// Efface les copies laissées par les partages précédents.
  Future<void> clear();
}

/// Fichier écrit dans le cache de l'app (effacé avant chaque nouvel export,
/// la copie en clair ne doit pas s'accumuler), puis feuille de partage.
class SystemFileSharer implements FileSharer {
  const SystemFileSharer();

  @override
  Future<void> share(
    String fileName,
    String mimeType,
    Uint8List bytes, {
    Rect? origin,
  }) async {
    await clear();
    final dir = await _dir();
    dir.createSync(recursive: true);
    final file = File(p.join(dir.path, fileName));
    await file.writeAsBytes(bytes, flush: true);
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path, mimeType: mimeType)],
        sharePositionOrigin: origin,
      ),
    );
  }

  @override
  Future<void> clear() async {
    final dir = await _dir();
    if (dir.existsSync()) dir.deleteSync(recursive: true);
  }

  static Future<Directory> _dir() async =>
      Directory(p.join((await getTemporaryDirectory()).path, 'exports'));
}
