# Déploiement chez o2switch (§8.5, NF-QUA-03, NF-SEC-01, P7-07)

Procédure pour l'humain qui met Depenseo en service. Les sauvegardes et la restauration sont décrites
dans [`BACKUP.md`](BACKUP.md), la mesure de performance dans [`PERF.md`](PERF.md). Les éléments
marqués **☐** sont à faire une fois, à la mise en service. `<domaine>` désigne le domaine retenu
(§11.4), `<user>` le compte cPanel.

## 1. Environnements

| Environnement | Où | Base | Données | `NODE_ENV` | `SENTRY_ENVIRONMENT` (API et mobile) |
| --- | --- | --- | --- | --- | --- |
| dev | poste du développeur, `docker compose up -d db` (MariaDB 10.6, port 3307) | `depenseo_dev` ; `depenseo_test` et `depenseo_restore_test` réservées aux tests | fictives (`seed:fake`) | `development` | — (pas de DSN) |
| recette | sous-domaine `recette.<domaine>` du même compte cPanel (ou second compte) | `<user>_depenseo_recette` | fictives (`seed:fake`) | `production` | `recette` |
| prod | `<domaine>` | `<user>_depenseo_prod` | réelles | `production` | `prod` |

- **Nommage des bases obligatoire** : suffixe `_dev`, `_recette` ou `_test` hors production, `_prod` en
  production. Le script de données fictives refuse toute base sans l'un des trois premiers suffixes
  (ADR-066). Ne jamais donner un de ces suffixes à une base qui contient des données réelles.
- Volume Docker créé avant P7-07 (base de dev nommée `depenseo`) : créer `depenseo_dev` à la main
  `docker compose exec db mariadb -uroot -pdepenseo_root_dev -e "CREATE DATABASE IF NOT EXISTS depenseo_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci; GRANT SELECT, INSERT, UPDATE, DELETE ON depenseo_dev.* TO 'depenseo_api'@'%'; GRANT SELECT, INSERT, UPDATE, DELETE ON depenseo_dev.* TO 'depenseo_admin'@'%'; GRANT ALL ON depenseo_dev.* TO 'depenseo_migrator'@'%';"`.
  Ne jamais remplir `depenseo_restore_test` : le test de restauration exige une base vide.
- Chaque environnement a **ses propres** secrets, comptes de base, clés de chiffrement, environnement
  Sentry, dossier de fichiers, dossier de sauvegarde et fichier d'environnement. Aucun secret n'est
  partagé entre recette et production.
- La recette utilise les environnements _sandbox_ des magasins (`APP_STORE_ENVIRONMENT=sandbox`,
  comptes testeurs Google Play) et un projet Firebase / une clé APNs de développement
  (`APNS_ENVIRONMENT=sandbox`).
- Les applications mobiles de recette sont construites avec
  `--dart-define=API_BASE_URL=https://recette.<domaine>` et `--dart-define=SENTRY_ENVIRONMENT=recette`
  (TestFlight, piste de test interne Google Play) ; celles de production avec `SENTRY_ENVIRONMENT=prod`.

### Secrets saisis sur le serveur

Aucun secret sur la ligne de commande (historique du shell, `ps` visible des autres comptes du
mutualisé). Les commandes ponctuelles qui en demandent un (migration, données fictives,
administrateur, restauration) lisent un **fichier éphémère** :

```bash
umask 077 && nano ~/.depenseo-oneshot.env      # VAR='valeur' une par ligne
set -a && . ~/.depenseo-oneshot.env && set +a && <commande> ; shred -u ~/.depenseo-oneshot.env
```

