const STORAGE = {
    session: "ftc-quizzes-session",
    profiles: "ftc-quizzes-profiles",
    team: "ftc-quizzes-team",
    quizzes: "ftc-quizzes-quizzes",
    results: "ftc-quizzes-results"
};
const WEBSITE_VERSION = "0:01:4";

const sampleQuiz = {
    id: "sample-game-strategy",
    title: "Game Strategy Essentials",
    category: "Strategy",
    description: "Test your knowledge of planning a strong autonomous and tele-op routine.",
    audience: "team",
    questions: [
        {
            prompt: "What is a useful first step when planning an autonomous routine?",
            options: ["Add as many actions as possible", "Identify reliable scoring actions and constraints", "Skip testing until competition day", "Only plan for the endgame"],
            answer: 1
        },
        {
            prompt: "Why should a team keep a match strategy flexible?",
            options: ["The robot should change its hardware each match", "The referee chooses the team's strategy", "Match conditions and alliance roles can vary", "Flexible plans do not need testing"],
            answer: 2
        },
        {
            prompt: "Which practice best helps improve cycle time?",
            options: ["Measure repeated cycles and identify delays", "Change several mechanisms at once", "Avoid recording match data", "Practice only once"],
            answer: 0
        }
    ]
};

function readStorage(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch (error) {
        console.error(`Could not read ${key} from local storage.`, error);
        return fallback;
    }
}

function saveStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

const supabaseConfig = window.FTC_SUPABASE_CONFIG || {};
const supabaseExpected = Boolean(
    supabaseConfig.url?.startsWith("https://") &&
    !supabaseConfig.url.includes("YOUR_PROJECT_ID") &&
    supabaseConfig.anonKey &&
    !supabaseConfig.anonKey.includes("YOUR_SUPABASE")
);
const supabaseConfigured = Boolean(supabaseExpected && window.supabase?.createClient);
const supabaseClient = supabaseConfigured
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
    : null;

function throwOnError(error, operation) {
    if (error) throw new Error(`${operation}: ${error.message}`);
}

async function resolveSession() {
    if (!supabaseClient) return getSession();
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    throwOnError(sessionError, "Checking your sign-in");
    const authUser = sessionData.session?.user;
    if (!authUser) return null;

    const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("id,email,role,display_name")
        .eq("id", authUser.id)
        .single();
    throwOnError(profileError, "Loading your profile");
    if (authUser.email && !authUser.email_confirmed_at) {
        const { error: signOutError } = await supabaseClient.auth.signOut();
        throwOnError(signOutError, "Signing out before email verification");
        return null;
    }

    const { data: memberships, error: membershipError } = await supabaseClient
        .from("team_members")
        .select("role")
        .eq("user_id", authUser.id);
    throwOnError(membershipError, "Checking your team access");
    const role = profile.role === "coach" || memberships.some((membership) => membership.role === "coach")
        ? "coach"
        : "member";
    return {
        id: authUser.id,
        email: profile.email,
        displayName: profile.display_name || profile.email.split("@")[0],
        role
    };
}

async function fetchAppData(session, page) {
    if (!supabaseClient) {
        const team = getTeam();
        if (session.role === "coach" && !team.coaches.some((coach) => coach.email === session.email)) {
            team.coaches.push({
                userId: session.email,
                email: session.email,
                displayName: session.displayName || session.email.split("@")[0],
                role: "coach"
            });
            saveStorage(STORAGE.team, team);
        }
        return {
            quizzes: getQuizzes(),
            team,
            results: readStorage(STORAGE.results, {}),
            invitations: []
        };
    }

    const { data: quizRows, error: quizError } = await supabaseClient
        .from("quizzes")
        .select("id,owner_id,team_id,title,category,description,quiz_questions(id,prompt,position,quiz_options(option_text,position))")
        .order("created_at", { ascending: false });
    throwOnError(quizError, "Loading quizzes");
    const quizzes = quizRows.map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        description: row.description,
        ownerId: row.owner_id,
        teamId: row.team_id,
        audience: row.team_id ? "team" : "personal",
        questions: (row.quiz_questions || [])
            .sort((left, right) => left.position - right.position)
            .map((question) => ({
                id: question.id,
                prompt: question.prompt,
                options: (question.quiz_options || [])
                    .sort((left, right) => left.position - right.position)
                    .map((option) => option.option_text)
            }))
    }));

    const { data: myMemberships, error: myMembershipError } = await supabaseClient
        .from("team_members")
        .select("team_id,role,teams(id,name)")
        .eq("user_id", session.id);
    throwOnError(myMembershipError, "Loading your team");
    const myMembership = myMemberships[0];
    let team = null;
    let invitations = [];
    if (myMembership) {
        const { data: rosterRows, error: rosterError } = await supabaseClient
            .from("team_members")
            .select("user_id,role,profiles(email,display_name)")
            .eq("team_id", myMembership.team_id);
        throwOnError(rosterError, "Loading the team roster");
        const roster = rosterRows.map((row) => ({
            userId: row.user_id,
            email: row.profiles?.email || "Team member",
            displayName: row.profiles?.display_name || row.profiles?.email?.split("@")[0] || "Team member",
            role: row.role
        }));
        team = {
            id: myMembership.teams.id,
            name: myMembership.teams.name,
            members: roster.filter((person) => person.role === "member"),
            coaches: roster.filter((person) => person.role === "coach")
        };
        if (page === "team" && session.role === "coach") {
            const { data: invitationRows, error: invitationError } = await supabaseClient
                .from("team_invitations")
                .select("email,role,expires_at")
                .eq("team_id", team.id)
                .order("created_at", { ascending: false });
            throwOnError(invitationError, "Loading team invitations");
            invitations = invitationRows || [];
        }
    }

    const results = {};
    if (page === "dashboard" && quizzes.length) {
        const { data: attempts, error: attemptsError } = await supabaseClient
            .from("quiz_attempts")
            .select("quiz_id,score,total,created_at")
            .eq("user_id", session.id)
            .order("created_at", { ascending: false });
        throwOnError(attemptsError, "Loading quiz results");
        for (const attempt of attempts || []) {
            if (!results[attempt.quiz_id]) {
                results[attempt.quiz_id] = { score: attempt.score, total: attempt.total };
            }
        }
    }

    return { quizzes, team, results, invitations };
}

