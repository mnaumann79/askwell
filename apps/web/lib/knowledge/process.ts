import { knowledgeSourceSchema, type KnowledgeSource } from "@askwell/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refusalFrom } from "../projects/plan-refusal";
import { createOwnerClient } from "../supabase/owner";
import { createServiceClient } from "../supabase/service";
import { chunkText } from "./chunk";

/**
 * The knowledge lane on the server (docs/project.md §6.4, §7, §9).
 *
 * Three things happen here: the ownership check, the reservation of a source
 * and the pipeline that turns a text into chunks.
 *
 * The OpenAI key is read from the environment here and nowhere else, so it
 * never reaches the browser (§9). The chunks are written with the service
 * client: the owner may read the chunks, but not write them (§7).
 */

/** The model the embeddings come from (§3). */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** The width of the `embedding` column: 1,536 dimensions (§7). */
export const EMBEDDING_DIMENSIONS = 1536;

/** Where the embeddings come from. */
const EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

/** How many texts go into one request. */
const EMBEDDING_BATCH_SIZE = 64;

/** The `knowledge_sources` row the lane reads and writes (§7). */
export type KnowledgeSourceRow = {
  id: string;
  project_id: string;
  title: string;
  type: string;
  status: string;
  created_at: string;
};

function isKnowledgeSourceRow(value: unknown): value is KnowledgeSourceRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as Record<string, unknown>;

  return (
    typeof row.id === "string" &&
    typeof row.project_id === "string" &&
    typeof row.title === "string" &&
    typeof row.type === "string" &&
    typeof row.status === "string" &&
    typeof row.created_at === "string"
  );
}

/**
 * Maps a `knowledge_sources` row to the shape the API answers with.
 *
 * The shared schema is the contract, so the row is checked against it instead
 * of assumed to fit.
 */
export function toKnowledgeSource(value: unknown): KnowledgeSource {
  if (!isKnowledgeSourceRow(value)) {
    throw new Error("The knowledge source row is not the shape we expect.");
  }

  const source = knowledgeSourceSchema.safeParse({
    id: value.id,
    projectId: value.project_id,
    title: value.title,
    type: value.type,
    status: value.status,
    createdAt: value.created_at,
  });

  if (!source.success) {
    throw new Error(
      `The knowledge source row does not match the contract: ${source.error.message}`,
    );
  }

  return source.data;
}

/**
 * The project, when it is the owner's own.
 *
 * The read goes through the owner client, so RLS scopes it to the signed-in
 * owner: another owner's project is not reachable, and the lane does not
 * filter by owner itself (§9). `null` means there is no such project for
 * this owner, and the route answers 404 - the same answer as for a project
 * that does not exist, so nothing leaks.
 */
