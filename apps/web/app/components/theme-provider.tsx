import type { PropsWithChildren } from "react";

import { useDidUpdate } from "@mantine/hooks";
import { ScriptOnce } from "@tanstack/react-router";
import { outdent } from "outdent";
import { useEffect, useState } from "react";
import { z } from "zod";

import { createContextFactory } from "@/lib/utils";

const themeSchema = z.enum(["dark", "light", "system"]);

type Theme = z.infer<typeof themeSchema>;
type ResolvedTheme = Exclude<Theme, "system">;

interface ThemeContext {
  value: Theme;
  resolved: ResolvedTheme;
  set: (theme: Theme) => void;
  toggle: () => void;
}

const [ThemeContextProvider, useTheme] = createContextFactory<ThemeContext>({
  errorMessage: "useTheme must be used within a ThemeProvider",
});

function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, _setTheme] = useState<Theme>(getLocalTheme());
  const [resolvedTheme, _setResolvedTheme] = useState<ResolvedTheme>(
    getResolvedTheme(theme)
  );

  const setTheme = (theme: Theme) => {
    _setTheme(theme);
    _setResolvedTheme(getResolvedTheme(theme));
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  useDidUpdate(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  useDidUpdate(() => {
    const classList = document.documentElement.classList;
    classList.remove("light", "dark");
    classList.add(resolvedTheme);
  }, [resolvedTheme]);

  // Handle cross-tab theme changes
  useEffect(() => {
    const handleStorageListener = () => {
      setTheme(getLocalTheme());
    };

    handleStorageListener();

    window.addEventListener("storage", handleStorageListener);
    return () => window.removeEventListener("storage", handleStorageListener);
  }, []);

  // Handle system theme changes
  useEffect(() => {
    if (theme !== "system") {
      return;
    }

    const handleSystemThemeChange = () => {
      _setResolvedTheme(getResolvedTheme(theme));
    };

    const media = window.matchMedia("(prefers-color-scheme: dark)");

    // Intentionally use deprecated listener methods to support iOS & old browsers
    media.addListener(handleSystemThemeChange);
    return () => media.removeListener(handleSystemThemeChange);
  }, [theme]);

  const context: ThemeContext = {
    value: theme,
    resolved: resolvedTheme,
    set: setTheme,
    toggle: toggleTheme,
  };

  return (
    <ThemeContextProvider value={context}>
      <ScriptOnce>
        {outdent`
          function initTheme() {
            if (typeof localStorage === 'undefined') return

            const localTheme = localStorage.getItem('theme')
            const preferTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
            const resolvedTheme = localTheme === null || localTheme === 'system' ? preferTheme : localTheme

            if (localTheme === null) {
              localStorage.setItem('theme', 'system')
            }

            const classList = document.documentElement.classList;
            classList.remove("light", "dark");
            classList.add(resolvedTheme);
          }

          initTheme()
        `}
      </ScriptOnce>
      {children}
    </ThemeContextProvider>
  );
}

function getLocalTheme(): Theme {
  if (typeof localStorage === "undefined") {
    return "system";
  }

  const localTheme = localStorage.getItem("theme");
  if (localTheme === null) {
    throw new Error(
      "Can't find theme in localStorage. Make sure you wrap the app with ThemeProvider."
    );
  }

  const localThemeParsed = themeSchema.safeParse(localTheme);
  if (localThemeParsed.error) {
    return "system";
  }

  return localThemeParsed.data;
}

function getPreferTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getResolvedTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getPreferTheme() : theme;
}

export { themeSchema };
export { ThemeProvider, useTheme };
export type { ResolvedTheme, Theme };