function getTeam() {
    const team = readStorage(STORAGE.team, {
        id: "team",
        name: "FTC Team 12345",
        members: [],
        coaches: []
    });
    if (!team.id) team.id = "team";
    team.members = (team.members || []).filter((person) => !person.email?.endsWith("@team12345.org"));
    team.coaches = (team.coaches || []).filter((person) => !person.email?.endsWith("@team12345.org"));
    saveStorage(STORAGE.team, team);
    return team;
}

function getQuizzes() {
    return readStorage(STORAGE.quizzes, [sampleQuiz]);
}

function getSession() {
    return readStorage(STORAGE.session, null);
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function initials(email) {
    return (email || "?").split("@")[0].slice(0, 2).toUpperCase();
}

function pageLink(file, label, active, key) {
    const current = active === key ? ' aria-current="page"' : "";
    return `<a href="${file}"${current}>${label}</a>`;
}

function renderHeader(page, session) {
    const loggedIn = Boolean(session);
    const links = loggedIn
        ? [
            pageLink("dashboard.html", "My quizzes", page, "dashboard"),
            pageLink("create-quiz.html", "Create quiz", page, "create"),
            ...(session.role === "coach" ? [pageLink("team.html", "Team admin", page, "team")] : [])
        ].join("")
        : `${pageLink("index.html#features", "How it works", page, "home")}<a href="index.html#about">For teams</a>`;

    document.getElementById("site-header").innerHTML = `
        <header class="site-header">
            <div class="nav-wrap">
                <a class="brand" href="${loggedIn ? "dashboard.html" : "index.html"}" aria-label="FTC Quizzes home">
                    <span class="brand-mark">FTC</span>
                    <span class="brand-name">FTC <span>Quizzes</span></span>
                </a>
                <nav class="nav-links" aria-label="Main navigation">${links}</nav>
                <div class="nav-actions">
                    ${loggedIn
                        ? `<span class="nav-email">${escapeHtml(session.displayName || session.email)}</span><button class="button button-outline button-small" type="button" data-action="signout">Sign out</button>`
                        : `<a class="button button-outline button-small" href="signin.html">Sign in</a><a class="button button-primary button-small" href="signin.html?mode=signup">Get started <span aria-hidden="true">→</span></a>`}
                </div>
            </div>
        </header>`;

    document.getElementById("site-footer").innerHTML = `
        <footer class="site-footer">
            <div class="footer-wrap">
                <p>© ${new Date().getFullYear()} FTC Quizzes · Built for teams that build together.</p>
                <div class="footer-links"><a href="index.html#about">About</a><a href="signin.html">Sign in</a></div>
                <span class="site-version">Version ${WEBSITE_VERSION}</span>
            </div>
        </footer>`;
}

function bindProfile(session) {
    const form = document.getElementById("display-name-form");
    if (!form) return;
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void (async () => {
            const displayName = String(new FormData(form).get("displayName")).trim();
            const message = document.getElementById("profile-message");
            if (!displayName) {
                message.textContent = "Enter a display name.";
                message.className = "form-error";
                return;
            }
            try {
                if (supabaseClient) {
                    const { error } = await supabaseClient
                        .from("profiles")
                        .update({ display_name: displayName })
                        .eq("id", session.id);
                    throwOnError(error, "Saving display name");
                } else {
                    const profiles = readStorage(STORAGE.profiles, {});
                    profiles[session.email] = { ...profiles[session.email], role: session.role, displayName };
                    saveStorage(STORAGE.profiles, profiles);
                    saveStorage(STORAGE.session, { ...session, displayName });
                }
                message.textContent = "Display name saved.";
                message.className = "form-success";
                await render();
                const updatedMessage = document.getElementById("profile-message");
                if (updatedMessage) {
                    updatedMessage.textContent = "Display name saved.";
                    updatedMessage.className = "form-success";
                }
            } catch (error) {
                message.textContent = error.message;
                message.className = "form-error";
            }
        })();
    });
}