export async function getOwnedProject(projectId: string): Promise<string | null> {
  const client = await createOwnerClient();

  const { data, error } = await client
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read the project: ${error.message}`);
  }

  if (data === null) {
    return null;
  }

  const id = (data as { id?: unknown }).id;

  if (typeof id !== "string") {
    throw new Error("The project row is not the shape we expect.");
  }

  return id;
}

/**
 * Reserves a source for a pasted text and counts it against the plan limit.
 *
 * The counting is done by `reserve_knowledge_source`, which locks the project
 * row, so two requests cannot both pass the limit. The limit comes from the
 * server - `PLAN_LIMITS` - and is never taken from the client (§9).
 *
 * The call goes through the service client: the function is granted to
 * `service_role` only, and `authenticated` has no INSERT on
 * `knowledge_sources` (§7).
 */
export async function reserveKnowledgeSource(input: {
  projectId: string;
  title: string;
  maxSources: number;
}): Promise<KnowledgeSourceRow> {
  const { data, error } = await createServiceClient().rpc("reserve_knowledge_source", {
    p_project_id: input.projectId,
    p_title: input.title,
    p_type: "text",
    // A pasted text has no file behind it.
    p_storage_key: null,
    p_max_sources: input.maxSources,
  });

  if (error) {
    throw refusalFrom(error, "Could not add the source.");
  }

  const row: unknown = data;

  if (!isKnowledgeSourceRow(row)) {
    throw new Error("The reserved source row is not the shape we expect.");
  }

  return row;
}

/**
 * Embeds the texts with OpenAI.
 *
 * The key is read from the environment and sent in the header; it never
 * leaves the server (§9). The embeddings are the width of the `embedding`
 * column, so a chunk that is stored fits the column.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY;

  if (!key) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const embeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);

    embeddings.push(...(await embedBatch(key, batch)));
  }

  return embeddings;
}

/** One request to the embeddings endpoint. */
async function embedBatch(key: string, inputs: string[]): Promise<number[][]> {
  const response = await fetch(EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      input: inputs,
    }),
  });

  if (!response.ok) {
    throw new Error(`The embeddings request failed with the status ${response.status}.`);
  }

  const body: unknown = await response.json();
  const embeddings = readEmbeddings(body);

  if (embeddings.length !== inputs.length) {
    throw new Error(
      `The embeddings request answered ${embeddings.length} embeddings for ${inputs.length} texts.`,
    );
  }

  return embeddings;
}

/**
 * Reads the embeddings of an answer.
 *
 * The items carry the index of the text they belong to, so they are put back
 * in order: a batch that comes back in another order still lines up with the
 * texts.
 */
function readEmbeddings(body: unknown): number[][] {
  if (typeof body !== "object" || body === null) {
    throw new Error("The embeddings answer is not the shape we expect.");
  }

  const data = (body as { data?: unknown }).data;

  if (!Array.isArray(data)) {
    throw new Error("The embeddings answer carries no data.");
  }

  const items = data.map((item, position) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("The embeddings answer carries an item we do not know.");
    }

    const { index, embedding } = item as { index?: unknown; embedding?: unknown };

    if (!Array.isArray(embedding) || embedding.some((value) => typeof value !== "number")) {
      throw new Error("An embedding of the answer is not a list of numbers.");
    }

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `An embedding of the answer has ${embedding.length} dimensions, not ${EMBEDDING_DIMENSIONS}.`,
      );
    }

    return { index: typeof index === "number" ? index : position, embedding };
  });

  return items
    .sort((left, right) => left.index - right.index)
    .map((item) => item.embedding as number[]);
}

/** The embedding as pgvector takes it: the numbers between brackets. */
function toVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/** Sets the status of a source. */
async function setSourceStatus(
  client: SupabaseClient,
  sourceId: string,
  status: string,
): Promise<void> {
  const { error } = await client.from("knowledge_sources").update({ status }).eq("id", sourceId);

  if (error) {
    throw new Error(`Could not set the status of the source: ${error.message}`);
  }
}

/** Removes the chunks of a source. */
async function deleteChunks(client: SupabaseClient, sourceId: string): Promise<void> {
  const { error } = await client.from("knowledge_chunks").delete().eq("source_id", sourceId);

  if (error) {
    throw new Error(`Could not remove the chunks of the source: ${error.message}`);
  }
}

/**
 * The pipeline: the text -> the chunks -> the embeddings -> the rows.
 *
 * The source is `processing` while the pipeline runs, `ready` when the chunks
 * are stored and `failed` when it throws (§6.4). A failed source keeps no
 * chunks: half a source would be found by the retrieval and would answer
 * with the wrong text.
 */
export async function processKnowledgeSource(input: {
  projectId: string;
  source: KnowledgeSourceRow;
  content: string;
}): Promise<KnowledgeSource> {
  const client = createServiceClient();
  const sourceId = input.source.id;

  await setSourceStatus(client, sourceId, "processing");

  try {
    const chunks = chunkText(input.content);

    if (chunks.length === 0) {
      throw new Error("The text has no words to store.");
    }

    const embeddings = await embedTexts(chunks);

    const rows = chunks.map((content, index) => {
      const embedding = embeddings[index];

      if (!embedding) {
        throw new Error(`There is no embedding for the chunk ${index}.`);
      }

      return {
        project_id: input.projectId,
        source_id: sourceId,
        content,
        embedding: toVector(embedding),
      };
    });

    const { error } = await client.from("knowledge_chunks").insert(rows);

    if (error) {
      throw new Error(`Could not store the chunks: ${error.message}`);
    }

    await setSourceStatus(client, sourceId, "ready");

    return toKnowledgeSource({ ...input.source, status: "ready" });
  } catch (error) {
    try {
      await deleteChunks(client, sourceId);
      await setSourceStatus(client, sourceId, "failed");
    } catch (cleanupError) {
      // The failure of the pipeline is the one the caller has to hear about.
      console.error("Could not clean up the failed source", cleanupError);
    }

    throw error;
  }
}
