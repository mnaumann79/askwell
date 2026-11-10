import { publicKeySchema } from "@askwell/shared";
import { Panel } from "../../components/widget/panel";

/**
 * The panel, inside the iframe on the customer's website
 * (docs/project.md §6.5).
 *
 * The key comes from the URL: the loader opens `/embed?key=pk_…`. Only this
 * page may be framed by other sites — the headers that say so are Phase 6's
 * job, so the route is written to take them later.
 */
export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string | string[] }>;
}) {
  const params = await searchParams;
  const key = typeof params.key === "string" ? params.key : "";

  return <Panel publicKey={publicKeySchema.safeParse(key).success ? key : ""} />;
}
