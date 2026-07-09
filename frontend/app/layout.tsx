import { LangProvider } from "../lib/i18n";

export const metadata = {
  title: "Fleet AI Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
