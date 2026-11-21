# AEON Homes

Real estate website (buy, sell, rent, mortgage calculator) with an Express backend and a free, file-based JSON database.

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000

## Folder structure
```
server.js          Express API + static server
package.json
public/            Website (HTML pages, js/app.js, css, images)
  images/          logo.jpg, Background.png, house-*.jpg
data/              db.json is created here on first run
```

## Admin
Go to `/admin.html`. Default login is `admin@aeonhomes.ph` / `admin123`.
**Before going live set these environment variables:** `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`.

## Hosting
Render, Railway, Fly.io (free tiers) or any VPS with Node 18+. Set `DATA_DIR` to a persistent disk so `db.json` is not lost on redeploy.
