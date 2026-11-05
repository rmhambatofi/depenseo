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

  @override
  String get expenseListTitle => 'Expenses';

  @override
  String get editExpenseTitle => 'Edit expense';

  @override
  String get expenseNotFound => 'This expense no longer exists.';

  @override
  String get deleteExpense => 'Delete expense';

  @override
  String get expenseDeleted => 'Expense deleted.';

  @override
  String get undo => 'Undo';

  @override
  String get expenseConflictExplanation =>
      'This expense was deleted on another device. Restore it to keep your version, or discard it.';

  @override
  String get restoreExpense => 'Restore';

  @override
  String get discardExpense => 'Discard';

  @override
  String get discardExpenseConfirm =>
      'Discard this expense? It will stay deleted.';

  @override
  String get restoreFailed =>
      'Could not restore. Check your connection and try again.';

  @override
  String get expenseRestored => 'Expense restored.';

  @override
  String get expenseDiscarded => 'Expense discarded.';

  @override
  String get searchLabel => 'Search';

  @override
  String get searchHint => 'Note or merchant';

  @override
  String get searchEmpty => 'No matching expenses.';

  @override
  String get filtersTitle => 'Filters';

  @override
  String get filtersActive => 'Filters on';

  @override
  String get filtersApply => 'Apply';

  @override
  String get filtersReset => 'Clear filters';

  @override
  String get periodLabel => 'Period';

  @override
  String get periodAny => 'All dates';

  @override
  String get minAmountLabel => 'Minimum amount';

  @override
  String get maxAmountLabel => 'Maximum amount';

  @override
  String get amountRangeInvalid =>
      'The maximum must be greater than or equal to the minimum.';

  @override
  String get undoTooLate => 'Too late: the deletion has already been saved.';

  @override
  String get categoriesTitle => 'Categories';

  @override
  String get categoriesSettingsHint => 'Name, icon, colour and hiding';

  @override
  String get categoryAdd => 'New category';

  @override
  String get categoryEdit => 'Edit category';

  @override
  String get categoryNameLabel => 'Name';

  @override
  String get categoryNameRequired => 'Enter a name.';

  @override
  String get categoryNameTooLong => '100 characters at most.';

  @override
  String get categoryIconLabel => 'Icon (emoji)';

  @override
  String get categoryIconRequired => 'Choose an icon.';

  @override
  String get categoryIconTooLong => 'Icon too long.';

  @override
  String get categoryColorLabel => 'Colour';

  @override
  String categoryColorOption(String hex) {
    return 'Colour $hex';
  }

  @override
  String get categoryParentLabel => 'Parent category';

  @override
  String get categoryParentNone => 'None (main category)';

  @override
  String get categoryHidden => 'Hidden: not offered when adding expenses';

  @override
  String categoryShownInEntry(String name) {
    return 'Offer “$name” when adding expenses';
  }

  @override
  String get categoryWriteOffline =>
      'A connection is needed to change categories. Try again once online.';

  @override
  String get categoryWriteInvalid => 'Change refused: check the fields.';

  @override
  String get categoryWriteGone => 'This category no longer exists.';

  @override
  String get categoryHiddenWithParent =>
      'Not offered when adding expenses: its parent category is hidden';

  @override
  String get limitsTitle => 'Spending limit';

  @override
  String get limitsSettingsHint => 'Monthly or weekly cap';

  @override
  String get limitCurrentTitle => 'Current period';

  @override
  String get limitSettingsTitle => 'Limit settings';

  @override
  String get limitKindNone => 'None';

  @override
  String get limitKindMonth => 'Monthly';

  @override
  String get limitKindWeek => 'Weekly';

  @override
  String get limitAmountLabel => 'Limit amount';

  @override
  String get limitStartDayMonth => 'Spending month starts on';

  @override
  String limitStartDayOption(int day) {
    return 'Day $day';
  }

  @override
  String get limitStartDayWeek => 'First day of the week';

  @override
  String get limitIncludeRecurring => 'Include recurring expenses';

  @override
  String get limitIncludeRecurringHint => 'Paid bills count towards the limit.';

  @override
  String limitPeriod(String start, String end) {
    return 'From $start to $end';
  }

  @override
  String limitSpentOf(String spent, String limit) {
    return '$spent spent of $limit';
  }

  @override
  String limitSpentNoLimit(String spent) {
    return '$spent spent this period';
  }

  @override
  String limitRemaining(String amount) {
    return '$amount left before the limit';
  }

  @override
  String limitExceeded(String amount) {
    return 'Limit exceeded by $amount';
  }

  @override
  String limitPaceMonth(int consumed, int elapsed) {
    return '$consumed% of the limit used at $elapsed% of the month';
  }

  @override
  String limitPaceWeek(int consumed, int elapsed) {
    return '$consumed% of the limit used at $elapsed% of the week';
  }

  @override
  String get limitNone => 'No limit set';

  @override
  String limitUpcoming(String date) {
    return 'These settings apply from $date.';
  }

  @override
  String get limitSaved => 'Limit saved.';

  @override
  String get limitOffline =>
      'You need a connection to view or change the limit.';

  @override
  String get limitInvalid => 'Settings rejected: check the fields.';

  @override
  String get limitConflict =>
      'The limit changed in the meantime: check and save again.';

  @override
  String get recurringTitle => 'Recurring expenses';

  @override
  String get recurringSettingsHint => 'Rent, subscriptions, bills to pay';

  @override
  String get recurringUpcomingTitle => 'Pending payments';

  @override
  String get recurringUpcomingNone => 'No pending payment.';

  @override
  String get recurringListTitle => 'Recurring expenses';

  @override
  String get recurringNone =>
      'No recurring expense yet: add your rent, subscriptions…';

  @override
  String get recurringAdd => 'New recurring expense';

  @override
  String get recurringEditTitle => 'Edit recurring expense';

  @override
  String get recurringNameLabel => 'Name';

  @override
  String get recurringNameRequired => 'Enter a name.';

  @override
  String get recurringAmountFixed => 'Fixed';

  @override
  String get recurringAmountEstimated => 'Estimated';

  @override
  String get recurringFrequencyLabel => 'Frequency';

  @override
  String get recurringFrequencyWeekly => 'Every week';

  @override
  String get recurringFrequencyMonthly => 'Every month';

  @override
  String get recurringFrequencyQuarterly => 'Every quarter';

  @override
  String get recurringFrequencyYearly => 'Every year';

  @override
  String get recurringFrequencyOnce => 'Once';

  @override
  String get recurringStartDateLabel => 'First due date';

  @override
  String get recurringScheduleLocked =>
      'Frequency and first due date cannot be changed: delete this recurring expense and create another one.';

  @override
  String get recurringModeAuto => 'Record automatically when due';

  @override
  String get recurringModeAutoHint =>
      'Otherwise, you will be asked to confirm.';

  @override
  String get recurringRemindThreeDays => 'Reminder 3 days before';

  @override
  String get recurringRemindOnDueDate => 'Reminder on the due date';

  @override
  String get recurringReminderTime => 'Reminder time';

  @override
  String get recurringSaved => 'Recurring expense saved.';

  @override
  String get recurringDeleted => 'Recurring expense deleted.';

  @override
  String get recurringDelete => 'Delete';

  @override
  String get recurringAwaiting => 'To confirm';

  @override
  String get occurrencePay => 'Pay';

  @override
  String get occurrenceConfirm => 'Confirm';

  @override
  String get occurrenceAdjust => 'Adjust amount';

  @override
  String get occurrenceSkip => 'Skip';

  @override
  String get occurrenceResetAmount => 'Back to the planned amount';

  @override
  String get occurrencePaid => 'Payment recorded as an expense.';

  @override
  String get occurrenceSkipped => 'Payment skipped.';

  @override
  String get occurrenceAdjusted => 'Amount adjusted.';

  @override
  String get recurringOffline =>
      'A connection is required to view or edit recurring expenses.';

  @override
  String get recurringInvalid => 'Rejected: check the fields (category, date).';

  @override
  String get recurringConflict =>
      'Recurring expenses changed in the meantime: list reloaded.';

  @override
  String recurringDue(String date) {
    return 'Due on $date';
  }

  @override
  String recurringEstimated(String amount) {
    return '≈ $amount';
  }

  @override
  String recurringReminderTimeValue(String time) {
    return '$time, local time';
  }

  @override
  String recurringDeleteConfirm(String name) {
    return 'Delete “$name” and its pending payments? Expenses already recorded are kept.';
  }

  @override
  String occurrenceSkipConfirm(String date) {
    return 'Skip the payment due on $date? No expense will be recorded.';
  }
}
