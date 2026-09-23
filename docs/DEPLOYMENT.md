# MotorAtlas Deployment

## Current architecture

- Source: GitHub repository `Pat211290/MotorAtlas`
- Frontend: React + TypeScript + Vite
- Backend: Supabase project `wicnjwqkurpqqrozrblq`
- Production hosting: GitHub Pages
- Canonical production domain: `https://motoratlas.de`
- Optional alias: `https://www.motoratlas.de`
- PWA: same frontend, installable on supported mobile browsers
- Android: Capacitor container prepared for APK generation

## CI and deployment

Every push to `main` runs the TypeScript check and production build.

The GitHub Pages workflow under `.github/workflows/pages.yml` builds `dist/` and deploys it through GitHub Pages. The repository includes `public/CNAME` with `motoratlas.de`, so the deployed artifact contains the production custom-domain marker.

The production build uses the MotorAtlas Supabase publishable client configuration. No service-role secret is exposed.

## Production DNS

The apex domain `motoratlas.de` is published directly through GitHub Pages using the official GitHub Pages A records:

- `185.199.108.153`
- `185.199.109.153`
- `185.199.110.153`
- `185.199.111.153`

The optional `www.motoratlas.de` alias uses a CNAME to `Pat211290.github.io`.

The previous Cloudflare Tunnel for the public `motoratlas.de` website is no longer part of the production path.

## Production verification

After each production deployment verify:

1. `https://motoratlas.de/`
2. `https://motoratlas.de/anmelden`
3. `https://motoratlas.de/bestaetigung`
4. `https://motoratlas.de/passwort-zuruecksetzen`
5. HTTPS certificate and redirect behavior
6. PWA manifest/service worker
7. Customer and workshop authentication
8. Request → appointment → diagnosis → quote → approval → repair → invoice workflow