function homePage() {
    return `
        <div class="container">
            <section class="hero" id="about">
                <div class="hero-copy">
                    <div class="eyebrow"><span class="eyebrow-dot"></span>Made for FIRST Tech Challenge</div>
                    <h1>Build skills.<br>Win <span>together.</span></h1>
                    <p>A better way for FTC teams to learn the game, sharpen their engineering, and show up ready for competition.</p>
                    <div class="hero-actions">
                        <a class="button button-primary" href="signin.html?mode=signup">Get started for free <span aria-hidden="true">→</span></a>
                        <a class="button button-outline" href="#features">Explore the platform</a>
                    </div>
                    <div class="hero-note">
                        <span class="hero-note-icon" aria-hidden="true">✦</span>
                        <span>For curious builders, dedicated coaches, and teams that never stop learning.</span>
                    </div>
                </div>
                <div class="preview-wrap" aria-label="Quiz preview">
                    <div class="preview-glow"></div>
                    <div class="preview-card">
                        <div class="preview-top"><span class="preview-label">GAME STRATEGY · QUESTION 3 OF 8</span><span class="preview-chip">Team quiz</span></div>
                        <div class="preview-question">What makes an autonomous routine reliable?</div>
                        <div class="preview-option"><b>A</b><span>Stacking as many actions as possible</span></div>
                        <div class="preview-option active"><b>B</b><span>Repeatable paths tested on the field</span></div>
                        <div class="preview-option"><b>C</b><span>Changing the plan every match</span></div>
                        <div class="preview-option"><b>D</b><span>Skipping practice to save battery</span></div>
                        <div class="preview-progress"><span>YOUR PROGRESS</span><span>3 / 8</span></div>
                        <div class="progress-track"><span></span></div>
                    </div>
                    <div class="floating-stat"><span class="stat-icon" aria-hidden="true">✦</span><span><strong>Learn by doing</strong><small>One question at a time</small></span></div>
                </div>
            </section>

            <section class="section" id="features">
                <div class="section-heading">
                    <div class="eyebrow"><span class="eyebrow-dot"></span>Everything in one place</div>
                    <h2>More than a quiz.<br>A stronger team.</h2>
                    <p>Keep learning simple so your team can focus on what it does best: building, testing, and improving.</p>
                </div>
                <div class="feature-grid">
                    <article class="feature-card"><div class="feature-icon" aria-hidden="true">◈</div><h3>Practice with purpose</h3><p>Take focused quizzes on game strategy, engineering, safety, and the skills your team wants to grow.</p></article>
                    <article class="feature-card"><div class="feature-icon" aria-hidden="true">◎</div><h3>Coach your whole team</h3><p>Assign practice, see who's on your roster, and keep everyone moving in the same direction.</p></article>
                    <article class="feature-card"><div class="feature-icon" aria-hidden="true">✎</div><h3>Make learning yours</h3><p>Create your own quizzes for independent practice or share them with your team.</p></article>
                </div>
                <div class="cta-band">
                    <div><h2>Ready to level up your next practice?</h2><p>Create an account and bring your whole team along.</p></div>
                    <a class="button button-primary" href="signin.html?mode=signup">Join FTC Quizzes <span aria-hidden="true">→</span></a>
                </div>
            </section>
        </div>`;
}

function signInPage() {
    return `
        <div class="container auth-layout">
            <section class="auth-intro">
                <div class="eyebrow"><span class="eyebrow-dot"></span>Your next practice starts here</div>
                <h1>Every great team keeps <span style="color:var(--teal)">learning.</span></h1>
                <p>Sign in to find your coach's assignments, pick up a personal quiz, and keep getting better.</p>
                <div class="auth-bullets"><span>Personal practice and team assignments together</span><span>Built for learners and coaches</span><span>Free to get started</span></div>
            </section>
            <section class="auth-card" aria-labelledby="auth-title">
                <h2 id="auth-title">Welcome to the team</h2>
                <p>Sign in or create your free account to continue.</p>
                <div class="social-buttons">
                    <button class="social-button" type="button" data-action="oauth" data-provider="Google">Continue with Google</button>
                    <button class="social-button" type="button" data-action="oauth" data-provider="GitHub">Continue with GitHub</button>
                </div>
                <div class="divider">OR CONTINUE WITH EMAIL</div>
                <div class="auth-tabs" role="tablist" aria-label="Account action">
                    <button class="auth-tab" type="button" role="tab" data-mode="signin">Sign in</button>
                    <button class="auth-tab" type="button" role="tab" data-mode="signup">Create account</button>
                </div>
                <form id="auth-form" class="form-grid">
                    <div class="field hidden" id="display-name-field"><label for="auth-display-name">Display name</label><input id="auth-display-name" name="displayName" type="text" autocomplete="name" maxlength="60" placeholder="How should your team know you?" required></div>
                    <div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
                    <div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="current-password" minlength="6" placeholder="At least 6 characters" required></div>
                    <div class="field hidden" id="role-field"><label for="auth-role">I am a…</label><select id="auth-role" name="role"><option value="member">Team member / learner</option><option value="coach">Coach</option></select></div>
                    <p id="auth-message" class="form-note" aria-live="polite">Demo preview: accounts are stored only in this browser.</p>
                    <button class="button button-outline button-small hidden" id="resend-verification" type="button">Resend verification email</button>
                    <button class="button button-primary button-block" id="auth-submit" type="submit">Sign in <span aria-hidden="true">→</span></button>
                    <p class="form-footer">Supabase email accounts must verify their address before signing in. The browser-only preview does not send verification emails.</p>
                </form>
            </section>
        </div>`;
}

function quizCard(quiz, result) {
    const score = result ? `<span class="quiz-score">Latest: ${result.score}/${result.total} correct</span>` : "";
    return `
        <article class="quiz-card">
            <div class="quiz-card-top"><span class="tag">${escapeHtml(quiz.category || "Practice")}</span><span class="tag tag-muted">${quiz.audience === "team" ? "Team assignment" : "Personal"}</span></div>
            <h3>${escapeHtml(quiz.title)}</h3>
            <p>${escapeHtml(quiz.description || "A practice quiz made for your team.")}</p>
            <div class="quiz-meta"><span>${quiz.questions.length} questions</span><span>Multiple choice</span></div>
            <div class="quiz-card-bottom">${score}<a class="button button-outline button-small" href="take-quiz.html?id=${encodeURIComponent(quiz.id)}">${result ? "Try again" : "Start quiz"} <span aria-hidden="true">→</span></a></div>
        </article>`;
}

