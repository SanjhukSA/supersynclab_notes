import { SignUp } from "@clerk/clerk-react";

/**
 * Sign-up page — wraps the Clerk <SignUp /> component.
 *
 * Same layout and art-direction as the sign-in page.
 */
export function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base">
      <div className="w-full max-w-md space-y-8 px-4">
        {/* Decorative heading */}
        <div className="text-center">
          <h1 className="font-display text-4xl font-semibold text-text-primary">
            SuperNotes
          </h1>
          <p className="mt-2 font-sans text-sm text-text-muted">
            Create your study workspace
          </p>
          {/* Ornamental divider */}
          <div className="mx-auto mt-4 flex w-24 flex-col gap-0.5">
            <div className="h-px bg-border" />
            <div className="h-px bg-border" />
          </div>
        </div>

        {/* Clerk sign-up form */}
        <div className="flex justify-center">
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "bg-bg-surface border border-border shadow-none rounded-xl",
                headerTitle: "font-display text-text-primary",
                headerSubtitle: "text-text-muted",
                formButtonPrimary:
                  "bg-accent-primary hover:opacity-90 text-white rounded-md",
                footerActionLink: "text-accent-primary hover:underline",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
