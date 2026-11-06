# Pièges — app mobile Flutter (code)

Tests widget : `mobile-tests.md`. Phase 8 (refonte visuelle) : lire aussi `docs/dev/UI.md`.

## Règles générales

- `mobile/` ne doit **jamais** contenir la chaîne `/admin` (même en commentaire).
- Aucun calcul de total, limite, pourcentage ou période sur le téléphone : lire l'API (ajouter à `/dashboard` si besoin).
- **Thème (P8-01, ADR-069)** : couleurs **uniquement** via `AppTokens.of(context)` / `Theme.of(context).colorScheme` (jamais `Color(0x…)` dans un écran) ; widgets `AppCard`, `IconTile`, `SectionHeader`, `AmountText` dans `lib/ui/`. Nouveau couple texte/fond → `test/ui/tokens_test.dart`. Préférence `ui.theme` du coffre lue dans `main()` (borne 300 ms) puis `initialThemeModeProvider`.
- **Dates** (ADR-059) : afficher/analyser une date **uniquement** via `lib/core/dates/date_display.dart` (`parsePlainDate`, `formatCalendarDate(d, locale, {long})`, `formatInstantDate(tz, instant, locale)`) et `today.dart` (`todayIn(tz, instant)`, `formatPlainDate`). Paquet `timezone` base `latest_all` (`latest_10y` n'a pas `America/Montreal`).
- Montant : `parseAmountInput` Dart (`lib/core/money/`, table ISO comparée à `packages/shared` par test). UUID v7 : `idGeneratorProvider`.
- Textes : `lib/l10n/app_fr.arb` (modèle) + `app_en.arb` puis `flutter gen-l10n` (aussi après un `sed` sur un `.arb`). Code généré committé (CI : diff vide + `dart format --set-exit-if-changed lib test`). Ne pas coder de prix dans les textes (prix localisés du store).
- Riverpod 3 : relance seul un `FutureProvider` en erreur → `retry: (_, _) => null` quand l'écran propose « Réessayer ». `ProviderOrFamily` s'importe de `package:flutter_riverpod/misc.dart`. `invalidate` garde la valeur précédente (`AsyncError` avec `value`).
- Écriture en ligne type `writeLimit` : lire les providers **avant** le premier `await`, garder `ref.invalidate` par `ref.context.mounted` (sinon `StateError` si l'écran est fermé) ; ou invalider via le conteneur racine (`ProviderScope.containerOf`, lu avant le premier `await`).
- Formulaire long : `SingleChildScrollView` (un `ListView` paresseux détruit les champs hors écran → erreurs invisibles). Données d'un formulaire : lire la base **une fois** (pas de `watch` d'un provider invalidé par la synchro), rendre sur `AsyncValue(:final value?)`.
- **Sélecteur d'heure en saisie** : forcer `alwaysUse24HourFormat` selon la langue (bogue Flutter, « 07 » → 19:00).

## Socle (ADR-046 à 048)

- SQLCipher via `hooks.user_defines.sqlite3.source: sqlcipher` (pubspec) — **ne pas** ajouter `sqlcipher_flutter_libs` (eol). Marche aussi dans `flutter test`. Base : `openLocalDatabase(dir, DatabaseKeyProvider(secure))` ; tables Drift dans `lib/core/db/app_database.dart` puis `dart run build_runner build --delete-conflicting-outputs`.
- Auth : `createApiClient(…, onSessionExpired, adapter)` rafraîchit sur 401 (un seul refresh en vol) ; `TokenStore` à **générations** (`saveIfCurrent`/`clearIfCurrent`) : jamais écrire les jetons hors `TokenStore`. `authControllerProvider` → redirections pures `authRedirect` (`lib/router.dart`) : nouvelle route = la classer dans `_signedOutOnly`/`_emailLinks`, sinon elle exige une session. Ouvrir la base depuis `AuthController` bloque les tests d'auth (d'où le marqueur dans le coffre). Ne **pas** lire `syncControllerProvider` depuis `AuthController` (dépendance circulaire).
- Contexte du compte : `accountContextProvider` protégé par `account.epoch` (`AccountEpoch`) : ne **jamais** lire `account.*` sans `AccountContextRepository` ; lire l'`epoch` **après** `accountContextProvider`.
- Verrou : `appLockProvider` (opérations sérialisées par `_serial` ; toute mise à jour de préférences = fonction appliquée **dans** la file). `LockGate` dans `MaterialApp.builder` = **hors Navigator/Overlay** : pas de `Tooltip`/dialogue/`IconButton.tooltip` dans l'écran de verrouillage. Horloge : `clockProvider`. Android : `MainActivity` = `FlutterFragmentActivity` + canal `fr.depenseo/screen_security`.

## Données et synchro (ADR-049 à 051)

