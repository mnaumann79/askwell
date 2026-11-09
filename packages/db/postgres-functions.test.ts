import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  applyMigrations,
  closeTestDb,
  createTestDb,
  query,
  stubSupabaseRoles,
} from "./supabase-pglite";

const OWNER = "owner-a";
const OTHER = "owner-b";

// The values DEFAULT_WIDGET_CONFIG holds in @askwell/shared. The shared
// package is not on this branch yet, so they are spelled out here.
const WIDGET_CONFIG = {
  buttonColor: "#111111",
  position: "bottom-right",
  label: "Chat",
  animation: "fade",
  headerText: "Askwell",
  showBadge: true,
};

const CONFIG = JSON.stringify(WIDGET_CONFIG);

let db: PGlite;

function vectorLiteral(position: number, value: number): string {
  const values = new Array<number>(1536).fill(0);
  values[position] = value;
  return `[${values.join(",")}]`;
}

async function createProject(
  ownerId: string,
  name: string,
  maxProjects: number,
): Promise<{ id: string; public_key: string }> {
  const rows = await query<{ id: string; public_key: string }>(
    db,
    "select id, public_key from public.create_project($1, $2, $3, $4)",
    [ownerId, name, maxProjects, CONFIG],
  );
  const project = rows[0];
  if (!project) {
    throw new Error("create_project returned nothing");
  }
  return project;
}

