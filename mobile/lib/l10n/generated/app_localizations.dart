import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_fr.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('fr'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In fr, this message translates to:
  /// **'Depenseo'**
  String get appTitle;

  /// No description provided for @homeTitle.
  ///
  /// In fr, this message translates to:
  /// **'Mes dépenses'**
  String get homeTitle;

  /// No description provided for @homeEmpty.
  ///
  /// In fr, this message translates to:
  /// **'Aucune dépense pour le moment.'**
  String get homeEmpty;

  /// No description provided for @logout.
  ///
  /// In fr, this message translates to:
  /// **'Se déconnecter'**
  String get logout;

  /// No description provided for @emailLabel.
  ///
  /// In fr, this message translates to:
  /// **'Adresse e-mail'**
  String get emailLabel;

  /// No description provided for @passwordLabel.
  ///
  /// In fr, this message translates to:
  /// **'Mot de passe'**
  String get passwordLabel;

  /// No description provided for @newPasswordLabel.
  ///
  /// In fr, this message translates to:
  /// **'Nouveau mot de passe'**
  String get newPasswordLabel;

  /// No description provided for @loginTitle.
  ///
  /// In fr, this message translates to:
  /// **'Connexion'**
  String get loginTitle;

  /// No description provided for @loginSubmit.
  ///
  /// In fr, this message translates to:
  /// **'Se connecter'**
  String get loginSubmit;

  /// No description provided for @loginWithApple.
  ///
  /// In fr, this message translates to:
  /// **'Continuer avec Apple'**
  String get loginWithApple;

  /// No description provided for @loginWithGoogle.
  ///
  /// In fr, this message translates to:
  /// **'Continuer avec Google'**
  String get loginWithGoogle;

  /// No description provided for @goToRegister.
  ///
  /// In fr, this message translates to:
  /// **'Créer un compte'**
  String get goToRegister;

  /// No description provided for @goToForgotPassword.
  ///
  /// In fr, this message translates to:
  /// **'Mot de passe oublié ?'**
  String get goToForgotPassword;

  /// No description provided for @goToLogin.
  ///
  /// In fr, this message translates to:
  /// **'Aller à la connexion'**
  String get goToLogin;

  /// No description provided for @registerTitle.
  ///
  /// In fr, this message translates to:
  /// **'Créer un compte'**
  String get registerTitle;

  /// No description provided for @registerSubmit.
  ///
  /// In fr, this message translates to:
  /// **'Créer mon compte'**
  String get registerSubmit;

  /// No description provided for @acceptTermsLabel.
  ///
  /// In fr, this message translates to:
  /// **'J’accepte les conditions générales d’utilisation et la politique de confidentialité.'**
  String get acceptTermsLabel;

  /// No description provided for @termsRequired.
  ///
  /// In fr, this message translates to:
  /// **'Acceptez les conditions pour continuer.'**
  String get termsRequired;

  /// No description provided for @registerSentTitle.
  ///
  /// In fr, this message translates to:
  /// **'Vérifiez votre adresse'**
  String get registerSentTitle;

  /// No description provided for @registerSentBody.
  ///
  /// In fr, this message translates to:
  /// **'Si cette adresse peut être utilisée, un lien de vérification vient d’y être envoyé. Ouvrez-le sur ce téléphone pour activer votre compte.'**
  String get registerSentBody;

  /// No description provided for @socialTermsTitle.
  ///
  /// In fr, this message translates to:
  /// **'Nouveau compte'**
  String get socialTermsTitle;

  /// No description provided for @socialTermsBody.
  ///
  /// In fr, this message translates to:
  /// **'Aucun compte n’existe encore pour cette adresse. Pour le créer, acceptez les conditions générales d’utilisation et la politique de confidentialité.'**
  String get socialTermsBody;

  /// No description provided for @socialTermsAccept.
  ///
  /// In fr, this message translates to:
  /// **'Accepter et créer'**
  String get socialTermsAccept;

  /// No description provided for @cancel.
  ///
  /// In fr, this message translates to:
  /// **'Annuler'**
  String get cancel;

  /// No description provided for @forgotTitle.
  ///
  /// In fr, this message translates to:
  /// **'Mot de passe oublié'**
  String get forgotTitle;

  /// No description provided for @forgotSubmit.
  ///
  /// In fr, this message translates to:
  /// **'Recevoir un lien'**
  String get forgotSubmit;

  /// No description provided for @forgotSent.
  ///
  /// In fr, this message translates to:
  /// **'Si un compte existe pour cette adresse, un lien de réinitialisation valable 30 minutes vient d’être envoyé.'**
  String get forgotSent;

  /// No description provided for @resetTitle.
  ///
  /// In fr, this message translates to:
  /// **'Nouveau mot de passe'**
  String get resetTitle;

  /// No description provided for @resetSubmit.
  ///
  /// In fr, this message translates to:
  /// **'Enregistrer'**
  String get resetSubmit;

  /// No description provided for @resetDone.
  ///
  /// In fr, this message translates to:
  /// **'Mot de passe modifié. Connectez-vous avec le nouveau mot de passe.'**
  String get resetDone;

  /// No description provided for @verifyTitle.
  ///
  /// In fr, this message translates to:
  /// **'Vérification de l’adresse'**
  String get verifyTitle;

  /// No description provided for @verifyDone.
  ///
  /// In fr, this message translates to:
  /// **'Adresse vérifiée. Vous pouvez vous connecter.'**
  String get verifyDone;

  /// No description provided for @invalidEmail.
  ///
  /// In fr, this message translates to:
  /// **'Saisissez une adresse e-mail valide.'**
  String get invalidEmail;

  /// No description provided for @passwordTooShort.
  ///
  /// In fr, this message translates to:
  /// **'8 caractères minimum.'**
  String get passwordTooShort;

  /// No description provided for @passwordTooLong.
  ///
  /// In fr, this message translates to:
  /// **'128 caractères maximum.'**
  String get passwordTooLong;

  /// No description provided for @errorInvalidCredentials.
  ///
  /// In fr, this message translates to:
  /// **'Adresse ou mot de passe incorrect.'**
  String get errorInvalidCredentials;

  /// No description provided for @errorEmailNotVerified.
  ///
  /// In fr, this message translates to:
  /// **'Adresse non vérifiée : ouvrez le lien reçu par e-mail.'**
  String get errorEmailNotVerified;

  /// No description provided for @errorInvalidLink.
  ///
  /// In fr, this message translates to:
  /// **'Ce lien est invalide, expiré ou déjà utilisé. Demandez-en un nouveau.'**
  String get errorInvalidLink;

  /// No description provided for @errorInvalidInput.
  ///
  /// In fr, this message translates to:
  /// **'Vérifiez les informations saisies.'**
  String get errorInvalidInput;

  /// No description provided for @errorIdentityRejected.
  ///
  /// In fr, this message translates to:
  /// **'La connexion n’a pas pu être vérifiée. Réessayez.'**
  String get errorIdentityRejected;

  /// No description provided for @errorAccountNotLinkable.
  ///
  /// In fr, this message translates to:
  /// **'Un compte existe déjà avec cette adresse : connectez-vous par e-mail ou réinitialisez le mot de passe.'**
  String get errorAccountNotLinkable;

  /// No description provided for @errorProviderUnavailable.
  ///
  /// In fr, this message translates to:
  /// **'Ce mode de connexion est momentanément indisponible.'**
  String get errorProviderUnavailable;

  /// No description provided for @errorNetwork.
  ///
  /// In fr, this message translates to:
  /// **'Pas de connexion au serveur. Réessayez.'**
  String get errorNetwork;

  /// No description provided for @errorUnknown.
  ///
  /// In fr, this message translates to:
  /// **'Une erreur est survenue. Réessayez.'**
  String get errorUnknown;

  /// No description provided for @storageErrorTitle.
  ///
  /// In fr, this message translates to:
  /// **'Stockage sécurisé inaccessible'**
  String get storageErrorTitle;

  /// No description provided for @storageErrorBody.
  ///
  /// In fr, this message translates to:
  /// **'Depenseo ne peut pas lire son coffre sécurisé. Déverrouillez l’appareil puis réessayez.'**
  String get storageErrorBody;

  /// No description provided for @retry.
  ///
  /// In fr, this message translates to:
  /// **'Réessayer'**
  String get retry;

  /// No description provided for @settingsTitle.
  ///
  /// In fr, this message translates to:
  /// **'Réglages'**
  String get settingsTitle;

  /// No description provided for @settingsSecurity.
  ///
  /// In fr, this message translates to:
  /// **'Sécurité'**
  String get settingsSecurity;

  /// No description provided for @lockEnable.
  ///
  /// In fr, this message translates to:
  /// **'Verrouiller l’application'**
  String get lockEnable;

  /// No description provided for @lockEnableHint.
  ///
  /// In fr, this message translates to:
  /// **'Code à 6 chiffres demandé à l’ouverture'**
  String get lockEnableHint;

  /// No description provided for @lockDelayLabel.
  ///
  /// In fr, this message translates to:
  /// **'Verrouiller après'**
  String get lockDelayLabel;

  /// No description provided for @lockDelayImmediate.
  ///
  /// In fr, this message translates to:
  /// **'Immédiat'**
  String get lockDelayImmediate;

  /// No description provided for @lockDelayOneMinute.
  ///
  /// In fr, this message translates to:
  /// **'1 min'**
  String get lockDelayOneMinute;

  /// No description provided for @lockDelayFiveMinutes.
  ///
  /// In fr, this message translates to:
  /// **'5 min'**
  String get lockDelayFiveMinutes;

  /// No description provided for @lockBiometrics.
  ///
  /// In fr, this message translates to:
  /// **'Déverrouiller par biométrie'**
  String get lockBiometrics;

  /// No description provided for @lockScreenshots.
  ///
  /// In fr, this message translates to:
  /// **'Bloquer les captures d’écran'**
  String get lockScreenshots;

  /// No description provided for @lockTitle.
  ///
  /// In fr, this message translates to:
  /// **'Depenseo est verrouillé'**
  String get lockTitle;

  /// No description provided for @lockPrompt.
  ///
  /// In fr, this message translates to:
  /// **'Saisissez votre code'**
  String get lockPrompt;

  /// No description provided for @lockWrongPin.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{Code incorrect. 1 essai restant.} other{Code incorrect. {count} essais restants.}}'**
  String lockWrongPin(int count);

  /// No description provided for @lockUseBiometrics.
  ///
  /// In fr, this message translates to:
  /// **'Utiliser la biométrie'**
  String get lockUseBiometrics;

  /// No description provided for @lockBiometricReason.
  ///
  /// In fr, this message translates to:
  /// **'Déverrouiller Depenseo'**
  String get lockBiometricReason;

  /// No description provided for @lockForgot.
  ///
  /// In fr, this message translates to:
  /// **'Code oublié ?'**
  String get lockForgot;

  /// No description provided for @lockForgotBody.
  ///
  /// In fr, this message translates to:
  /// **'Vous allez être déconnecté. Reconnectez-vous avec votre mot de passe, puis choisissez un nouveau code.'**
  String get lockForgotBody;

  /// No description provided for @pinSetupTitle.
  ///
  /// In fr, this message translates to:
  /// **'Code de verrouillage'**
  String get pinSetupTitle;

  /// No description provided for @pinSetupPrompt.
  ///
  /// In fr, this message translates to:
  /// **'Choisissez un code à 6 chiffres'**
  String get pinSetupPrompt;

  /// No description provided for @pinSetupConfirm.
  ///
  /// In fr, this message translates to:
  /// **'Confirmez le code'**
  String get pinSetupConfirm;

  /// No description provided for @pinSetupMismatch.
  ///
  /// In fr, this message translates to:
  /// **'Les codes ne correspondent pas. Recommencez.'**
  String get pinSetupMismatch;

  /// No description provided for @pinDelete.
  ///
  /// In fr, this message translates to:
  /// **'Effacer'**
  String get pinDelete;

  /// No description provided for @addExpense.
  ///
  /// In fr, this message translates to:
  /// **'Ajouter une dépense'**
  String get addExpense;

  /// No description provided for @quickEntryTitle.
  ///
  /// In fr, this message translates to:
  /// **'Nouvelle dépense'**
  String get quickEntryTitle;

  /// No description provided for @save.
  ///
  /// In fr, this message translates to:
  /// **'Enregistrer'**
  String get save;

  /// No description provided for @amountLabel.
  ///
  /// In fr, this message translates to:
  /// **'Montant'**
  String get amountLabel;

  /// No description provided for @amountEmpty.
  ///
  /// In fr, this message translates to:
  /// **'Saisissez un montant.'**
  String get amountEmpty;

  /// No description provided for @amountInvalid.
  ///
  /// In fr, this message translates to:
  /// **'Montant invalide.'**
  String get amountInvalid;

  /// No description provided for @amountTooManyDecimals.
  ///
  /// In fr, this message translates to:
  /// **'Trop de décimales pour cette devise.'**
  String get amountTooManyDecimals;

  /// No description provided for @amountTooLarge.
  ///
  /// In fr, this message translates to:
  /// **'Montant trop élevé.'**
  String get amountTooLarge;

  /// No description provided for @amountNotPositive.
  ///
  /// In fr, this message translates to:
  /// **'Le montant doit être supérieur à zéro.'**
  String get amountNotPositive;

  /// No description provided for @categoryLabel.
  ///
  /// In fr, this message translates to:
  /// **'Catégorie'**
  String get categoryLabel;

  /// No description provided for @categoryRequired.
  ///
  /// In fr, this message translates to:
  /// **'Choisissez une catégorie.'**
  String get categoryRequired;

  /// No description provided for @categoriesUnavailable.
  ///
  /// In fr, this message translates to:
  /// **'Les catégories ne sont pas encore disponibles. Connectez-vous à Internet pour les synchroniser.'**
  String get categoriesUnavailable;

  /// No description provided for @dateLabel.
  ///
  /// In fr, this message translates to:
  /// **'Date'**
  String get dateLabel;

  /// No description provided for @today.
  ///
  /// In fr, this message translates to:
  /// **'Aujourd\'hui'**
  String get today;

  /// No description provided for @noteLabel.
  ///
  /// In fr, this message translates to:
  /// **'Note'**
  String get noteLabel;

  /// No description provided for @merchantLabel.
  ///
  /// In fr, this message translates to:
  /// **'Marchand ou lieu'**
  String get merchantLabel;

  /// No description provided for @tagsLabel.
  ///
  /// In fr, this message translates to:
  /// **'Étiquettes'**
  String get tagsLabel;

  /// No description provided for @tagsHint.
  ///
  /// In fr, this message translates to:
  /// **'Séparées par des virgules'**
  String get tagsHint;

  /// No description provided for @tagsTooMany.
  ///
  /// In fr, this message translates to:
  /// **'10 étiquettes au maximum.'**
  String get tagsTooMany;

  /// No description provided for @tagTooLong.
  ///
  /// In fr, this message translates to:
  /// **'Une étiquette compte 50 caractères au maximum.'**
  String get tagTooLong;

  /// No description provided for @expenseSaved.
  ///
  /// In fr, this message translates to:
  /// **'Dépense enregistrée.'**
  String get expenseSaved;

  /// No description provided for @accountUnavailable.
  ///
  /// In fr, this message translates to:
  /// **'Connectez-vous à Internet une première fois pour préparer la saisie.'**
  String get accountUnavailable;

  /// No description provided for @noteTooLong.
  ///
  /// In fr, this message translates to:
  /// **'500 caractères au maximum.'**
  String get noteTooLong;

  /// No description provided for @merchantTooLong.
  ///
  /// In fr, this message translates to:
  /// **'100 caractères au maximum.'**
  String get merchantTooLong;

  /// No description provided for @saveFailed.
  ///
  /// In fr, this message translates to:
  /// **'Enregistrement impossible. Réessayez.'**
  String get saveFailed;

  /// No description provided for @expensePendingSync.
  ///
  /// In fr, this message translates to:
  /// **'En attente d\'envoi'**
  String get expensePendingSync;

  /// No description provided for @expenseSyncRejected.
  ///
  /// In fr, this message translates to:
  /// **'Refusée par le serveur'**
  String get expenseSyncRejected;

  /// No description provided for @categoryNotSynced.
  ///
  /// In fr, this message translates to:
  /// **'Catégorie inconnue'**
  String get categoryNotSynced;

  /// No description provided for @syncOffline.
  ///
  /// In fr, this message translates to:
  /// **'Hors ligne : les dépenses seront envoyées au retour du réseau.'**
  String get syncOffline;

  /// No description provided for @expenseSyncConflict.
  ///
  /// In fr, this message translates to:
  /// **'En conflit avec le serveur (supprimée ailleurs ?)'**
  String get expenseSyncConflict;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'fr'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
