# NurseVault

NurseVault is a digital records portal for the Pamantasan ng Lungsod ng Maynila (PLM) College of Nursing. It is built to help the records office manage student document archives, track required files, and make document retrieval faster and more organized.

This project is a full frontend application with Supabase-backed authentication and document workflows. It includes secure sign-in, OTP verification sent to the requesting user's email, student master-file tracking, upload handling, browse-by-folder navigation, student and folder deletion workflows, activity monitoring, and a responsive records dashboard.

## Overview

NurseVault centralizes the College of Nursing records workflow around a single archive interface:

- Secure staff login flow with email/password and OTP verification
- Student master-file tracking across required document folders
- Record upload workflow for academic and personal record documents
- Browse experience by batch, classification, and folder hierarchy
- Searchable student and record tables
- Audit-style activity log and session timeout safeguards
- PLM College of Nursing branding and green/gold visual system

## Tech Stack

- React 19
- TypeScript
- Vite
- TanStack Router
- Tailwind CSS
- shadcn/ui style components
- Supabase for auth and data lifecycle
- Edge functions for login, verification, and file access logic

## Current Features

### Authentication

- Login screen with institutional branding
- Email/password sign-in through Supabase edge auth flow
- OTP verification step before access to protected routes
- Idle session timeout warning and automatic sign-out after inactivity

### Dashboard

- Overview cards for total records, batches, and student coverage
- Recent uploads panel showing the newest archived student documents
- Quick navigation to upload or browse views

### Upload workflow

- Student record filing with document selection and validation
- Batch, classification, and folder-aware uploads
- Document type checks and required-file enforcement
- Student lookup and folder creation flow
- Direct upload of missing document requirements from the student panel

### Master File

- Student requirement tracker by folder and document type
- Search / filter by batch, classification, and completion status
- Sort by student name or missing requirement counts, with sort direction tooltip
- Missing files shown as "N/A" instead of "Not uploaded yet"
- Student panel view with per-folder file list, missing-file highlighting, and inline upload action

### Master File edits

- Classification field is locked in the edit dialog because it determines the student folder structure
- Batch folder delete and individual student delete are available in the browse view with confirmation dialogs and audit logging

### Browse Folders

- Folder hierarchy for batch → classification → student → document set
- Records table view for quick filtering and inspection
- Search across student name, number, and batch
- Folder-level select mode for batch deletion of batch, classification, or student folders
- Folder sort toggle (A–Z / Z–A) in the browse view

### Activity / audit flow

- Event logging for student and document operations
- Audit logging for student deletions, batch folder deletions, and document uploads
- Activity views for file and access actions

## Project Structure

```text
.
├── src/
│   ├── components/
│   ├── data/
│   ├── hooks/
│   ├── integrations/
│   ├── lib/
│   ├── routes/
│   ├── router.tsx
│   └── styles.css
├── supabase/
│   ├── functions/
│   └── migrations/
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── bun.lock
├── components.json
├── vercel.json
└── README.md
```

## Local Development

Requirements:

- Node.js 18+
- npm

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Build the app:

```bash
npm run build
```

Run linting:

```bash
npm run lint
```

## Environment Variables

Create a `.env` file in the project root with your Supabase configuration:

```env
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

These values are used by the frontend client and by the Supabase server-side/edge-function code.

## Supabase Notes

This repo includes Supabase edge functions under `supabase/functions/` for actions such as:

- login/authentication
- OTP verification
- student document processing
- file access checks

If you are using a Supabase project, make sure the corresponding environment variables are configured in your deployed environment and local `.env` file.

## Notes

This application is designed as a records office management UI and is intended to evolve with real document storage and backend services. It is not a generic demo-only app anymore; it is structured around the actual NurseVault workflow and institutional routing.

## License

This project is for internal/educational use within the repository scope unless otherwise specified by the project owner.
