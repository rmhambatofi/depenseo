// Statistiques agrégées (F-ADM-01) : compteurs fournis par l'API, affichés tels quels.
import { Card, CardContent, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Loading, Title, useDataProvider } from 'react-admin';
import type { AdminDataProvider } from './data-provider';

interface Stats {
  generatedAt: string;
  users: { total: number; verified: number; admins: number };
  signups: { date: string; count: number }[];
  plans: { premium: number; trial: number };
  subscriptions: { byStatus: Record<string, number>; byStore: Record<string, number> };
  expenses: { total: number; createdLast30Days: number };
  jobs: Record<string, number>;
}

const entries = (counts: Record<string, number>) =>
  Object.entries(counts)
    .map(([key, count]) => `${key} : ${count}`)
    .join(' · ') || '—';

export function Dashboard() {
  const dataProvider = useDataProvider<AdminDataProvider>();
  const [stats, setStats] = useState<Stats>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    dataProvider
      .getStats()
      .then((value) => setStats(value as Stats))
      .catch(() => setFailed(true));
  }, [dataProvider]);
  if (failed) return <Typography>Statistiques indisponibles.</Typography>;
  if (!stats) return <Loading />;
  const rows: [string, string][] = [
    [
      'Comptes',
      `${stats.users.total} (vérifiés : ${stats.users.verified}, admins : ${stats.users.admins})`,
    ],
    ['Premium / essai', `${stats.plans.premium} / ${stats.plans.trial}`],
    ['Abonnements par statut', entries(stats.subscriptions.byStatus)],
    ['Abonnements par store', entries(stats.subscriptions.byStore)],
    [
      'Dépenses (nombre)',
      `${stats.expenses.total} (30 derniers jours : ${stats.expenses.createdLast30Days})`,
    ],
    ['Tâches', entries(stats.jobs)],
    // Dates calendaires AAAA-MM-JJ affichées telles quelles (jamais converties en Date).
    ['Inscriptions', stats.signups.map((s) => `${s.date} : ${s.count}`).join(' · ') || '—'],
  ];
  return (
    <Card>
      <Title title="Statistiques" />
      <CardContent>
        {rows.map(([label, value]) => (
          <Typography key={label} gutterBottom>
            <strong>{label}</strong> — {value}
          </Typography>
        ))}
        <Typography variant="caption">
          Calculées le {new Date(stats.generatedAt).toLocaleString('fr-FR')}
        </Typography>
      </CardContent>
    </Card>
  );
}
