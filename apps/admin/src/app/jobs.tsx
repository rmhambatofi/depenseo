// Tâches en échec (F-ADM-01) : consultation et relance (seule écriture du back-office, tracée).
import {
  Button,
  Datagrid,
  InfiniteList,
  NumberField,
  TextField,
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from 'react-admin';
import { Timestamp } from './fields';
import { useState } from 'react';
import { type AdminDataProvider, SERVER_SORT } from './data-provider';

function RetryButton() {
  const record = useRecordContext<{ id: string }>();
  const dataProvider = useDataProvider<AdminDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [pending, setPending] = useState(false);
  if (!record) return null;
  const retry = () => {
    setPending(true);
    dataProvider
      .retryJob(record.id)
      .then(() => notify('Tâche relancée', { type: 'success' }))
      .catch(() => notify('Relance impossible', { type: 'error' }))
      .finally(() => {
        setPending(false);
        refresh();
      });
  };
  return <Button label="Relancer" onClick={retry} disabled={pending} />;
}

export const JobList = () => (
  <InfiniteList exporter={false} sort={SERVER_SORT} perPage={50}>
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <TextField source="type" label="Type" sortable={false} />
      <NumberField source="attempts" label="Essais" sortable={false} />
      <TextField source="lastError" label="Dernière erreur" sortable={false} />
      <Timestamp source="finishedAt" label="Échec le" sortable={false} />
      <Timestamp source="createdAt" label="Création" sortable={false} />
      <RetryButton />
    </Datagrid>
  </InfiniteList>
);
