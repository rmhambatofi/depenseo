/// Bornes de l'API (`expense-input.ts`), en unités UTF-16.
const maxTags = 10;
const maxTagLength = 50;
const noteMaxLength = 500;
const merchantMaxLength = 100;

enum TagsErrorKind { tooMany, tooLong }

sealed class TagsParse {
  const TagsParse();
}

class TagsOk extends TagsParse {
  const TagsOk(this.names);

  final List<String> names;
}

class TagsError extends TagsParse {
  const TagsError(this.kind);

  final TagsErrorKind kind;
}

/// Découpe une saisie « courses, vacances » : noms rognés, vides ignorés,
/// doublons (sans tenir compte de la casse) retirés en gardant le premier.
/// Longueur en unités UTF-16, comme `z.string().max` côté API.
TagsParse parseTags(String input) {
  final seen = <String>{};
  final names = <String>[];
  for (final raw in input.split(',')) {
    final name = raw.trim();
    if (name.isEmpty || !seen.add(name.toLowerCase())) continue;
    if (name.length > maxTagLength) {
      return const TagsError(TagsErrorKind.tooLong);
    }
    names.add(name);
  }
  if (names.length > maxTags) return const TagsError(TagsErrorKind.tooMany);
  return TagsOk(names);
}
