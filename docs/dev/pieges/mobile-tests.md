# Pièges — app mobile : tests Flutter

## Lancer

- `flutter test --timeout` ne coupe pas un `testWidgets` bloqué : lancer en arrière-plan avec garde (`grep "All tests|Some tests"`).
- Dates : tout nouveau test de date → étiquette `tz` ; `mobile/tool/test_tz.sh` (aussi en CI) rejoue sous 4 `TZ` d'hôte (~1 min par fuseau). `group` n'accepte **pas** `tags:` : étiqueter chaque `testWidgets(…, tags: 'tz')` ou le fichier (`@Tags(['tz'])` + `library;`).
- Instables connus sous charge (suite complète), verts au relancement : `test/sync/sync_flow_test.dart` « demande reçue pendant un passage », `home_dashboard_test` « relu après une synchro réussie ». À surveiller, ne pas désactiver.
- Captures : `flutter test test/screenshots --dart-define=CAPTURE=../design-ref/captures/<nom>` (polices réelles, `debugDisableShadows` remis en `finally`, couche racine pour inclure le verrouillage).

## Harnais

- `test/support/test_app.dart` (`TestApp` : `FakeApi` par route, `FakeSocialSignIn`, coffre mémoire `memory_secure_store.dart`, `clock.advance`, `biometrics`, `screen`, `syncEnabled` faux par défaut, `syncRetryDelays`, `push` = `FakePushService` (token null), `files` = `FakeFileSharer`, `storeGateway` = `FakeStore`, `openedUrls`). Dans `TestApp`, la préférence de thème est lue par le contrôleur (Auto d'abord). `TestApp.pump(settleAfter: false)`.
- `TestApp.location` ne reflète pas un `context.push` : vérifier l'écran affiché. `app.router.go('/verify-email#token=…')`.
- Harnais par domaine : `test/support/settle.dart` (`settle`, `settleUntil`, `uuidV7`), `test/support/fake_sync_server.dart`, `test/limits/limit_harness.dart`, `test/recurring/recurring_harness.dart` (`RecurringServer.wire()` ; ids d'échéances **distincts**), `test/home/dashboard_fixture.dart`, `test/premium/premium_harness.dart`, `test/account/account_harness.dart` (`reveal`). Sans route `GET /subscriptions` dans `FakeApi` : 404 → état inconnu.
- Cycle de vie : `handleAppLifecycleStateChanged` dans l'ordre inactive→hidden→paused (`toBackground`/`toForeground` de `test/lock/app_lock_test.dart`).
- `FakeResponse.bytes` pour un fichier. `expect(map..remove('id'), …)` modifie le corps enregistré par `FakeApi`.

## Asynchronisme (la source n° 1 de blocages)

- **Base Drift réelle** : jamais `tester.runAsync(() => db…)` ni attendre la base dans un tap + `pumpAndSettle` → blocage. Utiliser `io(tester, action)` et `pumpIo(tester, until: finder)` (`test/expenses/quick_entry_harness.dart`). Écran qui lit la base à l'ouverture : `tester.tap` + `pumpIo(until: …)`, jamais `tap()` (pumpAndSettle). Attendre une écriture : `settleUntil(tester, () => …)` (un `find.text` déjà présent passe trop tôt).
- **Requête Dio réelle** (fausse API) : ni `io()` ni `pumpIo` n'avancent le minuteur zéro de Dio → `settleRequest(tester, finder)` (`test/expenses/expense_list_test.dart`), appel lancé sans l'attendre (`.ignore()`). Synchro : `drain(tester, app)` de `test/sync/sync_flow_test.dart` ; `tester.pump(durée > 0)` obligatoire (sinon « syncing » bloqué ou « Timer still pending »).
- **Jamais `tester.runAsync` autour d'un appel qui touche `TokenStore`** (verrou créé dans l'horloge simulée → blocage infini).
- Un indicateur qui tourne (bouton occupé, `/splash`) fait expirer `pumpAndSettle` : `tapAndPump`.
- `exportSleepProvider` neutralisé dans `TestApp`. Fin de parcours a11y : `_drainRequests` (sinon « Timer still pending »).

## Défilement et listes paresseuses

- `scrollUntilVisible` ne garantit pas une cible touchable : ajouter `ensureVisible`. Sur une liste paresseuse, `ensureVisible` seul échoue (« Bad state: No element ») : `scrollUntilVisible` d'abord, ou `reveal(tester, key)` sur l'écran Compte.
- Réglages `/settings` (et Compte, dernière entrée) : `scrollUntilVisible(…, scrollable: find.byType(Scrollable).last)`. Menu déroulant de 31 jours : idem.
- Accueil (`ListView` paresseux, clé `recent-expenses`) : `scrollable: find.descendant(of: find.byKey(...('recent-expenses')), matching: find.byType(Scrollable)).first`.
- `find.text` trouve aussi le texte d'un `TextField` : viser la ligne (`find.widgetWithText(ListTile, …)`).
- `tester.pageBack()` ne trouve pas le bouton retour de go_router : `Navigator.of(tester.element(…)).pop()`.
- Limites : `saveLimit` retire la SnackBar qui couvre le bouton.
- Tester un chargement « à froid » : partir d'un état d'erreur sans valeur.

## Accessibilité (ADR-063)

- `test/a11y/guidelines_test.dart` = `journeys` × clair/sombre × texte ×1/×2, défilement par demi-écran (`meetsGuideline` ignore le hors-écran). **Nouvel écran de parcours clé → l'ajouter à `journeys`.** `ensureSemantics()` : `dispose` en `try/finally`, pas `addTearDown`. Barre de progression : `semanticsValue` > 100 % → assertion. Check-list manuelle : `docs/dev/A11Y.md`.
- Bouton en fin de formulaire long : une SnackBar le couvre en bas d'écran (test 800×600) → `removeCurrentSnackBar` + `ensureVisible` avant le toucher (`tapSave` de `categories_screen_test.dart`). `Scrollable.ensureVisible(alignment: 0.5)` en bout de défilement donne un toucher manqué.
