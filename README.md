# Saylani HCM Lite

A role-scoped human capital management application built with React, Vite, Express, MongoDB, and Groq. The database starts empty; first-run setup creates the company and its first administrator.

## Requirements

- Node.js 20 or newer
- MongoDB Atlas URI (or a local MongoDB connection string)
- A Groq API key for AI features (optional while setting up)

## Run locally

1. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI`, `JWT_SECRET`, and `JWT_REFRESH_SECRET`. Add `GROQ_API_KEY` to enable the AI assistant.
2. Copy `frontend/.env.example` to `frontend/.env` if the API is not running at `http://localhost:5000/api`.
3. Install dependencies:

   ```powershell
   npm install
   npm install --prefix backend
   npm install --prefix frontend
   ```

4. Start API and frontend in separate terminals:

   ```powershell
   npm run dev --prefix backend
   npm run dev --prefix frontend
   ```

   Or run `npm run dev` from this folder after installing the root dependencies.
5. Open `http://localhost:5173`. The first-run wizard creates the company and Admin account. Add departments, create an HR account, then register employees.

The API health check is `GET http://localhost:5000/api/health`. No sample or seeded employee records are created.

Run the backend unit and API-guard checks with `npm test --prefix backend`.

## Demo flow

1. Complete first-run setup and add organization departments.
2. Create an HR account in Organization settings.
3. Sign in as HR, add employees individually or use the CSV dry-run/import flow.
4. Give an employee their one-time password; the employee must set a new password on first login.
5. Check in/out, request leave directly or use the AI assistant to draft a leave request, then approve it as HR.
6. Generate a payroll draft as HR and finalize it as Admin. Finalized payroll is immutable.
7. Download an employee payslip; Admin-only audit records are available from Audit log.

## Roles and data access

- **Admin:** company configuration, HR account creation/password reset API, organization dashboard, payroll finalization, and read-only audit log.
- **HR:** employee records and CSV, attendance/correction review, leave approval, payroll drafts, and announcements.
- **Employee:** own attendance, leave, profile, payslips, and AI leave-balance access.

Authorization and employee scoping are enforced by API middleware/controllers, not only by the UI. Employee payroll responses and payslip downloads include only the signed-in employee's own salary records. Passwords use bcrypt; access tokens expire after 15 minutes and refresh tokens rotate.

## API overview

All endpoints are under `/api`: `/setup`, `/auth`, `/employees`, `/attendance`, `/leave`, `/organization`, `/payroll`, `/dashboard`, `/ai`, `/announcements`, `/notifications`, and `/audit`.

Request bodies are validated server-side. AI requests are sent from the backend to Groq; browser bundles never receive the Groq secret. AI responses and fallback notices are labeled as AI-generated in the assistant.

## Deployment

No database or hosting account is bundled into the code. The app can be built locally now, but a public deployment needs your own MongoDB Atlas connection and Render/Vercel accounts. Add secret values in the provider dashboards; do not send passwords, connection strings, or API keys in chat.

### MongoDB Atlas

1. Create an Atlas project and a database user with a strong password.
2. Create a cluster and copy its application connection string. Replace the username/password placeholders and include the database name `saylani_hcm`.
3. Allow your Render service's outbound IP in Atlas Network Access. If the Render plan uses changing outbound IPs, use the narrowest network access Atlas/Render allow; avoid leaving broad network access enabled after a demo.

### Render (backend)

1. Create a Render **Web Service** from this standalone project folder (not the ecommerce folder), or use the included `render.yaml` Blueprint.
2. Set the service root to `backend`, build command to `npm install`, and start command to `npm start`.
3. Add `MONGODB_URI` from Atlas, `CLIENT_ORIGIN` as your Vercel site URL, and optional `GROQ_API_KEY`, `GROQ_MODEL`, and `AI_TIMEOUT_MS`. Set independent strong `JWT_SECRET` and `JWT_REFRESH_SECRET` values, or use the generated values in `render.yaml`.
4. Wait for `GET /api/health` to return `{"status":"ok"}`.

### Vercel (frontend)

1. Import the same standalone project folder into Vercel and set the project root to `frontend`.
2. Set the environment variable `VITE_API_URL=https://<your-render-service>.onrender.com/api` for the Production environment.
3. Deploy with build command `npm run build` and output folder `dist` (the supplied `frontend/vercel.json` enables client-side route fallback).
4. Copy the Vercel production URL into Render's `CLIENT_ORIGIN` and redeploy the backend.
5. Open the Vercel URL. On an empty database, the first-run wizard creates your company and the only Admin. Add organization settings, create HR, and follow the demo flow above.

Use separate, strong JWT secrets and restrict MongoDB Atlas network access to your deployment as appropriate. Never commit `.env` files.

## Business rules included

- Default office start 09:00, grace period 15 minutes, Saturday/Sunday weekend, and leave quotas Annual 14, Sick 8, Casual 10, Unpaid unlimited.
- Attendance timestamps are generated by the server, duplicate daily check-ins are rejected, late is after the configured grace period, and under-five-hour attendance is half-day.
- Leave requests exclude configured weekends and holidays, reject overlaps, and validate approved balances again at approval.
- Payroll derives HRA and Medical as 40% and 10% of Basic, gross as `Basic x 1.5`, applies progressive annual tax bands, and calculates absence, approved unpaid leave, and half-day deductions using workdays.
- Optional late penalties default to 0% (disabled). Admins may configure a percentage of daily gross per late arrival; the total is capped at monthly gross and appears on payslips. Confirm local employment-law requirements before enabling deductions.
- Optional geofence check-in requires office latitude/longitude and browser location permission; employee coordinates are checked against the configured radius and are not stored.
- Optional camera check-in detects face presence on-device in browsers that support `FaceDetector`. No camera image or biometric template is stored. This is not identity verification, and browser-reported location/camera checks are not tamper-proof security controls.
- Admin/HR dashboards include transparent, rule-based absence flags for review. Admins also see an aggregate 90-day departure run-rate; it is historical context, not a reliable forecast or individual attrition score.
- The frontend can be installed as a PWA. Its service worker caches only the app shell and static assets; authenticated API responses are never cached. Dark mode follows the system preference initially and can be toggled from the app header.

## Current scope

This project provides the setup, authentication, employee 360 profile, CSV dry-run/import/export, attendance, leave, payroll, dashboards, announcements, audit, notifications, and Groq tool-calling flows. Optional camera presence checks, office geofencing, configurable late penalties, dashboard absence signals, a historical attrition run-rate, dark mode, and an installable PWA are included and remain opt-in where appropriate.
