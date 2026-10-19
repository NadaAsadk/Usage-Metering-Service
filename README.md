# Usage Metering and Quota Service

A TypeScript/Express API backed by PostgreSQL. Calling applications use an account API key to register users, check quotas, consume units, inspect usage, and view request history. Account-level and user-level quotas are enforced together.

## Features

- Account creation with a one-time API key; only the SHA-256 hash is stored.
- Users scoped to an account, with a user-specific plan.
- Predefined account plans (`Starter`, `Growth`) and user plans (`Basic`, `Power`), seeded on startup.
- Custom plans, plan rule updates, and plan assignment endpoints.
- Monthly allowance and maximum-units-per-request rules at both account and user level.
- Accepted and rejected request history, including plan snapshots and rejection reasons.
- Idempotent `requestId` handling within an account.
- UTC calendar-month usage counters, history pagination, database constraints, and transaction-based account locking.
- Browser demo client and a Node.js load-test script.

## Requirements

- Docker Engine and Docker Compose v2 for the complete stack.
- For running directly on your machine: Node.js 22+ and PostgreSQL 17.

## Start the complete stack

From the repository root:

```bash
docker compose up --build
```

The stack contains:

- PostgreSQL on `localhost:5433`.
- API on `http://localhost:3000`.
- Demo client on `http://localhost:8080`.

The API container waits for PostgreSQL to become healthy, runs Drizzle migrations, seeds predefined plans, then starts the API. The database uses a named Docker volume (`usage_metering_data`) so data persists across container restarts.

Open **http://localhost:8080** to use the demo. Create an account, register users, consume units, inspect usage/history, and change plans. The API key is displayed once and held in the current browser tab's session storage for the demo. Copy it to a safe local place if you need it after closing the tab.

### Environment variables

Compose has safe local-development defaults. To override them, create a `.env` file in the repository root:

```dotenv
POSTGRES_DB=usage_metering
POSTGRES_USER=usage_app
POSTGRES_PASSWORD=replace_with_a_local_password
POSTGRES_PORT=5433
API_PORT=3000
CLIENT_PORT=8080
```

Do not commit `.env` or real API keys. `.env.example` documents the direct/local API database URL. Inside Docker, the API must connect to host `db` on port `5432`; `localhost:5433` is only for processes running on your host machine.

### Useful Docker commands

```bash
# Start in foreground
docker compose up --build

# Start in background
docker compose up --build -d

# Follow API logs
docker compose logs -f api

# Follow all logs
docker compose logs -f

# Stop containers but preserve the database volume
docker compose down

# Check health/status
docker compose ps
curl http://localhost:3000/health
```

**Do not run `docker compose down -v` unless you intentionally want to delete the persisted database volume and all its data.**

## Run directly without Docker

1. Start PostgreSQL 17 and create a database/user.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to the host-reachable PostgreSQL URL.
3. Install dependencies and initialize the schema/plans:

```bash
npm ci
npm run db:migrate
npm run db:seed
```

4. In one terminal, run the API:

```bash
npm run dev
```

5. In another terminal, run the demo client proxy:

```bash
cd client
API_BASE_URL=http://localhost:3000 node server.mjs
```

Open `http://localhost:8080` if `PORT` is not overridden.

## Predefined plans

| Scope | Plan | Monthly allowance | Maximum per request |
|---|---|---:|---:|
| Account | Starter | 10,000 | 1,000 |
| Account | Growth | 100,000 | 10,000 |
| User | Basic | 1,000 | 250 |
| User | Power | 10,000 | 2,500 |

The account quota is shared by all users belonging to that account. Each user also has an independent quota. A request is accepted only when it passes both plans' per-request limits and both monthly allowance checks.

## API reference

Base URL: `http://localhost:3000`

Authenticated endpoints use:

```http
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

### Health and plans

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | No | API health |
| `GET` | `/api/plans` | No | List plans |
| `GET` | `/api/plans/:id` | No | Get a plan |
| `POST` | `/api/plans` | Yes | Create a custom plan |
| `PATCH` | `/api/plans/:id` | Yes | Update a custom plan; predefined plans are read-only |

Create a custom plan:

```json
{
  "name": "Team Plus",
  "scope": "user",
  "monthlyAllowance": 5000,
  "maxUnitsPerRequest": 500
}
```

Update rules (send at least one field):

```json
{
  "monthlyAllowance": 7500,
  "maxUnitsPerRequest": 600
}
```

### Accounts

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/accounts` | No | Create account and receive its API key once |
| `PATCH` | `/api/accounts/plan` | Yes | Change authenticated account's plan |

Create an account:

```json
{
  "name": "Example Document App",
  "planName": "Starter"
}
```

Change account plan:

```json
{ "planName": "Growth" }
```

