import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({
  reportId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/properties/$id/photos")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Upload photos — Elle Inventory Solutions" },
      { name: "description", content: "Add photos to the property report." },
      { property: "og:title", content: "Upload photos" },
      { property: "og:description", content: "Add photos to the property report." },
    ],
  }),
  component: PhotosPage,
});

function PhotosPage() {
  const { id } = Route.useParams();

  const { data: property } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("address, postcode, status")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-xl">
        <Link
          to="/dashboard"
          className="text-base text-muted-foreground underline underline-offset-4"
        >
          ← Back to properties
        </Link>
        <h1 className="mt-4 text-4xl font-bold text-foreground">
          {property?.address ?? "Property"}
        </h1>
        {property ? (
          <p className="mt-2 text-lg text-muted-foreground">
            {property.postcode} · {property.status}
          </p>
        ) : null}

        <div className="mt-10 rounded-lg border-2 border-dashed border-border bg-card p-10 text-center">
          <p className="text-xl font-semibold text-foreground">Photo upload</p>
          <p className="mt-3 text-lg text-muted-foreground">
            Photo capture and AI item detection will appear here next.
          </p>
          <Button asChild className="mt-8 h-14 px-8 text-lg">
            <Link to="/dashboard">Back to properties</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}