// Textes légaux embarqués (§6, ADR-057). Brouillons à faire valider par un
// juriste avant publication (§6) ; l'identité de l'éditeur et l'adresse de
// contact sont fixées à la compilation (`--dart-define`, ADR-057, P7-07).

/// Identité de l'éditeur : `--dart-define=LEGAL_PUBLISHER=…` (raison sociale,
/// forme, capital, siège, RCS/SIREN, directeur de la publication).
const legalPublisher = String.fromEnvironment('LEGAL_PUBLISHER');

/// Contact données personnelles : `--dart-define=LEGAL_CONTACT_EMAIL=…`.
const legalContactEmail = String.fromEnvironment('LEGAL_CONTACT_EMAIL');

/// Documents obligatoires accessibles depuis l'app (§6).
enum LegalDoc { legalNotice, privacy, terms, sales, accessibility }

class LegalSection {
  const LegalSection(this.heading, this.body);

  final String heading;
  final String body;
}

class LegalText {
  const LegalText(this.title, this.sections);

  final String title;
  final List<LegalSection> sections;
}

String _or(String value, String missing) => value.isEmpty ? missing : value;

/// En release, l'éditeur et le contact sont obligatoires (aucun texte « à
/// compléter » publié).
void checkLegalConfig({
  required bool release,
  String publisher = legalPublisher,
  String contact = legalContactEmail,
}) {
  if (release && (publisher.trim().isEmpty || contact.trim().isEmpty)) {
    throw StateError(
      'LEGAL_PUBLISHER et LEGAL_CONTACT_EMAIL sont obligatoires en release',
    );
  }
}

/// Texte de [doc] en français, ou en anglais pour toute autre langue.
LegalText legalText(LegalDoc doc, String languageCode) =>
    languageCode == 'fr' ? _fr(doc) : _en(doc);

