import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  BookOpenCheck,
  Bot,
  ShieldCheck,
  Trophy,
  UsersRound,
  Wrench,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const features = [
  {
    icon: BookOpenCheck,
    title: "Learn the rules",
    description: "Turn game manuals and engineering concepts into clear, focused practice.",
  },
  {
    icon: Wrench,
    title: "Build team knowledge",
    description: "Give students a shared place to strengthen the skills behind a great robot.",
  },
  {
    icon: Trophy,
    title: "Get competition ready",
    description: "Practice with purpose, learn from each attempt, and show up prepared.",
  },
  {
    icon: UsersRound,
    title: "Learn together",
    description: "A platform designed around how FIRST teams mentor, collaborate, and grow.",
  },
  {
    icon: ShieldCheck,
    title: "Your account, your choice",
    description: "Control what appears on your profile and keep personal information private.",
  },
  {
    icon: Bot,
    title: "Made for robotics",
    description: "Built for FLL, FTC, FRC, and the engineering community connecting them.",
  },
];

export function HomePage() {
  const { user, profile, profileLoading, profileError } = useAuth();

  return (
    <>
      {user && profileError && (
        <div className="home-profile-error">
          <div className="notice notice-error" role="alert">
            Your account is signed in, but your profile could not load: {profileError}{" "}
            <Link to="/profile">Review your profile settings</Link>
          </div>
        </div>
      )}
      <section className="hero-section">
        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow"><span className="eyebrow-mark" /> Built for FIRST teams</span>
            <h1>
              {user ? (
                <>Keep building, <span>{profile?.display_name || "FIRST learner"}.</span></>
              ) : (
                <>Learn robotics.<br />Challenge your team.<br /><span>Get competition ready.</span></>
              )}
            </h1>
            <p className="hero-description">
              A collaborative learning platform for robotics. Build quizzes, practice
              game rules and engineering concepts, and prepare your team for its next challenge.
            </p>
            <div className="hero-actions">
              {user ? (
                <Link className="button button-primary" to="/quizzes">
                  Explore quizzes <ArrowRight size={17} aria-hidden="true" />
                </Link>
              ) : (
                <Link className="button button-primary" to="/sign-up">
                  Get started <ArrowRight size={17} aria-hidden="true" />
                </Link>
              )}
              <a className="button button-secondary" href="#how-it-works">
                How it works <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <div className="hero-proof">
              <span className="proof-icon"><ShieldCheck size={17} aria-hidden="true" /></span>
              {profileLoading
                ? "Loading your account…"
                : user
                  ? `Signed in${user.email ? ` as ${user.email}` : ""}`
                  : "For curious builders, thoughtful teammates, and future innovators"}
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-node node-top" />
            <div className="art-node node-side" />
            <div className="robot-blueprint">
              <div className="blueprint-topline"><span>FIELD NOTES</span><span>FQ / 001</span></div>
              <div className="blueprint-grid">
                <div className="robot-frame">
                  <span className="robot-wheel wheel-left" />
                  <span className="robot-wheel wheel-right" />
                  <span className="robot-base" />
                  <span className="robot-upright" />
                  <span className="robot-arm arm-left" />
                  <span className="robot-arm arm-right" />
                  <span className="robot-sensor" />
                  <span className="robot-center" />
                </div>
                <div className="blueprint-label label-top">DESIGN<br />ITERATE</div>
                <div className="blueprint-label label-bottom">TEST<br />IMPROVE</div>
                <span className="blueprint-cross cross-one">+</span>
                <span className="blueprint-cross cross-two">+</span>
              </div>
              <div className="blueprint-footer"><span>IDEAS INTO MOTION</span><span className="signal"><i /><i /><i /></span></div>
            </div>
            <div className="art-caption caption-top"><span className="caption-dot" /> BUILD WITH PURPOSE</div>
            <div className="art-caption caption-bottom">LEARN <b>·</b> TEST <b>·</b> REPEAT</div>
          </div>
        </div>
      </section>

      <section className="community-strip" aria-label="Supported FIRST programs">
        <span>One community</span>
        <i />
        <span>FIRST LEGO League</span>
        <i />
        <span>FIRST Tech Challenge</span>
        <i />
        <span>FIRST Robotics Competition</span>
      </section>

      <section className="content-section" id="what-you-can-do">
        <div className="section-heading">
          <span className="eyebrow"><span className="eyebrow-mark" /> A smarter way to practice</span>
          <h2>More than memorizing.<br /><span>Ready for the real world.</span></h2>
          <p>Great robots start with curious, capable people. Build knowledge that moves your whole team forward.</p>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, description }, index) => (
            <article className="feature-card" key={title}>
              <span className="feature-number">0{index + 1}</span>
              <span className="feature-icon"><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="steps-section" id="how-it-works">
        <div className="steps-intro">
          <span className="eyebrow"><span className="eyebrow-mark" /> Start where you are</span>
          <h2>Small steps.<br /><span>Big breakthroughs.</span></h2>
          <p>Every great build starts with a first question. Get your learning journey underway in three simple steps.</p>
          {!user && (
            <Link className="text-link" to="/sign-up">
              Create your free account <ArrowRight size={17} aria-hidden="true" />
            </Link>
          )}
        </div>
        <ol className="steps-list">
          <li><span className="step-count">01</span><div><h3>Make it yours</h3><p>Create your account and set up a profile that reflects how you learn.</p></div></li>
          <li><span className="step-count">02</span><div><h3>Find your focus</h3><p>Choose your FIRST program and the skills you want to strengthen.</p></div></li>
          <li><span className="step-count">03</span><div><h3>Keep getting better</h3><p>Practice quizzes on your own or complete the learning your coach assigns to your team.</p></div></li>
        </ol>
      </section>

      <section className="closing-section">
        <div className="closing-mark" aria-hidden="true"><Bot size={30} strokeWidth={1.6} /></div>
        <div>
          <span className="eyebrow">The next great idea starts here</span>
          <h2>Ready to build what’s next?</h2>
          <p>Join a community that learns by asking better questions.</p>
        </div>
        <Link className="button button-light" to={user ? "/quizzes" : "/sign-up"}>
          {user ? "Explore quizzes" : "Get started"} <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}
