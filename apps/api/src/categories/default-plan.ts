// Plan de catégories par défaut adapté à la France (F-CAT-01, ADR-023) : 14 racines, chacune avec
// ses sous-catégories, icône (emoji) et couleur. Copié dans chaque carnet à sa création, dans la
// langue du compte ; ensuite modifiable par l'utilisateur comme une catégorie personnalisée (sauf
// suppression : une catégorie du plan se masque). `key` est stable et sert à reconnaître une
// catégorie du plan (`category.system_key`), jamais à l'afficher.

export interface DefaultCategory {
  readonly key: string;
  readonly fr: string;
  readonly en: string;
}

export interface DefaultRootCategory extends DefaultCategory {
  readonly icon: string;
  readonly color: string;
  readonly children: readonly DefaultCategory[];
}

export const DEFAULT_CATEGORY_PLAN: readonly DefaultRootCategory[] = [
  {
    key: 'housing',
    fr: 'Logement',
    en: 'Housing',
    icon: '🏠',
    color: '#8D6E63',
    children: [
      { key: 'housing.rent', fr: 'Loyer', en: 'Rent' },
      { key: 'housing.mortgage', fr: 'Crédit immobilier', en: 'Mortgage' },
      { key: 'housing.service_charges', fr: 'Charges de copropriété', en: 'Service charges' },
      { key: 'housing.maintenance', fr: 'Entretien et travaux', en: 'Repairs and maintenance' },
    ],
  },
  {
    key: 'energy',
    fr: 'Énergie',
    en: 'Energy',
    icon: '⚡',
    color: '#FBC02D',
    children: [
      { key: 'energy.electricity', fr: 'Électricité', en: 'Electricity' },
      { key: 'energy.gas', fr: 'Gaz', en: 'Gas' },
      { key: 'energy.water', fr: 'Eau', en: 'Water' },
      { key: 'energy.heating', fr: 'Fioul et bois', en: 'Heating oil and wood' },
    ],
  },
  {
    key: 'groceries',
    fr: 'Courses',
    en: 'Groceries',
    icon: '🛒',
    color: '#43A047',
    children: [
      { key: 'groceries.supermarket', fr: 'Supermarché', en: 'Supermarket' },
      { key: 'groceries.local_shops', fr: 'Marché et commerces', en: 'Markets and local shops' },
    ],
  },
  {
    key: 'restaurants',
    fr: 'Restaurants',
    en: 'Restaurants',
    icon: '🍽️',
    color: '#E53935',
    children: [
      { key: 'restaurants.restaurant', fr: 'Restaurant', en: 'Restaurant' },
      { key: 'restaurants.cafe_bar', fr: 'Café et bar', en: 'Café and bar' },
      { key: 'restaurants.takeaway', fr: 'À emporter et livraison', en: 'Takeaway and delivery' },
      { key: 'restaurants.canteen', fr: 'Cantine', en: 'Canteen' },
    ],
  },
  {
    key: 'transport',
    fr: 'Transports',
    en: 'Transport',
    icon: '🚗',
    color: '#1E88E5',
    children: [
      { key: 'transport.fuel', fr: 'Carburant', en: 'Fuel' },
      { key: 'transport.public', fr: 'Transports en commun', en: 'Public transport' },
      { key: 'transport.parking_tolls', fr: 'Stationnement et péages', en: 'Parking and tolls' },
      { key: 'transport.vehicle', fr: 'Entretien du véhicule', en: 'Vehicle maintenance' },
      { key: 'transport.train_plane', fr: 'Train et avion', en: 'Train and plane' },
    ],
  },
  {
    key: 'health',
    fr: 'Santé',
    en: 'Health',
    icon: '🩺',
    color: '#00ACC1',
    children: [
      { key: 'health.doctor', fr: 'Médecin', en: 'Doctor' },
      { key: 'health.pharmacy', fr: 'Pharmacie', en: 'Pharmacy' },
      { key: 'health.dental_optical', fr: 'Dentaire et optique', en: 'Dental and eyecare' },
    ],
  },
  {
    key: 'insurance',
    fr: 'Assurances',
    en: 'Insurance',
    icon: '🛡️',
    color: '#5E35B1',
    children: [
      { key: 'insurance.home', fr: 'Habitation', en: 'Home' },
      { key: 'insurance.vehicle', fr: 'Auto et moto', en: 'Car and motorbike' },
      { key: 'insurance.health', fr: 'Mutuelle', en: 'Health insurance' },
      { key: 'insurance.life', fr: 'Prévoyance', en: 'Life and disability' },
    ],
  },
  {
    key: 'taxes',
    fr: 'Impôts et taxes',
    en: 'Taxes',
    icon: '🏛️',
    color: '#546E7A',
    children: [
      { key: 'taxes.income', fr: 'Impôt sur le revenu', en: 'Income tax' },
      { key: 'taxes.property', fr: 'Taxe foncière', en: 'Property tax' },
      { key: 'taxes.housing', fr: 'Taxe d’habitation', en: 'Housing tax' },
      { key: 'taxes.other', fr: 'Autres taxes', en: 'Other taxes' },
    ],
  },
  {
    key: 'children',
    fr: 'Enfants',
    en: 'Children',
    icon: '🧸',
    color: '#F06292',
    children: [
      { key: 'children.childcare', fr: 'Garde d’enfants', en: 'Childcare' },
      { key: 'children.school', fr: 'Scolarité', en: 'School' },
      { key: 'children.activities', fr: 'Activités', en: 'Activities' },
      { key: 'children.clothing', fr: 'Vêtements enfants', en: 'Children’s clothing' },
    ],
  },
  {
    key: 'leisure',
    fr: 'Loisirs',
    en: 'Leisure',
    icon: '🎭',
    color: '#FB8C00',
    children: [
      { key: 'leisure.outings', fr: 'Sorties', en: 'Outings' },
      { key: 'leisure.sport', fr: 'Sport', en: 'Sport' },
      { key: 'leisure.travel', fr: 'Voyages', en: 'Travel' },
      { key: 'leisure.culture', fr: 'Livres et culture', en: 'Books and culture' },
    ],
  },
  {
    key: 'shopping',
    fr: 'Shopping',
    en: 'Shopping',
    icon: '🛍️',
    color: '#D81B60',
    children: [
      { key: 'shopping.clothing', fr: 'Vêtements', en: 'Clothing' },
      { key: 'shopping.electronics', fr: 'High-tech', en: 'Electronics' },
      { key: 'shopping.home', fr: 'Maison et déco', en: 'Home and decor' },
    ],
  },
  {
    key: 'subscriptions',
    fr: 'Abonnements',
    en: 'Subscriptions',
    icon: '🔁',
    color: '#3949AB',
    children: [
      {
        key: 'subscriptions.phone_internet',
        fr: 'Téléphone et internet',
        en: 'Phone and internet',
      },
      { key: 'subscriptions.streaming', fr: 'Streaming', en: 'Streaming' },
      { key: 'subscriptions.press', fr: 'Presse', en: 'News' },
      { key: 'subscriptions.other', fr: 'Autres abonnements', en: 'Other subscriptions' },
    ],
  },
  {
    key: 'gifts',
    fr: 'Cadeaux',
    en: 'Gifts',
    icon: '🎁',
    color: '#8E24AA',
    children: [
      { key: 'gifts.given', fr: 'Cadeaux offerts', en: 'Gifts given' },
      { key: 'gifts.donations', fr: 'Dons', en: 'Donations' },
    ],
  },
  {
    key: 'misc',
    fr: 'Divers',
    en: 'Miscellaneous',
    icon: '📦',
    color: '#757575',
    children: [
      { key: 'misc.bank_fees', fr: 'Frais bancaires', en: 'Bank fees' },
      { key: 'misc.cash', fr: 'Retraits d’espèces', en: 'Cash withdrawals' },
      { key: 'misc.other', fr: 'Autres dépenses', en: 'Other expenses' },
    ],
  },
];

/** Libellé dans la langue du compte (fr par défaut). */
export const defaultLabel = (category: DefaultCategory, language: string): string =>
  language === 'en' ? category.en : category.fr;
