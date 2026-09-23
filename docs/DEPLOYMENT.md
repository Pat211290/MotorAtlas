# MotorAtlas Deployment

## Current architecture

- Source: GitHub repository `Pat211290/MotorAtlas`
- Frontend: React + TypeScript + Vite
- Backend: Supabase project `wicnjwqkurpqqrozrblq`
- PWA: same frontend, installable on iPhone/iPad/Android-capable browsers
- Android: Capacitor container prepared for APK generation

## CI

Every push to `main` runs a full dependency install, TypeScript check and production build.

## Preview

A GitHub Pages workflow is included under `.github/workflows/pages.yml`.

For the first publication, GitHub Pages must be enabled once in the repository settings and its source set to **GitHub Actions**. After that, every push to `main` republishes the preview automatically.

The preview build uses the MotorAtlas Supabase publishable client configuration. No service-role secret is exposed.

## Production motoratlas.de

The production cutover should happen only after the preview has been accepted.

Recommended production sequence:

1. Preview acceptance
2. Confirm production hosting target
3. Build with the same Supabase client variables
4. Upload `dist/` to production host
5. Verify HTTPS and service-worker scope
6. Verify customer/workshop login
7. Smoke-test request → appointment → diagnosis → quote → approval → repair → invoice
8. Switch DNS or document root only after smoke tests pass

Do not point `motoratlas.de` at the preview blindly; keep the current public site available until the final production build is validated.
