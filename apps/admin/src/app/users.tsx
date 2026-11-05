// Comptes (F-ADM-01) : liste avec recherche par adresse, fiche sans aucun montant (ADR-043).
import {
  ArrayField,
  BooleanField,
  Datagrid,
  FunctionField,
  InfiniteList,
  NumberField,
  SearchInput,
  Show,
  SimpleShowLayout,
  TextField,
} from 'react-admin';
import { Timestamp } from './fields';

const filters = [<SearchInput key="q" source="q" alwaysOn placeholder="Adresse e-mail" />];

export const UserList = () => (
  <InfiniteList
    exporter={false}
    filters={filters}
    sort={{ field: 'createdAt', order: 'DESC' }}
    perPage={50}
  >
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="email" label="Adresse" sortable={false} />
      <BooleanField source="emailVerified" label="Vérifiée" sortable={false} />
      <TextField source="role" label="Rôle" sortable={false} />
      <Timestamp source="createdAt" label="Création" sortable={false} />
    </Datagrid>
  </InfiniteList>
);

export const UserShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="email" label="Adresse" />
      <BooleanField source="emailVerified" label="Adresse vérifiée" />
      <TextField source="role" label="Rôle" />
      <Timestamp source="createdAt" label="Création" />
      <TextField source="language" label="Langue" />
      <TextField source="timeZone" label="Fuseau" />
      <TextField source="currency" label="Devise par défaut" />
      <BooleanField source="hasPassword" label="Mot de passe défini" />
      <FunctionField
        label="Connexions externes"
        render={(record: { providers?: string[] }) => record.providers?.join(', ') || '—'}
      />
      <NumberField source="devices.ios" label="Appareils iOS" />
      <NumberField source="devices.android" label="Appareils Android" />
      <NumberField source="notebooks" label="Carnets" />
      <NumberField source="expenses" label="Dépenses (nombre)" />
      <TextField source="plan" label="Formule" />
      <Timestamp source="premiumUntil" label="Premium jusqu’au" />
      <Timestamp source="trialEndsAt" label="Fin d’essai" />
      <ArrayField source="subscriptions" label="Abonnements">
        <Datagrid bulkActionButtons={false} rowClick={false}>
          <TextField source="store" label="Store" />
          <TextField source="productCode" label="Produit" />
          <TextField source="status" label="Statut" />
          <Timestamp source="expiresAt" label="Échéance" />
        </Datagrid>
      </ArrayField>
    </SimpleShowLayout>
  </Show>
);