function dashboardPage(session, data) {
    const quizzes = data.quizzes;
    const results = data.results;
    const team = data.team || { members: [], coaches: [] };
    const latestResult = (quiz) => results[quiz.id] || results[`${session.email}:${quiz.id}`];
    const done = quizzes.filter((quiz) => latestResult(quiz)).length;
    const teamQuizzes = quizzes.filter((quiz) => quiz.audience === "team");
    const personalQuizzes = quizzes.filter((quiz) => quiz.audience === "personal");
    const quizSection = (title, items) => `
        <div class="section-row"><h2>${title}</h2><span class="tag tag-muted">${items.length} ${items.length === 1 ? "quiz" : "quizzes"}</span></div>
        ${items.length ? `<div class="quiz-grid">${items.map((quiz) => quizCard(quiz, latestResult(quiz))).join("")}</div>` : `<div class="empty-state"><strong>Nothing here just yet</strong>When you create a quiz or your coach assigns one, it will show up here.</div>`}`;

    return `
        <div class="container">
            <section class="page-heading">
                <div><div class="eyebrow"><span class="eyebrow-dot"></span>Your learning space</div><h1>Hey, ${escapeHtml(session.displayName || session.email.split("@")[0])}.</h1><p>Your next great idea could start with a question.</p></div>
                <a class="button button-primary" href="create-quiz.html">Create a quiz <span aria-hidden="true">+</span></a>
            </section>
            <section class="panel profile-panel">
                <div class="panel-heading"><div><h2>Your display name</h2><p>This is the name your teammates see.</p></div></div>
                <form id="display-name-form" class="profile-form">
                    <div class="field"><label for="profile-display-name">Display name</label><input id="profile-display-name" name="displayName" maxlength="60" value="${escapeHtml(session.displayName || session.email.split("@")[0])}" required></div>
                    <button class="button button-outline button-small" type="submit">Save name</button>
                    <p id="profile-message" class="form-note" aria-live="polite"></p>
                </form>
            </section>
            <section class="dashboard-stats" aria-label="Learning overview">
                <div class="stat-card"><div class="stat-card-label">Available quizzes</div><div class="stat-card-value">${quizzes.length}</div><div class="stat-card-note">Ready when you are</div></div>
                <div class="stat-card"><div class="stat-card-label">Quizzes completed</div><div class="stat-card-value">${done}</div><div class="stat-card-note">Keep the momentum going</div></div>
                <div class="stat-card"><div class="stat-card-label">${session.role === "coach" ? "Team roster" : "Team practice"}</div><div class="stat-card-value">${session.role === "coach" ? team.members.length + team.coaches.length : teamQuizzes.length}</div><div class="stat-card-note">${session.role === "coach" ? "Members and coaches" : "Assignments from your coach"}</div></div>
            </section>
            ${quizSection("Assigned by your coach", teamQuizzes)}
            ${quizSection("Your personal quizzes", personalQuizzes)}
        </div>`;
}

function teamPage(data, session) {
    const team = data.team;
    if (!team) {
        return `
            <div class="container">
                <section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span>Coach workspace</div><h1>Create your team</h1><p>Set up your team roster before assigning practice.</p></div></section>
                <form id="create-team-form" class="panel member-form" style="max-width:560px">
                    <div class="field"><label for="team-name">Team name</label><input id="team-name" name="name" maxlength="80" placeholder="e.g. FTC Team 12345" required></div>
                    <p id="team-message" class="form-note" aria-live="polite">Creating a team makes you its first coach.</p>
                    <button class="button button-primary" type="submit">Create team <span aria-hidden="true">→</span></button>
                </form>
            </div>`;
    }
    const allQuizzes = data.quizzes;
    const quizzes = allQuizzes.filter((quiz) => quiz.audience === "team");
    const personalQuizzes = allQuizzes.filter((quiz) => quiz.audience === "personal" && (!quiz.ownerId || quiz.ownerId === session.id));
    const count = team.members.length;
    const coachCount = team.coaches.length;
    const roster = [...team.coaches, ...team.members];
    return `
        <div class="container">
            <section class="page-heading">
                <div><div class="eyebrow"><span class="eyebrow-dot"></span>Coach workspace</div><h1>Team admin</h1><p>Manage your roster and make practice count.</p></div>
                <a class="button button-primary" href="create-quiz.html">Create a quiz <span aria-hidden="true">+</span></a>
            </section>
            <div class="team-layout">
                <section class="panel">
                    <div class="panel-heading"><div><h2>${escapeHtml(team.name)}</h2><p>Your FTC team roster</p></div><span class="tag">Coach view</span></div>
                    <div class="team-counts">
                        <div class="count-box"><strong>${count}<span style="color:var(--muted);font-size:14px"> / 15</span></strong><span>Team members</span></div>
                        <div class="count-box"><strong>${coachCount}<span style="color:var(--muted);font-size:14px"> / 4</span></strong><span>Coaches</span></div>
                    </div>
                    <div class="roster-list">${roster.map((person) => `
                        <div class="roster-row"><div class="person"><span class="person-avatar">${initials(person.displayName || person.email)}</span><span class="person-name">${escapeHtml(person.displayName || person.email)}<span class="person-role">${escapeHtml(person.email)} · ${person.role === "coach" ? "Coach" : "Team member"}</span></span></div><div class="roster-actions"><span class="tag ${person.role === "coach" ? "" : "tag-muted"}">${person.role === "coach" ? "Coach" : "Member"}</span>${person.role === "member" ? `<button class="button button-danger button-small" type="button" data-action="remove-member" data-user-id="${escapeHtml(person.userId || person.email)}">Remove</button>` : ""}</div></div>`).join("")}</div>
                </section>
                <div>
                    <section class="panel">
                        <div class="panel-heading"><div><h2>Add to your team</h2><p>Invite a member or another coach.</p></div></div>
                        <form id="invite-form" class="member-form">
                            <div class="field"><label for="invite-email">Email address</label><input id="invite-email" name="email" type="email" placeholder="teammate@example.com" required></div>
                            <div class="field"><label for="invite-role">Team role</label><select id="invite-role" name="role"><option value="member">Team member</option><option value="coach">Coach</option></select></div>
                            <p id="invite-message" class="form-note" aria-live="polite">Limits: 15 members and 4 coaches. Invitations expire after 14 days; share the link with your teammate.</p>
                            <button class="button button-primary" type="submit">Create invitation <span aria-hidden="true">→</span></button>
                        </form>
                    </section>
                    <section class="panel" style="margin-top:16px">
                        <div class="panel-heading"><div><h2>Team assignments</h2><p>Quizzes shared with your members.</p></div><span class="tag tag-muted">${quizzes.length}</span></div>
                        ${quizzes.length ? `<div class="assigned-list">${quizzes.map((quiz) => `<div class="assigned-row"><span>${escapeHtml(quiz.title)}</span><span class="tag">${quiz.questions.length} Qs</span></div>`).join("")}</div>` : `<p class="form-note">No team quizzes yet. Create one and assign it to your team.</p>`}
                        ${data.invitations.length ? `<div class="section-row"><h2>Pending invitations</h2><span class="tag tag-muted">${data.invitations.length}</span></div><div class="assigned-list">${data.invitations.map((invite) => `<div class="assigned-row"><span>${escapeHtml(invite.email)} · ${invite.role}</span><span class="tag tag-muted">Expires ${new Date(invite.expires_at).toLocaleDateString()}</span></div>`).join("")}</div>` : ""}
                        ${personalQuizzes.length ? `
                            <form id="assignment-form" class="member-form" style="margin-top:16px">
                                <div class="field"><label for="assign-quiz">Assign an existing personal quiz</label><select id="assign-quiz" name="quizId">${personalQuizzes.map((quiz) => `<option value="${escapeHtml(quiz.id)}">${escapeHtml(quiz.title)}</option>`).join("")}</select></div>
                                <p id="assignment-message" class="form-note" aria-live="polite">This quiz will be added to your team's assignments.</p>
                                <button class="button button-outline button-small" type="submit">Assign to team <span aria-hidden="true">→</span></button>
                            </form>` : `<p class="form-note" style="margin-top:14px">No personal quizzes to assign. Create a quiz for yourself or make a team quiz.</p>`}
                    </section>
                </div>
            </div>
        </div>`;
}

