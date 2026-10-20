# WattWise

Solar and battery decision tool for Karachi homes (Vite + React + Tailwind).

Deploy: push these files to a GitHub repo, import it at vercel.com/new, click Deploy.
Update tariffs: edit `tariffs.js` only (slab rates, fixed charges, FCA, QTA, dates). Everything else recalculates.
Local: `npm install && npm run dev`

Cloudflare: build command `npm run build`, deploy command `npx wrangler deploy` (uses wrangler.jsonc, serves ./dist).
