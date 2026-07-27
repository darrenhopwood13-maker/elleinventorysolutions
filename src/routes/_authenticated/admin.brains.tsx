import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const REPORT_TYPES = ["Inventory", "Check In", "Check Out", "Update"] as const;
type ReportType = (typeof REPORT_TYPES)[number];

export const Route = createFileRoute("/_authenticated/admin/brains")({
  head: () => ({
    meta: [
      { title: "AI Brains — Elle Inventory Solutions" },
      { name: "description", content: "View, edit and version the AI prompts used to analyse photos." },
      { property: "og:title", content: "AI Brains" },
      { property: "og:description", content: "Manage per-report-type AI prompts." },
    ],
  }),
  component: AdminBrainsPage,
});

type Brain = {
  id: string;
  report_type: ReportType;
  prompt_content: string;
  version: number;
  updated_at: string;
};

function AdminBrainsPage() {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<ReportType>("Inventory");

  const { data: isAdmin, isLoading: checkingRole } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const { data: brains } = useQuery({
    queryKey: ["brains-all"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brains")
        .select("id, report_type, prompt_content, version, updated_at")
        .order("version", { ascending: false });
      if (error) throw error;
      return data as Brain[];
    },
  });

  const versions = useMemo(
    () => (brains ?? []).filter((b) => b.report_type === selectedType),
    [brains, selectedType],
  );
  const latest = versions[0];

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(latest?.prompt_content ?? "");
  }, [latest?.id]);

  async function saveNewVersion() {
    if (!draft.trim()) {
      toast.error("Prompt content cannot be empty.");
      return;
    }
    if (latest && draft === latest.prompt_content) {
      toast.info("No changes to save.");
      return;
    }
    setSaving(true);
    const nextVersion = (latest?.version ?? 0) + 1;
    const { error } = await supabase.from("brains").insert({
      report_type: selectedType,
      prompt_content: draft,
      version: nextVersion,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Saved ${selectedType} brain v${nextVersion}`);
    queryClient.invalidateQueries({ queryKey: ["brains-all"] });
  }

  function restoreVersion(v: Brain) {
    setDraft(v.prompt_content);
    toast.message(`Loaded v${v.version} into editor — click Save to publish as a new version.`);
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <p className="mx-auto max-w-3xl text-base text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-serif text-3xl font-medium text-foreground">Admins only</h1>
          <p className="mt-3 text-base text-muted-foreground">
            You need the admin role to manage AI brains.
          </p>
          <Button asChild variant="ghost" className="mt-6">
            <Link to="/dashboard">← Back to dashboard</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <Button asChild variant="ghost" className="mb-4 text-base">
          <Link to="/dashboard">← Back to dashboard</Link>
        </Button>

        <p className="text-xs font-medium uppercase tracking-[0.32em] text-muted-foreground">
          Admin
        </p>
        <h1 className="font-serif mt-2 text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
          AI Brains
        </h1>
        <span className="gold-rule mt-4" aria-hidden />
        <p className="mt-4 max-w-2xl text-base text-foreground/80">
          Each report type uses its own prompt. Saving creates a new version — the
          latest version is what runs during photo analysis. Previous versions are kept
          for reference and can be loaded back into the editor.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          {REPORT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={
                "rounded-full border px-4 py-2 text-sm font-medium transition-colors " +
                (selectedType === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-accent")
              }
            >
              {t}
              {brains?.some((b) => b.report_type === t) ? "" : " · not set"}
            </button>
          ))}
        </div>

        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-2xl text-foreground">
              {selectedType} prompt
            </h2>
            <p className="text-sm text-muted-foreground">
              {latest
                ? `Currently v${latest.version} · updated ${new Date(latest.updated_at).toLocaleString()}`
                : "No versions yet — this brain is missing."}
            </p>
          </div>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="mt-4 h-96 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-sm leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder={`Prompt for ${selectedType} reports…`}
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              onClick={saveNewVersion}
              disabled={saving}
              size="lg"
              className="h-12 px-6 text-base"
            >
              {saving ? "Saving…" : `Save as v${(latest?.version ?? 0) + 1}`}
            </Button>
            {latest ? (
              <Button
                variant="ghost"
                onClick={() => setDraft(latest.prompt_content)}
                disabled={draft === latest.prompt_content}
              >
                Discard changes
              </Button>
            ) : null}
          </div>
        </section>

        <section className="mt-8">
          <h3 className="font-serif text-xl text-foreground">Version history</h3>
          {versions.length === 0 ? (
            <p className="mt-2 text-base text-muted-foreground">No versions yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-base font-medium text-foreground">
                      v{v.version}
                      {v.id === latest?.id ? (
                        <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                          current
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(v.updated_at).toLocaleString()} ·{" "}
                      {v.prompt_content.length.toLocaleString()} chars
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => restoreVersion(v)}>
                    Load into editor
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}