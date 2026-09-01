# NurseVault UI Mockup

Build a static frontend-only demo of "NurseVault" — a digital records storage and retrieval system for Pamantasan ng Lungsod ng Maynila (PLM) College of Nursing. This is a UI/UX mockup only — NO backend, NO database, NO real file upload/storage. Use mock/dummy data and local React state only.

BRANDING & THEME

- Incorporate the PLM College of Nursing seal (logo asset will be provided) in the sidebar and login page

- Color palette:

  - Primary Green: #1B5E20 (deep forest green)

  - Secondary Green: #2E7D32 / #4CAF50 (accents, hover states)

  - Gold/Yellow: #C9A227 (used sparingly — active states, buttons, icon highlights)

  - Background: White (#FFFFFF) and light gray (#F7F8F7) for cards/surfaces

  - Text: dark charcoal (#1A1A1A)

- Feel: professional school archival office — clean, trustworthy, not flashy. Rounded corners (rounded-xl), soft shadows, subtle hover animations

- Font: clean modern sans-serif (Inter or similar)

TECH STACK

- React + TypeScript + Tailwind CSS only

- Use React Bits (reactbits.dev) for polished reusable UI components (buttons, modals, loaders, transitions)

- No Supabase, no auth logic, no real API calls — everything runs on mock data stored in local component state or a static JSON file

LOGIN PAGE (static/UI only)

- Centered card, white background, green/gold accents, PLM CON logo

- Email + password fields with a "Sign in" button

- Clicking "Sign in" just navigates to the Dashboard (no real authentication)

LAYOUT: SIDEBAR NAVIGATION

- Left sidebar (white or light green background):

  - PLM College of Nursing logo + "NurseVault" wordmark at top

  - Nav links: Dashboard, Upload Record, Browse Folders

  - Logout button (just navigates back to login page)

- Top bar: page title + search bar (can filter the mock data client-side)

PAGE 1: DASHBOARD

- Overview cards showing mock stats: total records (e.g. "128 Records"), total folders/batches (e.g. "6 Batches"), recent uploads list (mock array of 5 fake records)

- "Upload New Record" button (gold accent) linking to Upload page

PAGE 2: UPLOAD RECORD (form UI only, no real upload)

- Form fields exactly as follows:

  - Student Name (text input)

  - Student Number (text input, e.g. 2024-0001)

  - Batch (text input, e.g. "Batch 2024")

  - Student Category (dropdown: HD Student, RLE Student)

  - Status (dropdown: Regular, Irregular)

  - Scanned Record (file input — drag-and-drop zone with file icon, accepts PDF/Word/Excel visually, but just stores the file name in local state, no actual upload)

- On clicking "Upload Record": show a success toast/confirmation, then add the new record to the mock dataset in local state so it appears immediately in Browse Folders and the Records Table (simulate real behavior with fake data persistence during the session)

PAGE 3: BROWSE FOLDERS

- Use a hardcoded/mock dataset representing the auto-generated hierarchy: Batch → Student Category → Status → individual records

- Include at least 3 mock batches (e.g. Batch 2023, Batch 2024, Batch 2025), each with HD Student / RLE Student categories, each with Regular / Irregular status folders, each containing a few mock student records

- Breadcrumb navigation at top, clickable segments to go up/down the hierarchy

- Grid or list view toggle

- Clicking into the deepest folder shows individual student records (Student Name, Student Number, and a file icon representing the "scanned record")

- Clicking a file opens a preview modal (can just show a placeholder PDF icon/mock preview, no real file rendering needed)

- Include a "Records Table" tab/view: a searchable, filterable, sortable table of ALL mock records with columns: Student Name, Student Number, Batch, Category, Status, Upload Date — with a working search bar and filter dropdowns (filtering the mock data client-side)

- Rename/delete buttons on folders/records can be present in the UI but just show a confirmation dialog and update local state (no real persistence needed beyond the session)

MOCK DATA

- Create a realistic dummy dataset (JSON or TS array) with at least 15–20 fake student records spread across the batches/categories/statuses described above, so the UI never looks empty

IMPORTANT NOTES

- Focus entirely on getting the UI/UX polished, responsive, and true to the green/gold/white PLM College of Nursing branding

- No real authentication, no real file storage — this is purely a clickable, interactive prototype to validate the design and flow before backend integration

## Development

You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
