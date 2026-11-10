import type { Project } from "@askwell/shared";
import { CopyButton } from "../copy-button";
import { GlassPanel } from "../glass-panel";
import { installSnippet } from "../install-snippet";

/**
 * The install snippet for the picked project (docs/project.md §6.9).
 *
 * The owner's projects are on the left, the script tag on the right: the tag
 * carries the picked project's own public key, so it is the one the widget
 * expects (§6.5).
 */
export function InstallView({
  projects,
  selectedId,
  onSelect,
}: {
  projects: Project[];
  selectedId: string;
  onSelect: (projectId: string) => void;
}) {
  const selected = projects.find((project) => project.id === selectedId) ?? projects[0];

  if (!selected) {
    return null;
  }

  const snippet = installSnippet(selected.publicKey);

  return (
    <GlassPanel className="flex flex-col gap-6">
      {projects.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-foreground">Which project?</legend>

          {projects.map((project) => (
            <label
              key={project.id}
              className="flex items-center gap-2 text-sm leading-relaxed text-muted"
            >
              <input
                type="radio"
                name="project"
                value={project.id}
                checked={project.id === selected.id}
                onChange={() => onSelect(project.id)}
                className="h-4 w-4 accent-foreground"
              />
              <span className="font-medium text-foreground">{project.name}</span>
              <code className="text-xs text-muted">{project.publicKey}</code>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-muted">
          Project: <span className="font-medium text-foreground">{selected.name}</span>
        </p>
      )}

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">Your script tag</p>

        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-card border border-border bg-surface-strong p-5 text-sm text-foreground">
          <code>{snippet}</code>
        </pre>

        <CopyButton text={snippet} />
      </div>
    </GlassPanel>
  );
}
