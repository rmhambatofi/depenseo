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
}
