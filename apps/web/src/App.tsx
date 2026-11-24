import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import { Routes, Route, useParams, useNavigate } from "react-router-dom";
import { SignInPage } from "@/features/auth/SignInPage";
import { SignUpPage } from "@/features/auth/SignUpPage";
import { AppShell } from "@/components/layout/AppShell";
import { SharedStudyDesk } from "@/features/sharing/SharedStudyDesk";

function ShareRoute() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  return <SharedStudyDesk token={token || ""} onExitShare={() => navigate("/")} />;
}

/**
 * Top-level routing:
 *  - /sign-in and /sign-up are public (Clerk-hosted UI)
 *  - /share/:token is public read-only study desk
 *  - Everything else requires authentication
 */
export default function App() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />

      {/* Public shared study desk route (no login required) */}
      <Route path="/share/:token" element={<ShareRoute />} />

      {/* Protected app routes — redirect to sign-in if not authenticated */}
      <Route
        path="/*"
        element={
          <>
            <SignedIn>
              <AppShell />
            </SignedIn>
            <SignedOut>
              <RedirectToSignIn />
            </SignedOut>
          </>
        }
      />
    </Routes>
  );
}
