import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const APP_VERSION = "0:02:2";

export function SiteLayout() {
  const { user, profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSignOut() {
    setSignOutError(null);
    try {
      await signOut();
      setMenuOpen(false);
      navigate("/");
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="nav-wrap">
          <Link className="brand" to="/" aria-label="Robotics Quizzes home" onClick={closeMenu}>
            <img className="brand-logo" src="/robotics-quizzes-logo.jpg" alt="" />
            <span className="brand-name">Robotics<span>Quizzes</span></span>
          </Link>
          <button
            className="mobile-menu-toggle"
            type="button"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
          <nav
            id="primary-navigation"
            className={`primary-nav${menuOpen ? " is-open" : ""}`}
            aria-label="Main navigation"
          >
            <NavLink to="/" end onClick={closeMenu}>Home</NavLink>
            <NavLink to="/about" onClick={closeMenu}>About us</NavLink>
            {user ? (
              <>
                <NavLink to="/quizzes" onClick={closeMenu}>Quizzes</NavLink>
                <NavLink to="/teams" onClick={closeMenu}>My teams</NavLink>
                <NavLink to="/profile" onClick={closeMenu}>Profile</NavLink>
                <button className="nav-action" type="button" onClick={() => void handleSignOut()}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/sign-in" onClick={closeMenu}>Sign in</NavLink>
                <Link className="button button-primary nav-cta" to="/sign-up" onClick={closeMenu}>
                  Create account <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </>
            )}
          </nav>
          {user && (
            <Link className="account-chip" to="/profile" aria-label="Open your profile">
              <span className="account-chip-avatar" aria-hidden="true">
                {(profile?.display_name || user.email || "A").slice(0, 1).toUpperCase()}
              </span>
              <span>{profile?.display_name || "Your profile"}</span>
            </Link>
          )}
        </div>
      </header>
      {signOutError && (
        <div className="global-error" role="alert">
          <div className="container-narrow">{signOutError}</div>
        </div>
      )}
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <Link className="brand footer-brand" to="/" aria-label="Robotics Quizzes home">
            <img className="brand-logo" src="/robotics-quizzes-logo.jpg" alt="" />
            <span className="brand-name">Robotics<span>Quizzes</span></span>
          </Link>
          <p>Made for teams who learn by building.</p>
          <span className="site-version">Version {APP_VERSION}</span>
        </div>
        <div className="footer-bottom">
          <span>Independent community project. FIRST® is a registered trademark of For Inspiration and Recognition of Science and Technology.</span>
          <span>© {new Date().getFullYear()} Robotics Quizzes</span>
        </div>
      </footer>
    </>
  );
}
