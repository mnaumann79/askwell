import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_NAME, pageTitle } from "@askwell/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: pageTitle(),
  description: `${APP_NAME} — an AI support chat widget for any website.`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
