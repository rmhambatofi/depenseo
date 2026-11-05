import 'package:dio/dio.dart';

import '../push/push_service.dart';

/// Plage de silence en heures locales `HH:MM` (début inclus, fin exclue, ADR-035).
class QuietHours {
  const QuietHours(this.start, this.end);

  final String start;
  final String end;

  Map<String, String> toJson() => {'start': start, 'end': end};

  @override
  bool operator ==(Object other) =>
      other is QuietHours && other.start == start && other.end == end;

  @override
  int get hashCode => Object.hash(start, end);
}

/// Réglages de notification du compte : `GET /me/notification-settings`
/// et `dailyReminderTime` de `GET /me` (ADR-034/035).
class NotificationPrefs {
  const NotificationPrefs({
    required this.limit,
    required this.occurrence,
    required this.unusualExpense,
    required this.dailyReminder,
    required this.quietHours,
    required this.dailyReminderTime,
  });

  final bool limit;
  final bool occurrence;
  final bool unusualExpense;
  final bool dailyReminder;
  final QuietHours? quietHours;

  /// `null` : rappel quotidien désactivé.
  final String? dailyReminderTime;

  /// Le rappel quotidien est actif s'il a une heure et que son type est activé.
  bool get dailyReminderOn => dailyReminder && dailyReminderTime != null;

  NotificationPrefs withSettings(Map<String, dynamic> json) =>
      NotificationPrefs(
        limit: json['limit'] as bool,
        occurrence: json['occurrence'] as bool,
        unusualExpense: json['unusualExpense'] as bool,
        dailyReminder: json['dailyReminder'] as bool,
        quietHours: _quiet(json['quietHours']),
        dailyReminderTime: dailyReminderTime,
      );

  NotificationPrefs withDailyReminderTime(String? time) => NotificationPrefs(
    limit: limit,
    occurrence: occurrence,
    unusualExpense: unusualExpense,
    dailyReminder: dailyReminder,
    quietHours: quietHours,
    dailyReminderTime: time,
  );

  static QuietHours? _quiet(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    return QuietHours(json['start'] as String, json['end'] as String);
  }
}

/// Requête refusée ou réseau absent (réglages en ligne seulement, ADR-056).
class NotificationApiException implements Exception {
  const NotificationApiException({required this.status});

  /// `null` : pas de réponse (hors ligne).
  final int? status;
}

/// Routes `/me/devices` et `/me/notification-settings` (ADR-035) et
/// `dailyReminderTime` de `/me` (ADR-034).
class NotificationApi {
  NotificationApi(this._dio);

  final Dio _dio;

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      throw NotificationApiException(status: e.response?.statusCode);
    }
  }

  Future<void> registerDevice(
    String deviceId,
    PushPlatform platform,
    String token,
  ) => _guard(() async {
    await _dio.put<void>(
      '/me/devices/$deviceId',
      data: {'platform': platform.name, 'token': token},
    );
  });

  Future<void> unregisterDevice(String deviceId) => _guard(() async {
    await _dio.delete<void>('/me/devices/$deviceId');
  });

  Future<NotificationPrefs> load() => _guard(() async {
    final settings = await _dio.get<Map<String, dynamic>>(
      '/me/notification-settings',
    );
    final me = await _dio.get<Map<String, dynamic>>('/me');
    return NotificationPrefs(
      limit: false,
      occurrence: false,
      unusualExpense: false,
      dailyReminder: false,
      quietHours: null,
      dailyReminderTime: me.data!['dailyReminderTime'] as String?,
    ).withSettings(settings.data!);
  });

  /// `PATCH /me/notification-settings` : seuls les champs de [patch].
  Future<NotificationPrefs> updateSettings(
    NotificationPrefs current,
    Map<String, Object?> patch,
  ) => _guard(() async {
    final response = await _dio.patch<Map<String, dynamic>>(
      '/me/notification-settings',
      data: patch,
    );
    return current.withSettings(response.data!);
  });

  Future<NotificationPrefs> setDailyReminderTime(
    NotificationPrefs current,
    String? time,
  ) => _guard(() async {
    await _dio.patch<Map<String, dynamic>>(
      '/me',
      data: {'dailyReminderTime': time},
    );
    return current.withDailyReminderTime(time);
  });
}
