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

const TABLES = [
  "accounts",
  "conversations",
  "knowledge_chunks",
  "knowledge_sources",
  "messages",
  "projects",
  "widget_configs",
];

let db: PGlite;
let ownerProjectId: string;
let otherProjectId: string;

async function seed(): Promise<void> {
  await db.query("insert into public.accounts (clerk_user_id) values ($1), ($2)", [OWNER, OTHER]);

  const projects = await query<{ id: string; owner_id: string }>(
    db,
    `insert into public.projects (owner_id, name, public_key)
     values ($1, 'Alpha', 'pk_alpha'), ($2, 'Gamma', 'pk_gamma')
     returning id, owner_id`,
    [OWNER, OTHER],
  );

  ownerProjectId = projects[0]?.id ?? "";
  otherProjectId = projects[1]?.id ?? "";

  await db.query(
    `insert into public.widget_configs
       (project_id, button_color, position, label, animation, header_text, show_badge)
     values
       ($1, '#111111', 'bottom-right', 'Chat', 'fade', 'Askwell', true),
       ($2, '#111111', 'bottom-right', 'Chat', 'fade', 'Askwell', true)`,
    [ownerProjectId, otherProjectId],
  );

  const sources = await query<{ id: string; project_id: string }>(
    db,
    `insert into public.knowledge_sources (project_id, title, type, status)
     values ($1, 'Manual', 'text', 'ready'), ($2, 'Manual', 'text', 'ready')
     returning id, project_id`,
    [ownerProjectId, otherProjectId],
  );

  await db.query(
    "insert into public.knowledge_chunks (project_id, source_id, content) values ($1, $2, 'hello'), ($3, $4, 'hello')",
    [ownerProjectId, sources[0]?.id ?? "", otherProjectId, sources[1]?.id ?? ""],
  );

  const conversations = await query<{ id: string; project_id: string }>(
    db,
    `insert into public.conversations (project_id, visitor_id)
     values ($1, 'visitor-1'), ($2, 'visitor-2')
     returning id, project_id`,
    [ownerProjectId, otherProjectId],
  );

  await db.query(
    `insert into public.messages (conversation_id, role, body)
     values ($1, 'visitor', 'hi'), ($1, 'bot', 'hello'), ($2, 'visitor', 'hi')`,
    [conversations[0]?.id ?? "", conversations[1]?.id ?? ""],
  );
}

