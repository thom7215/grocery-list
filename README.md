# Family Grocery List

Mobile-friendly grocery lists with **separate lists per store** (Costco, Walmart, etc.). Syncs to your Family Dashboard TV via Cloudflare.

## Deploy to GitHub Pages

1. Create repo `grocery-list` on GitHub
2. Upload `index.html`
3. **Settings → Pages → Source:** Deploy from branch → `main` → `/ (root)`
4. Live at `https://YOUR_USERNAME.github.io/grocery-list/`

## Update Cloudflare Worker (required for store tabs)

1. Open [Cloudflare Workers](https://dash.cloudflare.com) → **family-dashboard-api**
2. Replace all code with `worker/index.js` from this folder
3. Deploy

The worker migrates your existing flat grocery list into a **General** store automatically.

## App setup

1. Open the app → **⚙ Settings**
2. **Cloud API URL:** `https://family-dashboard-api.thom7215.workers.dev`
3. **Family password:** your household password
4. Tap **Save & sync**

## Using store tabs

- Tap a store tab to switch lists
- Tap **+** to add a new store
- **Rename store** / **Delete store** buttons appear below the tabs
- Tap a row to check it off · **×** to delete · **Undo** reverses your last change
- Choose an aisle when you add an item, or tap **Add aisle**. Drag the grip to reorder items or aisle groups
- Open **Staples**, enter a name, choose an aisle, then tap **Add staple**. Tap a staple later and it goes back into that aisle. Each store keeps its own staples

## TV dashboard note

The dashboard still shows groceries from all stores (each item includes its store name after you update the dashboard). If you want store sections on the TV, update `family-dashboard/index.html` to group by `storeName` from the API.

## Local testing

Double-click **Start Grocery List.bat** — opens at http://localhost:8080
