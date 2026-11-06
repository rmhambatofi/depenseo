// Abonnements (F-ADM-01) : filtrables par compte, store et statut.
import { Datagrid, InfiniteList, SelectInput, TextField, TextInput } from 'react-admin';
import { SERVER_SORT } from './data-provider';
import { Timestamp } from './fields';

const STORES = [
  { id: 'app_store', name: 'App Store' },
  { id: 'google_play', name: 'Google Play' },
];
const STATUSES = ['active', 'suspended', 'expired', 'revoked'].map((id) => ({ id, name: id }));

const filters = [
  <TextInput key="userId" source="userId" label="Compte (UUID)" />,
  <SelectInput key="store" source="store" label="Store" choices={STORES} />,
  <SelectInput key="status" source="status" label="Statut" choices={STATUSES} />,
];

export const SubscriptionList = () => (
  <InfiniteList exporter={false} filters={filters} sort={SERVER_SORT} perPage={50}>
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <TextField source="userId" label="Compte" sortable={false} />
      <TextField source="store" label="Store" sortable={false} />
      <TextField source="productCode" label="Produit" sortable={false} />
      <TextField source="status" label="Statut" sortable={false} />
      <Timestamp source="expiresAt" label="Échéance" sortable={false} />
      <Timestamp source="verifiedAt" label="Vérifié le" sortable={false} />
    </Datagrid>
  </InfiniteList>
);
