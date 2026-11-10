import type { Plan } from "@askwell/shared";
import { GlassPanel } from "../glass-panel";

/**
 * The Pro parts, for an owner on the Free plan (docs/project.md §6.8).
 *
 * The plan is read on the server and this is rendered there, so the browser
 * never decides what the owner may do (§9). The script tag itself is not a Pro
 * feature: the widget works on every plan (§5), so the note points at the
 * customizer and gates nothing here.
 */
export function PlanNote({ plan }: { plan: Plan }) {
  if (plan !== "free") {
    return null;
  }

  return (
    <GlassPanel className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">The script tag works on every plan.</p>
      <p className="text-sm leading-relaxed text-muted">
        Changing the button&apos;s colour, its position and its label is part of Customize, and that
        part is Pro. Upgrade to unlock it — the tag above needs nothing.
      </p>
    </GlassPanel>
  );
}
