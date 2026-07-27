import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your properties — Elle Inventory Solutions" },
      { name: "description", content: "Manage your property inventory reports." },
      { property: "og:title", content: "Your properties" },
      { property: "og:description", content: "Manage your property inventory reports." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");

  const { data: properties, isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, postcode, client_name, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!properties) return [];
    const term = q.trim().toLowerCase();
    if (!term) return properties;
    return properties.filter((p) =>
      [p.address, p.postcode, p.client_name ?? ""]
        .some((f) => f.toLowerCase().includes(term)),
    );
  }, [properties, q]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-4xl font-bold text-foreground">Your properties</h1>
          <Button variant="ghost" onClick={handleSignOut} className="text-base">
            Sign out
          </Button>
        </div>

        <div className="mt-8">
          <Button asChild size="lg" className="h-16 w-full text-xl">
            <Link to="/properties/new">+ New property</Link>
          </Button>
        </div>

        <div className="mt-8">
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search address, postcode or client"
            aria-label="Search properties"
            className="h-14 text-lg"
          />
        </div>

        <div className="mt-10 space-y-4">
          {isLoading ? (
            <p className="text-lg text-muted-foreground">Loading…</p>
          ) : filtered.length > 0 ? (
            filtered.map((p) => (
              <Link
                key={p.id}
                to="/properties/$id"
                params={{ id: p.id }}
                className="block rounded-lg border border-border bg-card p-5 transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <p className="text-2xl font-semibold text-foreground">{p.address}</p>
                <p className="mt-1 text-base text-muted-foreground">{p.postcode}</p>
                {p.client_name ? (
                  <p className="mt-1 text-lg text-foreground/80">{p.client_name}</p>
                ) : null}
                <p className="mt-3 inline-block rounded-full bg-secondary px-3 py-1 text-sm font-medium">
                  {p.status}
                </p>
              </Link>
            ))
          ) : properties && properties.length > 0 ? (
            <p className="text-lg text-muted-foreground">
              No properties match “{q}”.
            </p>
          ) : (
            <p className="text-lg text-muted-foreground">
              No properties yet. Add your first one to begin.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}