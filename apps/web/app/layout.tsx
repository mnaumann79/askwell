import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { APP_NAME, pageTitle } from "@askwell/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: pageTitle(),
  description: `${APP_NAME} — an AI support chat widget for any website.`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {/*
          ClerkProvider is an async server component and belongs inside
          <body>. `afterSignOutUrl` sends a signed-out owner to the sign-in
          page (docs/project.md §6.2).
        */}
        <ClerkProvider afterSignOutUrl="/sign-in">{children}</ClerkProvider>
      </body>
    </html>
  );
}
