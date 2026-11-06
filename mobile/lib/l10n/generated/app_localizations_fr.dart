// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appTitle => 'Depenseo';

  @override
  String get homeTitle => 'Mes dépenses';

  @override
  String get homeEmpty => 'Aucune dépense pour le moment.';

  @override
  String get logout => 'Se déconnecter';

  @override
  String get emailLabel => 'Adresse e-mail';

  @override
  String get passwordLabel => 'Mot de passe';

  @override
  String get newPasswordLabel => 'Nouveau mot de passe';

  @override
  String get loginTitle => 'Connexion';

  @override
  String get loginSubmit => 'Se connecter';

  @override
  String get loginWithApple => 'Continuer avec Apple';

  @override
  String get loginWithGoogle => 'Continuer avec Google';

  @override
  String get goToRegister => 'Créer un compte';

  @override
  String get goToForgotPassword => 'Mot de passe oublié ?';

  @override
  String get goToLogin => 'Aller à la connexion';

  @override
  String get registerTitle => 'Créer un compte';

  @override
  String get registerSubmit => 'Créer mon compte';

  @override
  String get acceptTermsLabel =>
      'J’accepte les conditions générales d’utilisation et la politique de confidentialité.';

  @override
  String get termsRequired => 'Acceptez les conditions pour continuer.';

  @override
  String get registerSentTitle => 'Vérifiez votre adresse';

  @override
  String get registerSentBody =>
      'Si cette adresse peut être utilisée, un lien de vérification vient d’y être envoyé. Ouvrez-le sur ce téléphone pour activer votre compte.';

  @override
  String get socialTermsTitle => 'Nouveau compte';

  @override
  String get socialTermsBody =>
      'Aucun compte n’existe encore pour cette adresse. Pour le créer, acceptez les conditions générales d’utilisation et la politique de confidentialité.';

  @override
  String get socialTermsAccept => 'Accepter et créer';

  @override
  String get cancel => 'Annuler';

  @override
  String get forgotTitle => 'Mot de passe oublié';

  @override
  String get forgotSubmit => 'Recevoir un lien';

  @override
  String get forgotSent =>
      'Si un compte existe pour cette adresse, un lien de réinitialisation valable 30 minutes vient d’être envoyé.';

  @override
  String get resetTitle => 'Nouveau mot de passe';

  @override
  String get resetSubmit => 'Enregistrer';

  @override
  String get resetDone =>
      'Mot de passe modifié. Connectez-vous avec le nouveau mot de passe.';

  @override
  String get verifyTitle => 'Vérification de l’adresse';

  @override
  String get verifyDone => 'Adresse vérifiée. Vous pouvez vous connecter.';

  @override
  String get invalidEmail => 'Saisissez une adresse e-mail valide.';

  @override
  String get passwordTooShort => '8 caractères minimum.';

  @override
  String get passwordTooLong => '128 caractères maximum.';

  @override
  String get errorInvalidCredentials => 'Adresse ou mot de passe incorrect.';

  @override
  String get errorEmailNotVerified =>
      'Adresse non vérifiée : ouvrez le lien reçu par e-mail.';

  @override
  String get errorInvalidLink =>
      'Ce lien est invalide, expiré ou déjà utilisé. Demandez-en un nouveau.';

  @override
  String get errorInvalidInput => 'Vérifiez les informations saisies.';

  @override
  String get errorIdentityRejected =>
      'La connexion n’a pas pu être vérifiée. Réessayez.';

  @override
  String get errorAccountNotLinkable =>
      'Un compte existe déjà avec cette adresse : connectez-vous par e-mail ou réinitialisez le mot de passe.';

  @override
  String get errorProviderUnavailable =>
      'Ce mode de connexion est momentanément indisponible.';

  @override
  String get errorNetwork => 'Pas de connexion au serveur. Réessayez.';

  @override
  String get errorUnknown => 'Une erreur est survenue. Réessayez.';

  @override
  String get storageErrorTitle => 'Stockage sécurisé inaccessible';

  @override
  String get storageErrorBody =>
      'Depenseo ne peut pas lire son coffre sécurisé. Déverrouillez l’appareil puis réessayez.';

  @override
  String get retry => 'Réessayer';

  @override
  String get settingsTitle => 'Réglages';

  @override
  String get settingsSecurity => 'Sécurité';

  @override
  String get settingsAppearance => 'Apparence';

  @override
  String get themeLight => 'Clair';

  @override
  String get themeAuto => 'Auto';

  @override
  String get themeDark => 'Sombre';

  @override
  String get themeHint => 'Auto suit le réglage du téléphone.';

  @override
  String get lockEnable => 'Verrouiller l’application';

  @override
  String get lockEnableHint => 'Code à 6 chiffres demandé à l’ouverture';

  @override
  String get lockDelayLabel => 'Verrouiller après';

  @override
  String get lockDelayImmediate => 'Immédiat';

  @override
  String get lockDelayOneMinute => '1 min';

  @override
  String get lockDelayFiveMinutes => '5 min';

  @override
  String get lockBiometrics => 'Déverrouiller par biométrie';

  @override
  String get lockScreenshots => 'Bloquer les captures d’écran';

  @override
  String get lockTitle => 'Depenseo est verrouillé';

  @override
  String get lockPrompt => 'Saisissez votre code';

  @override
  String lockWrongPin(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Code incorrect. $count essais restants.',
      one: 'Code incorrect. 1 essai restant.',
    );
    return '$_temp0';
  }

  @override
  String get lockUseBiometrics => 'Utiliser la biométrie';

  @override
  String get lockBiometricReason => 'Déverrouiller Depenseo';

  @override
  String get lockForgot => 'Code oublié ?';

  @override
  String get lockForgotBody =>
      'Vous allez être déconnecté. Reconnectez-vous avec votre mot de passe, puis choisissez un nouveau code.';

  @override
  String get pinSetupTitle => 'Code de verrouillage';

  @override
  String get pinSetupPrompt => 'Choisissez un code à 6 chiffres';

  @override
  String get pinSetupConfirm => 'Confirmez le code';

  @override
  String get pinSetupMismatch => 'Les codes ne correspondent pas. Recommencez.';

  @override
  String get pinDelete => 'Effacer';

  @override
  String get addExpense => 'Ajouter une dépense';

  @override
  String get quickEntryTitle => 'Nouvelle dépense';

  @override
  String get save => 'Enregistrer';

  @override
  String get amountLabel => 'Montant';

  @override
  String get amountEmpty => 'Saisissez un montant.';

  @override
  String get amountInvalid => 'Montant invalide.';

  @override
  String get amountTooManyDecimals => 'Trop de décimales pour cette devise.';

  @override
  String get amountTooLarge => 'Montant trop élevé.';

  @override
  String get amountNotPositive => 'Le montant doit être supérieur à zéro.';

  @override
  String get categoryLabel => 'Catégorie';

  @override
  String get categoryRequired => 'Choisissez une catégorie.';

  @override
  String get categoriesUnavailable =>
      'Les catégories ne sont pas encore disponibles. Connectez-vous à Internet pour les synchroniser.';

  @override
  String get dateLabel => 'Date';

  @override
  String get today => 'Aujourd\'hui';

  @override
  String get noteLabel => 'Note';

  @override
  String get merchantLabel => 'Marchand ou lieu';

  @override
  String get tagsLabel => 'Étiquettes';

  @override
  String get tagsHint => 'Séparées par des virgules';

  @override
  String get tagsTooMany => '10 étiquettes au maximum.';

  @override
  String get tagTooLong => 'Une étiquette compte 50 caractères au maximum.';

  @override
  String get expenseSaved => 'Dépense enregistrée.';

  @override
  String get accountUnavailable =>
      'Connectez-vous à Internet une première fois pour préparer la saisie.';

  @override
  String get noteTooLong => '500 caractères au maximum.';

  @override
  String get merchantTooLong => '100 caractères au maximum.';

  @override
  String get saveFailed => 'Enregistrement impossible. Réessayez.';

  @override
  String get expensePendingSync => 'En attente d\'envoi';

  @override
  String get expenseSyncRejected => 'Refusée par le serveur';

  @override
  String get categoryNotSynced => 'Catégorie inconnue';

  @override
  String get syncOffline =>
      'Hors ligne : les dépenses seront envoyées au retour du réseau.';

  @override
  String get expenseSyncConflict =>
      'En conflit avec le serveur (supprimée ailleurs ?)';

  @override
  String get expenseListTitle => 'Dépenses';

  @override
  String get editExpenseTitle => 'Modifier la dépense';

  @override
  String get expenseNotFound => 'Cette dépense n\'existe plus.';

  @override
  String get deleteExpense => 'Supprimer la dépense';

  @override
  String get expenseDeleted => 'Dépense supprimée.';

  @override
  String get undo => 'Annuler';

  @override
  String get expenseConflictExplanation =>
      'Cette dépense a été supprimée sur un autre appareil. Restaurez-la pour garder votre version, ou abandonnez-la.';

  @override
  String get restoreExpense => 'Restaurer';

  @override
  String get discardExpense => 'Abandonner';

  @override
  String get discardExpenseConfirm =>
      'Abandonner cette dépense ? Elle restera supprimée.';

  @override
  String get restoreFailed =>
      'Restauration impossible. Vérifiez la connexion et réessayez.';

  @override
  String get expenseRestored => 'Dépense restaurée.';

  @override
  String get expenseDiscarded => 'Dépense abandonnée.';

  @override
  String get searchLabel => 'Rechercher';

  @override
  String get searchHint => 'Note ou commerçant';

  @override
  String get searchEmpty => 'Aucune dépense ne correspond.';

  @override
  String get filtersTitle => 'Filtres';

  @override
  String get filtersActive => 'Filtres actifs';

  @override
  String get filtersApply => 'Appliquer';

  @override
  String get filtersReset => 'Effacer les filtres';

  @override
  String get periodLabel => 'Période';

  @override
  String get periodAny => 'Toutes les dates';

  @override
  String get minAmountLabel => 'Montant minimum';

  @override
  String get maxAmountLabel => 'Montant maximum';

  @override
  String get amountRangeInvalid =>
      'Le maximum doit être supérieur ou égal au minimum.';

  @override
  String get undoTooLate => 'Trop tard : la suppression est déjà enregistrée.';

  @override
  String get categoriesTitle => 'Catégories';

  @override
  String get categoriesSettingsHint => 'Nom, icône, couleur et masquage';

  @override
  String get categoryAdd => 'Nouvelle catégorie';

  @override
  String get categoryEdit => 'Modifier la catégorie';

  @override
  String get categoryNameLabel => 'Nom';

  @override
  String get categoryNameRequired => 'Saisissez un nom.';

  @override
  String get categoryNameTooLong => '100 caractères au plus.';

  @override
  String get categoryIconLabel => 'Icône';

  @override
  String categoryIconCurrent(String icon) {
    return 'Icône actuelle : $icon';
  }

  @override
  String categoryIconName(String key) {
    String _temp0 = intl.Intl.selectLogic(key, {
      'home': 'Maison',
      'bolt': 'Énergie',
      'cart': 'Panier',
      'restaurant': 'Restaurant',
      'car': 'Voiture',
      'health': 'Santé',
      'shield': 'Protection',
      'bank': 'Administration',
      'child': 'Enfant',
      'theater': 'Spectacle',
      'bag': 'Sac de shopping',
      'repeat': 'Abonnement',
      'gift': 'Cadeau',
      'box': 'Carton',
      'tag': 'Étiquette',
      'pets': 'Animaux',
      'sport': 'Sport',
      'travel': 'Avion',
      'train': 'Train',
      'bus': 'Bus',
      'bike': 'Vélo',
      'fuel': 'Carburant',
      'parking': 'Stationnement',
      'school': 'École',
      'phone': 'Téléphone',
      'wifi': 'Internet',
      'coffee': 'Café',
      'bar': 'Bar',
      'fastfood': 'Restauration rapide',
      'pharmacy': 'Pharmacie',
      'hospital': 'Hôpital',
      'clothes': 'Vêtements',
      'book': 'Livres',
      'music': 'Musique',
      'games': 'Jeux vidéo',
      'movie': 'Cinéma',
      'beauty': 'Bien-être',
      'tools': 'Bricolage',
      'water': 'Eau',
      'light': 'Électricité',
      'furniture': 'Mobilier',
      'card': 'Carte bancaire',
      'cash': 'Espèces',
      'receipt': 'Facture',
      'work': 'Travail',
      'charity': 'Dons',
      'party': 'Fête',
      'nature': 'Nature',
      'heart': 'Cœur',
      'other': 'Icône',
    });
    return '$_temp0';
  }

  @override
  String get categoryColorLabel => 'Couleur';

  @override
  String categoryColorOption(String hex) {
    return 'Couleur $hex';
  }

  @override
  String get categoryParentLabel => 'Catégorie parente';

  @override
  String get categoryParentNone => 'Aucune (catégorie principale)';

  @override
  String get categoryHidden => 'Masquée : non proposée à la saisie';

  @override
  String categoryShownInEntry(String name) {
    return 'Proposer « $name » à la saisie';
  }

  @override
  String get categoryWriteOffline =>
      'Connexion requise pour modifier les catégories. Réessayez une fois en ligne.';

  @override
  String get categoryWriteInvalid =>
      'Modification refusée : vérifiez les champs.';

  @override
  String get categoryWriteGone => 'Cette catégorie n\'existe plus.';

  @override
  String get categoryHiddenWithParent =>
      'Non proposée à la saisie : sa catégorie parente est masquée';

  @override
  String get limitsTitle => 'Limite de dépenses';

  @override
  String get limitsSettingsHint => 'Plafond mensuel ou hebdomadaire';

  @override
  String get limitCurrentTitle => 'Période en cours';

  @override
  String get limitSettingsTitle => 'Réglages de la limite';

  @override
  String get limitKindNone => 'Aucune';

  @override
  String get limitKindMonth => 'Mensuelle';

  @override
  String get limitKindWeek => 'Hebdomadaire';

  @override
  String get limitAmountLabel => 'Montant de la limite';

  @override
  String get limitStartDayMonth => 'Début du mois de dépenses';

  @override
  String limitStartDayOption(int day) {
    return 'Le $day';
  }

  @override
  String get limitStartDayWeek => 'Premier jour de la semaine';

  @override
  String get limitIncludeRecurring => 'Inclure les dépenses récurrentes';

  @override
  String get limitIncludeRecurringHint =>
      'Les échéances payées comptent dans la limite.';

  @override
  String limitPeriod(String start, String end) {
    return 'Du $start au $end';
  }

  @override
  String limitSpentOf(String spent, String limit) {
    return '$spent dépensés sur $limit';
  }

  @override
  String limitSpentNoLimit(String spent) {
    return '$spent dépensés sur la période';
  }

  @override
  String limitRemaining(String amount) {
    return 'Reste $amount avant la limite';
  }

  @override
  String limitExceeded(String amount) {
    return 'Limite dépassée de $amount';
  }

  @override
  String get limitGaugeLabel => 'Part de la limite consommée';

  @override
  String limitPaceMonth(int consumed, int elapsed) {
    return '$consumed % de la limite consommée à $elapsed % du mois';
  }

  @override
  String limitPaceWeek(int consumed, int elapsed) {
    return '$consumed % de la limite consommée à $elapsed % de la semaine';
  }

  @override
  String get limitNone => 'Aucune limite définie';

  @override
  String limitUpcoming(String date) {
    return 'Ces réglages s\'appliquent à partir du $date.';
  }

  @override
  String get limitSaved => 'Limite enregistrée.';

  @override
  String get limitOffline =>
      'Connexion requise pour consulter ou modifier la limite.';

  @override
  String get limitInvalid => 'Réglage refusé : vérifiez les champs.';

  @override
  String get limitConflict =>
      'La limite a changé entre-temps : vérifiez puis enregistrez à nouveau.';

  @override
  String get recurringTitle => 'Dépenses récurrentes';

  @override
  String get recurringSettingsHint => 'Loyer, abonnements, échéances à payer';

  @override
  String get recurringUpcomingTitle => 'Échéances en attente';

  @override
  String get recurringUpcomingNone => 'Aucune échéance en attente.';

  @override
  String get recurringListTitle => 'Récurrences';

  @override
  String get recurringNone =>
      'Aucune dépense récurrente : ajoutez votre loyer, vos abonnements…';

  @override
  String get recurringAdd => 'Nouvelle récurrence';

  @override
  String get recurringEditTitle => 'Modifier la récurrence';

  @override
  String get recurringNameLabel => 'Nom';

  @override
  String get recurringNameRequired => 'Indiquez un nom.';

  @override
  String get recurringAmountFixed => 'Fixe';

  @override
  String get recurringAmountEstimated => 'Estimé';

  @override
  String get recurringFrequencyLabel => 'Fréquence';

  @override
  String get recurringFrequencyWeekly => 'Chaque semaine';

  @override
  String get recurringFrequencyMonthly => 'Chaque mois';

  @override
  String get recurringFrequencyQuarterly => 'Chaque trimestre';

  @override
  String get recurringFrequencyYearly => 'Chaque année';

  @override
  String get recurringFrequencyOnce => 'Une seule fois';

  @override
  String get recurringStartDateLabel => 'Première échéance';

  @override
  String get recurringScheduleLocked =>
      'La fréquence et la première échéance ne se modifient pas : supprimez la récurrence et créez-en une autre.';

  @override
  String get recurringModeAuto => 'Enregistrer automatiquement à l’échéance';

  @override
  String get recurringModeAutoHint =>
      'Sinon, une confirmation vous est demandée.';

  @override
  String get recurringRemindThreeDays => 'Rappel 3 jours avant';

  @override
  String get recurringRemindOnDueDate => 'Rappel le jour de l’échéance';

  @override
  String get recurringReminderTime => 'Heure des rappels';

  @override
  String get recurringSaved => 'Récurrence enregistrée.';

  @override
  String get recurringDeleted => 'Récurrence supprimée.';

  @override
  String get recurringDelete => 'Supprimer';

  @override
  String get recurringAwaiting => 'À confirmer';

  @override
  String get occurrencePay => 'Payer';

  @override
  String get occurrenceConfirm => 'Confirmer';

  @override
  String get occurrenceAdjust => 'Ajuster le montant';

  @override
  String get occurrenceSkip => 'Sauter';

  @override
  String get occurrenceResetAmount => 'Revenir au montant prévu';

  @override
  String get occurrencePaid => 'Échéance payée : dépense enregistrée.';

  @override
  String get occurrenceSkipped => 'Échéance sautée.';

  @override
  String get occurrenceAdjusted => 'Montant ajusté.';

  @override
  String get recurringOffline =>
      'Connexion requise pour consulter ou modifier les récurrences.';

  @override
  String get recurringInvalid =>
      'Refusé : vérifiez les champs (catégorie, date).';

  @override
  String get recurringConflict =>
      'Les récurrences ont changé entre-temps : liste rechargée.';

  @override
  String recurringDue(String date) {
    return 'Échéance le $date';
  }

  @override
  String recurringEstimated(String amount) {
    return '≈ $amount';
  }

  @override
  String recurringReminderTimeValue(String time) {
    return '$time, heure locale';
  }

  @override
  String recurringDeleteConfirm(String name) {
    return 'Supprimer « $name » et ses échéances en attente ? Les dépenses déjà enregistrées sont conservées.';
  }

  @override
  String occurrenceSkipConfirm(String date) {
    return 'Sauter l’échéance du $date ? Aucune dépense ne sera enregistrée.';
  }

  @override
  String get dashboardOffline =>
      'Connexion requise pour afficher les indicateurs de la période.';

  @override
  String get dashboardUpcomingTitle => 'Prochaines échéances';

  @override
  String get dashboardUpcomingEmpty => 'Aucune échéance à venir.';

  @override
  String get dashboardOverdue => 'En retard';

  @override
  String get dashboardCategoriesTitle => 'Répartition par catégorie';

  @override
  String get dashboardCategoriesEmpty => 'Aucune dépense sur la période.';

  @override
  String get dashboardCategoryUnknown => 'Catégorie indisponible';

  @override
  String dashboardCategoryShare(String amount, int percent) {
    return '$amount · $percent %';
  }

  @override
  String get dashboardCumulativeTitle => 'Cumul de la période';

  @override
  String dashboardCumulativeVsPrevious(String current, String previous) {
    return '$current à ce jour, contre $previous au même jour de la période précédente.';
  }

  @override
  String dashboardCumulativeOnly(String current) {
    return '$current à ce jour.';
  }

  @override
  String get dashboardCurrentPeriod => 'Période en cours';

  @override
  String get dashboardPreviousPeriod => 'Période précédente';

  @override
  String get dashboardEvolutionTitle => '12 dernières périodes';

  @override
  String dashboardEvolutionRange(String start, String end) {
    return 'Du $start au $end';
  }

  @override
  String dashboardEvolutionItem(String period, String amount) {
    return '$period : $amount';
  }

  @override
  String dashboardEvolutionCurrentItem(String period, String amount) {
    return '$period (en cours) : $amount';
  }

  @override
  String get dashboardRecentTitle => 'Dernières dépenses';

  @override
  String get notificationsTitle => 'Notifications';

  @override
  String get notificationsSettingsHint =>
      'Types, plage de silence, rappel quotidien';

  @override
  String get notificationsOffline =>
      'Connexion requise pour consulter ou modifier les notifications.';

  @override
  String get notificationsTypes => 'Types de notification';

  @override
  String get notificationsLimit => 'Limite de dépenses';

  @override
  String get notificationsLimitHint => 'À 80 % et à 100 % de la limite';

  @override
  String get notificationsOccurrence => 'Dépenses récurrentes';

  @override
  String get notificationsOccurrenceHint => 'Échéances à venir et à confirmer';

  @override
  String get notificationsUnusual => 'Dépense inhabituelle';

  @override
  String get notificationsUnusualHint =>
      'Dépense nettement plus élevée que d’habitude';

  @override
  String get notificationsDaily => 'Rappel quotidien';

  @override
  String get notificationsDailyHint =>
      '« Avez-vous noté vos dépenses du jour ? »';

  @override
  String get notificationsDailyTime => 'Heure du rappel quotidien';

  @override
  String get notificationsQuiet => 'Plage de silence';

  @override
  String get notificationsQuietEnable => 'Activer la plage de silence';

  @override
  String get notificationsQuietHint =>
      'Les notifications sont reportées à la fin de la plage.';

  @override
  String get notificationsQuietStart => 'Début';

  @override
  String get notificationsQuietEnd => 'Fin';

  @override
  String get notificationsQuietInvalid =>
      'Le début et la fin de la plage doivent être différents.';

  @override
  String get notificationsNoAmount =>
      'Aucun montant n’apparaît dans les notifications.';

  @override
  String get accountTitle => 'Compte';

  @override
  String get accountSettingsHint =>
      'Exports, suppression du compte, informations légales';

  @override
  String get accountOffline =>
      'Connexion impossible. Réessayez une fois en ligne.';

  @override
  String get exportExpensesTitle => 'Exporter mes dépenses';

  @override
  String get exportFrom => 'Du';

  @override
  String get exportTo => 'Au';

  @override
  String get exportCsv => 'CSV';

  @override
  String get exportExcel => 'Excel (Premium)';

  @override
  String get exportExpensesAction => 'Exporter';

  @override
  String get exportPreparing => 'Préparation du fichier…';

  @override
  String get exportPremiumOnly =>
      'L’export Excel est réservé à l’abonnement Premium. L’export CSV reste gratuit.';

  @override
  String get exportFailed =>
      'L’export n’a pas pu être préparé. Réessayez plus tard.';

  @override
  String get exportPeriodInvalid =>
      'La date de début doit précéder la date de fin.';

  @override
  String get accountDataTitle => 'Mes données';

  @override
  String get exportPersonalAction => 'Exporter mes données personnelles';

  @override
  String get exportPersonalHint => 'Archive zip au format JSON et CSV';

  @override
  String get legalTitle => 'Informations légales';

  @override
  String get legalLicenses => 'Licences des logiciels';

  @override
  String get deleteAccountAction => 'Supprimer mon compte';

  @override
  String get deleteAccountHint =>
      'Efface définitivement le compte et toutes ses données';

  @override
  String get deleteAccountConfirmTitle => 'Supprimer votre compte ?';

  @override
  String get deleteAccountConfirmBody =>
      'Votre compte et toutes vos données (dépenses, catégories, limites, dépenses récurrentes, réglages) seront supprimés immédiatement et définitivement. Cette action est irréversible. Pensez à exporter vos données avant.';

  @override
  String get deleteAccountWord => 'SUPPRIMER';

  @override
  String deleteAccountTypeWord(String word) {
    return 'Saisissez $word pour confirmer';
  }

  @override
  String get deleteAccountConfirm => 'Supprimer définitivement';

  @override
  String get deleteFailed => 'La suppression a échoué. Réessayez.';

  @override
  String get accountDeleted => 'Votre compte a été supprimé.';

  @override
  String get subscriptionTitle => 'Abonnement';

  @override
  String get planFree => 'Offre gratuite';

  @override
  String get planTrial => 'Essai Premium';

  @override
  String get planPremium => 'Premium';

  @override
  String planTrialUntil(String date) {
    return 'Essai Premium jusqu’au $date inclus';
  }

  @override
  String planPremiumUntil(String date) {
    return 'Premium jusqu’au $date';
  }

  @override
  String get planReadOnly =>
      'Hors Premium, les fonctions Premium passent en lecture seule : aucune donnée n’est supprimée et l’export CSV reste gratuit.';

  @override
  String get premiumIncludes => 'Premium : export Excel des dépenses.';

  @override
  String get trialStart => 'Essayer Premium gratuitement pendant 14 jours';

  @override
  String get trialHint => 'Sans engagement : aucun moyen de paiement demandé.';

  @override
  String get trialStarted => 'Essai Premium activé.';

  @override
  String get trialUsed => 'L’essai gratuit a déjà été utilisé sur ce compte.';

  @override
  String get subscriptionOffline => 'Abonnement indisponible hors connexion.';

  @override
  String get subscriptionFailed => 'L’opération a échoué. Réessayez.';

  @override
  String get storeUnavailable =>
      'Les achats ne sont pas disponibles sur cet appareil.';

  @override
  String get restorePurchases => 'Restaurer mes achats';

  @override
  String get restoreRequested => 'Recherche de vos achats auprès du store…';

  @override
  String get manageSubscription => 'Gérer ou résilier l’abonnement';

  @override
  String get manageSubscriptionHint =>
      'Ouvre la gestion des abonnements du store';

  @override
  String get purchaseActivated => 'Premium activé. Merci !';

  @override
  String get purchaseRestored => 'Achat restauré.';

  @override
  String get purchasePending => 'Achat en attente de validation par le store.';

  @override
  String get purchaseInvalid => 'Cet achat n’a pas pu être vérifié.';

  @override
  String get purchaseOtherAccount =>
      'Cet achat est déjà lié à un autre compte Depenseo.';

  @override
  String get purchaseRetryLater =>
      'Vérification impossible pour l’instant : elle sera retentée automatiquement.';

  @override
  String get purchaseFailed => 'L’achat n’a pas abouti.';

  @override
  String get exportExcelLocked => 'Export Excel réservé à Premium.';
}
