"use client";

import { useState, type FormEvent } from "react";
import type { Project } from "@askwell/shared";
import { createProject } from "./project-api";

/**
 * The form that creates a project (docs/project.md §6.3).
 *
 * The server generates the public key and the default widget config; the page
 * sends a name and nothing else. When the plan's limit is reached, the server
 * refuses and the refusal comes back in the shared error shape — the page shows
 * its message and never decides what is allowed itself (§9).
 */
export function ProjectCreateForm({ onCreated }: { onCreated: (project: Project) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setBusy(true);
    const result = await createProject(name);
    setBusy(false);

    if (!result.ok) {
      setRefusal(result.message);
      return;
    }

    setRefusal(null);
    setName("");
    onCreated(result.data.project);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="new-project" className="text-sm font-medium text-foreground">
        New project
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <input
          id="new-project"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          placeholder="My site"
          className="rounded-card border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <button
          type="submit"
          disabled={busy || name.trim() === ""}
          className="rounded-card border border-border bg-surface-strong px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-border disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </div>

      {refusal ? (
        <p role="alert" className="text-sm leading-relaxed text-foreground">
          {refusal}
        </p>
      ) : null}
    </form>
  );
}
