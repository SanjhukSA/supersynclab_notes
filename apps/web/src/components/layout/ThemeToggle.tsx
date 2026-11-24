import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Theme toggle — switches between light and dark modes.
 *
 * From ui-context.md:
 * "Light and dark modes, both supported from day one. The default follows
 *  the OS setting, and the user can override it with a toggle."
 *
 * The toggle sets data-theme on <html> and persists the choice
 * to localStorage so it survives page refreshes.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    // Read from the DOM (set in main.tsx before React mounts)
    const current = document.documentElement.getAttribute("data-theme");
    return current === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("supernotes-theme", theme);
  }, [theme]);

  const toggle = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));

  return (
    <button
      onClick={toggle}
      className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-primary"
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </button>
  );
}
