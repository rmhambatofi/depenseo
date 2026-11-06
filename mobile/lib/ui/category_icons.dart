import 'package:flutter/material.dart';

/// Catalogue fermé des icônes de catégorie (P8-02, ADR-069) : la colonne
/// `icon` d'une catégorie contient l'une de ces clés. Le plan par défaut de
/// l'API (`apps/api/src/categories/default-plan.ts`) vient en tête, dans son
/// ordre ; une valeur hors catalogue (emoji d'une version antérieure) reste
/// affichée en texte. Ne jamais retirer ni renommer une clé : elle est
/// stockée et synchronisée. Noms lus par les lecteurs d'écran :
/// `categoryIconName` dans les `.arb`.
const Map<String, IconData> _catalog = {
  // Plan par défaut.
  'home': Icons.home_rounded,
  'bolt': Icons.bolt_rounded,
  'cart': Icons.shopping_cart_rounded,
  'restaurant': Icons.restaurant_rounded,
  'car': Icons.directions_car_rounded,
  'health': Icons.medical_services_rounded,
  'shield': Icons.shield_rounded,
  'bank': Icons.account_balance_rounded,
  'child': Icons.child_care_rounded,
  'theater': Icons.theater_comedy_rounded,
  'bag': Icons.shopping_bag_rounded,
  'repeat': Icons.autorenew_rounded,
  'gift': Icons.card_giftcard_rounded,
  'box': Icons.inventory_2_rounded,
  // Choix supplémentaires.
  'tag': Icons.sell_rounded,
  'pets': Icons.pets_rounded,
  'sport': Icons.fitness_center_rounded,
  'travel': Icons.flight_rounded,
  'train': Icons.train_rounded,
  'bus': Icons.directions_bus_rounded,
  'bike': Icons.pedal_bike_rounded,
  'fuel': Icons.local_gas_station_rounded,
  'parking': Icons.local_parking_rounded,
  'school': Icons.school_rounded,
  'phone': Icons.smartphone_rounded,
  'wifi': Icons.wifi_rounded,
  'coffee': Icons.local_cafe_rounded,
  'bar': Icons.local_bar_rounded,
  'fastfood': Icons.fastfood_rounded,
  'pharmacy': Icons.local_pharmacy_rounded,
  'hospital': Icons.local_hospital_rounded,
  'clothes': Icons.checkroom_rounded,
  'book': Icons.menu_book_rounded,
  'music': Icons.music_note_rounded,
  'games': Icons.sports_esports_rounded,
  'movie': Icons.movie_rounded,
  'beauty': Icons.spa_rounded,
  'tools': Icons.build_rounded,
  'water': Icons.water_drop_rounded,
  'light': Icons.lightbulb_rounded,
  'furniture': Icons.chair_rounded,
  'card': Icons.credit_card_rounded,
  'cash': Icons.payments_rounded,
  'receipt': Icons.receipt_long_rounded,
  'work': Icons.work_rounded,
  'charity': Icons.volunteer_activism_rounded,
  'party': Icons.celebration_rounded,
  'nature': Icons.park_rounded,
  'heart': Icons.favorite_rounded,
};

/// Clés du catalogue, dans l'ordre du sélecteur.
final List<String> categoryIconKeys = List.unmodifiable(_catalog.keys);

/// Icône d'une nouvelle catégorie.
const defaultCategoryIcon = 'tag';

/// Icône d'une clé du catalogue ; `null` pour toute autre valeur (emoji).
IconData? categoryIconFor(String value) => _catalog[value];
