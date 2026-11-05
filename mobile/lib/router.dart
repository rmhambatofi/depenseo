import 'package:go_router/go_router.dart';

import 'features/home/home_screen.dart';

/// Routes de l'application. Aucun écran d'administration (F-ADM-02).
GoRouter buildRouter() => GoRouter(
  routes: [GoRoute(path: '/', builder: (context, state) => const HomeScreen())],
);
