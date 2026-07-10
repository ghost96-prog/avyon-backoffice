# Avyon BackOffice (web)

Vite + React web app for the Avyon BackOffice. This first chunk covers:

- Firebase email/password **Login**
- Post-login **PIN gate** (same identity model as the POS's PinModal —
  if the business owner has a PIN set up for staff, whoever signs into
  BackOffice has to enter their 4-digit PIN too, and the sidebar/pages
  gate themselves by that person's role permissions)
- Responsive **Sidebar + TopBar shell** (collapsible on desktop, a slide-in
  drawer on tablet/mobile)
- **Executive Dashboard** — KPI cards, sales trend chart, branch snapshot,
  wired to `GET /business/:businessId/reports/dashboard`
- Every other BackOffice section from the brainstorm doc (Sales Analytics,
  Profit Analytics, Product Performance, Inventory Intelligence, Customer
  Analytics, Cashier Performance, Branch Comparison, Financial Reports,
  Report Builder, Scheduled Reports, Export Centre, Audit Logs, Business
  Profile, Settings) is already in the nav and routed to a "coming soon"
  placeholder, correctly permission-gated, ready to be filled in as we add
  chunks.

## Setup

```bash
npm install
cp .env.example .env   # fill in your Firebase web config + API base
npm run dev
```

## Where things live

| Concern | File |
|---|---|
| Firebase init | `src/firebase/firebase.js` |
| Auth + business context + PIN flow | `src/context/AppContext.jsx` |
| Authenticated fetch helper | `src/services/api.js` |
| Staff roster / PIN verify / role permissions cache | `src/services/backofficeSessionManager.js` |
| Nav items + which permission unlocks each | `src/utils/navConfig.js` |
| Permission id catalog (matches `roleController.js`) | `src/utils/permissions.js` |
| Route guard (redirect to /login, PIN gate) | `src/components/auth/ProtectedRoute.jsx` |
| Per-page permission gate | `src/components/auth/RequirePermission.jsx` |
| Sidebar / TopBar / shell layout | `src/components/layout/` |
| Design tokens (colors, spacing, radius) | `src/styles/tokens.css` |

## Backend assumptions for this chunk

`backofficeSessionManager.js` assumes these endpoints exist, mirroring the
mobile app's pattern:

- `GET  /business/:businessId/staff` — roster with `.pin`, `.role`, `.status`
- `GET  /business/:businessId/staff/owner/status` — `{ hasPin }`
- `GET  /business/:businessId/branches` — used for the branch filter
- `GET  /business/:businessId/roles/:roleId/permissions` — from `roleController.js`
- `GET  /business/:businessId/reports/dashboard` — from `reportController.js`

If any of these differ in your actual API, those are the only two files
to adjust (`backofficeSessionManager.js` and `pages/Dashboard.jsx`) — the
rest of the app doesn't know or care about the wire format.

## Design

- White surfaces, `#357ABD` accent, `#234C6A` deep ink-blue for headings/
  sidebar depth (same family as the mobile app's `#234C6A` primary, so
  BackOffice reads as the grown-up sibling of the POS/Dashboard apps).
- Fully responsive: sidebar collapses to icon rail on desktop, becomes a
  drawer under 1024px; KPI grid reflows 2 → 3 → 4 columns; dashboard's
  chart + snapshot panels stack on mobile.

## Next chunks

Say which section to build next (Sales Analytics, Staff/Cashier
Performance, Branch Comparison, etc.) and it'll replace the matching
`ComingSoon` placeholder — the nav, routing, and permission gating are
already wired for all of them.
