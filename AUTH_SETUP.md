# Real authentication setup

This branch replaces the demo login with a real Worker + D1 authentication flow.

## 1. Configure the admin password

For local development:

```bash
cp .dev.vars.example .dev.vars
```

Then set a private value for `ADMIN_PASSWORD` in `.dev.vars`.

For the deployed Worker, set the encrypted Cloudflare secret:

```bash
npx wrangler secret put ADMIN_PASSWORD
```

The admin username is always `admin`.

## 2. Apply the D1 migration

The existing database needs the authentication migration before the new Worker is deployed:

```bash
npx wrangler d1 migrations apply malastrana_db --remote
```

For local D1:

```bash
npx wrangler d1 migrations apply malastrana_db --local
```

## 3. Run the Worker

```bash
npx wrangler dev
```

The default local API URL is `http://127.0.0.1:8787`.

## 4. Frontend

Copy `.env.example` to `.env` in the frontend repository and set `VITE_API_BASE_URL` to the Worker URL.

The frontend now supports:

- real username + password login;
- persistent server-side sessions;
- admin-only collaborator creation;
- automatic `nome.cognome` usernames;
- default initial password equal to the surname;
- real collaborator profile lookup;
- admin password changes.

The old demo provider is intentionally still present for the rest of the application. It will be removed module by module after the real API is proven.
