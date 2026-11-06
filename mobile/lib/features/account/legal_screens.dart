import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/generated/app_localizations.dart';
import 'legal_texts.dart';

/// Chemin de [doc] sous `/settings/legal` (`legal-notice`, `privacy`…).
String legalSlug(LegalDoc doc) => switch (doc) {
  LegalDoc.legalNotice => 'legal-notice',
  LegalDoc.privacy => 'privacy',
  LegalDoc.terms => 'terms',
  LegalDoc.sales => 'sales',
  LegalDoc.accessibility => 'accessibility',
};

LegalDoc? legalDocFromSlug(String? slug) =>
    LegalDoc.values.where((d) => legalSlug(d) == slug).firstOrNull;

/// Licences absentes du registre Flutter : bibliothèques natives (ADR-046)
/// et police embarquée (ADR-069, texte lu depuis les assets).
void registerNativeLicenses() {
  LicenseRegistry.addLicense(
    () => Stream.fromIterable(const [
      LicenseEntryWithLineBreaks(['SQLCipher'], _sqlcipherLicense),
      LicenseEntryWithLineBreaks(['OpenSSL'], _opensslLicense),
    ]),
  );
  LicenseRegistry.addLicense(() async* {
    yield LicenseEntryWithLineBreaks([
      'Plus Jakarta Sans',
    ], await rootBundle.loadString('assets/fonts/OFL.txt'));
  });
}

/// Liste des documents légaux et licences (§6).
class LegalScreen extends StatelessWidget {
  const LegalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.legalTitle)),
      body: ListView(
        children: [
          for (final doc in LegalDoc.values)
            ListTile(
              key: Key('legal-${legalSlug(doc)}'),
              title: Text(legalText(doc, language).title),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/settings/legal/${legalSlug(doc)}'),
            ),
          ListTile(
            key: const Key('legal-licenses'),
            title: Text(l10n.legalLicenses),
            trailing: const Icon(Icons.chevron_right),
            onTap: () =>
                showLicensePage(context: context, applicationName: 'Depenseo'),
          ),
        ],
      ),
    );
  }
}

class LegalDocScreen extends StatelessWidget {
  const LegalDocScreen({super.key, required this.doc});

  final LegalDoc doc;

  @override
  Widget build(BuildContext context) {
    final text = legalText(doc, Localizations.localeOf(context).languageCode);
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(text.title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          for (final section in text.sections) ...[
            Semantics(
              header: true,
              child: Text(section.heading, style: theme.textTheme.titleMedium),
            ),
            const SizedBox(height: 4),
            Text(section.body),
            const SizedBox(height: 16),
          ],
        ],
      ),
    );
  }
}

const _sqlcipherLicense = '''
Copyright (c) 2008, ZETETIC LLC
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * Neither the name of the ZETETIC LLC nor the
      names of its contributors may be used to endorse or promote products
      derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY ZETETIC LLC ''AS IS'' AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL ZETETIC LLC BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.''';

const _opensslLicense = '''
Copyright (c) The OpenSSL Project Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.''';
