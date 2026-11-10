import { projectSchema, type Project } from "@askwell/shared";

/**
 * The `projects` row the routes read (docs/project.md §7).
 */

/**
 * The columns the routes need.
 *
 * `owner_id` is not among them: the owner never sees whose project it is,
 * because every route only ever reaches their own rows.
 */
export const PROJECT_COLUMNS = "id, name, public_key, messages_used, period_start, created_at";

type ProjectRow = {
  id: string;
  name: string;
  public_key: string;
  messages_used: number;
  period_start: string;
  created_at: string;
};

function isProjectRow(value: unknown): value is ProjectRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as Record<string, unknown>;

  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.public_key === "string" &&
    typeof row.messages_used === "number" &&
    typeof row.period_start === "string" &&
    typeof row.created_at === "string"
  );
}

/**
 * Maps a `projects` row to the shape the API answers with.
 *
 * The shared schema is the contract, so the row is checked against it instead
 * of assumed to fit: a row that does not match is a bug we want to see, not
 * a 200 with a body that breaks the contract.
 */
export function toProject(value: unknown): Project {
  if (!isProjectRow(value)) {
    throw new Error("The project row is not the shape we expect.");
  }

  const project = projectSchema.safeParse({
    id: value.id,
    name: value.name,
    publicKey: value.public_key,
    messagesUsed: value.messages_used,
    periodStart: value.period_start,
    createdAt: value.created_at,
  });

  if (!project.success) {
    throw new Error(`The project row does not match the contract: ${project.error.message}`);
  }

  return project.data;
}
