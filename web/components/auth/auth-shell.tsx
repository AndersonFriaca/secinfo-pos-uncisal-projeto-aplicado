import type * as React from "react";

/**
 * Shared, card-less centered column used by the login, signup, and
 * verify-email screens (UI-01, UI-02).
 */
export function AuthShell({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
      <p className="text-center text-sm text-muted-foreground">{footer}</p>
    </main>
  );
}
