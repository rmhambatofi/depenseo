// Journal d'audit des accès admin (NF-SEC-06), filtrable par auteur, cible et action.
import { Datagrid, InfiniteList, TextField, TextInput } from 'react-admin';
import { SERVER_SORT } from './data-provider';
import { Timestamp } from './fields';

const filters = [
  <TextInput key="actorUserId" source="actorUserId" label="Auteur (UUID)" />,
  <TextInput key="targetId" source="targetId" label="Cible (UUID)" />,
  <TextInput key="action" source="action" label="Action" />,
];

export const AuditList = () => (
  <InfiniteList exporter={false} filters={filters} sort={SERVER_SORT} perPage={50}>
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <Timestamp source="createdAt" label="Date" sortable={false} />
      <TextField source="actorUserId" label="Auteur" sortable={false} />
      <TextField source="action" label="Action" sortable={false} />
      <TextField source="route" label="Route" sortable={false} />
      <TextField source="targetType" label="Type de cible" sortable={false} />
      <TextField source="targetId" label="Cible" sortable={false} />
    </Datagrid>
  </InfiniteList>
);
