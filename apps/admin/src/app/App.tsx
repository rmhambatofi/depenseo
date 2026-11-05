// Application du back-office (F-ADM-01, ADR-044) : servie par l'API à une session admin seulement,
// lecture seule sauf la relance d'une tâche en échec. Routeur par fragment (`/admin/#/users`).
import polyglotI18nProvider from 'ra-i18n-polyglot';
import french from 'ra-language-french';
import { Admin, Resource } from 'react-admin';
import { adminFetch } from './admin-api';
import { AuditList } from './audit';
import { createAuthProvider } from './auth-provider';
import { createDataProvider } from './data-provider';
import { Dashboard } from './dashboard';
import { JobList } from './jobs';
import { SubscriptionList } from './subscriptions';
import { UserList, UserShow } from './users';

const dataProvider = createDataProvider(adminFetch);
const authProvider = createAuthProvider(adminFetch, () => `${window.location.origin}/admin/login`);
const i18nProvider = polyglotI18nProvider(() => french, 'fr');

export function App() {
  return (
    <Admin
      title="Depenseo — back-office"
      dataProvider={dataProvider}
      authProvider={authProvider}
      i18nProvider={i18nProvider}
      dashboard={Dashboard}
      loginPage={false}
      requireAuth
      disableTelemetry
    >
      <Resource name="users" options={{ label: 'Comptes' }} list={UserList} show={UserShow} />
      <Resource name="subscriptions" options={{ label: 'Abonnements' }} list={SubscriptionList} />
      <Resource name="jobs" options={{ label: 'Tâches en échec' }} list={JobList} />
      <Resource name="audit" options={{ label: 'Audit' }} list={AuditList} />
    </Admin>
  );
}
