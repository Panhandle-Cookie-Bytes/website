# Robotics Quizzes

A FIRST Robotics learning platform built with React, TypeScript, Vite, and Supabase. Phase 1 provides the public homepage, verified authentication, and user profiles. Phase 2 adds team spaces and role-based membership. Phase 3 adds quiz authoring, discovery, team assignments, practice, scoring, and answer review.

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

Without these environment variables, the public homepage and About Us page remain available; Supabase actions show a configuration error. The app does not create simulated accounts, teams, quizzes, or members.

## Set up Supabase

### 1. Apply the database migrations in order

In the Supabase project, open **SQL Editor** and run these files in order:

1. [`supabase/migrations/20261109000000_phase1_foundation.sql`](./supabase/migrations/20261109000000_phase1_foundation.sql) — creates or upgrades profiles, the Auth profile trigger, profile RLS, and private avatar storage.
2. [`supabase/migrations/20261112000000_phase2_teams.sql`](./supabase/migrations/20261112000000_phase2_teams.sql) — creates teams, memberships, invitations, team roles, secure invite functions, and team RLS. Enforces up to **15 students and 4 coaches** per team.
3. [`supabase/migrations/20261112190000_phase3_quizzes.sql`](./supabase/migrations/20261112190000_phase3_quizzes.sql) — creates quizzes, multiple-choice questions, team assignments, attempts, scoring, and protected quiz RPCs.

If earlier migrations have already been applied, run only the migrations you have not applied yet. Do not skip Phase 2; Phase 3 depends on its team tables and access helpers.

### 2. Configure Supabase Auth URLs and providers

In **Authentication → URL Configuration**:

- Set **Site URL** to `https://website-6r2.pages.dev`.
- Add allowed redirect URLs `http://localhost:5173/**` and `https://website-6r2.pages.dev/**`.
- If you add a custom domain later, also add `https://your-domain.example/**`.

In **Authentication → Providers**, enable email/password and email confirmations. To use Google or GitHub, enable each provider and configure its OAuth credentials. In the Google/GitHub developer console, use the Supabase callback URL shown in provider settings (`https://<project-ref>.supabase.co/auth/v1/callback`). Users return to `/auth/callback` after authentication.

### 3. Configure the app’s environment variables

Use the same two public client settings locally and at deployment:

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase publishable key (or legacy anon key)

The key is intended for browser use; Row Level Security protects the data. Do not add a service-role key.

## Set up and deploy on Cloudflare

This repository is configured for the **Cloudflare Workers Builds** workflow:

1. Connect the GitHub repository to a Cloudflare Worker using Workers Builds.
2. Set the build command to `npm run build` and deploy command to `npm run deploy`.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build environment variables for Preview and Production.
4. Deploy. The site URL is `https://website-6r2.pages.dev`.

[`wrangler.jsonc`](./wrangler.jsonc) publishes `dist/` as static assets with a React Router single-page-app fallback. Do not add a catch-all `/* /index.html 200` redirect; Wrangler may reject it as an infinite loop. Vite variables are compiled at build time.

For a separate **Cloudflare Pages** project connected directly to Git, use `npm run build` as the build command, `dist` as the output directory, and no deploy command. Choose either Pages or Workers Builds.

For a local production deploy:

```sh
npm run build
npm run deploy
```

## Pages and capabilities

### Public pages

- `/` — homepage and entry points for teams and quiz practice.
- `/about` — project mission and creator profiles.

To add creator information, edit `creators` in [`src/content/about.ts`](./src/content/about.ts). Add an object with `name`, `role`, and `bio`; `link` is optional. Creator information is intentionally kept in one file, and no names or bios are fabricated.

### Teams

- `/teams` — create a team, browse public team spaces, and see your teams.
- `/teams/join` — check and accept an invitation.
- `/teams/:teamId` — team dashboard, roster, and assigned quizzes.
- `/teams/:teamId/settings` — team details, invitations, assignments, ownership transfer, and deletion.

The creator is the team owner. Owners can appoint administrators; owners and administrators can manage team roles and settings. Coaches can invite students, remove students, and assign published quizzes. Students can take assigned quizzes and leave. Team invitations add actual registered users, not demo members.

### Quizzes

- `/quizzes` — discover public and assigned quizzes, view your own drafts, and see your quiz activity.
- `/quizzes/create` — write a multiple-choice quiz and save it as a draft or publish it.
- `/quizzes/:quizId` — view details and start or repeat a quiz.
- `/quizzes/:quizId/edit` — edit a quiz you created.
- `/quizzes/:quizId/take` — answer and submit a quiz.
- `/quizzes/:quizId/results/:attemptId` — see your score, selected answers, correct answers, and explanations.

Quizzes support up to 50 questions and 2–6 answer choices per question. Authors select the correct answer and may add an explanation. Drafts are private to their creator. Published quizzes may be public or private; coaches can assign public quizzes or published quizzes they created to their team, with an optional due date. A quiz with existing attempts cannot have its question set changed. Unassign it before changing it back to draft.

Correct answers are not readable through the normal quiz/question APIs or sent to the browser before submission. Supabase functions validate submissions and calculate scores; completed result data is only available to the attempt’s owner.

## Test Phase 3

1. Apply all migrations, configure Supabase Auth, set environment variables, and sign in with a real account.
2. Create a quiz with several choices and an explanation. Save it as a draft; verify it is not publicly discoverable.
3. Publish the quiz publicly and confirm it appears in the quiz library. Use a second account to practice and review its score and answers.
4. Create a private published quiz. Verify another account cannot open it before it is assigned.
5. As a team coach/owner/administrator, assign a published quiz to a team and set an optional due date. Confirm team members can open and complete it; remove the assignment and verify access is removed.
6. Attempt to edit a quiz after a submission; the database should reject changing its question set.
7. Test quiz creation, discovery, assignment, practice, and About Us on desktop and mobile layouts.

Run local code checks:

```sh
npm run typecheck
npm run build
npm run preview
```

The footer version is `0:02:1`; for each future website change, increment its last segment and roll over from 9 to 1 while incrementing the segment to its left.
