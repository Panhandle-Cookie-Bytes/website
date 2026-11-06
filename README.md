# FTC Quizzes

FTC Quizzes is a responsive, multi-page starter experience for FIRST Tech Challenge teams. Learners can practice personal and coach-assigned quizzes; coaches can manage a team roster and create team assignments.

## Pages

- `index.html` — public landing page
- `signin.html` — Supabase sign-in and account creation (browser demo until configured)
- `dashboard.html` — personal and team quiz dashboard
- `team.html` — coach roster administration and team assignments
- `create-quiz.html` — quiz authoring
- `take-quiz.html` — quiz taking and score results

## Connect Supabase

1. Create a Supabase project.
2. In the Supabase SQL Editor, run `supabase-schema.sql`. It creates the profile, team, invitation, quiz, answer-key, and attempt tables; row-level security policies; and RPC functions.
3. Copy the project URL and **publishable key** (or legacy anon key) into `supabase-config.js`. Never put a `service_role` or secret key in this website.
4. In Supabase **Authentication → URL Configuration**, set the site URL to your deployed site and add your local development URL to the redirect allow list.
5. To enable Google or GitHub sign-in, configure each provider in Supabase **Authentication → Providers** and add the Supabase callback URL to the provider's console.
6. Serve the folder over HTTP(S), such as with GitHub Pages or a local static server. Email confirmation behavior is controlled in Supabase Auth settings.

Email/password auth, Google/GitHub OAuth, teams, invitations, quizzes, private answer keys, and quiz attempts use Supabase once the project config is filled in. Coaches create an invitation link and share it with the teammate; the site does not send invitation email. Quiz scores are calculated in a database function so answer keys are not sent to learners. Database policies enforce access and cap each team at 15 members and 4 coaches, including pending invitations.

If `supabase-config.js` still contains its placeholders, the site falls back to a browser-only demo. Demo state is not shared or secure and should not be used for real accounts.

## Brand colors

The supplied `013132B` and `FFFFF` values are not valid CSS hex colors (hex colors need 3, 4, 6, or 8 digits). The site uses `#013132` and `#FFFFFF` for those values, alongside `#1C2541`, `#5BC0BE`, and `#3A506B`.

## Publish with GitHub Pages

In your GitHub repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, then save. GitHub Pages hosts the front end; Supabase provides authentication and the shared database.
