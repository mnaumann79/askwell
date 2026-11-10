"use client";

import { useState } from "react";
import type { Project } from "@askwell/shared";
import { deleteProject, renameProject } from "./project-api";

/**
 * One project of the owner, with a rename and a delete (docs/project.md §6.3).
 *
 * A delete asks first: a project carries its conversations and its knowledge
 * with it, and the route refuses nothing on its own — the confirmation is the
 * page's job.
 */
export function ProjectRow({
  project,
  onRenamed,
  onDeleted,
}: {
  project: Project;
  onRenamed: (project: Project) => void;
  onDeleted: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    const result = await renameProject(project.id, name);
    setBusy(false);

    if (!result.ok) {
      setRefusal(result.message);
      return;
    }

    setRefusal(null);
    setRenaming(false);
    onRenamed(result.data.project);
  }

  async function remove() {
    setBusy(true);
    const result = await deleteProject(project.id);
    setBusy(false);

    if (!result.ok) {
      setRefusal(result.message);
      setConfirming(false);
      return;
    }

    setRefusal(null);
    onDeleted(project.id);
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      {renaming ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`name-${project.id}`}>
            Name
          </label>
          <input
            id={`name-${project.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            className="rounded-card border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-card border border-border bg-surface-strong px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-border disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            className="rounded-card px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-foreground">{project.name}</p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setName(project.name);
                setRefusal(null);
                setRenaming(true);
              }}
              className="rounded-card px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => {
                setRefusal(null);
                setConfirming(true);
              }}
              className="rounded-card px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {confirming ? (
        <DeleteConfirmation
          project={project}
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      ) : null}

      {refusal ? (
        <p role="alert" className="text-sm leading-relaxed text-foreground">
          {refusal}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The confirmation a delete asks for.
 *
 * The route refuses nothing on its own: the project and everything under it go
 * with the delete, so the page asks before it does that.
 */
export function DeleteConfirmation({
  project,
  busy,
  onConfirm,
  onCancel,
}: {
  project: Project;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface-strong p-4">
      <p className="text-sm leading-relaxed text-foreground">
        Delete <span className="font-semibold">{project.name}</span>? Its conversations and its
        knowledge go with it.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-card border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-border disabled:opacity-60"
        >
          Delete it
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-card px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
