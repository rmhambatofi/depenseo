# Depenseo — application mobile (Flutter)

Flutter 3, Riverpod, go_router, Drift + SQLCipher, dio. Hors ligne d'abord. Voir ADR-046.

```bash
flutter pub get
flutter gen-l10n                                        # après modification de lib/l10n/*.arb
dart run build_runner build --delete-conflicting-outputs # après modification des tables Drift
flutter analyze && flutter test
flutter run --dart-define=API_BASE_URL=https://api.exemple.fr
```

Le code généré (`*.g.dart`, `lib/l10n/generated/`) est committé ; la CI vérifie qu'il est à jour.
