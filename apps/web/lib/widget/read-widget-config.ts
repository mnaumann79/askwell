import { DEFAULT_WIDGET_CONFIG, widgetConfigSchema, type WidgetConfig } from "@askwell/shared";
import { createServiceClient } from "../supabase/service";

/**
 * The config of the widget of one project (docs/project.md §6.5, §8).
 *
 * The route is public: the caller's only key is the public key, so the read
 * goes through the service client. There is no session to build an owner
 * client from, and the public key identifies the project and grants no owner
 * rights (§9) - the read reaches the project's config and its plan, and
 * nothing else.
 *
 * The plan is read on the server, from the owner's own account row, and it
 * is what the answer is built from: Free gets the defaults and the badge
 * (§5). The plan is never taken from the request.
 */

/** The columns of the project the config belongs to. */
const PROJECT_COLUMNS = "id, owner_id";

/** The columns of the widget config. */
const CONFIG_COLUMNS = "button_color, position, label, animation, header_text, show_badge";

type ProjectRow = {
  id: string;
  owner_id: string;
};

type WidgetConfigRow = {
  button_color: string;
  position: string;
  label: string;
  animation: string;
  header_text: string;
  show_badge: boolean;
};

function isProjectRow(value: unknown): value is ProjectRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as Record<string, unknown>;

  return typeof row.id === "string" && typeof row.owner_id === "string";
}

function isWidgetConfigRow(value: unknown): value is WidgetConfigRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as Record<string, unknown>;

  return (
    typeof row.button_color === "string" &&
    typeof row.position === "string" &&
    typeof row.label === "string" &&
    typeof row.animation === "string" &&
    typeof row.header_text === "string" &&
    typeof row.show_badge === "boolean"
  );
}

/**
 * Maps the stored row to the config the API answers with.
 *
 * The shared schema is the contract, so the row is checked against it rather
 * than assumed to fit.
 */
function toWidgetConfig(value: unknown): WidgetConfig {
  if (!isWidgetConfigRow(value)) {
    throw new Error("The widget config row is not the shape we expect.");
  }

  const config = widgetConfigSchema.safeParse({
    buttonColor: value.button_color,
    position: value.position,
    label: value.label,
    animation: value.animation,
    headerText: value.header_text,
    showBadge: value.show_badge,
  });

  if (!config.success) {
    throw new Error(`The widget config row does not match the contract: ${config.error.message}`);
  }

  return config.data;
}

/**
 * The config of the widget of the project with this public key.
 *
 * `null` means there is no such project: the route answers 404 and the
 * loader renders nothing (§6.5).
 */
export async function readWidgetConfig(publicKey: string): Promise<WidgetConfig | null> {
  const client = createServiceClient();

  const { data: project, error: projectError } = await client
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("public_key", publicKey)
    .maybeSingle();

  if (projectError) {
    throw new Error(`Could not read the project: ${projectError.message}`);
  }

  if (!project) {
    return null;
  }

  if (!isProjectRow(project)) {
    throw new Error("The project row is not the shape we expect.");
  }

  const { data: account, error: accountError } = await client
    .from("accounts")
    .select("plan")
    .eq("clerk_user_id", project.owner_id)
    .maybeSingle();

  if (accountError) {
    throw new Error(`Could not read the account: ${accountError.message}`);
  }

  // The account row is written when the owner signs in, so a project whose
  // owner has no account row means the data is broken. A plan we do not know
  // is not one we guess.
  if (!account || (account.plan !== "free" && account.plan !== "pro")) {
    throw new Error("The account row does not carry a plan we know.");
  }

  if (account.plan === "free") {
    // Free gets the defaults and the badge (§5): the customizer is Pro
    // only, so a Free project has nothing else to show.
    return DEFAULT_WIDGET_CONFIG;
  }

  const { data: config, error: configError } = await client
    .from("widget_configs")
    .select(CONFIG_COLUMNS)
    .eq("project_id", project.id)
    .maybeSingle();

  if (configError) {
    throw new Error(`Could not read the widget config: ${configError.message}`);
  }

  if (!config) {
    throw new Error("The project has no widget config.");
  }

  return toWidgetConfig(config);
}