### Users

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/users` | Yes | Register a user in the authenticated account |
| `GET` | `/api/users/:id` | Yes | Get user details |
| `PATCH` | `/api/users/:id/plan` | Yes | Change the user's plan |

Register a user:

```json
{
  "externalUserId": "customer-123",
  "planName": "Basic"
}
```

Change a user's plan:

```json
{ "planName": "Power" }
```

### Consume units

`POST /api/consumptions`

```json
{
  "userId": 1,
  "requestId": "document-job-0001",
  "units": 10
}
```

The `requestId` must be unique within an account for a new logical action. Replaying the same ID with the same `userId` and `units` returns the original decision without incrementing counters. Reusing it with different input returns `409 Idempotency conflict`.

Accepted response example:

```json
{
  "status": "accepted",
  "requestId": "document-job-0001",
  "consumptionId": 1,
  "units": 10,
  "usage": {
    "periodStart": "2026-10-01",
    "account": { "consumed": 10, "limit": 10000, "remaining": 9990 },
    "user": { "consumed": 10, "limit": 1000, "remaining": 990 }
  }
}
```

Rejected decisions use `status: "rejected"`, `rejectionScope` (`account` or `user`) and a stable `rejectionReason`, for example `USER_MAX_UNITS_PER_REQUEST_EXCEEDED` or `ACCOUNT_MONTHLY_ALLOWANCE_EXCEEDED`. A quota rejection is recorded but does not increment either usage counter.

### Usage and history

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/usage/account` | Yes | Current UTC-month account usage |
| `GET` | `/api/usage/users/:id` | Yes | Current UTC-month user usage |
| `GET` | `/api/consumptions?limit=20&offset=0` | Yes | Consumption history |

History filters also accept `userId` and `status=accepted` or `status=rejected`. `limit` must be between 1 and 100; `offset` must be non-negative.

## Postman

Recommended Collection variables:

| Variable | Example |
|---|---|
| `baseUrl` | `http://localhost:3000` |
| `apiKey` | Set after creating an account; do not commit it |
| `userId` | The ID returned by user creation |
| `requestId` | `postman-request-001` |

Set the Collection's Authorization type to **Bearer Token** and token to `{{apiKey}}`. Use `{{baseUrl}}/api/...` for request URLs. Keep `POST /api/accounts` unauthenticated because it creates the API key; use the returned key for all account/user operations. Avoid saving real keys in a shared exported Environment.

Suggested request order:

1. `GET {{baseUrl}}/api/plans`
2. `POST {{baseUrl}}/api/accounts` with `name` and `planName`; copy `apiKey` from response into `apiKey` variable.
3. `POST {{baseUrl}}/api/users` with `externalUserId` and `planName`; copy returned user ID into `userId`.
4. `POST {{baseUrl}}/api/consumptions` with `userId`, `requestId`, and `units`.
5. `GET {{baseUrl}}/api/usage/account` and `GET {{baseUrl}}/api/usage/users/{{userId}}`.
6. Retry the exact same consume request to demonstrate idempotency, then change `units` while keeping `requestId` to demonstrate a `409` conflict.
7. Try a request over the user limit and a request over the shared account allowance.
8. Use `GET {{baseUrl}}/api/consumptions?limit=20&offset=0` to inspect the decision history.

## Tests

```bash
npm ci
npm run build
npm test
```

The unit tests use Vitest and mock service/repository dependencies where appropriate. They are fast checks of validation, API-key middleware, and consumption-service decision logic. They are **not a substitute for PostgreSQL integration tests**; run database-backed concurrency tests before treating concurrency behavior as fully verified.

## Load test

Use a local/disposable account and user. The script creates real consumption history and changes usage counters, so do not point it at production data.

Linux/macOS/Git Bash:

```bash
API_KEY='your-local-api-key' USER_ID=1 TOTAL=500 CONCURRENCY=25 npm run load:test
```

PowerShell:

```powershell
$env:API_KEY='your-local-api-key'
$env:USER_ID='1'
$env:TOTAL='500'
$env:CONCURRENCY='25'
npm run load:test
```

Optional environment variables: `BASE_URL`, `UNITS`, `TOTAL`, and `CONCURRENCY`. Output includes requests per second, latency min/median/p95/max, accepted/rejected responses, and errors. Record the actual output, machine specs, database configuration, and test parameters in your report. No benchmark result is claimed in this repository until the script has been run in your environment.

## Assumptions and design decisions

- A unit is the only metered resource; multi-resource billing, payments, refunds, and authentication for end users are out of scope.
- Monthly periods follow UTC calendar months. New requests are charged to the UTC month in which they are processed.
- Account allowance is shared across all its users. User allowances are independent.
- A request is all-or-nothing; partial consumption is not supported.
- Quota rejections are persisted as history but do not increment usage.
- A repeated `requestId` with identical user and units returns the original decision; changed input returns `409`.
- Usage is preserved when plans are switched. If the current usage exceeds a newly lowered limit, remaining is zero and further consumption at that level is rejected.
- The demo client simulates a metered action; it does not perform document processing.
- Predefined plan limits are examples and should be changed deliberately for a real deployment.
- This setup is intended for local development/demo use. Before production use, add deployment-grade secret management, TLS/reverse proxy, monitoring, backups, and database-backed integration/concurrency tests.


