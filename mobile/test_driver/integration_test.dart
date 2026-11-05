// Pilote de `flutter drive --profile` (NF-PERF-01, P7-06) : écrit `reportData` (dont
// `startup_ms` et la frise `startup_timeline`) dans `build/integration_response_data.json`.
import 'package:integration_test/integration_test_driver.dart';

Future<void> main() => integrationDriver();
