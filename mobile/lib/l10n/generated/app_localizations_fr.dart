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
  String get categoryIconLabel => 'Icône (emoji)';

  @override
  String get categoryIconRequired => 'Choisissez une icône.';

  @override
  String get categoryIconTooLong => 'Icône trop longue.';

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
}