describe("the postgres functions", () => {
  beforeAll(async () => {
    db = await createTestDb();
    await stubSupabaseRoles(db);
    await applyMigrations(db);
    await actAs(db, "service_role");
    await db.query("insert into public.accounts (clerk_user_id) values ($1), ($2)", [OWNER, OTHER]);
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  describe("create_project", () => {
    it("creates a project with a public key and the given widget config", async () => {
      const project = await createProject(OWNER, "Alpha", 5);

      expect(project.public_key).toMatch(/^pk_[0-9a-f]{32}$/);

      const config = await query<{
        button_color: string;
        position: string;
        label: string;
        animation: string;
        header_text: string;
        show_badge: boolean;
      }>(db, "select * from public.widget_configs where project_id = $1", [project.id]);

      expect(config[0]).toEqual({
        project_id: project.id,
        button_color: WIDGET_CONFIG.buttonColor,
        position: WIDGET_CONFIG.position,
        label: WIDGET_CONFIG.label,
        animation: WIDGET_CONFIG.animation,
        header_text: WIDGET_CONFIG.headerText,
        show_badge: WIDGET_CONFIG.showBadge,
      });
    });

    it("refuses when the plan allows no more projects", async () => {
      await expect(createProject(OWNER, "Beta", 1)).rejects.toThrow(/project limit reached/);
    });

    it("refuses when the owner has no account", async () => {
      await expect(createProject("owner-without-account", "Gamma", 5)).rejects.toThrow(
        /no account for owner/,
      );
    });

    it("does not let two calls take the last slot", async () => {
      const first = await createProject(OTHER, "First", 1);
      expect(first.id).toBeTruthy();

      await expect(createProject(OTHER, "Second", 1)).rejects.toThrow(/project limit reached/);

      const projects = await query<{ id: string }>(
        db,
        "select id from public.projects where owner_id = $1",
        [OTHER],
      );
      expect(projects).toHaveLength(1);
    });

    it("counts the projects of the caller's own transaction", async () => {
      await db.query("insert into public.accounts (clerk_user_id) values ('owner-c')", []);
      await db.exec("begin");
      await db.query(
        "insert into public.projects (owner_id, name, public_key) values ('owner-c', 'pending', 'pk_pending_c')",
      );

      // The function runs in the caller's transaction, so it sees the row
      // above and the last slot is taken.
      await expect(createProject("owner-c", "Another", 1)).rejects.toThrow(/project limit reached/);

      await db.exec("rollback");
    });

    it("may only be run by the server", async () => {
      await actAs(db, "authenticated", { sub: OWNER });
      await expect(createProject(OWNER, "Hijack", 5)).rejects.toThrow(/permission denied/);

      await actAs(db, "anon");
      await expect(createProject(OWNER, "Hijack", 5)).rejects.toThrow(/permission denied/);

      await actAs(db, "service_role");
    });
  });

  describe("reserve_knowledge_source", () => {
    let projectId: string;

    beforeAll(async () => {
      const project = await createProject(OWNER, "Knowledge", 5);
      projectId = project.id;
    });

    it("reserves a source as uploading", async () => {
      const rows = await query<{ id: string; status: string; storage_key: string }>(
        db,
        "select id, status, storage_key from public.reserve_knowledge_source($1, $2, $3, $4, $5)",
        [projectId, "Manual", "text", null, 3],
      );

      expect(rows[0]?.status).toBe("uploading");
      expect(rows[0]?.storage_key).toBeNull();
    });

    it("counts uploaded files and pasted text together", async () => {
      await db.query(
        "insert into public.knowledge_sources (project_id, title, type, storage_key, status) values ($1, 'File', 'pdf', 'storage/1.pdf', 'uploading')",
        [projectId],
      );

      const sources = await query<{ id: string }>(
        db,
        "select id from public.knowledge_sources where project_id = $1",
        [projectId],
      );
      expect(sources).toHaveLength(2);
    });

    it("refuses when the plan allows no more sources", async () => {
      await expect(
        query(db, "select id from public.reserve_knowledge_source($1, $2, $3, $4, $5)", [
          projectId,
          "One more",
          "text",
          null,
          2,
        ]),
      ).rejects.toThrow(/knowledge source limit reached/);
    });

    it("does not let two calls take the last slot", async () => {
      const other = await createProject(OTHER, "Knowledge", 5);

      await query(db, "select id from public.reserve_knowledge_source($1, $2, $3, $4, 1)", [
        other.id,
        "First",
        "text",
        null,
      ]);

      await expect(
        query(db, "select id from public.reserve_knowledge_source($1, $2, $3, $4, 1)", [
          other.id,
          "Second",
          "text",
          null,
        ]),
      ).rejects.toThrow(/knowledge source limit reached/);
    });

    it("may only be run by the server", async () => {
      await actAs(db, "authenticated", { sub: OWNER });
      await expect(
        query(db, "select id from public.reserve_knowledge_source($1, $2, $3, $4, $5)", [
          projectId,
          "Hijack",
          "text",
          null,
          5,
        ]),
      ).rejects.toThrow(/permission denied/);

      await actAs(db, "service_role");
    });
  });

  describe("consume_message", () => {
    let projectId: string;

    beforeAll(async () => {
      const project = await createProject(OWNER, "Chat", 5);
      projectId = project.id;
    });

    it("counts the message and returns the new count", async () => {
      const rows = await query<{ consume_message: number }>(
        db,
        "select public.consume_message($1, 100)",
        [projectId],
      );

      expect(rows[0]?.consume_message).toBe(1);

      const project = await query<{ messages_used: number }>(
        db,
        "select messages_used from public.projects where id = $1",
        [projectId],
      );
      expect(project[0]?.messages_used).toBe(1);
    });

    it("refuses at the quota and counts nothing", async () => {
      await expect(query(db, "select public.consume_message($1, 1)", [projectId])).rejects.toThrow(
        /message quota reached/,
      );

      const project = await query<{ messages_used: number }>(
        db,
        "select messages_used from public.projects where id = $1",
        [projectId],
      );
      expect(project[0]?.messages_used).toBe(1);
    });

    it("does not let two calls pass the quota", async () => {
      const other = await createProject(OTHER, "Chat", 5);

      const first = await query<{ consume_message: number }>(
        db,
        "select public.consume_message($1, 1)",
        [other.id],
      );
      expect(first[0]?.consume_message).toBe(1);

      await expect(query(db, "select public.consume_message($1, 1)", [other.id])).rejects.toThrow(
        /message quota reached/,
      );

      const project = await query<{ messages_used: number }>(
        db,
        "select messages_used from public.projects where id = $1",
        [other.id],
      );
      expect(project[0]?.messages_used).toBe(1);
    });

    it("starts a new month with a fresh count", async () => {
      await db.query(
        "update public.projects set messages_used = 7, period_start = date_trunc('month', now()) - interval '1 month' where id = $1",
        [projectId],
      );

      const rows = await query<{ consume_message: number }>(
        db,
        "select public.consume_message($1, 100)",
        [projectId],
      );

      expect(rows[0]?.consume_message).toBe(1);
    });

    it("may only be run by the server", async () => {
      await actAs(db, "authenticated", { sub: OWNER });
      await expect(
        query(db, "select public.consume_message($1, 100)", [projectId]),
      ).rejects.toThrow(/permission denied/);

      await actAs(db, "service_role");
    });
  });

  describe("save_chat_turn", () => {
    let projectId: string;

    beforeAll(async () => {
      const project = await createProject(OWNER, "Conversations", 5);
      projectId = project.id;
    });

    it("creates the conversation on the first message and writes both turns", async () => {
      const rows = await query<{ save_chat_turn: string }>(
        db,
        "select public.save_chat_turn(null, $1, $2, $3, $4)",
        [projectId, "visitor-1", "hello", "hi there"],
      );

      const conversationId = rows[0]?.save_chat_turn;
      expect(conversationId).toBeTruthy();

      const conversation = await query<{ project_id: string; visitor_id: string }>(
        db,
        "select project_id, visitor_id from public.conversations where id = $1",
        [conversationId],
      );
      expect(conversation[0]).toEqual({ project_id: projectId, visitor_id: "visitor-1" });

      const messages = await query<{ role: string; body: string }>(
        db,
        "select role, body from public.messages where conversation_id = $1 order by created_at",
        [conversationId],
      );
      expect(messages).toEqual([
        { role: "visitor", body: "hello" },
        { role: "bot", body: "hi there" },
      ]);
    });

    it("adds to an existing conversation", async () => {
      const existing = await query<{ id: string }>(
        db,
        "select id from public.conversations limit 1",
      );
      const conversationId = existing[0]?.id ?? "";

      const rows = await query<{ save_chat_turn: string }>(
        db,
        "select public.save_chat_turn($1, $2, $3, $4, $5)",
        [conversationId, projectId, "visitor-1", "again", "sure"],
      );

      expect(rows[0]?.save_chat_turn).toBe(conversationId);

      const messages = await query<{ id: string }>(
        db,
        "select id from public.messages where conversation_id = $1",
        [conversationId],
      );
      expect(messages).toHaveLength(4);
    });

    it("refuses a conversation that belongs to another project", async () => {
      const other = await createProject(OWNER, "Other conversations", 10);
      const conversation = await query<{ id: string }>(db, "select id from public.conversations limit 1");

      await expect(
        query(db, "select public.save_chat_turn($1, $2, $3, $4, $5)", [
          conversation[0]?.id ?? "",
          other.id,
          "visitor-9",
          "hello",
          "hi",
        ]),
      ).rejects.toThrow(/does not belong to project/);
    });

    it("may only be run by the server", async () => {
      await actAs(db, "authenticated", { sub: OWNER });
      await expect(
        query(db, "select public.save_chat_turn(null, $1, $2, $3, $4)", [
          projectId,
          "visitor-1",
          "hello",
          "hi",
        ]),
      ).rejects.toThrow(/permission denied/);

      await actAs(db, "service_role");
    });
  });

  describe("match_chunks", () => {
    let projectId: string;
    let otherProjectId: string;
    let readySourceId: string;
    let processingSourceId: string;

    beforeAll(async () => {
      const project = await createProject(OWNER, "Retrieval", 10);
      projectId = project.id;
      const other = await createProject(OWNER, "Other retrieval", 10);
      otherProjectId = other.id;

      const sources = await query<{ id: string }>(
        db,
        `insert into public.knowledge_sources (project_id, title, type, status)
         values ($1, 'Ready', 'text', 'ready'), ($1, 'Processing', 'text', 'processing')
         returning id`,
        [projectId],
      );
      readySourceId = sources[0]?.id ?? "";
      processingSourceId = sources[1]?.id ?? "";

      await db.query(
        `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
         values ($1, $2, 'the closest one', $3::extensions.vector),
                ($1, $2, 'a bit further away', $4::extensions.vector),
                ($1, $5, 'not ready yet', $3::extensions.vector),
                ($6, $7, 'another project', $3::extensions.vector)`,
        [
          projectId,
          readySourceId,
          vectorLiteral(0, 1),
          vectorLiteral(1, 1),
          processingSourceId,
          otherProjectId,
          readySourceId,
        ],
      );
    });

    it("returns the closest chunks of the ready sources of that project", async () => {
      const rows = await query<{ content: string; distance: number }>(
        db,
        "select content, distance from public.match_chunks($1, $2::extensions.vector, $3)",
        [projectId, vectorLiteral(0, 1), 5],
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]?.content).toBe("the closest one");
      expect(rows[0]?.distance).toBeLessThan(rows[1]?.distance ?? 1);
    });

    it("never returns a chunk of another project", async () => {
      const rows = await query<{ content: string }>(
        db,
        "select content from public.match_chunks($1, $2::extensions.vector, $3)",
        [otherProjectId, vectorLiteral(0, 1), 5],
      );

      expect(rows.map((row) => row.content)).not.toContain("the closest one");
    });

    it("never returns a chunk of a source that is not ready", async () => {
      const rows = await query<{ content: string }>(
        db,
        "select content from public.match_chunks($1, $2::extensions.vector, $3)",
        [projectId, vectorLiteral(0, 1), 5],
      );

      expect(rows.map((row) => row.content)).not.toContain("not ready yet");
    });

    it("returns at most the requested number of chunks", async () => {
      const rows = await query<{ content: string }>(
        db,
        "select content from public.match_chunks($1, $2::extensions.vector, $3)",
        [projectId, vectorLiteral(0, 1), 1],
      );

      expect(rows).toHaveLength(1);
    });

    it("may only be run by the server", async () => {
      await actAs(db, "authenticated", { sub: OWNER });
      await expect(
        query(db, "select content from public.match_chunks($1, $2::extensions.vector, $3)", [
          projectId,
          vectorLiteral(0, 1),
          5,
        ]),
      ).rejects.toThrow(/permission denied/);

      await actAs(db, "service_role");
    });
  });
});
