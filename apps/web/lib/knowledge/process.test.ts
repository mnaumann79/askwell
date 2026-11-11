import type { SupabaseClientOptions } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  actAs,
  closeTestDb,
  createTestDb,
  query,
  stubSupabaseRoles,
} from "../../../../packages/db/supabase-pglite";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  processKnowledgeSource,
  type KnowledgeSourceRow,
} from "./process";

const { createClientMock, authMock, getTokenMock } = vi.hoisted(() => ({
  createClientMock:
    vi.fn<(url: string, key: string, options: SupabaseClientOptions<"public">) => unknown>(),
  authMock: vi.fn(),
  getTokenMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
// `server-only` throws outside a React Server Component. Next.js resolves it
// to an empty module there; the test needs the same.
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));

const URL = "https://project-ref.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_a_publishable_value";
const SECRET_KEY = "sb_secret_a_secret_value";
const OPENAI_KEY = "an-openai-key";

const PROJECT_ID = "3f2b1a44-9c1e-4a5b-8d2e-1f0a2b3c4d5e";
const SOURCE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const SOURCE: KnowledgeSourceRow = {
  id: SOURCE_ID,
  project_id: PROJECT_ID,
  title: "Our prices",
  type: "text",
  status: "uploading",
  created_at: "2026-11-11T09:30:00+00:00",
};

type FakeCall = {
  table: string;
  op: "select" | "update" | "insert" | "delete";
  payload?: unknown;
  filters: [string, unknown][];
};

type FakeResult = { data: unknown; error: { message: string } | null };

type FakeBuilder = {
  select(columns: string): FakeBuilder;
  update(payload: unknown): FakeBuilder;
  insert(payload: unknown): FakeBuilder;
  delete(): FakeBuilder;
  eq(column: string, value: unknown): FakeBuilder;
  maybeSingle(): Promise<FakeResult>;
  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
};

/** A stand-in for the Supabase client that records the queries it is given. */
function fakeClient(calls: FakeCall[]) {
  const client = {
    from(table: string): FakeBuilder {
      const call: FakeCall = { table, op: "select", filters: [] };
      calls.push(call);

      const builder: FakeBuilder = {
        select() {
          return builder;
        },
        update(payload) {
          call.op = "update";
          call.payload = payload;
          return builder;
        },
        insert(payload) {
          call.op = "insert";
          call.payload = payload;
          return builder;
        },
        delete() {
          call.op = "delete";
          return builder;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        then(onfulfilled, onrejected) {
          return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
        },
      };

      return builder;
    },
  };

  return client;
}

/** The calls the client was given for one table. */
function callsTo(calls: FakeCall[], table: string): FakeCall[] {
  return calls.filter((call) => call.table === table);
}

/** The embeddings endpoint answers one embedding per text. */
function stubEmbeddings(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { input: string[] };

    return new Response(
      JSON.stringify({
        data: body.input.map((_text, index) => ({
          index,
          embedding: Array.from(
            { length: EMBEDDING_DIMENSIONS },
            (_value, at) => (index + at) / 1000,
          ),
        })),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

describe("processKnowledgeSource", () => {
  const calls: FakeCall[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
    process.env.SUPABASE_SECRET_KEY = SECRET_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    getTokenMock.mockResolvedValue("clerk.session.token");
    authMock.mockResolvedValue({ userId: "user_123", getToken: getTokenMock });
    createClientMock.mockImplementation(() => fakeClient(calls));
    stubEmbeddings();
  });

  it("embeds the chunks with text-embedding-3-small", async () => {
    await processKnowledgeSource({
      projectId: PROJECT_ID,
      source: SOURCE,
      content: "The starter plan costs 10 euros a month.",
    });

    const fetchMock = vi.mocked(fetch);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as { model: string; dimensions: number };

    expect(body.model).toBe(EMBEDDING_MODEL);
    expect(body.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it("sends the key in the header and nowhere else", async () => {
    await processKnowledgeSource({
      projectId: PROJECT_ID,
      source: SOURCE,
      content: "The starter plan costs 10 euros a month.",
    });

    const fetchMock = vi.mocked(fetch);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;

    expect(headers.Authorization).toBe(`Bearer ${OPENAI_KEY}`);

    const insert = callsTo(calls, "knowledge_chunks")[0];
    const rows = insert?.payload as { content: string; embedding: string }[];

    expect(JSON.stringify(rows)).not.toContain(OPENAI_KEY);
  });

  it("stores one row per chunk, with an embedding of the width of the column", async () => {
    const content = `${"a".repeat(600)}\n\n${"b".repeat(600)}\n\n${"c".repeat(600)}`;

    await processKnowledgeSource({ projectId: PROJECT_ID, source: SOURCE, content });

    const insert = callsTo(calls, "knowledge_chunks")[0];
    const rows = insert?.payload as { content: string; embedding: string; project_id: string }[];

    expect(rows.length).toBeGreaterThan(1);

    for (const row of rows) {
      expect(row.embedding.split(",")).toHaveLength(EMBEDDING_DIMENSIONS);
      expect(row.project_id).toBe(PROJECT_ID);
    }
  });

  it("sets the source to processing and then to ready", async () => {
    const source = await processKnowledgeSource({
      projectId: PROJECT_ID,
      source: SOURCE,
      content: "The starter plan costs 10 euros a month.",
    });

    const statuses = callsTo(calls, "knowledge_sources").map(
      (call) => (call.payload as { status: string }).status,
    );

    expect(statuses).toEqual(["processing", "ready"]);
    expect(source.status).toBe("ready");
  });

  it("marks the source failed and removes the chunks when the pipeline throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );

    await expect(
      processKnowledgeSource({
        projectId: PROJECT_ID,
        source: SOURCE,
        content: "The starter plan costs 10 euros a month.",
      }),
    ).rejects.toThrow(/embeddings request failed/);

    const statuses = callsTo(calls, "knowledge_sources").map(
      (call) => (call.payload as { status: string }).status,
    );

    expect(statuses).toEqual(["processing", "failed"]);
    expect(callsTo(calls, "knowledge_chunks").map((call) => call.op)).toContain("delete");
  });
});

describe("the knowledge lane on the database", () => {
  const OWNER = "owner-a";

  let db: Awaited<ReturnType<typeof createTestDb>>;

  /** The vector the pipeline writes: 1,536 dimensions. */
  const vector = `[${new Array<number>(EMBEDDING_DIMENSIONS).fill(0).join(",")}]`;

  /** A project of the owner, with a public key of its own. */
  async function createProject(name: string): Promise<string> {
    const projects = await query<{ id: string }>(
      db,
      "insert into public.projects (owner_id, name, public_key) values ($1, $2, $3) returning id",
      [OWNER, name, `pk_${name.replace(/\W/g, "").toLowerCase().padEnd(32, "0").slice(0, 32)}`],
    );

    const project = projects[0];

    if (!project) {
      throw new Error("The project was not created.");
    }

    return project.id;
  }

  beforeAll(async () => {
    db = await createTestDb();
    await stubSupabaseRoles(db);
    await applyMigrations(db);
    await actAs(db, "service_role");
    await db.query("insert into public.accounts (clerk_user_id) values ($1)", [OWNER]);
  }, 60_000);

  afterAll(async () => {
    await closeTestDb(db);
  });

  it("stores an embedding of 1,536 dimensions in the column", async () => {
    const projectId = await createProject("Dimensions");
    const sources = await query<{ id: string }>(
      db,
      "select id from public.reserve_knowledge_source($1, 'Our prices', 'text', null, 3)",
      [projectId],
    );
    const sourceId = sources[0]?.id;

    await db.query(
      "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, 'A chunk', $3::extensions.vector)",
      [projectId, sourceId, vector],
    );

    const chunks = await query<{ dims: number }>(
      db,
      "select extensions.vector_dims(embedding) as dims from public.knowledge_chunks where source_id = $1",
      [sourceId],
    );

    expect(chunks[0]?.dims).toBe(EMBEDDING_DIMENSIONS);
  });

  it("counts the sources of the plan and refuses the one that is too many", async () => {
    const projectId = await createProject("Limit");
    const sources = await query<{ id: string }>(
      db,
      "select id from public.reserve_knowledge_source($1, 'One', 'text', null, 1)",
      [projectId],
    );

    expect(sources[0]?.id).toBeDefined();

    let refusal: { code?: string; hint?: string } | null = null;

    try {
      await query(
        db,
        "select id from public.reserve_knowledge_source($1, 'Two', 'text', null, 1)",
        [projectId],
      );
    } catch (error) {
      refusal = error as { code?: string; hint?: string };
    }

    expect(refusal?.code).toBe("P0001");
    expect(refusal?.hint).toBe("plan_limit_knowledge");
  });

  it("gives the retrieval the chunks of a ready source only", async () => {
    const projectId = await createProject("Retrieval");
    const sources = await query<{ id: string }>(
      db,
      "select id from public.reserve_knowledge_source($1, 'Ready', 'text', null, 25)",
      [projectId],
    );
    const sourceId = sources[0]?.id;

    await db.query(
      "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, 'The chunk of a ready source', $3::extensions.vector)",
      [projectId, sourceId, vector],
    );

    // A source that is still processing is not found by the retrieval.
    await db.query("update public.knowledge_sources set status = 'processing' where id = $1", [
      sourceId,
    ]);

    const processing = await query<{ content: string }>(
      db,
      "select content from public.match_chunks($1::uuid, $2::extensions.vector, 5)",
      [projectId, vector],
    );

    expect(processing).toHaveLength(0);

    await db.query("update public.knowledge_sources set status = 'ready' where id = $1", [
      sourceId,
    ]);

    const ready = await query<{ content: string }>(
      db,
      "select content from public.match_chunks($1::uuid, $2::extensions.vector, 5)",
      [projectId, vector],
    );

    expect(ready.map((chunk) => chunk.content)).toContain("The chunk of a ready source");
  });
});
