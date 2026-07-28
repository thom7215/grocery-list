# Family Grocery List

A simple mobile-friendly app for your family to add, check off, and remove grocery items. Changes sync to the **Family Dashboard** on your TV via the same Cloudflare Worker.

## Setup

1. Create a new GitHub repo (e.g. `thom7215/grocery-list`) and upload these files.
2. Enable **GitHub Pages** (Settings → Pages → Source: GitHub Actions).
3. Push to `main` — the workflow deploys automatically.

Your app will be at: `https://thom7215.github.io/grocery-list/`

## Connect to Cloudflare

1. Open the app on your phone or computer.
2. Tap **⚙ Settings**.
3. Enter:
   - **Cloud API URL:** `https://family-dashboard-api.thom7215.workers.dev`
   - **Family password:** same as your dashboard / `FAMILY_TOKEN` in Cloudflare
4. Tap **Save & sync**.

Everyone in the family can bookmark the app and use the same password.

## Update the Cloudflare Worker

The worker needs a small update to support deleting items. In the Cloudflare dashboard, open your `family-dashboard-api` worker and paste the latest code from `family-dashboard/worker/src/index.js` (includes `DELETE /api/groceries/:id`).

## Local testing

Double-click **Start Grocery List.bat** — opens at http://localhost:8080