Dans tout fichier d'environnement lu par `.` : valeurs entre apostrophes simples (elles contiennent
souvent `+ / = : @`), clés PEM sur **une seule ligne** avec des `\n` littéraux (acceptés par l'API).

### Données fictives (dev, recette)

```bash
# Fichier éphémère : DATABASE_URL='mysql://<compte API>:<mdp>@localhost/<user>_depenseo_recette'
#                    SEED_FAKE_PASSWORD='<mot de passe de démo, ≥ 12 caractères>'
#                    SEED_FAKE_ACCOUNTS=3 SEED_FAKE_EXPENSES=120   (facultatifs ; ≤ 1000 comptes, ≤ 20 000 dépenses)
pnpm --filter api build    # en dev : le script s'exécute depuis dist/
set -a && . ~/.depenseo-oneshot.env && set +a && pnpm --filter api seed:fake ; shred -u ~/.depenseo-oneshot.env
```

Crée `demo.1@example.test`… (comptes vérifiés, carnet personnel, catégories par défaut, dépenses
en EUR sur 90 jours). Rejouable : les comptes existants ne sont pas modifiés. Pas de mot de passe
de démo dans le dépôt : le conserver dans le gestionnaire de secrets de l'équipe. En dev, la base
locale a un mot de passe connu (`depenseo_api_dev`) : la ligne de commande est acceptable.

## 2. Comptes de base de données

Créés dans cPanel › Bases de données MySQL, **par environnement** (`<user>_` est préfixé par cPanel,
`<env>` = `rec` ou `prod`). Base en `utf8mb4` / `utf8mb4_unicode_520_ci` (vérifier après création :
`SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '<base>';`,
sinon `ALTER DATABASE <base> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci;`).

| Compte | Droits, sur la base de son environnement seulement | Utilisé par | Variable |
| --- | --- | --- | --- |
| `<user>_migr_<env>` (migrator) | tous (DDL + DML) | `migrate`, `db:restore` | `MIGRATOR_DATABASE_URL`, `RESTORE_DATABASE_URL` |
| `<user>_api_<env>` (API) | SELECT, INSERT, UPDATE, DELETE | application Node, cron `jobs-run` et `db-export`, `admin:grant`, `seed:fake` | `DATABASE_URL` |
| `depenseo_admin` (back-office, §8.3) | — | **non créé** | — |

Un compte n'a jamais de droit sur la base de l'autre environnement.

**Écart §8.3 (ADR-044)** : le back-office `/admin` tourne dans le même processus Passenger que l'API
publique, avec le compte API. Un compte `depenseo_admin` distinct n'isolerait rien sans processus
séparé. Ses routes sont en lecture seule (sauf la relance d'une tâche) et passent toutes par
`AdminGuard` (404 sans session administrateur à double authentification). Si un jour le back-office
devient une seconde application Passenger (`/admin`), créer alors `<user>_adm_<env>` avec les seuls
droits des tables que lit et écrit `src/admin/` (lecture, relance de tâche, audit, session) et lui
donner sa propre `DATABASE_URL`.

Mots de passe des comptes : 32 caractères aléatoires au moins (`openssl rand -base64 24`).
`DATABASE_URL` = `mysql://<compte>:<mdp encodé URL>@localhost/<base>` (sans paramètres : le pilote
impose lui-même `utf8mb4`, `timezone: 'Z'`, `SET time_zone = '+00:00'`, `READ COMMITTED`).

## 3. Construction et publication

Pré-requis serveur : Node.js 22 (cPanel › Setup Node.js App, sélecteur Node de CloudLinux) et
pnpm 9.15.4. **☐ À vérifier au premier déploiement de recette**, propre au sélecteur CloudLinux :

- `node` 22 dans le `PATH` du shell SSH et des crons : sinon
  `source ~/nodevenv/depenseo-<env>/current/apps/api/22/bin/activate` (chemin affiché par cPanel) en
  tête de chaque commande, ou chemin absolu de `node` ;
- pnpm : `corepack enable --install-directory ~/bin` (le dossier de Node n'est pas inscriptible), ou
  `npx pnpm@9.15.4 …` ;
- le sélecteur veut faire de `node_modules` un lien vers `~/nodevenv/…` : ne **pas** cliquer « Run NPM
  Install » ; les dépendances sont celles installées par pnpm dans la version (si cPanel refuse un
  vrai dossier `node_modules`, déplacer celui de `apps/api` dans le nodevenv et lier).
Arborescence par environnement, hors `public_html` :

```text
~/depenseo-<env>/
  releases/<sha>/      # un clone du dépôt par version publiée
  current -> releases/<sha>
```

Publication d'une version (jamais à la minute 7, heure de l'export horaire) :

```bash
cd ~/depenseo-prod && git clone --depth 1 --branch <tag> <dépôt> releases/<sha> && cd releases/<sha>
pnpm install --frozen-lockfile
pnpm --filter api build                        # packages/shared/dist puis apps/api/dist
pnpm --filter @depenseo/admin build            # apps/admin/dist/{login,app}
# 1. Sauvegarde, avec le code en service (premier déploiement : sauter, `current` n'existe pas) :
(cd ~/depenseo-prod/current/apps/api && set -a && . ~/depenseo-prod.env && set +a && node dist/scripts/db-export.js)
# 2. Migrations avec le nouveau code (fichier éphémère : MIGRATOR_DATABASE_URL='…'), section 1 :
set -a && . ~/.depenseo-oneshot.env && set +a && node apps/api/dist/scripts/migrate.js ; shred -u ~/.depenseo-oneshot.env
# 3. Bascule et redémarrage :
ln -sfn ~/depenseo-prod/releases/<sha> ~/depenseo-prod/current.new && mv -T ~/depenseo-prod/current.new ~/depenseo-prod/current
mkdir -p ~/depenseo-prod/current/apps/api/tmp && touch ~/depenseo-prod/current/apps/api/tmp/restart.txt   # ou cPanel › Restart
curl -fsS https://<domaine>/api/v1/health
# Vérifier ensuite que la nouvelle version répond (ex. l'événement de test Sentry porte SENTRY_RELEASE=<sha>).
```

- Le code en service n'est jamais modifié pendant la construction : Passenger peut relancer un
  processus à tout moment (sortie de veille) et doit trouver un `dist/` complet.
- `apps/api/dist` importe `@depenseo/shared` depuis `packages/shared/dist` : la version entière et ses
  `node_modules` restent sur le serveur (pas de bundle autonome).
- **Règle des migrations** : entre l'étape 2 et l'étape 3, l'ancien code tourne sur le nouveau
  schéma. Une migration publiée **doit** donc être compatible avec la version précédente (ajout de
  table, de colonne facultative ou d'index). Une suppression ou un renommage se fait en deux
  versions : la première cesse d'utiliser la colonne, la suivante la supprime (ce qu'a fait
  `0016_drop_user_plan.sql`). Le relecteur vérifie cette règle sur tout fichier de `apps/api/drizzle/`.
- **Retour arrière** : repointer `current` vers la version précédente et redémarrer. Une migration
  n'est jamais annulée en production : si elle est en cause, restaurer la sauvegarde de l'étape 1
  (`BACKUP.md`). Garder les 3 dernières versions dans `releases/`.
- Avant toute publication : CI verte sur le commit (`pnpm test`, `test:tz`, bench, Flutter).

### Application Node (cPanel › Setup Node.js App)

| Champ | Valeur |
| --- | --- |
| Node.js version | 22.x |
| Application mode | Production |
| Application root | `depenseo-<env>/current/apps/api` |
| Application URL | `<domaine>` (prod), `recette.<domaine>` (recette) |
| Application startup file | `dist/src/main.js` |

Passenger fournit le port d'écoute : `app.listen(config.PORT)` reçoit `PORT` (Passenger intercepte
`listen` pour Node). Le préfixe `/api/v1` est posé par l'application ; Passenger route aussi `/admin`
vers elle. L'API est un module ESM (`"type": "module"`) : **☐ vérifier** au premier déploiement de
recette que la version de Passenger d'o2switch le démarre (sinon, fichier de démarrage CommonJS
`app.cjs` contenant `import('./dist/src/main.js')`). Les variables d'environnement (section 4) sont
saisies dans cette page (« Environment variables »), jamais dans un fichier du dépôt.

