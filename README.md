# Robotics Quizzes

A FIRST Robotics learning platform built with React, TypeScript, Vite, and Supabase. Phase 1 provides authentication and profiles. Phase 2 adds team spaces and role-based membership. Phase 3 adds quiz authoring, discovery, team assignments, practice, scoring, and answer review. Phase 4 adds a personalized homepage dashboard. Phase 5 adds hosted live quiz rooms with synchronized questions, timed scoring, and results. Phase 6 adds team logos, configurable student quiz creation, team activity, statistics, and leaderboards. Phase 7 adds public quiz discovery, ratings, favorites, and safe question previews. Phase 8 adds a complete quiz workshop, four question types, media, configurable play settings, and immutable attempt snapshots.

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

Without these environment variables, the public homepage shell and About Us page remain available; Supabase-backed quiz discovery and account actions show a configuration error. The app does not create simulated accounts, teams, quizzes, or members.

## Set up Supabase

### 1. Apply the database migrations in order

In the Supabase project, open **SQL Editor** and run these files in order:

1. [`supabase/migrations/20261109000000_phase1_foundation.sql`](./supabase/migrations/20261109000000_phase1_foundation.sql) — creates or upgrades profiles, the Auth profile trigger, profile RLS, and private avatar storage.
2. [`supabase/migrations/20261112000000_phase2_teams.sql`](./supabase/migrations/20261112000000_phase2_teams.sql) — creates teams, memberships, invitations, team roles, secure invite functions, and team RLS. Enforces up to **15 students and 4 coaches** per team.
3. [`supabase/migrations/20261112190000_phase3_quizzes.sql`](./supabase/migrations/20261112190000_phase3_quizzes.sql) — creates quizzes, multiple-choice questions, team assignments, attempts, scoring, and protected quiz RPCs.
4. [`supabase/migrations/20261116000000_phase4_homepage.sql`](./supabase/migrations/20261116000000_phase4_homepage.sql) — enables anonymous read-only access to published public quiz metadata and adds protected dashboard statistics/activity functions.
5. [`supabase/migrations/20261116010000_phase5_live_games.sql`](./supabase/migrations/20261116010000_phase5_live_games.sql) — creates live game rooms, secure join codes, server-side question snapshots and scoring, protected game RPCs, and adds safe room state to Supabase Realtime.
6. [`supabase/migrations/20261117000000_phase6_team_management.sql`](./supabase/migrations/20261117000000_phase6_team_management.sql) — adds team quiz-creation settings, team dashboard statistics/activity/leaderboard RPCs, private team-logo storage, and migrates live-game join codes to 8 characters.
7. [`supabase/migrations/20261119000000_phase7_quiz_explorer.sql`](./supabase/migrations/20261119000000_phase7_quiz_explorer.sql) — adds quiz difficulty and preview settings, public explorer/detail/preview RPCs, category normalization, favorites, and ratings.
8. [`supabase/migrations/20261120000000_phase8_quiz_creation.sql`](./supabase/migrations/20261120000000_phase8_quiz_creation.sql) — adds private quiz-media storage, team-only quiz access, tags and quiz settings, four question types, per-attempt snapshots, and 8-character team invitations.

If earlier migrations have already been applied, run only the migrations you have not applied yet. Do not skip Phase 2; Phase 3 and Phase 4 depend on its team tables and access helpers.

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
- `/explore` — public quiz explorer with search, FIRST program/category/difficulty filters, and sorting.

The signed-out homepage includes platform information, public quizzes ranked by completed attempts, and account creation links. The signed-in homepage shows your teams, recent quiz activity, recommendations based on your preferred FIRST program and team assignments, and database-derived completed quiz, score, correct-answer, and streak statistics. Users without activity see empty states instead of fabricated progress. The Phase 4 migration only exposes published public quiz metadata to anonymous visitors; private quizzes, answer keys, and personal dashboard data remain restricted.

### Live games

- `/games` — host a game from a published quiz you can access, or join a room with its 8-character code.
- `/games/:gameId` — share the lobby, play synchronized questions, and view the final leaderboard.

Players must sign in and have access to the selected quiz. Public quizzes are joinable by any signed-in user; quizzes assigned to a team remain limited to members with that assignment. The host starts the game after at least one player joins. Questions run for 20 seconds, and any player can trigger the next question once the timer expires if the host disconnects. Hosts can also advance early. Scores and correct answers are validated by protected database functions; answer keys are never sent to players. The migration adds only safe game state to the `supabase_realtime` publication, and each user can subscribe only to rooms they host or joined.

