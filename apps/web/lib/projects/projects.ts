import { DEFAULT_WIDGET_CONFIG, PLAN_LIMITS, type Plan, type Project } from "@askwell/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

const PROJECT_COLUMNS = "id, name, public_key, messages_used, period_start, created_at";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A row of public.projects, the way the database returns it. */
type ProjectRow = {
  id: string;
  name: string;
  public_key: string;
  messages_used: number;
  period_start: string;
  created_at: string;
};

/** Why a project could not be created. */
export type ProjectsErrorCode = "limit_reached" | "no_account";

/** An error the route turns into the shared error shape. */
export class ProjectsError extends Error {
  constructor(
    readonly code: ProjectsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectsError";
  }
}

/**
 * Whether the id in the path can be a project id.
 *
 * The shared package owns the API schemas and has no schema for a path
 * parameter yet, so this is a plain check.
 */
export function isProjectId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** A project row as the API answers it. */
export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.public_key,
    messagesUsed: row.messages_used,
    periodStart: row.period_start,
    createdAt: row.created_at,
  };
}

function planLabel(plan: Plan): string {
  return plan === "pro" ? "Pro" : "Free";
}

/**
 * The message that goes with a refused project: how many the plan allows and
 * that Pro allows more (§6.3).
 */
export function limitReachedMessage(plan: Plan): string {
  const limit = PLAN_LIMITS[plan].projects;

  return `The ${planLabel(plan)} plan allows ${limit} ${limit === 1 ? "project" : "projects"}. Pro allows ${PLAN_LIMITS.pro.projects} — upgrade to Pro for more.`;
}

/**
 * The owner's projects.
 *
 * The read goes through the owner client, so RLS scopes it to the rows of the
 * signed-in owner. There is no owner filter in the query on purpose (§9).
 */
export async function listProjects(client: SupabaseClient): Promise<Project[]> {
  const { data, error } = await client
    .from("projects")
    .select(PROJECT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Could not read the projects: ${error.message}`);
  }

  return ((data ?? []) as ProjectRow[]).map(toProject);
}

/**
 * The plan of the owner.
 *
 * The plan is read on the server, never taken from the client (§9). The
 * accounts row is created when the owner signs in; without one the plan is
 * the default, free.
 */
export async function getOwnerPlan(client: SupabaseClient, ownerId: string): Promise<Plan> {
  const { data, error } = await client
    .from("accounts")
    .select("plan")
    .eq("clerk_user_id", ownerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read the plan: ${error.message}`);
  }

  const plan = (data as { plan?: Plan } | null)?.plan;
  return plan === "pro" ? "pro" : "free";
}

/**
 * Creates a project with the default widget config.
 *
 * The limit comes from the plan of the owner, so the server decides what is
 * allowed (§5, §9). The function generates the public key and writes the
 * widget config from DEFAULT_WIDGET_CONFIG.
 */
export async function createProject(
  client: SupabaseClient,
  ownerId: string,
  name: string,
  plan: Plan,
): Promise<Project> {
  const { data, error } = await client.rpc("create_project", {
    p_owner_id: ownerId,
    p_name: name,
    p_max_projects: PLAN_LIMITS[plan].projects,
    p_widget_config: DEFAULT_WIDGET_CONFIG,
  });

  if (error) {
    if (error.code === "PT001") {
      throw new ProjectsError("limit_reached", limitReachedMessage(plan));
    }

    if (error.code === "PT004") {
      throw new ProjectsError("no_account", "This account is not set up yet.");
    }

    throw new Error(`Could not create the project: ${error.message}`);
  }

  return toProject(data as ProjectRow);
}

/**
 * Renames a project.
 *
 * Only the name is sent: the RLS policy and the column level grant on
 * public.projects mean nothing else can change anyway.
 *
 * Returns null when the project is not the owner's, so the route can answer
 * 404 without saying that it exists (§9).
 */
export async function renameProject(
  client: SupabaseClient,
  projectId: string,
  name: string,
): Promise<Project | null> {
  const { data, error } = await client
    .from("projects")
    .update({ name })
    .eq("id", projectId)
    .select(PROJECT_COLUMNS);

  if (error) {
    throw new Error(`Could not rename the project: ${error.message}`);
  }

  const row = ((data ?? []) as ProjectRow[])[0];
  return row ? toProject(row) : null;
}

/**
 * Deletes a project. Its widget config, sources, chunks, conversations and
 * messages go with it.
 *
 * Returns false when the project is not the owner's, so the route can answer
 * 404 without saying that it exists (§9).
 */
export async function deleteProject(client: SupabaseClient, projectId: string): Promise<boolean> {
  const { data, error } = await client.from("projects").delete().eq("id", projectId).select("id");

  if (error) {
    throw new Error(`Could not delete the project: ${error.message}`);
  }

  return ((data ?? []) as { id: string }[]).length > 0;
}
