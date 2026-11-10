import type { Project } from "@askwell/shared";
import { GlassPanel } from "../glass-panel";
import { ProjectCreateForm } from "./project-create-form";
import { ProjectRow } from "./project-row";

/**
 * The list of projects, with the limit in view (docs/project.md §6.3, §5).
 *
 * The limit comes from the server: the page shows what the owner has and what
 * the plan allows, and it never decides what is allowed itself (§9).
 */

/** "1 of 1 project", "3 of 5 projects". */
export function limitLabel(count: number, limit: number): string {
  return `${count} of ${limit} ${limit === 1 ? "project" : "projects"}`;
}

export function ProjectsView({
  projects,
  limit,
  onCreated,
  onRenamed,
  onDeleted,
}: {
  projects: Project[];
  limit: number;
  onCreated: (project: Project) => void;
  onRenamed: (project: Project) => void;
  onDeleted: (id: string) => void;
}) {
  return (
    <GlassPanel className="flex flex-col gap-6">
      <p className="text-sm font-medium text-foreground">{limitLabel(projects.length, limit)}</p>

      {projects.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted">
          No projects yet. Create one and it gets its own public key and its own widget.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((project) => (
            <li key={project.id}>
              <ProjectRow project={project} onRenamed={onRenamed} onDeleted={onDeleted} />
            </li>
          ))}
        </ul>
      )}

      <ProjectCreateForm onCreated={onCreated} />
    </GlassPanel>
  );
}
