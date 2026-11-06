-- P8-02, ADR-069 : les emojis du plan par défaut (MVP) deviennent des clés d'icône du catalogue
-- mobile. Comparaison binaire (utf8mb4_bin) : un emoji voisin choisi par l'utilisateur reste tel
-- quel. `updated_at` avancé pour que la synchro renvoie les catégories modifiées ; lignes
-- supprimées ignorées (purgées par la synchro).
UPDATE `category`
SET `icon` = CASE `icon` COLLATE utf8mb4_bin
    WHEN '🏠' THEN 'home'
    WHEN '⚡' THEN 'bolt'
    WHEN '🛒' THEN 'cart'
    WHEN '🍽️' THEN 'restaurant'
    WHEN '🚗' THEN 'car'
    WHEN '🩺' THEN 'health'
    WHEN '🛡️' THEN 'shield'
    WHEN '🏛️' THEN 'bank'
    WHEN '🧸' THEN 'child'
    WHEN '🎭' THEN 'theater'
    WHEN '🛍️' THEN 'bag'
    WHEN '🔁' THEN 'repeat'
    WHEN '🎁' THEN 'gift'
    WHEN '📦' THEN 'box'
  END,
  `updated_at` = UTC_TIMESTAMP(3)
WHERE `deleted_at` IS NULL
  AND `icon` COLLATE utf8mb4_bin IN (
    '🏠', '⚡', '🛒', '🍽️', '🚗', '🩺', '🛡️', '🏛️', '🧸', '🎭', '🛍️', '🔁', '🎁', '📦'
  );
