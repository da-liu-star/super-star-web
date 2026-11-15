# Super Star Web

Vue 3 + TypeScript frontend for the Super Star Spring OAuth and user services.

## Included

- Registration and login forms with inline validation.
- Session-based login through the OAuth service.
- Automatic session recovery on refresh.
- Protected `/home` route and guest-only `/auth` route.
- Responsive workspace home page.
- Local image editor with horizontal/vertical stitching, freeform crop,
  rotation and PNG/JPEG/WebP export.
- Standalone mock mode with a hashed local demo account.

Demo account in mock mode and the backend seed data:

```text
username: admin
password: 123456
```

## Run against the backend

Start the `user` service on port `9001` and the `oauth` service on port `9000`,
then run:

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to
`http://localhost:9000`, so the browser session cookie remains same-origin in
development.

## Run without the backend

```powershell
npm install
npm run dev:mock
```

Mock users and sessions are stored in `localStorage`. Passwords are hashed
before storage, but this mode is still intended only for local demonstrations.

## Commands

```powershell
npm run dev
npm run dev:mock
npm run test
npm run build
npm run preview
npm run verify:ui
```

`npm run verify:ui` expects the mock dev server to be running at
`http://127.0.0.1:5173` and Chrome installed at its default Windows location.

## API contract

The frontend expects responses in the existing `ApiResult` envelope:

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

Endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`

For a production deployment, serve the built `dist` directory and proxy `/api`
to the OAuth service on the same origin.

For the complete Aliyun Docker deployment, see
[DEPLOY_DOCKER.md](DEPLOY_DOCKER.md).