function questionEditor(index) {
    const questionId = `question-${index}`;
    return `
        <section class="question-editor">
            <h3>Question ${index + 1}</h3>
            <div class="question-fields">
                <div class="field"><label for="${questionId}-prompt">Question</label><textarea id="${questionId}-prompt" name="prompt" placeholder="What do you want your team to know?" required></textarea></div>
                <div class="field"><label for="${questionId}-option-a">Option A</label><input id="${questionId}-option-a" name="option" placeholder="Answer choice A" required></div>
                <div class="field"><label for="${questionId}-option-b">Option B</label><input id="${questionId}-option-b" name="option" placeholder="Answer choice B" required></div>
                <div class="field"><label for="${questionId}-option-c">Option C</label><input id="${questionId}-option-c" name="option" placeholder="Answer choice C" required></div>
                <div class="field"><label for="${questionId}-option-d">Option D</label><input id="${questionId}-option-d" name="option" placeholder="Answer choice D" required></div>
                <div class="field"><label for="${questionId}-answer">Correct answer</label><select id="${questionId}-answer" name="answer"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></div>
            </div>
        </section>`;
}

function createPage(session, data) {
    const teamOption = session.role === "coach" && data.team
        ? `<option value="${escapeHtml(data.team.id)}">Assign to ${escapeHtml(data.team.name)}</option>`
        : "";
    return `
        <div class="container">
            <section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span>Build a little knowledge</div><h1>Create a quiz</h1><p>Write questions for your own practice${session.role === "coach" ? " or share them with your team" : ""}.</p></div></section>
            <form id="create-quiz-form" class="quiz-builder">
                <section class="panel form-grid">
                    <div class="form-grid two-col">
                        <div class="field"><label for="quiz-title">Quiz title</label><input id="quiz-title" name="title" placeholder="e.g. Game strategy essentials" required></div>
                        <div class="field"><label for="quiz-category">Topic</label><input id="quiz-category" name="category" placeholder="e.g. Strategy, Engineering" required></div>
                    </div>
                    <div class="field"><label for="quiz-description">Short description</label><textarea id="quiz-description" name="description" placeholder="What will this quiz help your team learn?"></textarea></div>
                    <div class="field"><label for="quiz-audience">Who is this quiz for?</label><select id="quiz-audience" name="audience"><option value="">Save to my personal quizzes</option>${teamOption}</select></div>
                    <p id="create-message" class="form-note" aria-live="polite">Each quiz needs at least one question with four answer choices.</p>
                </section>
                <div id="question-list">${questionEditor(0)}</div>
                <div class="builder-actions"><button class="button button-outline" id="add-question" type="button">+ Add a question</button><button class="button button-primary" type="submit">Save quiz <span aria-hidden="true">→</span></button></div>
            </form>
        </div>`;
}

function takePage(quiz) {
    if (!quiz) {
        return `<div class="container"><div class="empty-state"><strong>Quiz not found</strong>This quiz may have been removed. Head back to your quizzes to choose another one.<p style="margin-top:18px"><a class="button button-primary" href="dashboard.html">Back to my quizzes</a></p></div></div>`;
    }
    return `
        <div class="container">
            <section class="quiz-intro"><a class="form-note" href="dashboard.html">← Back to my quizzes</a><div class="eyebrow" style="margin-top:19px"><span class="eyebrow-dot"></span>${escapeHtml(quiz.category || "Practice")} · ${quiz.questions.length} questions</div><h1 style="margin:10px 0;font-size:clamp(34px,5vw,46px);letter-spacing:-1.8px">${escapeHtml(quiz.title)}</h1><p style="color:var(--muted)">${escapeHtml(quiz.description || "")}</p></section>
            <div id="quiz-result" aria-live="polite"></div>
            <form id="take-quiz-form" data-quiz-id="${escapeHtml(quiz.id)}">
                ${quiz.questions.map((question, index) => `
                    <section class="quiz-question-card">
                        <h2>${index + 1}. ${escapeHtml(question.prompt)}</h2>
                        ${question.options.map((option, optionIndex) => `<label class="answer-option"><input type="radio" name="question-${index}" value="${optionIndex}" required><span>${escapeHtml(option)}</span></label>`).join("")}
                    </section>`).join("")}
                <button class="button button-primary" type="submit">Submit answers <span aria-hidden="true">→</span></button>
            </form>
        </div>`;
}

