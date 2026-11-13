import { BrowserRouter, Navigate, Route, Routes, Link } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { RouteGuard } from "./components/RouteGuard";
import { SiteLayout } from "./components/SiteLayout";
import { AuthPage } from "./pages/AuthPage";
import { HomePage } from "./pages/HomePage";
import { AuthCallbackPage, ForgotPasswordPage, ResetPasswordPage } from "./pages/PasswordPages";
import { ProfilePage } from "./pages/ProfilePage";
import { PublicProfilePage } from "./pages/PublicProfilePage";
import { TeamDashboardPage } from "./pages/TeamDashboardPage";
import { TeamSettingsPage } from "./pages/TeamSettingsPage";
import { TeamJoinPage, TeamsPage } from "./pages/TeamsPage";

function NotFoundPage() {
  return (
    <section className="message-page">
      <span className="eyebrow"><span className="eyebrow-mark" /> Page not found</span>
      <h1>Looks like this path is still being built.</h1>
      <p>That page isn’t available yet. Head back home to see what’s available now.</p>
      <Link className="button button-primary" to="/">Back to home <span aria-hidden="true">→</span></Link>
    </section>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="sign-in" element={<AuthPage mode="sign-in" />} />
        <Route path="sign-up" element={<AuthPage mode="sign-up" />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="profile"
          element={(
            <RouteGuard>
              <ProfilePage />
            </RouteGuard>
          )}
        />
        <Route
          path="teams"
          element={(
            <RouteGuard>
              <TeamsPage />
            </RouteGuard>
          )}
        />
        <Route
          path="teams/join"
          element={(
            <RouteGuard>
              <TeamJoinPage />
            </RouteGuard>
          )}
        />
        <Route
          path="teams/:teamId/settings"
          element={(
            <RouteGuard>
              <TeamSettingsPage />
            </RouteGuard>
          )}
        />
        <Route
          path="teams/:teamId"
          element={(
            <RouteGuard>
              <TeamDashboardPage />
            </RouteGuard>
          )}
        />
        <Route path="users/:username" element={<PublicProfilePage />} />
        <Route path="404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
