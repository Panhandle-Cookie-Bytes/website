# FIRST Quiz Platform

A FIRST Robotics learning and quiz platform built in phases. **Phase 1** provides the responsive public homepage, shared navigation, Supabase authentication, and private/public user profiles. Team management and quiz experiences are not part of this phase.

## Stack

- React, TypeScript, Vite, and React Router
- Supabase Auth, PostgreSQL, Row Level Security, and private Storage for profile images
- Existing FIRST Quiz colors: `#013132`, `#1C2541`, `#5BC0BE`, `#3A506B`, and `#FFFFFF`
- DM Sans and Space Grotesk typography

## Run locally

1. Install Node.js LTS (Node 20 or newer) and npm.
2. Install project dependencies:
   ```sh
   npm install
   ```
3. Copy `.env.example` to `.env.local` and set your Supabase project URL and publishable (or legacy anon) key:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
   ```
   Use the base project URL, without `/rest/v1/`. Never use a `service_role` or secret key in this frontend.
4. Run the app:
   ```sh
   npm run dev
   ```

Without these environment variables, the homepage remains available, while authentication controls are disabled with a setup message. The app does not simulate or save fake accounts.

## Connect Supabase

1. Create a Supabase project, or use your existing project.
2. Open **SQL Editor**, paste and run [`supabase/migrations/20261109000000_phase1_foundation.sql`](./supabase/migrations/20261109000000_phase1_foundation.sql).
   - It creates or upgrades `public.profiles`, adds the auth-user profile trigger, and configures row-level security.
   - It creates a private `profile-avatars` bucket and owner/public-profile storage policies.
   - Existing profile email and role columns, if present from the previous site, are made nullable and are no longer selectable by frontend roles. Other legacy team/quiz tables are left untouched and are not used in Phase 1.
3. In **Authentication → URL Configuration**, set the Site URL to your production origin and add local (`http://localhost:5173/**`) and production redirect URLs.
4. In **Authentication → Providers**, enable email/password and email confirmations. Configure Google and/or GitHub providers if you want those sign-in options, and register each provider's Supabase callback URL.
5. Add the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables to your local `.env.local` and deployment environment.

The migration backfills any existing Auth users who do not yet have a profile and creates a profile when a new Auth user is created. Email addresses remain in Supabase Auth and are never selected from the profile table. Users can edit their own profile; public profile fields and avatars are readable only when the owner has opted into a public profile. Profile image uploads are limited to 5 MB and JPG, PNG, WebP, or AVIF.

## Routes in Phase 1

- `/` — public homepage
- `/sign-in` and `/sign-up` — email/password, Google, and GitHub authentication
- `/forgot-password` and `/auth/reset-password` — password recovery
- `/auth/callback` — email/OAuth confirmation return
- `/profile` — signed-in profile, privacy, avatar, and password settings
- `/users/:username` — public profile, only when its owner has enabled public visibility

Unauthenticated users are redirected from `/profile` to sign-in. Team, quiz, leaderboard, and game routes are intentionally not exposed until their planned phases are implemented.

## Check and build

```sh
npm run typecheck
npm run build
npm run preview
```

The production output is in `dist/`.

## Deploy to Cloudflare Pages

Connect the repository to Cloudflare Pages and configure:

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

The Pages `_redirects` file routes React Router paths back to the app entry point. Add the final Cloudflare Pages URL to Supabase's allowed redirect URLs. Do not deploy the old root-level static pages.

## Phase 1 manual test

1. Apply the migration and set the local environment variables.
2. Start the app and create an account with an email address, display name, and optional username.
3. Confirm the email from the message sent by Supabase, then sign in.
4. Open **Profile & settings**. Save profile fields, choose private/public visibility, upload and remove an avatar, and change the password.
5. Set the profile to public and assign a username; open its public-profile link in a private browser window. Then set it to private and confirm the same URL no longer displays the profile.
6. Try an unconfigured auth-provider or incorrect password and verify the app reports the Supabase error without creating a local/demo account.
7. Test a narrow mobile viewport and the navigation menu.

## Scope and next phases

Phase 1 intentionally stops at the foundation, design system, navigation, homepage, authentication, and profiles. Teams are Phase 2; quiz authoring, discovery, and practice are Phase 3; live games are Phase 4; community features and further polish follow. No placeholder quiz/team actions or fabricated activity are shown.

The footer version is `0:01:5`. For each website change, increment the last segment; after 9, reset it to 1 and increment the segment to its left. After the middle segment reaches 9, reset it to 1 and increment the first. No segment should be 10.
