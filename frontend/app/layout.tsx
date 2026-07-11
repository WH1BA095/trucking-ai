import "./globals.css";
import { LangProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/theme";
import { SettingsProvider } from "../lib/settings";
import { AuthProvider } from "../lib/auth";
import ScaleRoot from "../components/ScaleRoot";

export const metadata = {
  title: "Fleet AI Dashboard",
};

// Render at device width on phones (and allow pinch-zoom for accessibility).
export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <ThemeProvider>
          <LangProvider>
            <SettingsProvider>
              <AuthProvider>
                <ScaleRoot>{children}</ScaleRoot>
              </AuthProvider>
            </SettingsProvider>
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
