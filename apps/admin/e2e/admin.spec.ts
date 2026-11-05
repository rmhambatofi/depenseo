// F-ADM-01/03 (ADR-042/044) : `/admin/*` → 404 pour qui n'a pas de session admin, seule la page de
// connexion est publique ; un administrateur se connecte (TOTP) et parcourt les écrans.
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { accounts, totpNow } from './support';

/** Fichier JavaScript réel de l'application admin, lu dans le build servi. */
const appScript = (): string => {
  const html = readFileSync(new URL('../dist/app/index.html', import.meta.url), 'utf8');
  const match = /src="(\/admin\/assets\/[^"]+\.js)"/.exec(html);
  if (!match?.[1]) throw new Error('script de l’application introuvable dans dist/app');
  return match[1];
};

async function fillLogin(page: Page, email: string, password: string, code: string) {
  await page.goto('/admin/login');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByLabel('Code de l’application d’authentification').fill(code);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

async function expectAdminHidden(page: Page) {
  for (const path of ['/admin', '/admin/', appScript(), '/admin/api/users', '/admin/api/stats']) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(404);
    expect(res.headers()['content-type'], path).toContain('application/problem+json');
    expect(await res.text(), path).not.toContain('react-admin');
  }
}

test('anonyme : seule la page de connexion est servie, tout le reste de /admin répond 404', async ({
  page,
}) => {
  const login = await page.goto('/admin/login');
  expect(login?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Back-office Depenseo' })).toBeVisible();
  await expectAdminHidden(page);
  const navigation = await page.goto('/admin/');
  expect(navigation?.status()).toBe(404);
});

test('compte non administrateur : connexion refusée, /admin/* reste 404', async ({ page }) => {
  const { member } = accounts();
  await fillLogin(page, member.email, member.password, '123456');
  await expect(page.getByRole('alert')).toHaveText('Identifiants ou code invalides.');
  expect(page.url()).toMatch(/\/admin\/login$/);
  await expectAdminHidden(page);
});

test('administrateur : connexion TOTP, écrans du back-office, déconnexion', async ({ page }) => {
  const { admin } = accounts();
  const cspErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
      cspErrors.push(message.text());
    }
  });

  await fillLogin(page, admin.email, admin.password, totpNow(admin.totpSecret));
  await page.waitForURL(/\/admin\/(#\/)?$/);
  await expect(page.getByText('Comptes', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/vérifiés : \d+, admins : \d+/)).toBeVisible();

  await page.goto('/admin/#/users');
  await page.getByPlaceholder('Adresse e-mail').fill(admin.email);
  // Le filtre s'applique après un délai : attendre l'URL filtrée avant de cliquer la ligne.
  await expect(page).toHaveURL(/filter=/);
  const row = page.getByRole('cell', { name: admin.email });
  await expect(row).toBeVisible();
  await row.click();
  await page.waitForURL(/#\/users\/[^/]+\/show$/);
  await expect(page.getByText('Mot de passe défini')).toBeVisible();
  await expect(page.getByText('Dépenses (nombre)')).toBeVisible();

  await page.goto('/admin/#/audit');
  await expect(page.getByRole('cell', { name: 'admin.user_view' }).first()).toBeVisible();
  await page.goto('/admin/#/jobs');
  // Base de test sans tâche en échec ni abonnement : la page s'affiche (titre), sans erreur.
  await expect(page.getByRole('heading', { name: 'Tâches en échec', exact: true })).toBeVisible();
  await page.goto('/admin/#/subscriptions');
  await expect(page.getByRole('heading', { name: 'Abonnements', exact: true })).toBeVisible();
  await expect(page.getByText(/Erreur|Introuvable/)).toHaveCount(0);
  expect(cspErrors).toEqual([]);

  await page.getByRole('button', { name: /profil|Administrateur/i }).click();
  await page.getByRole('menuitem', { name: /Déconnexion/i }).click();
  await page.waitForURL(/\/admin\/login$/);
  await expectAdminHidden(page);
});