The migration adds `live_games` to Supabase Realtime when the standard `supabase_realtime` publication exists. If Realtime is unavailable in a project, room actions still work through the database; use the in-room Refresh message to check state while correcting the project’s Realtime configuration.

Live-game and team invitation codes use the unambiguous alphabet (`A-H`, `J-N`, `P-Z`, and `2-9`) and are 8 characters long. Applying Phase 6 replaces codes on existing rooms; hosts can see the new code from the game lobby. Phase 8 deactivates older 32-character team invitation codes because their original values are only stored as hashes; coaches should generate fresh invitations after applying it.

To add creator information, edit `creators` in [`src/content/about.ts`](./src/content/about.ts). Add an object with `name`, `role`, and `bio`; `link` is optional. Creator information is intentionally kept in one file, and no names or bios are fabricated.

### Teams

- `/teams` — create a team, browse public team spaces, and see your teams.
- `/teams/join` — check and accept an invitation.
- `/teams/:teamId` — team dashboard, roster, and assigned quizzes.
- `/teams/:teamId/settings` — team details, invitations, assignments, ownership transfer, and deletion.

The creator is the team owner. Owners can appoint administrators; owners and administrators can manage team roles, settings, and team logos. Coaches can invite students, remove students, and assign published quizzes. Owners and administrators can allow students to create quizzes in team settings. Team dashboards show real roster counts, assigned-quiz activity, completion totals, active learners, and a leaderboard; students see their own recent activity, while coaches and team managers can review the team’s activity. Students can take assigned quizzes and leave. Team invitations add actual registered users, not demo members. A user who is a student in multiple teams can create quizzes if at least one of those teams allows it or they have a privileged role on another team.

### Quizzes

- `/explore` — browse published public quizzes, filter by program, category, and difficulty, and sort by popularity, rating, recency, plays, or length.
- `/quizzes` — discover public and assigned quizzes, view your own drafts, and see your quiz activity.
- `/quizzes/create` — build a quiz with title, description, FIRST program, category, difficulty, cover art, tags, visibility, team association, and authoring settings.
- `/quizzes/:quizId` — view details and start or repeat a quiz.
- `/quizzes/:quizId/edit` — edit a quiz you created.
- `/quizzes/:quizId/take` — answer and submit a quiz.
- `/quizzes/:quizId/results/:attemptId` — see your score, selected answers, correct answers, and explanations.

Quizzes support up to 50 questions and 2–6 answer choices per question: multiple choice, true/false, multiple select, and image-based multiple choice. Authors can add images, explanations, point values, optional per-question countdowns, reorder or duplicate questions, preview them, and save drafts or publish. Timed-out questions lock and may be left unanswered; the practice countdown runs in the browser and is not a proctoring control. Private quizzes are creator-only; team quizzes are visible to their associated team; public quizzes can be discovered. Team coaches and administrators can edit a team quiz when the author enables it. Quiz settings include default question time, randomized question/answer order, explanation and answer-key visibility, repeat attempts, and public duplication. Quiz media is stored in a private bucket with quiz/team access checks. Each attempt captures its own immutable question, choice, image, and answer-key snapshot, so later edits do not change completed results. The public explorer shows only published public quizzes; answer keys are never returned by public detail or preview functions.

Correct answers are not readable through the normal quiz/question APIs or sent to the browser before submission. Supabase functions validate submissions and calculate scores; completed result data is only available to the attempt’s owner.

## Test Phase 3

1. Apply all migrations, configure Supabase Auth, set environment variables, and sign in with a real account.
2. Create a quiz with several choices and an explanation. Save it as a draft; verify it is not publicly discoverable.
3. Publish the quiz publicly and confirm it appears in the quiz library. Use a second account to practice and review its score and answers.
4. Create a private published quiz. Verify another account cannot open it before it is assigned.
5. As a team coach/owner/administrator, assign a published quiz to a team and set an optional due date. Confirm team members can open and complete it; remove the assignment and verify access is removed.
6. Attempt to edit a quiz after a submission; the database should reject changing its question set.
7. Test quiz creation, discovery, assignment, practice, and About Us on desktop and mobile layouts.

## Test Phase 4

