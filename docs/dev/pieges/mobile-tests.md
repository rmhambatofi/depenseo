# Pièges — app mobile : tests Flutter

## Lancer

- **CI Linux ≠ macOS** pour `textContrastGuideline` : un texte réduit (`FittedBox`, police Ahem très large → ×0,5 dès ×1) passe en local et échoue en CI (4,34:1). Garder les libellés à ≥ 80 % de leur taille (test `limits_screen_test` « presque à taille réelle »).
- `io()` (`quick_entry_harness.dart`) : budget de **20 s réelles** (2,5 s ne suffisaient pas en CI avec couverture). Après un message (SnackBar) suivi d'une relecture de liste, attendre la disparition par `settleUntil`, pas `findsNothing` direct.
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

- Barre du bas (P8-03) : la zone visible des onglets perd ~80 px ; un élément de tête de liste peut sortir de l'écran après `ensureVisible` d'un bouton du bas → `find.byKey(k, skipOffstage: false)`. Onglets : `open-home`, `open-expenses`, `open-limits`, `open-recurring` (`add-expense` = « + »). Pour tester une **première** lecture en échec d'un onglet, modifier la route avant d'ouvrir (`openRecurring(beforeOpen:, until:)`) : un retour sur l'onglet garde la valeur précédente.

- Liste des dépenses (P8-05) : groupée par jour, elle s'ouvre sur le **mois courant** (horloge `TestApp` = 2026-11-05) ; une dépense hors du mois n'apparaît qu'avec `month-previous`/`month-next` ou une période de filtre. Dernière tuile souvent hors écran (800×600) : `ensureVisible` avant le toucher (`openExpenseTile`) ; test de mise en page : `tester.view.physicalSize` agrandi + `addTearDown(tester.view.reset)`. Clé posée **sur** un `Text` : `find.descendant(…, matchRoot: true)`.
- Écrans en cartes groupées (P8-06) : listes plus hautes → une ligne basse n'est plus construite à l'ouverture (`tapUntil` du compte révèle d'abord, journée a11y « récurrentes » attend `no-occurrence`, pas `reminder-time`) et une ligne atteinte par `scrollUntilVisible` peut avoir son centre hors écran (`lock-screenshots`) → `ensureVisible`. Repères de style : `test/support/style_finders.dart` (`cardOf`, `expectSameCard`, `iconTileIn`, `expectSection`).
- `tester.ensureVisible` ne fait que demander le défilement : il n'est appliqué qu'à la frame suivante → `pump()` avant un `tap` brut (`revealLink` de `test_app.dart` pour les liens sous la carte de connexion, P8-07). Ne **pas** ajouter ce `pump` dans `tap`/`tapAndPump` partagés : 4 tests de `categories_screen_test` cassent.
- `scrollUntilVisible` ne garantit pas une cible touchable : ajouter `ensureVisible`. Sur une liste paresseuse, `ensureVisible` seul échoue (« Bad state: No element ») : `scrollUntilVisible` d'abord, ou `reveal(tester, key)` sur l'écran Compte.
- Réglages `/settings` (et Compte, dernière entrée) : `scrollUntilVisible(…, scrollable: find.byType(Scrollable).last)`. Menu déroulant de 31 jours : idem.
- Accueil (`ListView` paresseux, clé `recent-expenses`) : `scrollable: find.descendant(of: find.byKey(...('recent-expenses')), matching: find.byType(Scrollable)).first`.
- `textOf` (`limit_harness.dart`) lit le premier `Text` sous la clé : marche pour `AmountText`. Sémantique : vérifier aussi qu'un nœud **ne contient pas** le texte d'une section voisine (fusion silencieuse si aucun conteneur sémantique).
- Vérification visuelle rapide d'un écran : `flutter test test/screenshots --dart-define=CAPTURE=../design-ref/captures/<dossier> --plain-name <parcours>` puis lire les PNG (texte ×2 révèle les montants coupés : `FittedBox(scaleDown)`).
- Recette P8-08 : un parcours ouvert à texte ×2 attend souvent un élément de liste paresseuse **non construit** (`openRecurring` sans `until`, `openSubscription` avec `ensureVisible` seul, `openList` sur `expense-$e1`) → attendre un élément présent en haut (`until:`, `find.byType(ExpenseTile)`) ou `reveal` d'abord. Planche-contact des 84 captures : PIL (`python3 -I`), pas d'ImageMagick ici.
- Test « petit téléphone clavier ouvert » : `tester.view.viewInsets = FakeViewPadding(bottom: …)` **après** l'ouverture, puis `pump()` (`test/expenses/quick_entry_layout_test.dart`).
- `find.text` trouve aussi le texte d'un `TextField` : viser la ligne (`find.widgetWithText(ListTile, …)`).
- `tester.pageBack()` ne trouve pas le bouton retour de go_router : `Navigator.of(tester.element(…)).pop()`.
- Limites : `saveLimit` retire la SnackBar qui couvre le bouton.
- Tester un chargement « à froid » : partir d'un état d'erreur sans valeur.

## Accessibilité (ADR-063)

- `test/a11y/guidelines_test.dart` = `journeys` × clair/sombre × texte ×1/×2, défilement par demi-écran (`meetsGuideline` ignore le hors-écran). **Nouvel écran de parcours clé → l'ajouter à `journeys`.** `ensureSemantics()` : `dispose` en `try/finally`, pas `addTearDown`. Barre de progression : `semanticsValue` > 100 % → assertion. Check-list manuelle : `docs/dev/A11Y.md`.
- Bouton en fin de formulaire long : une SnackBar le couvre en bas d'écran (test 800×600) → `removeCurrentSnackBar` + `ensureVisible` avant le toucher (`tapSave` de `categories_screen_test.dart`). `Scrollable.ensureVisible(alignment: 0.5)` en bout de défilement donne un toucher manqué.
