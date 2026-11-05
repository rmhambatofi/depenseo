# Performance (NF-PERF-01, NF-PERF-02, P7-06, ADR-065)

## NF-PERF-02 — p95 de l'API < 300 ms

Banc : `apps/api/bench/p95.bench.ts`, lancé par `pnpm --filter api bench` (en CI après `pnpm test`,
base MariaDB 10.6 de `docker-compose.yml`). Échoue si une route dépasse 300 ms au p95, répond en
erreur ou est mesurée moins de 50 fois.

- Données : un compte, son carnet personnel, **10 000 dépenses** sur deux ans glissants (1 sur 50
  supprimée logiquement, une note sur trois, 7 commerçants), plan de catégories par défaut, limite
  globale à deux versions (l'une datée d'il y a un an).
- Routes : accueil (`GET …/dashboard`), liste (`GET …/expenses`), recherche (`q`, période d'un an,
  100 lignes), synchronisation complète (1re page de 500 lignes), catégories, limites en cours avec 12 périodes passées (`?past=12`),
  saisie (`POST …/expenses`, une nouvelle dépense par appel).
- Charge : 4 connexions simultanées, 5 s par route (`BENCH_CONNECTIONS`, `BENCH_DURATION_S`),
  après 10 appels de chauffe par route (NF-PERF-02 exclut le premier appel après une mise en veille).
- p95 exact (rang supérieur) sur la durée de chaque réponse, pas les centiles d'autocannon (p90/p97,5).
- `BENCH_REPORT=<fichier.json>` écrit les résultats.

Mesure du 2026-11-05 (MacBook de développement, **Node 26.10** — la cible est Node 22, celle de la
CI et d'o2switch —, MariaDB 10.6.28 sous Docker), en ms :

| Route | Appels | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| accueil | 482 | 40,8 | 50,7 | 59,9 | 80,0 |
| liste | 1 611 | 11,9 | 17,5 | 25,1 | 40,6 |
| recherche | 1 155 | 16,7 | 23,3 | 29,5 | 45,1 |
| synchro complète (1re page) | 402 | 47,3 | 65,4 | 77,6 | 89,0 |
| catégories | 2 028 | 8,9 | 15,9 | 25,4 | 81,8 |
| limites en cours (12 périodes passées) | 566 | 32,2 | 57,6 | 94,0 | 132,1 |
| saisie | 255 | 76,3 | 99,3 | 131,7 | 136,5 |

Les valeurs varient d'environ ×2 d'un lancement à l'autre selon la charge du poste (un lancement
précédent : p95 de 107 ms sur l'accueil, 112 ms sur la saisie). La CI (Node 22) tranche.

Limites : un seul processus Node en local, pas Passenger ni le mutualisé o2switch (CPU partagé,
base distante). Marge d'environ ×3 sur la route la plus lente (saisie). À refaire en recette avec la même charge
(`autocannon` contre l'URL de recette) lors de la mise en service : protocole ci-dessous.

### Mesure de recette (mise en service, `DEPLOY.md` §10)

1. Recette déployée, crons actifs (l'API reste éveillée : le premier appel après veille est exclu
   par NF-PERF-02). Données : `seed:fake` avec `SEED_FAKE_ACCOUNTS=1` et
   `SEED_FAKE_EXPENSES=10000` (volume du banc), lancé **avant** toute autre génération (un compte
   `demo.1` déjà présent n'est pas complété), voir `DEPLOY.md` §1.
2. Jeton : `POST https://recette.<domaine>/api/v1/auth/login` avec `demo.1@example.test` ; noter
   `accessToken` (15 min) et l'identifiant du carnet (`GET /api/v1/me`).
3. Depuis un poste extérieur, pour chaque route en lecture du banc (accueil, liste, recherche,
   synchro complète, catégories, limites en cours), 10 appels de chauffe puis :
   `npx autocannon@8.0.0 -c 4 -d 5 --latency -H "Authorization=Bearer <jeton>" https://recette.<domaine>/api/v1/<route>`
   La saisie se mesure avec le banc lui-même ou un script, chaque appel exigeant un UUID neuf.
4. Relever le p95 (`--latency` donne p97,5 et p99 ; le p95 est encadré par p90 et p97,5 : la cible est
   tenue si p97,5 < 300 ms) et le consigner ci-dessous, avec la date et la latence réseau de base
   (`curl -w '%{time_total}' …/health`), qui s'ajoute à toutes les mesures.

| Date | Route | p97,5 (ms) | p99 (ms) | Réseau (ms) |
| --- | --- | --- | --- | --- |
| à faire | — | — | — | — |

## NF-PERF-01 — ouverture de l'app jusqu'à l'accueil < 2 s

Test : `mobile/integration_test/startup_perf_test.dart`. Application complète (`DepenseoApp`, base
Drift **SQLCipher réelle**, Riverpod, routeur, verrou, accueil) avec une session ouverte ; l'API est
simulée et répond sans délai (le réseau est exclu : l'accueil s'affiche aussi hors ligne depuis la
copie locale, ADR-055). Chronomètre du premier `pumpWidget` à l'affichage de la jauge de l'accueil
(`limit-summary`) ; `startup_ms` et la frise `startup_timeline` sont publiés dans `reportData`.

La mesure **sous-estime** le démarrage réel ; ne sont pas comptés :
- le lancement natif et le moteur Flutter (avant `main`), et le travail de `main()` avant `runApp`
  (dont l'initialisation de Sentry quand un DSN est fourni) ;
- le coffre sécurisé réel (Keychain / Keystore, souvent lent sur Android) : le test utilise le coffre
  en mémoire de `TestApp` ;
- une base locale déjà remplie : la base est neuve (migration Drift initiale comprise), sans le
  carnet de plusieurs milliers de dépenses d'un utilisateur réel.

La mesure sur téléphone (`flutter drive --profile`) couvre le coffre réel mais pas une base remplie :
pour l'acceptation, la refaire aussi sur un compte réel synchronisé, au chronomètre, de l'appui sur
l'icône à l'accueil affiché.

- Simulateur (debug, JIT, assertions) : `flutter test integration_test/startup_perf_test.dart -d <id>`.
  Durée relevée seulement, budget non imposé (le mode debug n'est pas représentatif).
- Téléphone (profile, seule mesure opposable à la cible) :
  `flutter drive --profile --driver=test_driver/integration_test.dart --target=integration_test/startup_perf_test.dart -d <id>` ;
  le test échoue alors au-delà de 2 s, résultat dans `build/integration_response_data.json`.

Mesures :

| Date | Appareil | Mode | startup_ms |
| --- | --- | --- | --- |
| 2026-11-05 | Simulateur iPhone 17 (iOS 26.5) sur MacBook | debug | 2 432 / 2 221 / 2 718 (**au-dessus de la cible**) |
| à faire | Téléphone Android milieu de gamme 2023 (ex. Galaxy A54) | profile | — |
| à faire | iPhone de 2023 ou équivalent | profile | — |

La mesure sur téléphone milieu de gamme de 2023 n'a pas pu être faite (aucun appareil physique ni
émulateur Android dans l'environnement de développement ; `--profile` n'existe pas sur simulateur
iOS). **NF-PERF-01 n'est donc pas vérifiée** : les trois mesures en debug dépassent 2 s (le mode
debug, JIT avec assertions, est typiquement plusieurs fois plus lent que profile/release, mais cela
ne prouve pas la cible). Elle fait partie de la recette de mise en service (P7-07) ; consigner le résultat ici.