### `.htaccess` (racine `public_html` du domaine)

cPanel écrit lui-même le bloc Passenger (`PassengerAppRoot`, `PassengerBaseURI`, `PassengerNodejs`) ;
ne pas le modifier. À ajouter **au-dessus** :

```apache
# HTTPS obligatoire (le certificat AutoSSL est renouvelé par cPanel).
RewriteEngine On
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]

# Fichiers d'association des liens universels (section 7), servis en statique par Apache.
<Files "apple-app-site-association">
  ForceType application/json
</Files>

# Liens e-mail ouverts hors de l'app : page statique, sans redirection (le chemin doit rester exact).
RewriteRule ^(verify-email|reset-password)$ /ouvrir-l-app.html [L]

# Pas d'index de dossier ; fichiers cachés interdits sauf .well-known.
Options -Indexes
RewriteRule (^|/)\.(?!well-known) - [F]
```

**☐ Vérifier** qu'Apache sert ces fichiers avant Passenger (aucun ne doit atteindre l'API) :

```bash
curl -sI https://<domaine>/.well-known/apple-app-site-association   # 200, application/json, sans redirection
curl -sI https://<domaine>/.well-known/assetlinks.json              # 200, application/json
curl -sI https://<domaine>/verify-email                             # 200, text/html (page statique)
```