function renderAuthMode(mode) {
    const isSignup = mode === "signup";
    document.querySelectorAll(".auth-tab").forEach((tab) => {
        const active = tab.dataset.mode === mode;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
    });
    document.getElementById("role-field").classList.toggle("hidden", !isSignup);
    document.getElementById("display-name-field").classList.toggle("hidden", !isSignup);
    document.getElementById("auth-display-name").required = isSignup;
    document.getElementById("auth-password").autocomplete = isSignup ? "new-password" : "current-password";
    document.getElementById("resend-verification").classList.add("hidden");
    document.getElementById("auth-submit").innerHTML = `${isSignup ? "Create account" : "Sign in"} <span aria-hidden="true">→</span>`;
    document.getElementById("auth-message").textContent = supabaseClient
        ? (isSignup ? "Create a secure account. Verify your email before signing in." : "Your account is securely managed by Supabase.")
        : (isSignup ? "Choose a learner or coach profile for this browser preview." : "Demo preview: accounts are stored only in this browser.");
}

function startSession(email, role, displayName) {
    saveStorage(STORAGE.session, { email, role, displayName });
    window.location.href = "dashboard.html";
}

function bindAuth() {
    const initialMode = new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin";
    renderAuthMode(initialMode);
    document.querySelectorAll(".auth-tab").forEach((tab) => tab.addEventListener("click", () => renderAuthMode(tab.dataset.mode)));
    document.querySelectorAll('[data-action="oauth"]').forEach((button) => button.addEventListener("click", async () => {
        const message = document.getElementById("auth-message");
        if (!supabaseClient) {
            message.textContent = "Configure your Supabase project and enable this OAuth provider to sign in.";
            message.className = "form-note";
            return;
        }
        try {
            const redirectUrl = new URL("signin.html", window.location.href);
            const invitation = new URLSearchParams(window.location.search).get("invite");
            if (invitation) redirectUrl.searchParams.set("invite", invitation);
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: button.dataset.provider.toLowerCase(),
                options: { redirectTo: redirectUrl.href }
            });
            throwOnError(error, `${button.dataset.provider} sign-in`);
        } catch (error) {
            message.textContent = error.message;
            message.className = "form-error";
        }
    }));
    document.getElementById("auth-form").addEventListener("submit", (event) => {
        event.preventDefault();
        void (async () => {
            const form = new FormData(event.currentTarget);
            const email = String(form.get("email")).trim().toLowerCase();
            const password = String(form.get("password"));
            const displayName = String(form.get("displayName") || "").trim();
            const message = document.getElementById("auth-message");
            const isSignup = document.querySelector('[data-mode="signup"]').classList.contains("active");
            document.getElementById("resend-verification").classList.add("hidden");
            if (isSignup && !displayName) {
                message.textContent = "Enter the display name you'd like your team to see.";
                message.className = "form-error";
                return;
            }
            if (password.length < 6) {
                message.textContent = "Please enter a password with at least 6 characters.";
                message.className = "form-error";
                return;
            }
            try {
                if (supabaseClient) {
                    if (isSignup) {
                        const role = String(form.get("role"));
                        const redirectUrl = new URL("signin.html", window.location.href);
                        const invitation = new URLSearchParams(window.location.search).get("invite");
                        if (invitation) redirectUrl.searchParams.set("invite", invitation);
                        const { data, error } = await supabaseClient.auth.signUp({
                            email,
                            password,
                            options: {
                                data: { role, display_name: displayName },
                                emailRedirectTo: redirectUrl.href
                            }
                        });
                        throwOnError(error, "Creating your account");
                        if (!data.user?.email_confirmed_at) {
                            if (data.session) {
                                const { error: signOutError } = await supabaseClient.auth.signOut();
                                throwOnError(signOutError, "Signing out before email verification");
                            }
                            message.textContent = "Account created. Check your email to verify your address before signing in.";
                            message.className = "form-success";
                            document.getElementById("resend-verification").classList.remove("hidden");
                            return;
                        }
                    } else {
                        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
                        throwOnError(error, "Signing in");
                    }
                    await finishAuthentication();
                    return;
                }

                const profiles = readStorage(STORAGE.profiles, {});
                const role = isSignup ? String(form.get("role")) : (profiles[email]?.role || "member");
                if (isSignup) {
                    profiles[email] = { role, displayName };
                    saveStorage(STORAGE.profiles, profiles);
                }
                startSession(email, role, profiles[email]?.displayName || email.split("@")[0]);
            } catch (error) {
                message.textContent = error.message;
                message.className = "form-error";
                if (error.code === "email_not_confirmed" || error.message.toLowerCase().includes("email not confirmed")) {
                    message.textContent = "Please verify your email before signing in. Resend the confirmation email if needed.";
                    document.getElementById("resend-verification").classList.remove("hidden");
                }
            }
        })();
    });

    document.getElementById("resend-verification").addEventListener("click", async () => {
        const email = document.getElementById("auth-email").value.trim().toLowerCase();
        const message = document.getElementById("auth-message");
        if (!email) {
            message.textContent = "Enter your email address first.";
            message.className = "form-error";
            return;
        }
        try {
            if (supabaseClient) {
                const { error } = await supabaseClient.auth.resend({ type: "signup", email });
                throwOnError(error, "Resending verification email");
            } else {
                throw new Error("Email verification is available after connecting Supabase.");
            }
            message.textContent = "Verification email sent. Check your inbox and spam folder.";
            message.className = "form-success";
        } catch (error) {
            message.textContent = error.message;
            message.className = "form-error";
        }
    });
}