LegalText _fr(LegalDoc doc) {
  final publisher = _or(
    legalPublisher,
    '[Éditeur, directeur de la publication et médiateur à compléter]',
  );
  final contact = _or(legalContactEmail, '[adresse à compléter]');
  return switch (doc) {
    LegalDoc.legalNotice => LegalText('Mentions légales', [
      LegalSection('Éditeur', publisher),
      LegalSection(
        'Contact',
        'Pour toute question, y compris sur vos données personnelles : $contact.',
      ),
      const LegalSection(
        'Hébergement',
        'Les données sont hébergées en France par o2switch '
            '(Clermont-Ferrand) ; copie des sauvegardes dans l’Union européenne.',
      ),
      const LegalSection(
        'Logiciels tiers',
        'L’application chiffre ses données locales avec SQLCipher '
            '(licence BSD, © Zetetic LLC), qui s’appuie sur OpenSSL '
            '(licence Apache 2.0, © The OpenSSL Project Authors). '
            'Le texte complet de ces licences et de celles des autres '
            'composants figure dans « Licences des logiciels ».',
      ),
    ]),
    LegalDoc.privacy => LegalText('Politique de confidentialité', [
      LegalSection('Responsable du traitement', publisher),
      const LegalSection(
        'Données traitées',
        'Adresse e-mail, préférences (langue, fuseau, devise), dépenses, '
            'catégories, limites, dépenses récurrentes et, si vous activez les '
            'notifications, l’identifiant de notification de l’appareil. '
            'Aucune connexion bancaire, aucun revenu ni solde.',
      ),
      const LegalSection(
        'Finalités et base légale',
        'Fournir le service de suivi des dépenses (exécution du contrat) et '
            'gérer l’abonnement Premium. Aucune publicité, aucune revente.',
      ),
      const LegalSection(
        'Conservation',
        'Vos données sont conservées tant que votre compte existe. La '
            'suppression du compte depuis l’application efface immédiatement '
            'et définitivement vos données ; les sauvegardes sont écrasées '
            'à leur rotation.',
      ),
      const LegalSection(
        'Sous-traitants',
        'Hébergement et sauvegardes dans l’Union européenne. Certains '
            'prestataires techniques peuvent traiter des données hors de '
            'l’Union : notifications (Google Firebase Cloud Messaging, Apple '
            'Push Notification service, sans montant ni libellé de dépense), '
            'connexion avec Apple ou Google si vous la choisissez, envoi des '
            'e-mails du compte. Ces transferts sont encadrés par une décision '
            'd’adéquation ou des clauses contractuelles types.',
      ),
      const LegalSection(
        'Sécurité',
        'Échanges chiffrés (TLS) et données locales chiffrées sur l’appareil.',
      ),
      LegalSection(
        'Vos droits',
        'Accès, rectification, effacement, portabilité, limitation et '
            'opposition. L’export de vos données (JSON et CSV) et la '
            'suppression du compte sont disponibles dans Réglages › Compte. '
            'Contact : $contact. Vous pouvez saisir la CNIL (cnil.fr).',
      ),
    ]),
    LegalDoc.terms => const LegalText('Conditions générales d’utilisation', [
      LegalSection(
        'Objet',
        'Depenseo permet de noter et de suivre vos dépenses personnelles. '
            'L’application ne gère ni revenus, ni soldes, ni comptes bancaires.',
      ),
      LegalSection(
        'Compte',
        'Vous êtes responsable de la confidentialité de vos identifiants. '
            'Vous pouvez supprimer votre compte à tout moment depuis '
            'l’application.',
      ),
      LegalSection(
        'Responsabilité',
        'Les totaux, limites et projections sont fournis à titre indicatif '
            'et ne constituent pas un conseil financier.',
      ),
      LegalSection(
        'Droit applicable',
        'Droit français. En cas de litige, vous pouvez recourir gratuitement '
            'au médiateur de la consommation désigné par l’éditeur, dont les '
            'coordonnées figurent dans les mentions légales.',
      ),
    ]),
    LegalDoc.sales => const LegalText('Conditions générales de vente', [
      LegalSection(
        'Offre',
        'L’abonnement Premium (2,49 € TTC par mois ou 19,99 € TTC par an) '
            'débloque des fonctions supplémentaires, dont l’export Excel. '
            'Un essai gratuit de 14 jours, sans engagement, est proposé.',
      ),
      LegalSection(
        'Paiement et renouvellement',
        'Le paiement est encaissé par l’App Store ou Google Play. '
            'L’abonnement se renouvelle automatiquement sauf résiliation au '
            'moins 24 heures avant la fin de la période en cours.',
      ),
      LegalSection(
        'Résiliation',
        'La résiliation se fait depuis la gestion des abonnements de '
            'l’App Store ou de Google Play. À l’expiration, aucune donnée '
            'n’est supprimée : les fonctions Premium passent en lecture seule.',
      ),
    ]),
    LegalDoc.accessibility => const LegalText('Déclaration d’accessibilité', [
      LegalSection(
        'Engagement',
        'Depenseo vise la conformité au niveau AA des WCAG 2.1 : lecteurs '
            'd’écran (VoiceOver, TalkBack), tailles de texte dynamiques, '
            'contrastes suffisants.',
      ),
      LegalSection(
        'État de conformité',
        'Partiellement conforme : l’audit complet n’a pas encore été réalisé.',
      ),
      LegalSection(
        'Signaler un défaut',
        'Si un contenu vous est inaccessible, écrivez-nous à l’adresse '
            'indiquée dans les mentions légales : nous vous répondrons et '
            'corrigerons le défaut.',
      ),
    ]),
  };
}