Les en-têtes de sécurité (HSTS, CSP, `nosniff`…) sont posés par l'API (ADR-062) sur ses réponses.
HSTS porte `includeSubDomains` : **☐ vérifier** que tous les sous-domaines du domaine servent du
HTTPS valide avant la mise en service.

### `TRUST_PROXY_HOPS` (ADR-062) — ☐ à établir sur le serveur

Obligatoire en production (démarrage refusé sinon). Commencer par `1` (Apache → Passenger), puis
vérifier depuis deux postes d'adresses IP différentes, **avec une adresse e-mail différente à chaque
appel** (sinon le seuil par compte, 10 / 15 min, répond 429 avant celui par IP) : 31 appels
`POST /api/v1/auth/login` erronés depuis le poste A en 15 min doivent donner un 429 au 31e ; le
poste B doit encore recevoir 401. Si B est bloqué aussi, `req.ip` vaut l'adresse du proxy :
augmenter la valeur et recommencer.

## 4. Variables d'environnement

Format des clés : **AES-256 base64** = `openssl rand -base64 32` ; **secret** = `openssl rand -base64 48`.
Chaque variable est propre à un environnement.

### Application Node (cPanel)

| Variable | Requise | Valeur / rôle |
| --- | --- | --- |
| `NODE_ENV` | oui | `production` |
| `DATABASE_URL` | oui | compte API (section 2) |
| `JWT_ACCESS_SECRET` | oui | secret ≥ 32 car. ; signe les jetons d'accès (15 min) et dérive la clé HMAC du limiteur |
| `TRUST_PROXY_HOPS` | oui en prod | section 3 |
| `DB_POOL_SIZE` | non (5) | taille du pool par processus Passenger |
| `LOG_LEVEL` | non (`info`) | |
| `AUTH_RATE_LIMIT_PER_IP`, `AUTH_RATE_LIMIT_PER_ACCOUNT` | non (30, 10) | par 15 min |
| `FILE_STORAGE_DIR` + `FILE_ENCRYPTION_KEY` | ensemble | dossier absolu **hors** `public_html` (ex. `~/depenseo-<env>-files`) ; clé AES-256 des exports. Absents = exports en 503 |
| `ADMIN_SESSION_SECRET` + `ADMIN_TOTP_KEY` | ensemble | secret du cookie admin (≠ `JWT_ACCESS_SECRET`) ; clé AES-256 des secrets TOTP. Absents = back-office désactivé |
| `ADMIN_DIST_DIR` | non | chemin absolu de `apps/admin/dist` (contient `login/` et `app/`) ; absent = pages `/admin` en 404 |
| `APPLE_CLIENT_IDS` | non | identifiants d'audience Sign in with Apple (bundle iOS), séparés par des virgules |
| `GOOGLE_CLIENT_IDS` | non | identifiants client OAuth Google (iOS, Android, serveur) |
| `APP_STORE_ISSUER_ID`, `APP_STORE_KEY_ID`, `APP_STORE_PRIVATE_KEY`, `APP_STORE_BUNDLE_ID` | ensemble | App Store Server API (abonnements) ; `APP_STORE_ENVIRONMENT` = `production` / `sandbox` |
| `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_CLIENT_EMAIL`, `GOOGLE_PLAY_PRIVATE_KEY` | ensemble | Google Play Developer API (`fr.depenseo.depenseo`) |
| `GOOGLE_PLAY_PUSH_AUDIENCE`, `GOOGLE_PLAY_PUSH_SERVICE_ACCOUNT` | ensemble | vérification des notifications temps réel Play (Pub/Sub push) |
| `SENTRY_DSN` | non | DSN `https://…@….de.sentry.io/…` (région UE imposée, ADR-064) ; absent = aucun envoi |
| `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` | non | `recette`/`prod` ; SHA du commit |