describe("the initial schema", () => {
  beforeAll(async () => {
    db = await createTestDb();
    await stubSupabaseRoles(db);
    await applyMigrations(db);
    await seed();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  describe("the tables", () => {
    it("has exactly the tables of the data model", async () => {
      const rows = await query<{ table_name: string }>(
        db,
        `select table_name from information_schema.tables
         where table_schema = 'public' order by table_name`,
      );

      expect(rows.map((row) => row.table_name)).toEqual(TABLES);
    });

    it("has exactly the columns of the data model", async () => {
      const rows = await query<{ table_name: string; column_name: string }>(
        db,
        `select table_name, column_name from information_schema.columns
         where table_schema = 'public' order by table_name, ordinal_position`,
      );

      const columns: Record<string, string[]> = {};
      for (const row of rows) {
        columns[row.table_name] = [...(columns[row.table_name] ?? []), row.column_name];
      }

      expect(columns).toEqual({
        accounts: ["clerk_user_id", "plan", "created_at"],
        conversations: ["id", "project_id", "visitor_id", "created_at"],
        knowledge_chunks: ["id", "project_id", "source_id", "content", "embedding"],
        knowledge_sources: [
          "id",
          "project_id",
          "title",
          "type",
          "storage_key",
          "status",
          "created_at",
        ],
        messages: ["id", "conversation_id", "role", "body", "created_at"],
        projects: [
          "id",
          "owner_id",
          "name",
          "public_key",
          "messages_used",
          "period_start",
          "created_at",
        ],
        widget_configs: [
          "project_id",
          "button_color",
          "position",
          "label",
          "animation",
          "header_text",
          "show_badge",
        ],
      });
    });

    it("indexes the embedding with hnsw", async () => {
      const rows = await query<{ indexdef: string }>(
        db,
        `select indexdef from pg_indexes where schemaname = 'public' and tablename = 'knowledge_chunks'`,
      );

      expect(rows.some((row) => row.indexdef.includes("hnsw"))).toBe(true);
    });
  });

  describe("the roles", () => {
    it("creates the three API roles", async () => {
      const rows = await query<{ rolname: string; rolbypassrls: boolean }>(
        db,
        `select rolname, rolbypassrls from pg_roles
         where rolname in ('anon', 'authenticated', 'service_role') order by rolname`,
      );

      expect(rows.map((row) => row.rolname)).toEqual(["anon", "authenticated", "service_role"]);
      expect(rows.find((row) => row.rolname === "service_role")?.rolbypassrls).toBe(true);
    });

    it("gives anon no table at all", async () => {
      const rows = await query<{ table_name: string }>(
        db,
        `select table_name from information_schema.role_table_grants
         where grantee = 'anon' and table_schema = 'public'`,
      );

      expect(rows).toHaveLength(0);
    });

    it("lets the API roles use the vector type", async () => {
      // The vector type lives in the extensions schema. Without the usage grant
      // a vector literal or a vector argument fails with "permission denied
      // for schema extensions".
      await actAs(db, "service_role");

      const cast = await query<{ embedding: string }>(
        db,
        "select '[1,2,3]'::extensions.vector as embedding",
      );
      expect(cast[0]?.embedding).toContain("1,2,3");

      const inserted = await query<{ id: string }>(
        db,
        `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
         select $1, s.id, 'with embedding',
           ('[' || array_to_string(array_fill(0::real, array[1536]), ',') || ']')::extensions.vector
         from public.knowledge_sources s where s.project_id = $1 limit 1
         returning id`,
        [ownerProjectId],
      );
      expect(inserted).toHaveLength(1);

      await db.query("delete from public.knowledge_chunks where id = $1", [inserted[0]?.id ?? ""]);
    });
  });

  describe("the functions", () => {
    it("makes only the two RLS helpers SECURITY DEFINER", async () => {
      const rows = await query<{ proname: string; prosecdef: boolean }>(
        db,
        `select p.proname, p.prosecdef from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' order by p.proname`,
      );

      const definers = rows.filter((row) => row.prosecdef).map((row) => row.proname);
      expect(definers).toEqual(["owned_conversation_ids", "owned_project_ids"]);
    });

    it("gives every function an empty search_path", async () => {
      const rows = await query<{ proname: string; proconfig: string[] | null }>(
        db,
        `select p.proname, p.proconfig from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' order by p.proname`,
      );

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.proconfig ?? []).toContainEqual(expect.stringMatching(/^search_path=/));
      }
    });
  });

  describe("anon", () => {
    it("cannot read any table", async () => {
      await actAs(db, "anon");

      for (const table of TABLES) {
        await expect(query(db, `select * from public.${table}`)).rejects.toThrow(
          /permission denied/,
        );
      }
    });

    it("cannot call the functions", async () => {
      await actAs(db, "anon");

      await expect(query(db, "select public.owned_project_ids()")).rejects.toThrow(
        /permission denied/,
      );
      await expect(query(db, "select * from public.owner_activity()")).rejects.toThrow(
        /permission denied/,
      );
    });

    it("cannot truncate", async () => {
      await actAs(db, "anon");

      await expect(query(db, "truncate public.projects")).rejects.toThrow(/permission denied/);
    });
  });

  describe("authenticated", () => {
    it("sees only its own projects", async () => {
      await actAs(db, "authenticated", { sub: OWNER });

      const rows = await query<{ id: string }>(db, "select id from public.projects");

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(ownerProjectId);
    });

    it("cannot see another tenant's project", async () => {
      await actAs(db, "authenticated", { sub: OWNER });

      const rows = await query<{ id: string }>(db, "select id from public.projects where id = $1", [
        otherProjectId,
      ]);

      expect(rows).toHaveLength(0);
    });

    it("sees only its own account row", async () => {
      await actAs(db, "authenticated", { sub: OWNER });

      const rows = await query<{ clerk_user_id: string }>(
        db,
        "select clerk_user_id from public.accounts",
      );

      expect(rows).toEqual([{ clerk_user_id: OWNER }]);
    });

    it("sees only the conversations and messages of its own projects", async () => {
      await actAs(db, "authenticated", { sub: OWNER });

      const conversations = await query<{ id: string }>(db, "select id from public.conversations");
      const messages = await query<{ id: string }>(db, "select id from public.messages");
      const chunks = await query<{ id: string }>(db, "select id from public.knowledge_chunks");

      expect(conversations).toHaveLength(1);
      expect(messages).toHaveLength(2);
      expect(chunks).toHaveLength(1);
    });

    it("can rename its own project", async () => {
      await actAs(db, "authenticated", { sub: OWNER });

      await query(db, "update public.projects set name = 'renamed' where id = $1", [
        ownerProjectId,
      ]);

      const rows = await query<{ name: string }>(
        db,
        "select name from public.projects where id = $1",
        [ownerProjectId],
      );
      expect(rows[0]?.name).toBe("renamed");
    });

    it("cannot rename another tenant's project", async () => {
      await actAs(db, "authenticated", { sub: OWNER });

      await query(db, "update public.projects set name = 'hijacked' where id = $1", [
        otherProjectId,
      ]);

      await db.exec("reset role");
      const rows = await query<{ name: string }>(
        db,
        "select name from public.projects where id = $1",
        [otherProjectId],
      );
      expect(rows[0]?.name).toBe("Gamma");
    });

    it("cannot change anything but the name of a project", async () => {
      await actAs(db, "authenticated", { sub: OWNER });

      await expect(
        query(db, "update public.projects set messages_used = 5 where id = $1", [ownerProjectId]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        query(db, "update public.accounts set plan = 'pro' where clerk_user_id = $1", [OWNER]),
      ).rejects.toThrow(/permission denied/);
    });

    it("cannot insert a project", async () => {
      await actAs(db, "authenticated", { sub: OWNER });

      await expect(
        query(
          db,
          "insert into public.projects (owner_id, name, public_key) values ($1, 'sneaky', 'pk_sneaky')",
          [OWNER],
        ),
      ).rejects.toThrow(/permission denied/);
    });

    it("can delete its own project", async () => {
      await db.exec("reset role");
      const project = await query<{ id: string }>(
        db,
        "insert into public.projects (owner_id, name, public_key) values ($1, 'temporary', 'pk_temporary') returning id",
        [OWNER],
      );
      const id = project[0]?.id ?? "";

      await actAs(db, "authenticated", { sub: OWNER });
      await query(db, "delete from public.projects where id = $1", [id]);

      await db.exec("reset role");
      const rows = await query<{ id: string }>(db, "select id from public.projects where id = $1", [
        id,
      ]);
      expect(rows).toHaveLength(0);
    });

    it("cannot delete another tenant's project", async () => {
      await actAs(db, "authenticated", { sub: OWNER });

      await query(db, "delete from public.projects where id = $1", [otherProjectId]);

      await db.exec("reset role");
      const rows = await query<{ id: string }>(db, "select id from public.projects where id = $1", [
        otherProjectId,
      ]);
      expect(rows).toHaveLength(1);
    });

    it("gets the project ids of its own projects", async () => {
      await actAs(db, "authenticated", { sub: OWNER });

      const rows = await query<{ owned_project_ids: string }>(
        db,
        "select public.owned_project_ids() as owned_project_ids",
      );

      expect(rows.map((row) => row.owned_project_ids)).toEqual([ownerProjectId]);
    });

    it("gets the conversation ids of its own projects", async () => {
      await actAs(db, "authenticated", { sub: OWNER });

      const rows = await query<{ owned_conversation_ids: string }>(
        db,
        "select public.owned_conversation_ids() as owned_conversation_ids",
      );

      expect(rows).toHaveLength(1);
    });

    it("gets its own dashboard numbers", async () => {
      await actAs(db, "authenticated", { sub: OWNER });

      const rows = await query<{ projects: number; conversations: number; messages: number }>(
        db,
        `select (projects)::int as projects, (conversations)::int as conversations, (messages)::int as messages
         from public.owner_activity()`,
      );

      expect(rows[0]).toEqual({ projects: 1, conversations: 1, messages: 2 });
    });

    it("gets the other tenant's dashboard numbers for the other tenant", async () => {
      await actAs(db, "authenticated", { sub: OTHER });

      const rows = await query<{ projects: number; conversations: number; messages: number }>(
        db,
        `select (projects)::int as projects, (conversations)::int as conversations, (messages)::int as messages
         from public.owner_activity()`,
      );

      expect(rows[0]).toEqual({ projects: 1, conversations: 1, messages: 1 });
    });

    it("cannot truncate", async () => {
      await actAs(db, "authenticated", { sub: OWNER });

      await expect(query(db, "truncate public.projects")).rejects.toThrow(/permission denied/);
    });
  });

  describe("service_role", () => {
    it("sees every row", async () => {
      await actAs(db, "service_role");

      const projects = await query<{ id: string }>(db, "select id from public.projects");
      const messages = await query<{ id: string }>(db, "select id from public.messages");

      expect(projects.length).toBeGreaterThanOrEqual(2);
      expect(messages).toHaveLength(3);
    });

    it("cannot truncate either", async () => {
      await actAs(db, "service_role");

      await expect(query(db, "truncate public.projects")).rejects.toThrow(/permission denied/);
    });
  });
});
