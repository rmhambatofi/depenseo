/**
 * Fichier généré par packages/api-client/scripts/generate.mjs depuis apps/api/openapi.json.
 * Ne pas modifier : lancer `pnpm --filter api openapi`.
 */

export type paths = {
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/password-reset/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_confirmPasswordReset"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/password-reset/request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_requestPasswordReset"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/social": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_social"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/verify-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_verifyEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["HealthController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["MeController_get"];
        put?: never;
        post?: never;
        delete: operations["MeController_remove"];
        options?: never;
        head?: never;
        patch: operations["MeController_update"];
        trace?: never;
    };
    "/api/v1/me/devices/{deviceId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["NotificationsController_register"];
        post?: never;
        delete: operations["NotificationsController_unregister"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AccountExportController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/export/{exportId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AccountExportController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/export/{exportId}/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AccountExportController_download"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/notification-settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["NotificationsController_getSettings"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["NotificationsController_updateSettings"];
        trace?: never;
    };
    "/api/v1/notebooks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["NotebooksController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["NotebooksController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["CategoriesController_list"];
        put?: never;
        post: operations["CategoriesController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/categories/{categoryId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["CategoriesController_get"];
        put?: never;
        post?: never;
        delete: operations["CategoriesController_remove"];
        options?: never;
        head?: never;
        patch: operations["CategoriesController_update"];
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/dashboard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["DashboardController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/expenses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ExpensesController_list"];
        put?: never;
        post: operations["ExpensesController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/expenses/{expenseId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ExpensesController_get"];
        put?: never;
        post?: never;
        delete: operations["ExpensesController_remove"];
        options?: never;
        head?: never;
        patch: operations["ExpensesController_update"];
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/expenses/{expenseId}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ExpensesController_restore"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/exports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ExportsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/exports/{exportId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ExportsController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/exports/{exportId}/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ExportsController_download"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/limits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LimitsController_list"];
        put?: never;
        post: operations["LimitsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/limits/{limitId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["LimitsController_update"];
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/limits/current": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LimitsController_current"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/occurrences/{occurrenceId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["OccurrencesController_adjust"];
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/occurrences/{occurrenceId}/pay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["OccurrencesController_pay"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/occurrences/{occurrenceId}/skip": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["OccurrencesController_skip"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/recurring-expenses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["RecurringController_list"];
        put?: never;
        post: operations["RecurringController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/recurring-expenses/{recurringId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["RecurringController_get"];
        put?: never;
        post?: never;
        delete: operations["RecurringController_remove"];
        options?: never;
        head?: never;
        patch: operations["RecurringController_update"];
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/recurring-expenses/{recurringId}/occurrences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["RecurringController_occurrencesOf"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notebooks/{notebookId}/sync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["SyncController_changes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/store-notifications/app-store": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["StoreNotificationsController_appStore"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/store-notifications/google-play": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["StoreNotificationsController_googlePlay"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscriptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["SubscriptionsController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscriptions/trial": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["SubscriptionsController_startTrial"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscriptions/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["SubscriptionsController_verify"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
};
export type webhooks = Record<string, never>;
export type components = {
    schemas: {
        AccountExportDto: {
            /**
             * Format: date-time
             * @description Fin de validité du lien (15 min après génération)
             */
            expiresAt: string | null;
            /** Format: uuid */
            id: string;
            /**
             * @description `ready` : téléchargeable jusqu’à `expiresAt` ; `expired` : lien périmé
             * @enum {string}
             */
            status: "pending" | "ready" | "expired" | "failed";
        };
        AdjustOccurrenceDto: {
            /** @description NULL = montant de la récurrence */
            amount: number | null;
        };
        CategoryDto: {
            /** @example #43A047 */
            color: string;
            hidden: boolean;
            /** @description Emoji ou nom d’icône */
            icon: string;
            /** Format: uuid */
            id: string;
            name: string;
            /**
             * Format: uuid
             * @description NULL : racine
             */
            parentId: string | null;
            /** @description Clé stable du plan par défaut (ex. `housing.rent`), NULL si personnalisée */
            systemKey: string | null;
        };
        CategoryShareDto: {
            /**
             * Format: uuid
             * @description Catégorie racine
             */
            categoryId: string;
            /** @description ⌊100 × part⌋ */
            percent: number;
            /** @description Unités mineures de la devise de la jauge */
            total: number;
        };
        CreateAccountExportDto: {
            /**
             * Format: uuid
             * @description UUID v7 tiré par le client (rejeu sans doublon)
             */
            id: string;
        };
        CreateCategoryDto: {
            color: string;
            icon: string;
            /**
             * Format: uuid
             * @description UUID v7 généré par le client (idempotence)
             */
            id: string;
            name: string;
            /** Format: uuid */
            parentId?: string | null;
        };
        CreateExpenseDto: {
            /**
             * Format: int64
             * @description Montant en unités mineures (centimes), entier strictement positif
             */
            amount: number;
            /**
             * Format: uuid
             * @description Catégorie du carnet, masquée acceptée
             */
            categoryId: string;
            /**
             * @description Défaut : devise du compte
             * @enum {string}
             */
            currency?: "EUR" | "CHF" | "GBP" | "USD" | "CAD" | "SEK" | "NOK" | "DKK" | "PLN" | "CZK" | "HUF" | "RON" | "ISK" | "MAD" | "TND" | "MGA" | "MUR" | "XOF" | "XAF" | "XPF" | "JPY";
            /**
             * Format: date
             * @description Date calendaire, sans fuseau
             * @example 2026-03-29
             */
            date: string;
            /**
             * Format: uuid
             * @description UUID v7 généré par le client (idempotence)
             */
            id: string;
            merchant?: string | null;
            note?: string | null;
            /** @description Noms d’étiquettes (1 à 50 caractères), dédoublonnés à la casse et aux accents près */
            tags?: string[];
        };
        CreateExportDto: {
            /**
             * @description `xlsx` réservé au Premium
             * @enum {string}
             */
            format: "csv" | "xlsx";
            /**
             * Format: date
             * @description Premier jour inclus (AAAA-MM-JJ)
             */
            from: string;
            /**
             * Format: uuid
             * @description UUID v7 tiré par le client (rejeu sans doublon)
             */
            id: string;
            /**
             * Format: date
             * @description Dernier jour inclus (AAAA-MM-JJ)
             */
            to: string;
        };
        CreateLimitDto: {
            /** @description Unités mineures ; NULL = supprimer la limite à partir d’aujourd’hui */
            amount: number | null;
            /**
             * Format: uuid
             * @description UUID v7 généré par le client (idempotence)
             */
            id: string;
            /** @default true */
            includeRecurring: boolean;
            /**
             * @default month
             * @enum {string}
             */
            periodKind: "month" | "week";
            /** @default 1 */
            startDay: number;
        };
        CreateRecurringDto: {
            amount: number;
            /**
             * @default fixed
             * @enum {string}
             */
            amountKind: "fixed" | "estimated";
            /** Format: uuid */
            categoryId: string;
            /**
             * @description Défaut : devise du compte
             * @example EUR
             */
            currency?: string;
            /** @enum {string} */
            frequency: "weekly" | "monthly" | "quarterly" | "yearly" | "once";
            /**
             * Format: uuid
             * @description UUID v7 généré par le client (idempotence)
             */
            id: string;
            /**
             * @default confirm
             * @enum {string}
             */
            mode: "auto" | "confirm";
            name: string;
            /**
             * @description Rappel le jour de l’échéance
             * @default true
             */
            remindOnDueDate: boolean;
            /**
             * @description Rappel 3 jours avant l’échéance
             * @default true
             */
            remindThreeDaysBefore: boolean;
            /** Format: date */
            startDate: string;
        };
        CumulativeDto: {
            /** @description Jusqu’à aujourd’hui */
            current: components["schemas"]["CumulativePointDto"][];
            /** @description Période entière */
            previous: components["schemas"]["CumulativePointDto"][];
        };
        CumulativePointDto: {
            /** @description Unités mineures, cumul au jour inclus */
            cumulative: number;
            /** Format: date */
            date: string;
            /** @description Rang du jour dans la période */
            day: number;
        };
        CurrentLimitDto: {
            current: components["schemas"]["PeriodSummaryDto"];
            /** @description Plus récente d’abord */
            past: components["schemas"]["PeriodSummaryDto"][];
            /** @example Europe/Paris */
            timeZone: string;
            /** Format: date */
            today: string;
        };
        DashboardDto: {
            /** @description Total décroissant */
            categories: components["schemas"]["CategoryShareDto"][];
            cumulative: components["schemas"]["CumulativeDto"];
            /** @description En cours d’abord */
            evolution: components["schemas"]["PeriodSummaryDto"][];
            /** @description Période en cours ; limit NULL = sans limite */
            gauge: components["schemas"]["PeriodSummaryDto"];
            recent: components["schemas"]["ExpenseDto"][];
            /** @example Europe/Paris */
            timeZone: string;
            /** Format: date */
            today: string;
            /** @description Échéances en attente dues d’ici 31 jours, en retard comprises */
            upcoming: components["schemas"]["UpcomingOccurrenceDto"][];
        };
        DeviceDto: {
            /** @enum {string} */
            platform: "ios" | "android";
            /** @description Jeton APNs (iOS) ou FCM (Android) */
            token: string;
        };
        EntitlementsDto: {
            /**
             * @description `trial` : essai de 14 jours en cours
             * @enum {string}
             */
            plan: "free" | "trial" | "premium";
            /**
             * Format: date-time
             * @description Fin des droits Premium en cours (abonnement ou essai) ; null si gratuit
             */
            premiumUntil: string | null;
            /** @description Essai encore disponible (une fois par compte) */
            trialAvailable: boolean;
            /**
             * Format: date-time
             * @description Fin de l’essai (minuit local du 15e jour) ; null s’il n’a jamais commencé
             */
            trialEndsAt: string | null;
        };
        ExpenseDto: {
            /**
             * Format: int64
             * @description Montant en unités mineures (centimes), entier strictement positif
             */
            amount: number;
            /** Format: uuid */
            categoryId: string;
            /** Format: date-time */
            createdAt: string;
            /**
             * @description Code ISO 4217
             * @enum {string}
             */
            currency: "EUR" | "CHF" | "GBP" | "USD" | "CAD" | "SEK" | "NOK" | "DKK" | "PLN" | "CZK" | "HUF" | "RON" | "ISK" | "MAD" | "TND" | "MGA" | "MUR" | "XOF" | "XAF" | "XPF" | "JPY";
            /**
             * Format: date
             * @description Date calendaire, sans fuseau
             * @example 2026-03-29
             */
            date: string;
            /** Format: uuid */
            id: string;
            merchant: string | null;
            note: string | null;
            /** @enum {string} */
            source: "manual" | "recurrence";
            /** @description Noms d’étiquettes (1 à 50 caractères), dédoublonnés à la casse et aux accents près */
            tags: string[];
            /** Format: date-time */
            updatedAt: string;
        };
        ExpensePageDto: {
            items: components["schemas"]["ExpenseDto"][];
            /** @description Curseur opaque de la page suivante ; `null` en fin de liste */
            nextCursor: string | null;
        };
        ExportDto: {
            /**
             * Format: date-time
             * @description Fin de validité du lien (15 min après génération)
             */
            expiresAt: string | null;
            /** @enum {string} */
            format: "csv" | "xlsx";
            /** Format: date */
            from: string;
            /** Format: uuid */
            id: string;
            /**
             * @description `ready` : téléchargeable jusqu’à `expiresAt` ; `expired` : lien périmé
             * @enum {string}
             */
            status: "pending" | "ready" | "expired" | "failed";
            /** Format: date */
            to: string;
        };
        HealthDto: {
            /** @enum {string} */
            status: "ok";
        };
        LimitDto: {
            /** @description Unités mineures de `currency` ; NULL = aucune limite */
            amount: number | null;
            /**
             * Format: date
             * @description Début de la première période couverte
             */
            appliesFrom: string;
            /** Format: date-time */
            createdAt: string;
            /**
             * @description Devise du compte à la création (ISO 4217)
             * @example EUR
             */
            currency: string;
            /**
             * Format: date
             * @description Jour de création, fuseau du compte
             */
            effectiveDate: string;
            /** Format: uuid */
            id: string;
            /** @description Les dépenses récurrentes comptent dans la limite */
            includeRecurring: boolean;
            /** @enum {string} */
            periodKind: "month" | "week";
            /** @description Mois : 1–31 ; semaine : 1 = lundi … 7 */
            startDay: number;
            /** Format: date-time */
            updatedAt: string;
        };
        LoginDto: {
            /** Format: email */
            email: string;
            password: string;
        };
        MeDto: {
            /**
             * @description Code ISO 4217
             * @enum {string}
             */
            currency: "EUR" | "CHF" | "GBP" | "USD" | "CAD" | "SEK" | "NOK" | "DKK" | "PLN" | "CZK" | "HUF" | "RON" | "ISK" | "MAD" | "TND" | "MGA" | "MUR" | "XOF" | "XAF" | "XPF" | "JPY";
            /**
             * @description Heure locale du rappel quotidien de saisie ; null = désactivé
             * @example 09:00
             */
            dailyReminderTime: string | null;
            /** Format: email */
            email: string;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            language: "fr" | "en";
            /**
             * Format: date-time
             * @description Acceptation de la politique de confidentialité (UTC)
             */
            privacyAcceptedAt: string | null;
            /**
             * @description Heure locale des rappels d’échéance J-3 et J
             * @example 09:00
             */
            reminderTime: string;
            /**
             * Format: date-time
             * @description Acceptation des CGU (UTC)
             */
            termsAcceptedAt: string | null;
            /**
             * @description Fuseau IANA, ex. Europe/Paris
             * @example Europe/Paris
             */
            timeZone: string;
        };
        NotebookDto: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            kind: "personal" | "shared";
            name: string;
            /**
             * @description Rôle du compte connecté dans ce carnet
             * @enum {string}
             */
            role: "owner" | "member";
        };
        NotificationSettingsDto: {
            /** @description Rappel quotidien de saisie (heure : `dailyReminderTime` de /me) */
            dailyReminder: boolean;
            /** @description Alertes de limite (80 %, 100 %…) */
            limit: boolean;
            /** @description Échéances récurrentes : à confirmer, rappels J-3 et jour J */
            occurrence: boolean;
            /** @description Plage de silence (fuseau du compte) ; notifications reportées à sa fin */
            quietHours: components["schemas"]["QuietHoursDto"] | null;
            /** @description Dépense inhabituellement élevée */
            unusualExpense: boolean;
        };
        OccurrenceDto: {
            /** @description Montant propre à cette échéance */
            adjusted: boolean;
            /** @description Attendu (ajusté ou de la récurrence) ; payée : réel */
            amount: number;
            /** @enum {string} */
            amountKind: "fixed" | "estimated";
            /** @description Mode confirmation : échéance due, à confirmer (F-REC-02) */
            awaitingConfirmation: boolean;
            /** Format: uuid */
            categoryId: string;
            /** Format: date-time */
            createdAt: string;
            /** @example EUR */
            currency: string;
            /** Format: date */
            dueDate: string;
            /** Format: uuid */
            expenseId: string | null;
            /** Format: uuid */
            id: string;
            name: string;
            /** Format: uuid */
            recurringExpenseId: string;
            /** @enum {string} */
            status: "pending" | "paid" | "skipped";
            /** Format: date-time */
            updatedAt: string;
        };
        PasswordResetConfirmDto: {
            password: string;
            /** @description Jeton reçu par e-mail (base64url, 43 caractères) */
            token: string;
        };
        PasswordResetRequestDto: {
            /** Format: email */
            email: string;
        };
        PayOccurrenceDto: {
            /** @description Montant réel ; défaut : montant attendu */
            amount?: number;
            /**
             * Format: date
             * @description Défaut : date d’échéance
             */
            date?: string;
            /**
             * Format: uuid
             * @description UUID v7 de la dépense créée (idempotence)
             */
            expenseId: string;
        };
        PeriodSummaryDto: {
            /** @description ⌊100 × dépensé / limite⌋ */
            consumedPercent: number | null;
            /** @example EUR */
            currency: string;
            /** @description Jours écoulés, aujourd’hui compris */
            elapsedDays: number;
            /** @description ⌊100 × jours écoulés / jours de la période⌋ */
            elapsedPercent: number;
            /**
             * Format: date
             * @description Dernier jour (inclus)
             */
            end: string;
            includeRecurring: boolean;
            /** @description Unités mineures ; NULL = aucune */
            limit: number | null;
            /** Format: uuid */
            limitId: string | null;
            /** @description Devises non comptées */
            otherCurrencies: string[];
            /** @enum {string} */
            periodKind: "month" | "week";
            /** @description Négatif en cas de dépassement */
            remaining: number | null;
            /** @description Unités mineures de `currency` */
            spent: number;
            /**
             * Format: date
             * @description Premier jour (inclus)
             */
            start: string;
            startDay: number;
            totalDays: number;
        };
        QuietHoursDto: {
            /**
             * @description Fin, heure locale (exclue)
             * @example 07:00
             */
            end: string;
            /**
             * @description Début, heure locale (inclus)
             * @example 22:00
             */
            start: string;
        };
        RecurringDto: {
            /** @description Unités mineures de `currency` */
            amount: number;
            /** @enum {string} */
            amountKind: "fixed" | "estimated";
            /** Format: uuid */
            categoryId: string;
            /** Format: date-time */
            createdAt: string;
            /** @example EUR */
            currency: string;
            /** @enum {string} */
            frequency: "weekly" | "monthly" | "quarterly" | "yearly" | "once";
            /** Format: uuid */
            id: string;
            /**
             * @description auto : enregistrée à l’échéance
             * @enum {string}
             */
            mode: "auto" | "confirm";
            name: string;
            /** @description Rappel le jour de l’échéance (F-REC-04) ; sans effet en mode auto (payée à minuit) */
            remindOnDueDate: boolean;
            /** @description Rappel 3 jours avant l’échéance (F-REC-04) */
            remindThreeDaysBefore: boolean;
            /**
             * Format: date
             * @description Première échéance ; porte le jour (ADR-032)
             */
            startDate: string;
            /** Format: date-time */
            updatedAt: string;
        };
        RefreshTokenDto: {
            /** @description Jeton de rafraîchissement (base64url, 43 caractères) */
            refreshToken: string;
        };
        RegisterDto: {
            /**
             * @description Acceptation des CGU et de la politique de confidentialité
             * @enum {boolean}
             */
            acceptTerms: true;
            /** Format: email */
            email: string;
            /**
             * @default fr
             * @enum {string}
             */
            language: "fr" | "en";
            password: string;
        };
        SessionTokensDto: {
            /** @description JWT à présenter en `Authorization: Bearer …` */
            accessToken: string;
            /**
             * @description Durée de validité du jeton d’accès (s)
             * @example 900
             */
            expiresIn: number;
            /**
             * @description Durée de validité du jeton de rafraîchissement (s)
             * @example 2592000
             */
            refreshExpiresIn: number;
            /** @description Jeton opaque à usage unique, à échanger sur /auth/refresh */
            refreshToken: string;
            /** @enum {string} */
            tokenType: "Bearer";
        };
        SocialLoginDto: {
            /**
             * @description Requis pour créer un compte ou reprendre un compte non vérifié (sinon 422)
             * @enum {boolean}
             */
            acceptTerms?: true;
            /** @description `id_token` (JWT) remis par Apple ou Google */
            idToken: string;
            /**
             * @description Langue d’un compte créé
             * @default fr
             * @enum {string}
             */
            language: "fr" | "en";
            /** @description Nonce brut ; le fournisseur doit avoir reçu son SHA-256 hexadécimal */
            nonce: string;
            /** @enum {string} */
            provider: "apple" | "google";
        };
        SyncCategoryDto: {
            /** @example #43A047 */
            color: string;
            /** Format: date-time */
            createdAt: string;
            /**
             * Format: date-time
             * @description Suppression logique ; NULL si active
             */
            deletedAt: string | null;
            hidden: boolean;
            /** @description Emoji ou nom d’icône */
            icon: string;
            /** Format: uuid */
            id: string;
            name: string;
            /**
             * Format: uuid
             * @description NULL : racine
             */
            parentId: string | null;
            /** @description Ordre parmi les sœurs */
            position: number;
            /** @description Clé stable du plan par défaut (ex. `housing.rent`), NULL si personnalisée */
            systemKey: string | null;
            /** Format: date-time */
            updatedAt: string;
        };
        SyncExpenseDto: {
            /**
             * Format: int64
             * @description Montant en unités mineures (centimes), entier strictement positif
             */
            amount: number;
            /** Format: uuid */
            categoryId: string;
            /** Format: date-time */
            createdAt: string;
            /**
             * @description Code ISO 4217
             * @enum {string}
             */
            currency: "EUR" | "CHF" | "GBP" | "USD" | "CAD" | "SEK" | "NOK" | "DKK" | "PLN" | "CZK" | "HUF" | "RON" | "ISK" | "MAD" | "TND" | "MGA" | "MUR" | "XOF" | "XAF" | "XPF" | "JPY";
            /**
             * Format: date
             * @description Date calendaire, sans fuseau
             * @example 2026-03-29
             */
            date: string;
            /**
             * Format: date-time
             * @description Suppression logique ; NULL si active
             */
            deletedAt: string | null;
            /** Format: uuid */
            id: string;
            merchant: string | null;
            note: string | null;
            /** @enum {string} */
            source: "manual" | "recurrence";
            /** @description Noms d’étiquettes (1 à 50 caractères), dédoublonnés à la casse et aux accents près */
            tags: string[];
            /** Format: date-time */
            updatedAt: string;
        };
        SyncLimitDto: {
            /** @description Unités mineures ; NULL = aucune limite */
            amount: number | null;
            /** Format: date-time */
            createdAt: string;
            /** @example EUR */
            currency: string;
            /**
             * Format: date-time
             * @description Suppression logique ; NULL si active
             */
            deletedAt: string | null;
            /** Format: date */
            effectiveDate: string;
            /** Format: uuid */
            id: string;
            includeRecurring: boolean;
            /** @enum {string} */
            periodKind: "month" | "week";
            startDay: number;
            /** Format: date-time */
            updatedAt: string;
        };
        SyncOccurrenceDto: {
            /** @description Montant propre à l’échéance ; NULL = montant de la récurrence */
            amount: number | null;
            /**
             * Format: date-time
             * @description Mode confirmation : échéance due signalée « à confirmer » (F-REC-02)
             */
            confirmationRequestedAt: string | null;
            /** Format: date-time */
            createdAt: string;
            /**
             * Format: date-time
             * @description Suppression logique ; NULL si active
             */
            deletedAt: string | null;
            /** Format: date */
            dueDate: string;
            /** Format: uuid */
            expenseId: string | null;
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            recurringExpenseId: string;
            /** @enum {string} */
            status: "pending" | "paid" | "skipped";
            /** Format: date-time */
            updatedAt: string;
        };
        SyncPageDto: {
            categories: components["schemas"]["SyncCategoryDto"][];
            expenses: components["schemas"]["SyncExpenseDto"][];
            /** @description Versions de la limite globale (ADR-027) */
            limits: components["schemas"]["SyncLimitDto"][];
            /** @description Curseur de la page suivante du même parcours ; `null` en fin de parcours */
            nextCursor: string | null;
            /**
             * Format: date-time
             * @description `updated_since` du prochain parcours (identique sur toutes les pages)
             */
            nextUpdatedSince: string;
            /** @description Échéances (ADR-032) */
            occurrences: components["schemas"]["SyncOccurrenceDto"][];
            /** @description Dépenses récurrentes (ADR-032) */
            recurringExpenses: components["schemas"]["SyncRecurringDto"][];
            tags: components["schemas"]["SyncTagDto"][];
        };
        SyncRecurringDto: {
            /** @description Unités mineures de `currency` */
            amount: number;
            /** @enum {string} */
            amountKind: "fixed" | "estimated";
            /** Format: uuid */
            categoryId: string;
            /** Format: date-time */
            createdAt: string;
            /** @example EUR */
            currency: string;
            /**
             * Format: date-time
             * @description Suppression logique ; NULL si active
             */
            deletedAt: string | null;
            /** @enum {string} */
            frequency: "weekly" | "monthly" | "quarterly" | "yearly" | "once";
            /** Format: uuid */
            id: string;
            /**
             * @description auto : enregistrée à l’échéance
             * @enum {string}
             */
            mode: "auto" | "confirm";
            name: string;
            /** @description Rappel le jour de l’échéance (F-REC-04) ; sans effet en mode auto (payée à minuit) */
            remindOnDueDate: boolean;
            /** @description Rappel 3 jours avant l’échéance (F-REC-04) */
            remindThreeDaysBefore: boolean;
            /**
             * Format: date
             * @description Première échéance ; porte le jour (ADR-032)
             */
            startDate: string;
            /** Format: date-time */
            updatedAt: string;
        };
        SyncTagDto: {
            /**
             * Format: date-time
             * @description Suppression logique ; NULL si active
             */
            deletedAt: string | null;
            /** Format: uuid */
            id: string;
            name: string;
            /** Format: date-time */
            updatedAt: string;
        };
        UpcomingOccurrenceDto: {
            /** @description Montant propre à cette échéance */
            adjusted: boolean;
            /** @description Attendu (ajusté ou de la récurrence) ; payée : réel */
            amount: number;
            /** @enum {string} */
            amountKind: "fixed" | "estimated";
            /** @description Mode confirmation : échéance due, à confirmer (F-REC-02) */
            awaitingConfirmation: boolean;
            /** Format: uuid */
            categoryId: string;
            /** Format: date-time */
            createdAt: string;
            /** @example EUR */
            currency: string;
            /** Format: date */
            dueDate: string;
            /** Format: uuid */
            expenseId: string | null;
            /** Format: uuid */
            id: string;
            name: string;
            /** @description Date d’échéance passée (fuseau du compte) */
            overdue: boolean;
            /** Format: uuid */
            recurringExpenseId: string;
            /** @enum {string} */
            status: "pending" | "paid" | "skipped";
            /** Format: date-time */
            updatedAt: string;
        };
        UpdateCategoryDto: {
            color?: string;
            hidden?: boolean;
            icon?: string;
            name?: string;
            /** Format: uuid */
            parentId?: string | null;
        };
        UpdateExpenseDto: {
            /**
             * Format: int64
             * @description Montant en unités mineures (centimes), entier strictement positif
             */
            amount?: number;
            /** Format: uuid */
            categoryId?: string;
            /** @enum {string} */
            currency?: "EUR" | "CHF" | "GBP" | "USD" | "CAD" | "SEK" | "NOK" | "DKK" | "PLN" | "CZK" | "HUF" | "RON" | "ISK" | "MAD" | "TND" | "MGA" | "MUR" | "XOF" | "XAF" | "XPF" | "JPY";
            /**
             * Format: date
             * @description Date calendaire, sans fuseau
             * @example 2026-03-29
             */
            date?: string;
            merchant?: string | null;
            note?: string | null;
            /** @description Noms d’étiquettes (1 à 50 caractères), dédoublonnés à la casse et aux accents près ; remplace la liste */
            tags?: string[];
        };
        UpdateLimitDto: {
            amount?: number | null;
            includeRecurring?: boolean;
            /** @enum {string} */
            periodKind?: "month" | "week";
            startDay?: number;
        };
        UpdateMeDto: {
            /**
             * @description Code ISO 4217
             * @enum {string}
             */
            currency?: "EUR" | "CHF" | "GBP" | "USD" | "CAD" | "SEK" | "NOK" | "DKK" | "PLN" | "CZK" | "HUF" | "RON" | "ISK" | "MAD" | "TND" | "MGA" | "MUR" | "XOF" | "XAF" | "XPF" | "JPY";
            /**
             * @description Heure locale du rappel quotidien de saisie ; null = désactivé
             * @example 09:00
             */
            dailyReminderTime?: string | null;
            /** @enum {string} */
            language?: "fr" | "en";
            /**
             * @description Heure locale des rappels d’échéance
             * @example 09:00
             */
            reminderTime?: string;
            /**
             * @description Fuseau IANA (`Zone/Lieu` ou `UTC`) ; décalages fixes et abréviations refusés
             * @example America/Montreal
             */
            timeZone?: string;
        };
        UpdateNotificationSettingsDto: {
            dailyReminder?: boolean;
            limit?: boolean;
            occurrence?: boolean;
            /** @description null = aucune plage */
            quietHours?: components["schemas"]["QuietHoursDto"] | null;
            unusualExpense?: boolean;
        };
        UpdateRecurringDto: {
            amount?: number;
            /** @enum {string} */
            amountKind?: "fixed" | "estimated";
            /** Format: uuid */
            categoryId?: string;
            /** @enum {string} */
            mode?: "auto" | "confirm";
            name?: string;
            /** @description Rappel le jour de l’échéance */
            remindOnDueDate?: boolean;
            /** @description Rappel 3 jours avant l’échéance */
            remindThreeDaysBefore?: boolean;
        };
        VerifyEmailDto: {
            /** @description Jeton reçu par e-mail (base64url, 43 caractères) */
            token: string;
        };
        VerifyPurchaseDto: {
            /** @description Google Play : jeton d’achat */
            purchaseToken?: string;
            /**
             * @description Store de l’achat : exige `transactionId` (app_store) ou `purchaseToken` (google_play), à l’exclusion de l’autre champ
             * @enum {string}
             */
            store: "app_store" | "google_play";
            /** @description App Store : identifiant d’une transaction de l’abonnement (StoreKit 2) */
            transactionId?: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
    AuthController_login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionTokensDto"];
                };
            };
            /** @description Champs invalides */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Identifiants invalides */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Adresse e-mail non vérifiée */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Trop de tentatives ; réessayer après Retry-After */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshTokenDto"];
            };
        };
        responses: {
            /** @description Session fermée */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Champs invalides */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_confirmPasswordReset: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordResetConfirmDto"];
            };
        };
        responses: {
            /** @description Mot de passe remplacé, sessions révoquées */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Champs invalides, jeton invalide, expiré ou déjà utilisé */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Trop de tentatives ; réessayer après Retry-After */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_requestPasswordReset: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordResetRequestDto"];
            };
        };
        responses: {
            /** @description Demande prise en compte ; un e-mail suit si le compte existe */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Champs invalides */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Trop de tentatives ; réessayer après Retry-After */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_refresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshTokenDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionTokensDto"];
                };
            };
            /** @description Champs invalides */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton inconnu, expiré, révoqué ou déjà utilisé */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_register: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterDto"];
            };
        };
        responses: {
            /** @description Inscription prise en compte ; un e-mail de vérification suit */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Champs invalides */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Trop de tentatives ; réessayer après Retry-After */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_social: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SocialLoginDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionTokensDto"];
                };
            };
            /** @description Champs invalides */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’identité invalide */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Adresse e-mail non vérifiée ou inutilisable */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Compte existant non rattachable (adresse non garantie) */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Acceptation des CGU requise */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Trop de tentatives ; réessayer après Retry-After */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Fournisseur non configuré */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_verifyEmail: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerifyEmailDto"];
            };
        };
        responses: {
            /** @description Adresse vérifiée */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton invalide, expiré ou déjà utilisé */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Trop de tentatives ; réessayer après Retry-After */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    HealthController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthDto"];
                };
            };
        };
    };
    MeController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeDto"];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    MeController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Compte et toutes ses données effacés immédiatement et définitivement (F-AUTH-07) : carnets, dépenses (y compris supprimées), récurrences, limites, exports, appareils, sessions */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide, expiré, ou compte déjà supprimé */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    MeController_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateMeDto"];
            };
        };
        responses: {
            /** @description Profil après modification */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeDto"];
                };
            };
            /** @description Corps vide, champ inconnu, langue, fuseau ou devise non pris en charge */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NotificationsController_register: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description UUID v7 tiré par l’application */
                deviceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeviceDto"];
            };
        };
        responses: {
            /** @description Appareil enregistré ou mis à jour */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Identifiant, plateforme ou jeton invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Identifiant déjà utilisé par un autre compte */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NotificationsController_unregister: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deviceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Appareil désinscrit, ou inconnu */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AccountExportController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateAccountExportDto"];
            };
        };
        responses: {
            /** @description Demande enregistrée (archive zip JSON + CSV), ou existante si rejeu */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountExportDto"];
                };
            };
            /** @description Corps invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Identifiant déjà utilisé */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Stockage des fichiers non configuré */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AccountExportController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                exportId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountExportDto"];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Export introuvable (ou d’un autre compte) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AccountExportController_download: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                exportId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Archive zip déchiffrée (depenseo.json, csv/<table>.csv, LISEZMOI.txt) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/zip": string;
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Export introuvable (ou d’un autre compte), pas encore prêt ou lien expiré */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NotificationsController_getSettings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationSettingsDto"];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NotificationsController_updateSettings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateNotificationSettingsDto"];
            };
        };
        responses: {
            /** @description Réglages après modification */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationSettingsDto"];
                };
            };
            /** @description Corps vide, champ inconnu ou heure invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NotebooksController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotebookDto"][];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NotebooksController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotebookDto"];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet inexistant, supprimé ou d’un autre compte */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CategoriesController_list: {
        parameters: {
            query?: {
                includeHidden?: "true" | "false";
            };
            header?: never;
            path: {
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryDto"][];
                };
            };
            /** @description `includeHidden` autre que true/false */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou catégorie introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CategoriesController_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateCategoryDto"];
            };
        };
        responses: {
            /** @description Créée, ou existante si rejeu */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryDto"];
                };
            };
            /** @description Corps invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou catégorie introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Identifiant déjà utilisé ailleurs ou supprimé */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Catégorie parente invalide */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CategoriesController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                categoryId: string;
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Y compris masquée */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryDto"];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou catégorie introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CategoriesController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                categoryId: string;
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Supprimée (logiquement), ou déjà supprimée */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou catégorie introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Catégorie du plan par défaut, ou avec sous-catégories */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CategoriesController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                categoryId: string;
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateCategoryDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryDto"];
                };
            };
            /** @description Corps vide ou invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou catégorie introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Catégorie parente invalide */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    DashboardController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Tableau de bord du carnet */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DashboardDto"];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExpensesController_list: {
        parameters: {
            query?: {
                /** @description Catégorie(s) exacte(s), paramètre répétable (sous-catégories non incluses) */
                categoryId?: string[];
                /** @description `nextCursor` de la page précédente */
                cursor?: string;
                /** @description Date de début incluse */
                from?: string;
                limit?: number;
                /** @description Montant maximal inclus (centimes) */
                maxAmount?: number;
                /** @description Montant minimal inclus (centimes) */
                minAmount?: number;
                /** @description Texte cherché dans la note et le marchand (insensible à la casse et aux accents) */
                q?: string;
                /** @description Date de fin incluse */
                to?: string;
            };
            header?: never;
            path: {
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dépenses actives filtrées, par date puis identifiant décroissants */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpensePageDto"];
                };
            };
            /** @description Paramètre inconnu ou invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExpensesController_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateExpenseDto"];
            };
        };
        responses: {
            /** @description Créée, ou existante si rejeu */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpenseDto"];
                };
            };
            /** @description Corps invalide (montant non entier, date…) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou dépense introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Identifiant déjà utilisé ailleurs, ou dépense supprimée */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Catégorie invalide */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExpensesController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                expenseId: string;
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpenseDto"];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou dépense introuvable, ou supprimée */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExpensesController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                expenseId: string;
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Supprimée (logiquement), ou déjà supprimée */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou dépense introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExpensesController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                expenseId: string;
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateExpenseDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpenseDto"];
                };
            };
            /** @description Corps vide ou invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou dépense introuvable, ou supprimée */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Catégorie invalide */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExpensesController_restore: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                expenseId: string;
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Restaurée, ou déjà active */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpenseDto"];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou dépense introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExportsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateExportDto"];
            };
        };
        responses: {
            /** @description Demande enregistrée, ou existante si rejeu */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExportDto"];
                };
            };
            /** @description Corps invalide (format, dates, période inversée) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Export Excel hors Premium */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Identifiant déjà utilisé pour une autre demande */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Stockage des fichiers non configuré */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExportsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                exportId: string;
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExportDto"];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou export introuvable (ou export d’un autre compte) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ExportsController_download: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                exportId: string;
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Fichier déchiffré (CSV UTF-8 ou classeur Excel) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": string;
                    "text/csv; charset=utf-8": string;
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou export introuvable (ou export d’un autre compte), pas encore prêt ou lien expiré */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LimitsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Historique, plus récente d’abord */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LimitDto"][];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou limite introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LimitsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateLimitDto"];
            };
        };
        responses: {
            /** @description Nouvelle version, ou existante si rejeu */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LimitDto"];
                };
            };
            /** @description Corps invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou limite introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Identifiant déjà utilisé, ou version déjà créée ce jour */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LimitsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                limitId: string;
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateLimitDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LimitDto"];
                };
            };
            /** @description Corps vide ou invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou limite introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Version passée : créer une nouvelle version */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    LimitsController_current: {
        parameters: {
            query?: {
                past?: number;
            };
            header?: never;
            path: {
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Jauge de la période en cours */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CurrentLimitDto"];
                };
            };
            /** @description Paramètre invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou limite introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OccurrencesController_adjust: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
                occurrenceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdjustOccurrenceDto"];
            };
        };
        responses: {
            /** @description Montant ajusté */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OccurrenceDto"];
                };
            };
            /** @description Corps invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou échéance introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Échéance déjà payée ou sautée */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OccurrencesController_pay: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
                occurrenceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PayOccurrenceDto"];
            };
        };
        responses: {
            /** @description Payée (dépense créée), ou rejeu */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OccurrenceDto"];
                };
            };
            /** @description Corps invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou échéance introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Déjà payée (autre dépense) ou sautée ; identifiant pris */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Catégorie supprimée ou d’un autre carnet */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OccurrencesController_skip: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
                occurrenceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sautée, ou déjà sautée */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OccurrenceDto"];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou échéance introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Échéance déjà payée */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    RecurringController_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Actives, par nom */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecurringDto"][];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou dépense récurrente introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    RecurringController_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateRecurringDto"];
            };
        };
        responses: {
            /** @description Créée, ou existante si rejeu */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecurringDto"];
                };
            };
            /** @description Corps invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou dépense récurrente introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Identifiant déjà utilisé, ou récurrence supprimée */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Catégorie supprimée ou d’un autre carnet, ou ponctuelle passée */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    RecurringController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
                recurringId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecurringDto"];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou dépense récurrente introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    RecurringController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
                recurringId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Supprimée avec ses échéances en attente, ou déjà supprimée */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou dépense récurrente introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    RecurringController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
                recurringId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateRecurringDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecurringDto"];
                };
            };
            /** @description Corps vide ou invalide (calendrier immuable) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou dépense récurrente introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Catégorie supprimée ou d’un autre carnet */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    RecurringController_occurrencesOf: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notebookId: unknown;
                recurringId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Par date d’échéance */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OccurrenceDto"][];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet ou dépense récurrente introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SyncController_changes: {
        parameters: {
            query?: {
                /** @description `nextCursor` de la page précédente (exclut updated_since) */
                cursor?: string;
                /** @description Lignes par page, toutes tables confondues */
                limit?: number;
                /** @description Instant UTC (suffixe Z) inclus ; absent = synchronisation complète. Plus de 29 jours → 410 */
                updated_since?: string;
            };
            header?: never;
            path: {
                notebookId: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Catégories, étiquettes, dépenses, limites, récurrences puis échéances modifiées, suppressions incluses, par (updatedAt, id) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SyncPageDto"];
                };
            };
            /** @description Paramètre inconnu ou invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Carnet introuvable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description updated_since trop ancien : synchronisation complète requise */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    StoreNotificationsController_appStore: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description JWS signé par Apple (x5c) */
                    signedPayload: string;
                };
            };
        };
        responses: {
            /** @description Notification reçue (ignorée si elle ne concerne aucun abonnement connu) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Corps invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Signature absente de la chaîne Apple */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Store non configuré ou injoignable : le store relivrera la notification */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    StoreNotificationsController_googlePlay: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Message push Pub/Sub ; `message.data` = DeveloperNotification en base64 */
        requestBody: {
            content: {
                "application/json": {
                    message: {
                        /** Format: byte */
                        data: string;
                    };
                    subscription: string;
                };
            };
        };
        responses: {
            /** @description Notification reçue (ignorée si elle ne concerne aucun abonnement connu) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Corps ou message invalide */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton OIDC du push absent ou refusé */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Store non configuré ou injoignable : le store relivrera la notification */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SubscriptionsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Droits Premium du compte */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EntitlementsDto"];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SubscriptionsController_startTrial: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Essai commencé : droits mis à jour */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EntitlementsDto"];
                };
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Essai déjà utilisé par ce compte */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SubscriptionsController_verify: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerifyPurchaseDto"];
            };
        };
        responses: {
            /** @description Achat vérifié auprès du store et rattaché au compte (ou restauré) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EntitlementsDto"];
                };
            };
            /** @description Corps invalide, ou reçu refusé par le store */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Jeton d’accès absent, invalide ou expiré */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Achat déjà rattaché à un autre compte */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Store non configuré ou injoignable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