Les clés PEM (`*_PRIVATE_KEY`) sont saisies avec leurs retours à la ligne (ou `\n` littéraux).

### Cron (fichier `~/depenseo-<env>.env`, droits `600`)

Les scripts cron ne voient pas les variables de cPanel : elles sont lues d'un fichier chargé par le
crontab. Il contient `NODE_ENV`, `DATABASE_URL`, `DB_POOL_SIZE=2`, `LOG_LEVEL`,
`FILE_STORAGE_DIR`, `FILE_ENCRYPTION_KEY` (mêmes valeurs que l'application) et en plus :

| Variable | Rôle |
| --- | --- |
| `SMTP_URL`, `MAIL_FROM` | envoi des e-mails (`smtps://compte:mdp@mail.<domaine>:465`, boîte cPanel) |
| `PUBLIC_WEB_URL` | origine des liens e-mail, `https://<domaine>/` (barre finale, sans chemin) |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_TOPIC`, `APNS_ENVIRONMENT` | push iOS (clé `.p8`, topic = bundle iOS) |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | push Android (compte de service Firebase, rôle « Firebase Cloud Messaging API Admin ») |
| `BACKUP_DIR`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_RETENTION_HOURS` | export horaire (`BACKUP.md`) |
| `MIGRATOR_DATABASE_URL`, `RESTORE_DATABASE_URL` | **pas** dans ce fichier : fichier éphémère au moment d'une migration ou d'une restauration (section 1) |

## 5. Crontab (cPanel › Tâches Cron)

```cron
# Recette et prod : un bloc par environnement, avec son propre fichier d'environnement.
* * * * *  cd ~/depenseo-prod/current/apps/api && set -a && . ~/depenseo-prod.env && set +a && node dist/scripts/jobs-run.js >> ~/logs/depenseo-prod-jobs.log 2>&1
* * * * *  curl -fsS -o /dev/null --max-time 20 https://<domaine>/api/v1/health
7 * * * *  cd ~/depenseo-prod/current/apps/api && set -a && . ~/depenseo-prod.env && set +a && node dist/scripts/db-export.js >> ~/logs/depenseo-prod-backup.log 2>&1
```

- `jobs-run` : file de tâches (e-mails, push, récurrences, exports, purges) ; se termine en ≤ 50 s.
- `health` : garde l'API éveillée (Passenger la met en veille), §8.5. Une **sonde externe** (99,5 %,
  §8.5) appelle aussi `GET /api/v1/health` toutes les 5 min et alerte par e-mail : ☐ à créer.
- `db-export` : export chiffré horaire, rétention 48 h ; copie hors site (JetBackup) à vérifier.
  Cette ligne remplace celle, générique, de `BACKUP.md` (mêmes variables, chemins de cette page).
  Ne pas publier de version à la minute 7.
- Les journaux ne contiennent ni montant ni donnée personnelle (NF-SEC-06) ; rotation par
  `logrotate` cPanel ou purge mensuelle.

## 6. Comptes administrateurs

```bash
# Fichier éphémère (section 1) : DATABASE_URL='<compte API>' et ADMIN_TOTP_KEY='<même valeur que l’application>'
cd ~/depenseo-prod/current/apps/api && set -a && . ~/.depenseo-oneshot.env && set +a
node dist/scripts/grant-admin.js <email>            # terminal interactif obligatoire
node dist/scripts/grant-admin.js --revoke <email>
shred -u ~/.depenseo-oneshot.env
```

