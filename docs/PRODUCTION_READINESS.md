# MotorAtlas Production Readiness

Status: 2026-09-23

## Automated and active

- TypeScript type check on every push
- Vite production build on every push
- GitHub Pages preview deployment
- Production smoke test after every successful preview deployment
- Supabase Auth health check
- Supabase public Auth settings check
- Public workshop-directory REST check
- RLS performance hardening for auth init plans
- Password reset flow
- Email-confirmation-aware registration flow
- Privacy policy and imprint
- OpenStreetMap privacy disclosure
- Public legal links across the public experience

## Security model

The exposed SECURITY DEFINER RPC functions are intentionally callable by authenticated users because they implement MotorAtlas workflow commands. They use fixed search paths and enforce the current authenticated user plus workshop/customer permissions internally. Do not remove those permission checks when editing RPCs.

## Required before production cutover to motoratlas.de

1. Supabase Authentication > Email:
   - Confirm email must stay enabled.
   - Leaked password protection must be enabled.
2. Configure a production SMTP provider and verified sender domain.
3. Configure Site URL / Redirect URLs for:
   - https://motoratlas.de
   - the production callback/recovery route
   - optionally the GitHub preview while preview testing remains enabled.
4. Run one real end-to-end test with a mailbox:
   - register Autofahrer
   - receive confirmation mail
   - confirm address
   - login
   - password reset mail
   - set new password
   - login again
5. Run one real workshop onboarding test:
   - workshop registration
   - public workshop profile
   - customer relationship request
   - service request
   - appointment
   - arrival
   - diagnosis
   - quote/document
   - customer approval
   - repair complete
   - invoice/pickup

## Mail

Do not use Supabase's default test mail delivery for production. Use custom SMTP so MotorAtlas controls sender identity, deliverability and domain reputation.

## Legal

Privacy and imprint are implemented from the currently known MotorAtlas data flows and provider setup. Re-review them whenever analytics, advertising, payment processing, new sub-processors, new countries, or additional external services are introduced.