1. Apply the Phase 4 migration after Phases 1–3 and sign out. Verify the homepage shows only published public quizzes, ranked by completed attempts. Check that private and draft quizzes and all question answer keys remain unavailable to anonymous users.
2. Create and complete quizzes using a signed-in account. Confirm the homepage shows that account’s teams, recent created/completed activity, scores, recommendations, and only its own progress statistics.
3. Use an account with no teams or completed quizzes; verify the dashboard shows real zero/empty states, and that recommended quizzes reflect public quizzes and any team assignments.
4. Set a preferred FIRST program in the profile and verify recommendations prioritize quizzes for that program.
5. Test the signed-out homepage, dashboard, navigation links, and quiz cards on desktop and a narrow mobile viewport.

## Test Phase 5

1. Apply the Phase 5 migration after Phases 1–4 and confirm it completes successfully in the Supabase SQL Editor.
2. Sign in with two accounts. As the host, create and publish a quiz with several questions, then open **Live games** and create a room.
3. Join the room from the second account with the displayed code. Confirm the host sees the player join, start the game, and answer from both accounts.
4. Confirm the countdown advances the room, the leaderboard scores correct answers, the final question completes the game, and results persist after refreshing both room pages.
5. Try joining a private/unassigned quiz as an account without access; it should be rejected. Confirm draft quizzes cannot be hosted.
6. Test the lobby, question controls, timer, and final leaderboard on desktop and a narrow mobile viewport.

## Test Phase 6

1. Apply the Phase 6 migration after Phases 1–5. Verify the migration updates existing live-room codes and completes successfully.
2. As a team owner or administrator, upload and remove a JPG, PNG, or WebP team logo. Confirm it appears on the team dashboard and team list, and that students cannot change it.
3. In team settings, toggle student quiz creation. As a student, verify the create actions and direct create page reflect the setting; verify the database rejects a create request when disabled.
4. Complete assigned quizzes as multiple real team members. Confirm team statistics, recent activity, and leaderboard update with database results; students should only see their own activity.
5. Test team member, coach, and administrator limits and role permissions. Confirm students cannot manage team settings or the roster.
6. Create a live game and verify its code is exactly 8 characters from the unambiguous alphabet; join using the code. Confirm older active game rooms show their new code after migration.

## Test Phase 7

1. Apply the Phase 7 migration after Phases 1–6. Confirm it normalizes existing quiz categories and completes successfully.
2. Sign out and open `/explore`. Verify only published public quizzes are listed and program, category, difficulty, search, and all five sort options work.
3. Open a public quiz detail page while signed out. Confirm creator attribution, public team, difficulty, question count, estimated time, plays, and rating information are shown, while practice, live games, favorites, and ratings require sign-in.
4. As a quiz author, enable question previews and publish the quiz. Confirm the detail page shows up to five prompts and choices but never reveals correct answers or explanations. Disable previews and verify the questions are no longer returned.
5. As two signed-in users, save and unsave a quiz and submit ratings. Confirm favorite totals and average ratings update, and the explorer’s Highest rated and Most popular sorting reflects them.
6. Confirm drafts remain available to their creator in the signed-in quiz library and can still be opened and edited from their details page.
7. Test the explorer and details page on desktop and a narrow mobile viewport.

## Test Phase 8

1. Apply the Phase 8 migration after Phases 1–7. Generate new team invitation codes and replace any old invitation links; old 32-character codes are deactivated.
2. Create and edit draft quizzes with each question type. Verify multiple-select scoring requires the exact correct set, true/false choices stay fixed, and image-based questions require an image.
3. Upload and remove cover and question images. Confirm previews and practice show images only to users allowed to access the quiz.
4. Configure tags, team association, all visibility levels, question time and points, randomization, explanation/answer visibility, retry permissions, duplication, and team editing. Confirm quiz access and editing permissions match these choices.
5. Complete an attempt, then edit the quiz content and settings. Confirm the old result still shows the questions and answers from that attempt.
6. Drag and drop questions, use the up/down controls, duplicate and delete questions, preview the learner view, save a draft, and reload after unsaved changes to verify the warning.
7. Test editor, image upload, private/team/public access, invitation entry, practice, and historical results on desktop and a narrow mobile viewport.

Run local code checks:

```sh
npm run typecheck
npm run build
npm run preview
```

The footer version is `0:02:8`; for each future website change, increment its last segment and roll over from 9 to 1 while incrementing the segment to its left.