async function finishAuthentication() {
    const invitation = new URLSearchParams(window.location.search).get("invite");
    if (invitation && supabaseClient) {
        const { error } = await supabaseClient.rpc("accept_team_invitation", { _token: invitation });
        throwOnError(error, "Accepting team invitation");
    }
    window.location.href = "dashboard.html";
}

function bindTeam(session, data) {
    const createTeamForm = document.getElementById("create-team-form");
    if (createTeamForm) {
        createTeamForm.addEventListener("submit", (event) => {
            event.preventDefault();
            void (async () => {
                const name = String(new FormData(createTeamForm).get("name")).trim();
                const message = document.getElementById("team-message");
                try {
                    const { error } = await supabaseClient.rpc("create_team", { _name: name });
                    throwOnError(error, "Creating team");
                    await render();
                } catch (error) {
                    message.textContent = error.message;
                    message.className = "form-error";
                }
            })();
        });
        return;
    }

    document.getElementById("invite-form").addEventListener("submit", (event) => {
        event.preventDefault();
        void (async () => {
            const form = new FormData(event.currentTarget);
            const email = String(form.get("email")).trim().toLowerCase();
            const role = String(form.get("role"));
            const message = document.getElementById("invite-message");
            try {
                if (supabaseClient) {
                    const { data: token, error } = await supabaseClient.rpc("create_team_invitation", {
                        _team_id: data.team.id,
                        _email: email,
                        _role: role
                    });
                    throwOnError(error, "Creating team invitation");
                    const invitationUrl = new URL("signin.html", window.location.href);
                    invitationUrl.searchParams.set("mode", "signup");
                    invitationUrl.searchParams.set("invite", token);
                    message.innerHTML = `Invitation created. Share this link with ${escapeHtml(email)}: <a href="${escapeHtml(invitationUrl.href)}">Accept team invitation</a>`;
                    message.className = "form-success";
                    await render();
                    const updatedMessage = document.getElementById("invite-message");
                    if (updatedMessage) {
                        updatedMessage.innerHTML = `Invitation created for ${escapeHtml(email)}. Share <a href="${escapeHtml(invitationUrl.href)}">this acceptance link</a> with them.`;
                        updatedMessage.className = "form-success";
                    }
                    return;
                }
                const team = getTeam();
                if (team.members.some((person) => person.email === email) || team.coaches.some((person) => person.email === email)) {
                    throw new Error("That email is already on this roster.");
                }
                if (role === "coach" && team.coaches.length >= 4) throw new Error("Your team has reached its limit of 4 coaches.");
                if (role === "member" && team.members.length >= 15) throw new Error("Your team has reached its limit of 15 members.");
                throw new Error("Connect Supabase to invite real accounts. Demo mode does not add unregistered people to your roster.");
            } catch (error) {
                message.textContent = error.message;
                message.className = "form-error";
            }
        })();
    });

    const assignmentForm = document.getElementById("assignment-form");
    if (assignmentForm) {
        assignmentForm.addEventListener("submit", (event) => {
            event.preventDefault();
            void (async () => {
                const quizId = String(new FormData(assignmentForm).get("quizId"));
                const message = document.getElementById("assignment-message");
                try {
                    if (supabaseClient) {
                        const { error } = await supabaseClient
                            .from("quizzes")
                            .update({ team_id: data.team.id })
                            .eq("id", quizId)
                            .eq("owner_id", session.id);
                        throwOnError(error, "Assigning quiz");
                    } else {
                        const quizzes = getQuizzes();
                        const quiz = quizzes.find((item) => item.id === quizId && item.audience === "personal");
                        if (!quiz) throw new Error("That quiz is no longer available to assign. Refresh the page and try again.");
                        quiz.audience = "team";
                        saveStorage(STORAGE.quizzes, quizzes);
                    }
                    await render();
                } catch (error) {
                    message.textContent = error.message;
                    message.className = "form-error";
                }
            })();
        });
    }

    document.querySelectorAll('[data-action="remove-member"]').forEach((button) => {
        button.addEventListener("click", () => {
            const userId = button.dataset.userId;
            const person = data.team.members.find((member) => (member.userId || member.email) === userId);
            if (!person || !window.confirm(`Remove ${person.displayName || person.email} from ${data.team.name}?`)) return;
            void (async () => {
                try {
                    if (supabaseClient) {
                        const { error } = await supabaseClient.rpc("remove_team_member", {
                            _team_id: data.team.id,
                            _user_id: userId
                        });
                        throwOnError(error, "Removing team member");
                    } else {
                        const team = getTeam();
                        team.members = team.members.filter((member) => (member.userId || member.email) !== userId);
                        saveStorage(STORAGE.team, team);
                    }
                    await render();
                } catch (error) {
                    const app = document.getElementById("app");
                    app.insertAdjacentHTML("afterbegin", `<p class="form-error">${escapeHtml(error.message)}</p>`);
                }
            })();
        });
    });
}

