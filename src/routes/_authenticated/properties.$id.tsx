import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/properties/$id")({
  head: () => ({
    meta: [
      { title: "Property — Elle Inventory Solutions" },
      { name: "description", content: "Property details and reports." },
      { property: "og:title", content: "Property details" },
      { property: "og:description", content: "Property details and reports." },
    ],
  }),
  component: PropertyDetail,
});

function PropertyDetail() {
  const { id } = useParams({ from: "/_authenticated/properties/$id" });

  const { data: property, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, postcode, client_name, status, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Button asChild variant="ghost" className="mb-6 text-base">
          <Link to="/dashboard">← Back</Link>
        </Button>

        {isLoading ? (
          <p className="text-lg text-muted-foreground">Loading…</p>
        ) : property ? (
          <>
            <h1 className="text-4xl font-bold text-foreground">{property.address}</h1>
            <p className="mt-2 text-xl text-muted-foreground">{property.postcode}</p>
            {property.client_name ? (
              <p className="mt-1 text-xl text-foreground/80">{property.client_name}</p>
            ) : null}
            <p className="mt-4 inline-block rounded-full bg-secondary px-4 py-1.5 text-base font-medium">
              {property.status}
            </p>

            <div className="mt-10">
              <Button asChild size="lg" className="h-16 w-full text-xl">
                <Link to="/properties/$id/photos" params={{ id: property.id }}>
                  Continue to photos
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <p className="text-lg text-muted-foreground">Property not found.</p>
        )}
      </div>
    </main>
  );
}