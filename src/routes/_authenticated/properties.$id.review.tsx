import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({
  reportId: z.string().uuid().optional(),
  processed: z.coerce.number().int().nonnegative().default(0),
  unallocated: z.coerce.number().int().nonnegative().default(0),
});

export const Route = createFileRoute("/_authenticated/properties/$id/review")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Review report — Elle Inventory Solutions" },
      { name: "description", content: "Review AI-generated inventory items." },
      { property: "og:title", content: "Review report" },
      { property: "og:description", content: "Review AI-generated inventory items." },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const { id } = Route.useParams();
  const { processed, unallocated } = Route.useSearch();

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Button asChild variant="ghost" className="mb-4 text-base">
          <Link to="/properties/$id" params={{ id }}>← Back to property</Link>
        </Button>

        <h1 className="text-4xl font-bold text-foreground">Report processed</h1>
        <p className="mt-3 text-xl text-muted-foreground">
          The AI has analysed your photos.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-5xl font-bold text-foreground">{processed}</p>
            <p className="mt-2 text-lg text-muted-foreground">Items processed</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-5xl font-bold text-foreground">{unallocated}</p>
            <p className="mt-2 text-lg text-muted-foreground">Unallocated</p>
          </div>
        </div>

        <p className="mt-8 text-lg text-foreground/80">
          The full item review deck is coming next — you'll be able to swipe through
          each item, correct the AI's notes, and reassign any unallocated photos.
        </p>

        <Button asChild size="lg" className="mt-8 h-16 w-full text-xl">
          <Link to="/properties/$id" params={{ id }}>Back to property</Link>
        </Button>
      </div>
    </main>
  );
}