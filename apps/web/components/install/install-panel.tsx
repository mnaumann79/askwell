"use client";

import { useEffect, useState } from "react";
import type { Project } from "@askwell/shared";
import { StateMessage } from "../state-message";
import { fetchProjects } from "./projects";
import { InstallView } from "./install-view";

/**
 * The install panel (docs/project.md §6.9).
 *
 * The owner's projects come from the route that answers them. The route reads
 * them through the owner client, so RLS scopes them to the signed-in owner
 * (§9) — the page asks for them and never filters them itself.
 */
type PanelState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; projects: Project[]; selectedId: string };

export function InstallPanel() {
  const [state, setState] = useState<PanelState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetchProjects()
      .then((projects) => {
        if (cancelled) {
          return;
        }

        setState({
          status: "ready",
          projects,
          selectedId: projects[0]?.id ?? "",
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setState({
          status: "error",
          message: error instanceof Error ? error.message : "The projects could not be read.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <StateMessage tone="loading" title="Loading your projects…" />;
  }

  if (state.status === "error") {
    return (
      <StateMessage
        tone="error"
        title="Your projects could not be loaded"
        description={state.message}
      />
    );
  }

  if (state.projects.length === 0) {
    return (
      <StateMessage
        tone="empty"
        title="No projects yet"
        description="The widget belongs to a project. Create one first, then come back for the script tag."
      />
    );
  }

  return (
    <InstallView
      projects={state.projects}
      selectedId={state.selectedId}
      onSelect={(projectId) => setState({ ...state, selectedId: projectId })}
    />
  );
}
