# NurseVault

NurseVault is a records management portal for the Pamantasan ng Lungsod ng Maynila (PLM) College of Nursing. It gives authorized records-office personnel a centralized workspace for managing student master files, required documents, uploads, folder navigation, and audit activity.

## Product Scope

NurseVault supports the following workflows:

- Email/password authentication with email-based OTP verification
- Verified-session access control for protected records workflows
- Student master-file tracking by batch, classification, folder, and document type
- Student document uploads and missing-document completion
- Browse, search, filter, and sort operations across student records
- Student, classification, and batch folder management
- Activity and audit logging for records operations
- Password reset through Supabase Auth

## Technology Stack

- React 19 and TypeScript
- TanStack Start and TanStack Router
- Vite
- Tailwind CSS 4
- Radix UI and shadcn/ui-style components
- Supabase Auth, PostgreSQL, Storage, and Edge Functions
- Vercel deployment configuration

## Repository Layout

```text
.
├── src/
│   ├── components/              Reusable application and UI components
│   ├── integrations/supabase/   Supabase clients, auth helpers, and types
│   ├── lib/                     Data access, OTP, and shared utilities
│   ├── routes/                  TanStack file-based routes
│   ├── router.tsx               Router configuration
│   └── styles.css               Global design tokens and styles
├── supabase/
│   ├── functions/               Deployed Edge Functions
│   └── migrations/               Database schema and security migrations
├── public/                      Static assets
├── package.json                 Scripts and dependencies
├── vite.config.ts               Vite and TanStack Start configuration
├── vercel.json                  Production headers and CSP
└── README.md
```

## Requirements

- Node.js 18 or newer
- npm
- A configured Supabase project
- Supabase CLI for applying migrations and deploying Edge Functions

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local `.env` file using the variables listed below.

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open the local URL shown by Vite.

## Environment Variables

Create `.env` in the project root. The file is ignored by Git and must never be committed.

### Frontend and server variables

```env
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
```

### Supabase Edge Function secrets

Configure these with the Supabase CLI or Supabase Dashboard. Do not expose them through `VITE_` variables or commit them to the repository.

```env
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
OTP_PEPPER="your-random-secret"
GMAIL_USER="your-sending-address"
GMAIL_APP_PASSWORD="your-gmail-app-password"
```

Cloudinary and Turnstile values are also required when those integrations are enabled. Use the variable names already referenced by the corresponding Edge Functions and deployment settings.

## Supabase Deployment

Link the local project to the intended Supabase project, then apply migrations:

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

Deploy the Edge Functions used by the application:

```bash
supabase functions deploy auth-login
supabase functions deploy otp-send
supabase functions deploy otp-verify
supabase functions deploy check-duplicate
supabase functions deploy cloudinary-upload
supabase functions deploy file-access
supabase functions deploy student-docs
```

Set production secrets before deploying or invoking the functions:

```bash
supabase secrets set \
  SUPABASE_ANON_KEY="your-anon-key" \
  SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
  OTP_PEPPER="your-random-secret" \
  GMAIL_USER="your-sending-address" \
  GMAIL_APP_PASSWORD="your-gmail-app-password"
```

The production Supabase Auth configuration must include the deployed application URL and the password-reset callback URL:

```text
https://your-production-domain/reset-password?step=reset
```

The `admin_users` table must contain the intended administrator accounts before protected workflows are tested.

## Available Commands

```bash
npm run dev       # Start the development server
npm run build     # Create the production client and server build
npm run lint      # Run ESLint and Prettier checks
npm run format    # Format the repository with Prettier
npm run preview   # Preview the production build locally
npx tsc --noEmit  # Run TypeScript validation
```

Before a release, run:

```bash
npx tsc --noEmit
npm run lint
npm run build
npm audit --omit=dev
```

## Security Model

- Frontend code uses only the Supabase URL and publishable key.
- Service-role credentials are restricted to server-side and Edge Function environments.
- Protected database tables require an administrator account and a verified OTP session.
- Rate-limit counters are managed by Edge Functions and are not intended for browser access.
- Storage access is mediated through verified authorization and signed file access flows.
- Production responses include security headers configured in `vercel.json`.

## Production Checklist

Before going live, verify:

- Production environment variables and Supabase secrets are configured.
- All migrations have been applied to the production database.
- The production domain is allowed by Edge Function CORS rules.
- Supabase Auth redirect URLs include the production reset-password URL.
- Intended administrators exist in `admin_users`.
- Login lockout and OTP verification work with valid and invalid credentials.
- Password reset email delivery and password update work end to end.
- Upload, file access, deletion, and audit logging workflows work for a verified administrator.
- The production build, lint, typecheck, and dependency audit pass.

## License

This project is intended for internal and educational use within the PLM College of Nursing records workflow unless otherwise specified by the project owner.