function bindCreate() {
    const list = document.getElementById("question-list");
    document.getElementById("add-question").addEventListener("click", () => {
        list.insertAdjacentHTML("beforeend", questionEditor(list.querySelectorAll(".question-editor").length));
    });
    document.getElementById("create-quiz-form").addEventListener("submit", (event) => {
        event.preventDefault();
        void (async () => {
            const formData = new FormData(event.currentTarget);
            const editors = [...list.querySelectorAll(".question-editor")];
            const questions = editors.map((editor) => ({
                prompt: editor.querySelector('[name="prompt"]').value.trim(),
                options: [...editor.querySelectorAll('[name="option"]')].map((input) => input.value.trim()),
                answer: Number(editor.querySelector('[name="answer"]').value)
            }));
            const message = document.getElementById("create-message");
            if (questions.some((question) => !question.prompt || question.options.some((option) => !option))) {
                message.textContent = "Fill in every question and all four answer choices.";
                message.className = "form-error";
                return;
            }
            const audience = String(formData.get("audience"));
            const title = String(formData.get("title")).trim();
            const category = String(formData.get("category")).trim();
            const description = String(formData.get("description")).trim();
            try {
                if (supabaseClient) {
                    const { error } = await supabaseClient.rpc("create_quiz", {
                        _title: title,
                        _category: category,
                        _description: description,
                        _team_id: audience || null,
                        _questions: questions
                    });
                    throwOnError(error, "Saving quiz");
                } else {
                    const quiz = {
                        id: `quiz-${Date.now()}`,
                        title,
                        category,
                        description,
                        audience: audience === "team" ? "team" : "personal",
                        questions
                    };
                    const quizzes = getQuizzes();
                    quizzes.unshift(quiz);
                    saveStorage(STORAGE.quizzes, quizzes);
                }
                window.location.href = "dashboard.html";
            } catch (error) {
                message.textContent = error.message;
                message.className = "form-error";
            }
        })();
    });
}

function bindTake(session, quiz) {
    const form = document.getElementById("take-quiz-form");
    if (!form) return;
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void (async () => {
            const answers = quiz.questions.map((question, index) => Number(new FormData(form).get(`question-${index}`)));
            try {
                let score;
                let total;
                if (supabaseClient) {
                    const { data: result, error } = await supabaseClient.rpc("submit_quiz_attempt", {
                        _quiz_id: quiz.id,
                        _answers: answers
                    });
                    throwOnError(error, "Submitting quiz");
                    score = result[0].score;
                    total = result[0].total;
                } else {
                    score = answers.filter((answer, index) => answer === quiz.questions[index].answer).length;
                    total = quiz.questions.length;
                    const results = readStorage(STORAGE.results, {});
                    results[`${session.email}:${quiz.id}`] = { score, total };
                    saveStorage(STORAGE.results, results);
                }
                document.getElementById("quiz-result").innerHTML = `<div class="result-banner"><div><strong>${score} / ${total} correct</strong><br><span>${score === total ? "Perfect score! Nice work." : "Nice effort. Review and try again whenever you're ready."}</span></div><a class="button button-outline button-small" href="dashboard.html">My quizzes</a></div>`;
                window.scrollTo({ top: 0, behavior: "smooth" });
            } catch (error) {
                const result = document.getElementById("quiz-result");
                result.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`;
            }
        })();
    });
}

async function render() {
    const page = document.body.dataset.page || "home";
    try {
        if (supabaseExpected && !supabaseClient) {
            throw new Error("The Supabase client could not load. Check your internet connection and reload.");
        }
        const session = await resolveSession();
        if (page === "signin" && session) {
            const invitation = new URLSearchParams(window.location.search).get("invite");
            if (invitation && supabaseClient) {
                const { error } = await supabaseClient.rpc("accept_team_invitation", { _token: invitation });
                throwOnError(error, "Accepting team invitation");
            }
            window.location.replace("dashboard.html");
            return;
        }

        renderHeader(page, session);
        if (page === "home") {
            document.getElementById("app").innerHTML = homePage();
        } else if (page === "signin") {
            document.getElementById("app").innerHTML = signInPage();
            bindAuth();
            if (supabaseExpected && !supabaseConfigured) {
                const message = document.getElementById("auth-message");
                message.textContent = "Supabase settings are present, but the Supabase client library did not load.";
                message.className = "form-error";
            }
        } else if (!session) {
            window.location.replace("signin.html");
            return;
        } else {
            const data = await fetchAppData(session, page);
            if (page === "dashboard") {
                document.getElementById("app").innerHTML = dashboardPage(session, data);
                bindProfile(session);
            } else if (page === "team") {
                if (session.role !== "coach") {
                    document.getElementById("app").innerHTML = `<div class="container"><div class="empty-state"><strong>Coach access required</strong>Only coaches can manage the team roster and assignments.<p style="margin-top:18px"><a class="button button-primary" href="dashboard.html">Back to my quizzes</a></p></div></div>`;
                    return;
                }
                document.getElementById("app").innerHTML = teamPage(data, session);
                bindTeam(session, data);
            } else if (page === "create") {
                document.getElementById("app").innerHTML = createPage(session, data);
                bindCreate();
            } else if (page === "take") {
                const quizId = new URLSearchParams(window.location.search).get("id");
                const quiz = data.quizzes.find((item) => item.id === quizId);
                document.getElementById("app").innerHTML = takePage(quiz);
                bindTake(session, quiz);
            } else {
                document.getElementById("app").innerHTML = homePage();
            }
        }

        document.querySelector('[data-action="signout"]')?.addEventListener("click", async () => {
            try {
                if (supabaseClient) {
                    const { error } = await supabaseClient.auth.signOut();
                    throwOnError(error, "Signing out");
                } else {
                    localStorage.removeItem(STORAGE.session);
                }
                window.location.href = "index.html";
            } catch (error) {
                const app = document.getElementById("app");
                app.insertAdjacentHTML("afterbegin", `<p class="form-error">${escapeHtml(error.message)}</p>`);
            }
        });
    } catch (error) {
        console.error("Could not load FTC Quizzes.", error);
        renderHeader(page, null);
        document.getElementById("app").innerHTML = `<div class="container"><div class="notice form-error">${escapeHtml(error.message)}</div><a class="button button-outline" href="index.html">Return home</a></div>`;
    }
}

void render();
