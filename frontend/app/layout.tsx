import "./globals.css";
import { LangProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/theme";

export const metadata = {
  title: "Fleet AI Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <ThemeProvider>
          <LangProvider>{children}</LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
