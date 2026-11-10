import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A test double for the Supabase client.
 *
 * It records what the routes ask the database and answers with what the test
 * wants. The builder is thenable, like the one from supabase-js, so the
 * routes can be tested without a database.
 */

export type RecordedCall = {
  operation: "select" | "update" | "delete" | "rpc";
  table?: string;
  columns?: string;
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
  order?: { column: string; ascending: boolean };
  args?: Record<string, unknown>;
  /** The name of the Postgres function, for an rpc call. */
  fn?: string;
};

export type FakeError = { message: string; code?: string };

export type FakeResult = {
  data?: unknown;
  error?: FakeError | null;
};

export type FakeHandlers = {
  select?: (call: RecordedCall) => FakeResult;
  update?: (call: RecordedCall) => FakeResult;
  delete?: (call: RecordedCall) => FakeResult;
  rpc?: (call: RecordedCall) => FakeResult;
};

export type FakeSupabase = {
  client: SupabaseClient;
  calls: RecordedCall[];
};

type Builder = Record<string, unknown>;

function createBuilder(
  call: RecordedCall,
  handlers: FakeHandlers,
  calls: RecordedCall[],
  single: { value: boolean },
): Builder {
  const builder: Builder = {};

  builder.select = (columns?: string) => {
    if (columns !== undefined) {
      call.columns = columns;
    }
    return builder;
  };

  builder.update = (values: Record<string, unknown>) => {
    call.operation = "update";
    call.values = values;
    return builder;
  };

  builder.delete = () => {
    call.operation = "delete";
    return builder;
  };

  builder.eq = (column: string, value: unknown) => {
    call.filters[column] = value;
    return builder;
  };

  builder.order = (column: string, options?: { ascending?: boolean }) => {
    call.order = { column, ascending: options?.ascending ?? true };
    return builder;
  };

  builder.maybeSingle = () => {
    single.value = true;
    return builder;
  };

  builder.then = (
    onFulfilled: (value: FakeResult) => unknown,
    onRejected: (reason: unknown) => unknown,
  ) => {
    calls.push(call);
    const handler = handlers[call.operation];
    const result = handler ? handler(call) : { data: [], error: null };
    const data =
      single.value && Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;

    return Promise.resolve({ ...result, data }).then(onFulfilled, onRejected);
  };

  return builder;
}

/** A Supabase client that records the calls and answers with the handlers. */
export function fakeSupabase(handlers: FakeHandlers = {}): FakeSupabase {
  const calls: RecordedCall[] = [];

  const client = {
    from(table: string) {
      return createBuilder({ operation: "select", table, filters: {} }, handlers, calls, {
        value: false,
      });
    },
    rpc(fn: string, args: Record<string, unknown>) {
      const call: RecordedCall = { operation: "rpc", filters: {}, args, fn };
      return createBuilder(call, handlers, calls, { value: false });
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}