Le compte doit déjà exister (inscription par l'app). L'URI `otpauth://` affichée une seule fois est à
saisir aussitôt dans une application d'authentification.

## 7. Applications mobiles

### Dart-defines de release

```bash
flutter build ipa --release \
  --dart-define=API_BASE_URL=https://<domaine> \
  --dart-define=GOOGLE_SERVER_CLIENT_ID=<id client OAuth « Web » Google> \
  --dart-define=LEGAL_PUBLISHER='<éditeur>' --dart-define=LEGAL_CONTACT_EMAIL=<contact> \
  --dart-define=FIREBASE_API_KEY=… --dart-define=FIREBASE_PROJECT_ID=… \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=… --dart-define=FIREBASE_ANDROID_APP_ID=… \
  --dart-define=FIREBASE_IOS_APP_ID=… --dart-define=FIREBASE_IOS_BUNDLE_ID=… \
  --dart-define=SENTRY_DSN=https://…@….de.sentry.io/… --dart-define=SENTRY_ENVIRONMENT=prod
# idem `flutter build appbundle --release` pour Android.
```

`API_BASE_URL` doit être en `https` en release. Firebase absent = notifications désactivées (ADR-056).

### Liens universels `/verify-email` et `/reset-password` (ADR-047) — ☐

Les e-mails pointent vers `PUBLIC_WEB_URL/verify-email#token=…` et `/reset-password#token=…`.
L'app gère déjà ces chemins (go_router) ; il reste la configuration liée au domaine :

1. **Fichiers servis par Apache** sous `public_html/.well-known/` du domaine de `PUBLIC_WEB_URL` :
   - `apple-app-site-association` (sans extension, `application/json`, voir `.htaccess`) :
     ```json
     { "applinks": { "details": [ { "appIDs": ["<TEAM_ID>.<bundle iOS>"],
       "components": [ { "/": "/verify-email" }, { "/": "/reset-password" } ] } ] } }
     ```
   - `assetlinks.json` :
     ```json
     [ { "relation": ["delegate_permission/common.handle_all_urls"],
         "target": { "namespace": "android_app", "package_name": "fr.depenseo.depenseo",
                     "sha256_cert_fingerprints": ["<empreinte SHA-256 de la clé de signature Play>"] } } ]
     ```
     (empreinte : Play Console › Intégrité de l'application › Certificat de la clé de signature.)
2. **iOS** (Xcode › Runner › Signing & Capabilities) : capability *Associated Domains* avec
   `applinks:<domaine>` (crée `Runner.entitlements`, à committer).
3. **Android** (`mobile/android/app/src/main/AndroidManifest.xml`, activité principale) :
   ```xml
   <intent-filter android:autoVerify="true">
     <action android:name="android.intent.action.VIEW" />
     <category android:name="android.intent.category.DEFAULT" />
     <category android:name="android.intent.category.BROWSABLE" />
     <data android:scheme="https" android:host="<domaine>" android:path="/verify-email" />
     <data android:scheme="https" android:host="<domaine>" android:path="/reset-password" />
   </intent-filter>
   ```
4. **Test sur appareil** : s'inscrire, ouvrir le lien `https://<domaine>/verify-email#token=…` depuis
   l'application Mail (iOS) et Gmail (Android) : l'app doit s'ouvrir sur l'écran de vérification et
   confirmer l'adresse ; idem pour « mot de passe oublié ». Android :
   `adb shell pm get-app-links fr.depenseo.depenseo` doit montrer le domaine `verified`.
   Tant que les liens ne s'ouvrent pas dans l'app, le navigateur affiche `public_html/ouvrir-l-app.html`
   (règle `.htaccess`, section 3) : page statique « Ouvrez ce lien sur le téléphone où Depenseo est
   installé », sans script (le jeton du fragment `#token=` n'est jamais envoyé au serveur).

### Connexion Apple et Google (F-AUTH-01) — ☐

- **Apple** : identifiant d'app avec capability *Sign in with Apple* (portail développeur + Xcode).
  `APPLE_CLIENT_IDS` = bundle iOS. Apple n'est proposé que sur iOS (ADR-047).
- **Google** (console Google Cloud, écran de consentement publié) : un client OAuth **iOS** (bundle),
  un client **Android** (package + SHA-1 des clés de signature Play et d'upload), un client **Web**
  (= `GOOGLE_SERVER_CLIENT_ID`). iOS : ajouter dans `ios/Runner/Info.plist` la clé `GIDClientID`
  (id client iOS) et un `CFBundleURLTypes` avec le schéma `com.googleusercontent.apps.<…>` (id
  client iOS inversé). `GOOGLE_CLIENT_IDS` = les trois identifiants.

### Notifications push (F-NOT, ADR-056) — ☐

1. Projet Firebase (un par environnement) avec une app iOS et une app Android ; reporter leurs
   identifiants dans les dart-defines `FIREBASE_*`. Aucun `google-services.json` /
   `GoogleService-Info.plist` dans le dépôt.
2. **Clé APNs** (`.p8`, portail Apple › Keys, service APNs) → `APNS_KEY_ID`, `APNS_TEAM_ID`,
   `APNS_PRIVATE_KEY`, `APNS_TOPIC` = bundle iOS (cron). L'API envoie à APNs directement : la clé
   n'est pas nécessaire dans Firebase.
3. Xcode : capability *Push Notifications* (`aps-environment` dans `Runner.entitlements`) et
   *Background Modes* › *Remote notifications* (`UIBackgroundModes` = `remote-notification`).
4. Compte de service FCM → `FCM_*` (cron).
5. **Test Android app tuée** : forcer l'arrêt de l'app, provoquer un rappel quotidien (régler
   l'heure à la minute suivante), vérifier la réception. En cas d'échec (Firebase initialisé
   seulement depuis Dart) : générer `google-services.json` au build (non committé) et appliquer le
   plugin Gradle `com.google.gms.google-services`.

## 8. Sentry (ADR-064) — ☐

Organisation créée **dans la région UE** (choix définitif). Par projet (API, mobile) : *Data
Scrubber* et *Use Default Scrubbers* actifs, *Prevent Storing of IP Addresses* actif, règles
*Advanced Data Scrubbing* « Remove — Anything — `$error.value` » et « Remove — Anything —
`$message` », rétention minimale.

## 9. Rotation des clés et secrets (NF-SEC-01)

Rotation annuelle, et immédiate en cas de fuite suspectée ou de départ d'une personne y ayant eu
accès. Générer la nouvelle valeur, la consigner (gestionnaire de secrets, date), la remplacer dans
cPanel **et** dans le fichier d'environnement du cron si elle y figure, redémarrer l'application.

| Secret | Effet de la rotation | Procédure particulière |
| --- | --- | --- |
| `JWT_ACCESS_SECRET` | jetons d'accès en cours invalides (401) : les apps les renouvellent seules par le jeton de rafraîchissement (stocké haché, non lié à ce secret) ; compteurs du limiteur remis à zéro | aucune |
| `ADMIN_SESSION_SECRET` | sessions du back-office fermées | aucune |
| `ADMIN_TOTP_KEY` | secrets TOTP chiffrés illisibles | relancer `admin:grant <email>` pour chaque administrateur et réenrôler |
| `FILE_ENCRYPTION_KEY` | exports déjà produits illisibles (404) ; ils expirent de toute façon | prévenir si un export est en attente de téléchargement |
| `BACKUP_ENCRYPTION_KEY` | — | **conserver l'ancienne clé** tant que des sauvegardes chiffrées avec elle existent (`BACKUP.md`) |
| mots de passe des comptes de base | — | cPanel › changer le mot de passe, mettre à jour `DATABASE_URL` (application + cron) dans la même minute |
| `SMTP_URL` | — | mot de passe de la boîte cPanel |
| clé APNs, compte de service FCM, clé App Store, compte Google Play | — | créer la nouvelle clé, déployer, **puis** révoquer l'ancienne chez le fournisseur |
| `SEED_FAKE_PASSWORD` (recette) | — | changer le mot de passe des comptes `demo.*` par l'app |

## 10. Check-list de mise en service

- ☐ Domaine, certificat AutoSSL, `.htaccess`, page de présentation sur `/`.
- ☐ Bases `_recette` et `_prod`, comptes migrator/API (section 2), migrations.
- ☐ Application Node (section 3, démarrage ESM vérifié), variables (section 4), `TRUST_PROXY_HOPS` vérifié.
- ☐ Fichiers statiques servis par Apache (`curl -sI`, section 3), page `ouvrir-l-app.html`.
- ☐ Crons (section 5), premier export vérifié, restauration testée en recette (`BACKUP.md`).
- ☐ Sonde externe de disponibilité.
- ☐ Sentry UE et réglages de nettoyage.
- ☐ Liens universels, Apple, Google, push : tests sur appareil (section 7).
- ☐ Premier administrateur (section 6).
- ☐ Mesures de recette NF-PERF-01 et NF-PERF-02 consignées dans [`PERF.md`](PERF.md).
