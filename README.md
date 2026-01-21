# fleet-management-c_car_platform

Fleet Management MVP service for the connected-car platform.

This service provides minimal REST endpoints for registering:
- Organizations
- Users (drivers/operators/admins)
- Vehicles
- Assignments (user ↔ vehicle)

It includes basic authorization checks:
- **Org scoping**: token `orgId` must match the resource org.
- **Role checks**: `admin` required for create/delete operations; `operator` can read scoped data.

## Local development

### Environment
Copy and edit:
- `.env.example` -> `.env`

No external database is required:
- `STORE_MODE=memory` for in-memory
- `STORE_MODE=file` to persist to `STORE_FILE_PATH`

### Install & run
```bash
npm install
npm start
```

Service listens on `HOST`/`PORT` (defaults: `0.0.0.0:3010`).

### Health & auth docs
- `GET /health`
- `GET /docs/auth`

## Authentication (MVP)

Requests must include:

`Authorization: Bearer <JWT>`

JWT validation is a **stub** (no signature verification) using `@connected-car/shared`’s `createJwtValidator()`.

Expected JWT payload claims:
- `sub` (string): user id
- `orgId` (string): organization scope
- `role` (`"admin"` or `"operator"`)

Dev shortcut:
- Set `AUTH_REQUIRED=false` to bypass JWT and act as `admin` in `orgId="dev-org"`.

## API Endpoints (MVP)

### Create organization (admin)
`POST /orgs`
```json
{ "name": "Acme Fleet" }
```

### Create user (admin; same org as token)
`POST /users`
```json
{ "orgId": "org_...", "name": "Jane Driver", "role": "operator" }
```

### Create vehicle (admin; same org as token)
`POST /vehicles`
```json
{ "orgId": "org_...", "vin": "1HGBH41JXMN109186", "name": "Truck 12" }
```

### Create assignment (admin; same org)
`POST /assignments`
```json
{ "userId": "usr_...", "vehicleId": "veh_..." }
```

### List org vehicles (admin/operator; scoped)
`GET /orgs/:orgId/vehicles`

### List a user’s vehicles (admin/operator; scoped; operator can only query self)
`GET /users/:userId/vehicles`

### Get vehicle details (admin/operator; scoped)
`GET /vehicles/:vehicleId`

### Delete assignment (admin; scoped)
`DELETE /assignments/:id`

## Notes / limitations
- No pagination, filtering, or audit logs (MVP).
- Storage is dev-only and not safe for concurrent writes.
- JWT signature validation is not implemented (stub).
