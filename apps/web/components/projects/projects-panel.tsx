"use client";

import { useEffect, useState } from "react";
import type { Project } from "@askwell/shared";
import { StateMessage } from "../state-message";
import { listProjects } from "./project-api";
import { ProjectsView } from "./projects-view";

/**
 * The projects panel (docs/project.md §6.3).
 *
 * The owner's projects come from the route that answers them, and the route
 * reads them through the owner client, so RLS scopes them to the signed-in
 * owner (§9). The page asks for them and never filters them itself.
 */
type PanelState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; projects: Project[] };

export function ProjectsPanel({ limit }: { limit: number }) {
  const [state, setState] = useState<PanelState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    listProjects()
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setState({ status: "error", message: result.message });
          return;
        }

        setState({ status: "ready", projects: result.data.projects });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Your projects could not be read.",
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

  const projects = state.projects;

  return (
    <ProjectsView
      projects={projects}
      limit={limit}
      onCreated={(project) => setState({ status: "ready", projects: [...projects, project] })}
      onRenamed={(project) =>
        setState({
          status: "ready",
          projects: projects.map((entry) => (entry.id === project.id ? project : entry)),
        })
      }
      onDeleted={(id) =>
        setState({
          status: "ready",
          projects: projects.filter((entry) => entry.id !== id),
        })
      }
    />
  );
}