LegalText _en(LegalDoc doc) {
  final publisher = _or(
    legalPublisher,
    '[Publisher, publication director and mediator to be completed]',
  );
  final contact = _or(legalContactEmail, '[address to be completed]');
  return switch (doc) {
    LegalDoc.legalNotice => LegalText('Legal notice', [
      LegalSection('Publisher', publisher),
      LegalSection(
        'Contact',
        'For any question, including about your personal data: $contact.',
      ),
      const LegalSection(
        'Hosting',
        'Data is hosted in France by o2switch (Clermont-Ferrand); backup '
            'copies are kept in the European Union.',
      ),
      const LegalSection(
        'Third-party software',
        'The app encrypts its local data with SQLCipher (BSD licence, '
            '© Zetetic LLC), which relies on OpenSSL (Apache 2.0 licence, '
            '© The OpenSSL Project Authors). The full text of these and other '
            'licences is available in “Software licences”.',
      ),
    ]),
    LegalDoc.privacy => LegalText('Privacy policy', [
      LegalSection('Data controller', publisher),
      const LegalSection(
        'Data processed',
        'Email address, preferences (language, time zone, currency), '
            'expenses, categories, limits, recurring expenses and, if you '
            'enable notifications, the device notification identifier. '
            'No bank connection, no income or balances.',
      ),
      const LegalSection(
        'Purposes and legal basis',
        'Providing the expense tracking service (performance of contract) '
            'and managing the Premium subscription. No advertising, no resale.',
      ),
      const LegalSection(
        'Retention',
        'Your data is kept as long as your account exists. Deleting your '
            'account in the app erases your data immediately and permanently; '
            'backups are overwritten as they rotate.',
      ),
      const LegalSection(
        'Processors',
        'Hosting and backups in the European Union. Some technical providers '
            'may process data outside the Union: notifications (Google '
            'Firebase Cloud Messaging, Apple Push Notification service, with '
            'no amount or expense label), sign-in with Apple or Google if you '
            'choose it, account emails. These transfers rely on an adequacy '
            'decision or standard contractual clauses.',
      ),
      const LegalSection(
        'Security',
        'Encrypted connections (TLS) and local data encrypted on the device.',
      ),
      LegalSection(
        'Your rights',
        'Access, rectification, erasure, portability, restriction and '
            'objection. Exporting your data (JSON and CSV) and deleting your '
            'account are available in Settings › Account. Contact: $contact. '
            'You may lodge a complaint with the CNIL (cnil.fr).',
      ),
    ]),
    LegalDoc.terms => const LegalText('Terms of use', [
      LegalSection(
        'Purpose',
        'Depenseo lets you record and track your personal expenses. The app '
            'does not handle income, balances or bank accounts.',
      ),
      LegalSection(
        'Account',
        'You are responsible for keeping your credentials confidential. You '
            'can delete your account at any time from the app.',
      ),
      LegalSection(
        'Liability',
        'Totals, limits and projections are indicative and do not constitute '
            'financial advice.',
      ),
      LegalSection(
        'Governing law',
        'French law. In case of dispute, you may use, free of charge, the '
            'consumer mediator appointed by the publisher, whose details are '
            'given in the legal notice.',
      ),
    ]),
    LegalDoc.sales => const LegalText('Terms of sale', [
      LegalSection(
        'Offer',
        'The Premium subscription (€2.49 per month or €19.99 per year, VAT '
            'included) unlocks additional features, including Excel export. '
            'A 14-day free trial with no commitment is offered.',
      ),
      LegalSection(
        'Payment and renewal',
        'Payment is collected by the App Store or Google Play. The '
            'subscription renews automatically unless cancelled at least '
            '24 hours before the end of the current period.',
      ),
      LegalSection(
        'Cancellation',
        'Cancel from the App Store or Google Play subscription management. '
            'After expiry, no data is deleted: Premium features become '
            'read-only.',
      ),
    ]),
    LegalDoc.accessibility => const LegalText('Accessibility statement', [
      LegalSection(
        'Commitment',
        'Depenseo aims for WCAG 2.1 level AA: screen readers (VoiceOver, '
            'TalkBack), dynamic text sizes, sufficient contrast.',
      ),
      LegalSection(
        'Compliance status',
        'Partially compliant: a full audit has not yet been carried out.',
      ),
      LegalSection(
        'Report an issue',
        'If some content is not accessible to you, write to the address given '
            'in the legal notice: we will reply and fix the issue.',
      ),
    ]),
  };
}
