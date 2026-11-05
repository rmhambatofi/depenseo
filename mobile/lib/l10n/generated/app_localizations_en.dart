// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Depenseo';

  @override
  String get homeTitle => 'My expenses';

  @override
  String get homeEmpty => 'No expenses yet.';

  @override
  String get logout => 'Sign out';

  @override
  String get emailLabel => 'Email address';

  @override
  String get passwordLabel => 'Password';

  @override
  String get newPasswordLabel => 'New password';

  @override
  String get loginTitle => 'Sign in';

  @override
  String get loginSubmit => 'Sign in';

  @override
  String get loginWithApple => 'Continue with Apple';

  @override
  String get loginWithGoogle => 'Continue with Google';

  @override
  String get goToRegister => 'Create an account';

  @override
  String get goToForgotPassword => 'Forgot password?';

  @override
  String get goToLogin => 'Go to sign in';

  @override
  String get registerTitle => 'Create an account';

  @override
  String get registerSubmit => 'Create my account';

  @override
  String get acceptTermsLabel =>
      'I accept the terms of use and the privacy policy.';

  @override
  String get termsRequired => 'Accept the terms to continue.';

  @override
  String get registerSentTitle => 'Check your email';

  @override
  String get registerSentBody =>
      'If this address can be used, a verification link has just been sent to it. Open it on this phone to activate your account.';

  @override
  String get socialTermsTitle => 'New account';

  @override
  String get socialTermsBody =>
      'No account exists yet for this address. To create it, accept the terms of use and the privacy policy.';

  @override
  String get socialTermsAccept => 'Accept and create';

  @override
  String get cancel => 'Cancel';

  @override
  String get forgotTitle => 'Forgot password';

  @override
  String get forgotSubmit => 'Send me a link';

  @override
  String get forgotSent =>
      'If an account exists for this address, a reset link valid for 30 minutes has just been sent.';

  @override
  String get resetTitle => 'New password';

  @override
  String get resetSubmit => 'Save';

  @override
  String get resetDone => 'Password changed. Sign in with your new password.';

  @override
  String get verifyTitle => 'Email verification';

  @override
  String get verifyDone => 'Address verified. You can now sign in.';

  @override
  String get invalidEmail => 'Enter a valid email address.';

  @override
  String get passwordTooShort => 'At least 8 characters.';

  @override
  String get passwordTooLong => 'At most 128 characters.';

  @override
  String get errorInvalidCredentials => 'Incorrect email or password.';

  @override
  String get errorEmailNotVerified =>
      'Address not verified: open the link sent by email.';

  @override
  String get errorInvalidLink =>
      'This link is invalid, expired or already used. Request a new one.';

  @override
  String get errorInvalidInput => 'Check the information you entered.';

  @override
  String get errorIdentityRejected =>
      'Sign-in could not be verified. Try again.';

  @override
  String get errorAccountNotLinkable =>
      'An account already uses this address: sign in with your email or reset the password.';

  @override
  String get errorProviderUnavailable =>
      'This sign-in method is temporarily unavailable.';

  @override
  String get errorNetwork => 'Cannot reach the server. Try again.';

  @override
  String get errorUnknown => 'Something went wrong. Try again.';

  @override
  String get storageErrorTitle => 'Secure storage unavailable';

  @override
  String get storageErrorBody =>
      'Depenseo cannot read its secure vault. Unlock the device and try again.';

  @override
  String get retry => 'Try again';

  @override
  String get settingsTitle => 'Settings';

  @override
  String get settingsSecurity => 'Security';

  @override
  String get lockEnable => 'Lock the app';

  @override
  String get lockEnableHint => '6-digit passcode required on opening';

  @override
  String get lockDelayLabel => 'Lock after';

  @override
  String get lockDelayImmediate => 'Immediately';

  @override
  String get lockDelayOneMinute => '1 min';

  @override
  String get lockDelayFiveMinutes => '5 min';

  @override
  String get lockBiometrics => 'Unlock with biometrics';

  @override
  String get lockScreenshots => 'Block screenshots';

  @override
  String get lockTitle => 'Depenseo is locked';

  @override
  String get lockPrompt => 'Enter your passcode';

  @override
  String lockWrongPin(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Wrong passcode. $count attempts left.',
      one: 'Wrong passcode. 1 attempt left.',
    );
    return '$_temp0';
  }

  @override
  String get lockUseBiometrics => 'Use biometrics';

  @override
  String get lockBiometricReason => 'Unlock Depenseo';

  @override
  String get lockForgot => 'Forgot passcode?';

  @override
  String get lockForgotBody =>
      'You will be signed out. Sign in again with your password, then choose a new passcode.';

  @override
  String get pinSetupTitle => 'Lock passcode';

  @override
  String get pinSetupPrompt => 'Choose a 6-digit passcode';

  @override
  String get pinSetupConfirm => 'Confirm the passcode';

  @override
  String get pinSetupMismatch => 'The passcodes do not match. Try again.';

  @override
  String get pinDelete => 'Delete';

  @override
  String get addExpense => 'Add an expense';

  @override
  String get quickEntryTitle => 'New expense';

  @override
  String get save => 'Save';

  @override
  String get amountLabel => 'Amount';

  @override
  String get amountEmpty => 'Enter an amount.';

  @override
  String get amountInvalid => 'Invalid amount.';

  @override
  String get amountTooManyDecimals => 'Too many decimals for this currency.';

  @override
  String get amountTooLarge => 'Amount too large.';

  @override
  String get amountNotPositive => 'The amount must be greater than zero.';

  @override
  String get categoryLabel => 'Category';

  @override
  String get categoryRequired => 'Choose a category.';

  @override
  String get categoriesUnavailable =>
      'Categories are not available yet. Go online to sync them.';

  @override
  String get dateLabel => 'Date';

  @override
  String get today => 'Today';

  @override
  String get noteLabel => 'Note';

  @override
  String get merchantLabel => 'Merchant or place';

  @override
  String get tagsLabel => 'Tags';

  @override
  String get tagsHint => 'Separated by commas';

  @override
  String get tagsTooMany => '10 tags at most.';

  @override
  String get tagTooLong => 'A tag is 50 characters at most.';

  @override
  String get expenseSaved => 'Expense saved.';

  @override
  String get accountUnavailable => 'Go online once to set up expense entry.';

  @override
  String get noteTooLong => '500 characters at most.';

  @override
  String get merchantTooLong => '100 characters at most.';

  @override
  String get saveFailed => 'Could not save. Try again.';

  @override
  String get expensePendingSync => 'Waiting to sync';

  @override
  String get expenseSyncRejected => 'Rejected by the server';

  @override
  String get categoryNotSynced => 'Unknown category';

  @override
  String get syncOffline =>
      'Offline: expenses will be sent when the network is back.';

  @override
  String get expenseSyncConflict =>
      'Conflicts with the server (deleted elsewhere?)';
}