- Tables Drift `categories`/`expenses` (`pending_sync`, `tags` JSON, horodatages ISO ms). Écritures locales **uniquement** via `ExpenseStore` (`lib/core/db/expense_store.dart`) ; elles ignorent les lignes à `deleted_at`. Après écriture : `refreshLocalExpenses(ref.invalidate)` puis `syncControllerProvider.notifier.request()`.
- `SyncEngine` (`lib/core/sync/`, conflits `sync_rows.dart` `_localWins` + `base_updated_at`) ; `SyncController` (`lib/features/sync/`). Point de reprise `sync.v1.<carnet>.since` : **incrémenter `syncFormat`** quand une table locale alimentée par la synchro est ajoutée.
- Suppression = `deleteWithUndo` (`pending_deletions.dart`, différée 5 s ; SnackBar `persist: false` obligatoire).
- **Navigation (P8-03)** : coquille `StatefulShellRoute` (`features/shell/app_shell.dart`), onglets `/`, `/expenses`, `/limits`, `/recurring` (+ `new`, `:recurringId` sur le navigateur racine). Saisie `/expenses/new` et `/expenses/:expenseId` à plat, hors coquille ; `QuickEntryScreen(expenseId:)` réutilisé en modification. Passer d'un onglet à l'autre : `openTab(ref, shell, AppTab.x)` (relit Limites/Récurrentes) ; depuis un écran d'onglet, `StatefulNavigationShell.of(context).widget`. Les écrans d'onglet ne sont jamais fermés (pas de `BackButton`) : ils restent montés hors écran (`Offstage`).

## Écrans en ligne (ADR-052 à 058)

- Catégories : écritures en ligne via `writeCategory` (`category_providers.dart`, `storeCategoryFromApi`, puis `refreshCategories` + synchro). `CategoryDto` n'a ni `position` ni `updatedAt`.
- Limites : tout en ligne (`limitOverviewProvider`, `writeLimit`, `planLimitWrite`). Récurrences : tout en ligne (`recurringOverviewProvider`, `writeRecurring`, `payExpenseIdsProvider`).
- Accueil (P8-04) : carte d'en-tête `home_header.dart` (clés `limit-summary`, `limit-spent` = montant seul, `limit-amount`, `limit-remaining`, `limit-pace`, `home-period`, `home-spent`, `period-previous`/`period-next`), sélecteur = index dans `evolution` (aucun appel API), petits libellés blancs dans la moitié « départ » du dégradé seulement (voile des cercles décoratifs : les garder loin des libellés). `AppCard` et la carte d'en-tête sont des **conteneurs sémantiques** : sans eux, tout un `ListView` d'accueil devient un seul nœud lu d'un bloc.
- Liste (P8-05, ADR-070) : `expenseMonthOffsetProvider` + `expenseMonthProvider` (`AAAA-MM`, fuseau du compte) ; bornes `monthBounds` comparées comme chaînes ; `filter.hasPeriod` remplace le mois. `LocalExpenseItem.category` (catégorie entière, plus `categoryName`). `ExpenseTile` partagée accueil/liste : `MergeSemantics` porte la clé `expense-<id>` ; colonne montant/date en `Flexible` + `FittedBox` (sinon débordement en texte ×2).
- Accueil : `dashboardProvider` (copie `app_meta` `dashboard.v1.<carnet>`, repli `stale`), invalidé après une synchro **réussie** ; dernières dépenses = copie locale.
- Push : `firebase_core` 4.15.2 / `firebase_messaging` 16.7.1 **épinglés** (5.x/17.x → conflit SPM avec GoogleSignIn-iOS 9). Config par dart-defines `FIREBASE_*`, sinon `DisabledPushService`. `DeviceRegistrar` (`push_registration.dart`).
- Compte : exports via `AccountApi` + `runExport` puis `FileSharer` ; suppression `AuthController.accountDeleted(settleSync:)`. Textes légaux `legal_texts.dart` (brouillons, juriste requis) ; release : dart-defines `LEGAL_PUBLISHER`/`LEGAL_CONTACT_EMAIL` obligatoires (`checkLegalConfig`).
- Premium : droits **lus** sur `GET /subscriptions` (`subscriptionStatusProvider`), jamais calculés ; `StoreGateway` (`lib/core/premium/`, `InAppPurchaseGateway` = in_app_purchase 3.3.1) ; `PurchaseHandler` : 200 → close, 400/409 → close + message, hors ligne/503 → laissée ouverte. `in_app_purchase_android`/`_storekit` en dépendances **directes** : versions alignées sur celles tirées par in_app_purchase ; iOS non close = `StorePurchase(handle: SK2Transaction)` clos par `SK2Transaction.finish`.
- Sentry (ADR-064) : `lib/core/observability/sentry_config.dart` (`SentryFlutter.init` si `--dart-define=SENTRY_DSN`). Les erreurs natives contournent `beforeSend` Dart : réglages serveur obligatoires (voir `DEPLOY.md`).

## Build

- Premier build iOS ~6 min (SPM), Android ~6 min. Mesure de démarrage : `integration_test/startup_perf_test.dart` (`flutter test integration_test/… -d <id>`). Pas d'appareil Android ni `--profile` ici.
- Simulateur iOS pour des captures sans API locale impossible (lecture de `.env.example` refusée) : passer par le harnais de captures.

## Reliquats mineurs

- Un 401 d'une requête partie avec la session A, reçu après connexion B, est rejoué avec le jeton de B (relever la génération dans `onRequest` si besoin).
- Récurrences : `_newId` gardé si l'utilisateur modifie puis réessaie après réponse perdue ; N+1 lectures des échéances.
- `gauge.otherCurrencies` non affiché (devises hors MVP).
