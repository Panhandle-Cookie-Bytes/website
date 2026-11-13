# Robotics Quizzes

A FIRST Robotics learning platform built with React, TypeScript, Vite, and Supabase. Phase 1 provides the public homepage, verified authentication, and user profiles. Phase 2 adds secure team spaces, invitation-based membership, team roles, roster management, and settings. Quiz authoring and quiz-taking are not part of this phase.

## Stack and theme

- React, TypeScript, Vite, and React Router
- Supabase Auth, PostgreSQL, Row Level Security, and private Storage for profile images
- Existing palette: `#013132`, `#1C2541`, `#5BC0BE`, `#3A506B`, and `#FFFFFF`
- DM Sans and Space Grotesk typography

## Run locally

1. Install Node.js LTS (Node 20 or newer) and npm.
2. Install dependencies:
   ```sh
   npm install
   ```
3. Copy `.env.example` to `.env.local` and add your Supabase project URL and publishable (or legacy anon) key:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
   ```
   Use the base project URL, without `/rest/v1/`. Never put a `service_role` or secret key in this frontend.
4. Start the development server:
   ```sh
   npm run dev
   ```

Without these environment variables, the public homepage remains available, and Supabase actions show a configuration error. The app does not create simulated accounts, teams, or members.

## Set up Supabase

### 1. Apply the database migrations in order

In the Supabase project, open **SQL Editor** and run these files in order:

1. [`supabase/migrations/20261109000000_phase1_foundation.sql`](./supabase/migrations/20261109000000_phase1_foundation.sql)
   - Creates or upgrades `public.profiles`, the Auth-user profile trigger, and profile Row Level Security policies.
   - Creates the private `profile-avatars` bucket and its policies.
   - Backfills profiles for existing Auth users. Email addresses remain in Supabase Auth and are not selectable from `public.profiles`.
2. [`supabase/migrations/20261112000000_phase2_teams.sql`](./supabase/migrations/20261112000000_phase2_teams.sql)
   - Creates team, membership, and invitation tables plus indexes and Row Level Security.
   - Adds protected database functions for team creation, invitation preview/acceptance/replacement/revocation, role changes, member removal, leaving, ownership transfer, and deletion.
   - Stores only a SHA-256 hash of each invitation code. The original code is displayed once when generated.
   - Enforces up to **15 students and 4 coaches** per team during invitation acceptance and role changes. Owners and administrators are separate roles.

If Phase 1 is already installed on your project, apply only the Phase 2 migration. Re-running the first file is safe for its intended schema objects, but do not skip Phase 2.

### 2. Configure Supabase Auth URLs and providers

In **Authentication → URL Configuration**:

- Set **Site URL** to `https://website-6r2.pages.dev`.
- Add these allowed redirect URLs:
  - `http://localhost:5173/**`
  - `https://website-6r2.pages.dev/**`
- If you add a custom domain later, add `https://your-domain.example/**`.

In **Authentication → Providers**, enable email/password and email confirmations. To use Google or GitHub, enable each provider and configure its OAuth credentials. In the Google/GitHub developer console, use the Supabase project’s callback URL shown on that provider’s Supabase settings page (it has the form `https://<project-ref>.supabase.co/auth/v1/callback`). The app sends users back to `/auth/callback` after provider sign-in or email verification.

### 3. Configure the app’s environment variables

Use the same two public client settings locally and at deployment:

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase publishable key (or legacy anon key)

The key is intended for browser use; Row Level Security is what protects the database. Do not add a service-role key.

## Set up and deploy on Cloudflare

This repository is configured for the **Cloudflare Workers Builds** workflow:

1. Connect the GitHub repository to a Cloudflare Worker using Workers Builds.
2. Set the build command to `npm run build`.
3. Set the deploy command to `npm run deploy`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build environment variables for both Preview and Production.
5. Deploy. The published URL is currently `https://website-6r2.pages.dev`.

[`wrangler.jsonc`](./wrangler.jsonc) publishes the `dist/` folder as static assets with the single-page-app fallback used by React Router. Do not add a catch-all `/* /index.html 200` redirect; Wrangler rejects it as an infinite loop. Vite variables are compiled into the bundle at build time, so add them before building.

For a separate **Cloudflare Pages** project connected directly to Git, use `npm run build` as the build command, `dist` as the output directory, and no deploy command. Choose either Pages or Workers Builds for a deployment. The earlier deployment logs use Workers Builds.

For a local production deployment, run:

```sh
npm run build
npm run deploy
```

## Phase 2 routes and permissions

- `/teams` — create a team and see teams you belong to
- `/teams/join` — validate and accept a team invitation code
- `/teams/:teamId` — team overview, roster, roles, and member actions
- `/teams/:teamId/settings` — team details, invitation codes, ownership transfer, and deletion

Every team member has a role within that team; an account may have different roles on different teams. The creator becomes the owner. Owners can edit settings, appoint administrators, manage all members, transfer ownership, or delete the team. Administrators can edit settings, manage roles other than appointing administrators, and manage members. Coaches can invite students and remove students. Students can view the roster and leave. Only invitations can add students or coaches; no demo or fake teammates are created.

New invitation codes replace the previous active code for that role; a team can keep one active student code and one active coach code. An invitation can optionally expire, can be disabled by an authorized team manager, and cannot grant administrator or owner privileges. An owner must transfer ownership or delete the team before leaving.

## Test Phase 2

1. Apply both migrations, configure Auth, and set local environment variables.
2. Start the app and create/verify two real accounts.
3. With the first account, open **My teams**, create a team, and generate a student invitation.
4. Copy the invitation link, sign out, and open the link while signed in as the second account. Verify the team and assigned role before joining.
5. Return as the owner and confirm the roster shows the real second account. Test role changes, removal, creating a coach invitation, and disabling/replacing invitations.
6. Test the 15-student and 4-coach limits using real accounts if needed. The database enforces the limits even if a user bypasses the interface.
7. Test team settings, visibility, leaving as a non-owner, ownership transfer, and team deletion using disposable test teams.
8. Test sign-in and invite links on desktop and a narrow mobile viewport.

The migration and OAuth/account flows need to be tested against your Supabase project after you apply the migrations and configure providers. TypeScript and production-build checks can be run locally:

```sh
npm run typecheck
npm run build
npm run preview
```

Phase 3 quiz authoring and quiz-taking have not been started. The footer version is `0:01:9`; increment its last segment for the next website change, rolling from 9 back to 1 and incrementing the segment to its left.
