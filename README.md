# FTC Quizzes

FTC Quizzes is a responsive, multi-page starter experience for FIRST Tech Challenge teams. Learners can practice personal and coach-assigned quizzes; coaches can manage a team roster and create team assignments.

## Pages

- `index.html` — public landing page
- `signin.html` — Supabase sign-in and account creation (browser demo until configured)
- `dashboard.html` — personal and team quiz dashboard
- `team.html` — coach roster administration and team assignments
- `create-quiz.html` — quiz authoring
- `take-quiz.html` — quiz taking and score results
- `supabase-schema.sql` — initial database setup for a new Supabase project
- `supabase-migration-display-name.sql` — upgrade for projects that ran the earlier schema

## Connect Supabase

1. Create a Supabase project.
2. For a new project, run `supabase-schema.sql` in the Supabase SQL Editor. If you already ran the earlier schema, run `supabase-migration-display-name.sql` instead to add display names and coach removal.
3. Copy the project URL and **publishable key** (or legacy anon key) into `supabase-config.js`. Never put a `service_role` or secret key in this website.
4. In Supabase **Authentication → Providers → Email**, enable email confirmations. Users must confirm their email before signing in; the sign-in page can resend a confirmation message. In **Authentication → URL Configuration**, set the site URL to your deployed site and add your local development URL to the redirect allow list.
5. To enable Google or GitHub sign-in, configure each provider in Supabase **Authentication → Providers** and add the Supabase callback URL to the provider's console.
6. Serve the folder over HTTP(S), such as with GitHub Pages or a local static server. Email confirmation behavior is controlled in Supabase Auth settings.

Email/password auth with verified email, Google/GitHub OAuth, editable display names, teams, invitations, quizzes, private answer keys, and quiz attempts use Supabase once the project config is filled in. Coaches can remove team members and create an invitation link to share; the site does not send invitation email. New rosters are empty—no sample teammates are pre-populated. Quiz scores are calculated in a database function so answer keys are not sent to learners. Database policies enforce access and cap each team at 15 members and 4 coaches, including pending invitations.

If `supabase-config.js` still contains its placeholders, the site falls back to a browser-only demo. Demo state is not shared or secure and should not be used for real accounts.

## Brand colors

The supplied `013132B` and `FFFFF` values are not valid CSS hex colors (hex colors need 3, 4, 6, or 8 digits). The site uses `#013132` and `#FFFFFF` for those values, alongside `#1C2541`, `#5BC0BE`, and `#3A506B`.

## Website version

The footer shows the website version in `major:minor:patch` format. Increment the patch for each change; after patch 9, reset it to 1 and increment the minor. After minor 9, reset it to 1 and increment the major. No version segment should be 10.

## Publish with GitHub Pages

In your GitHub repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, then save. GitHub Pages hosts the front end; Supabase provides authentication and the shared database.
