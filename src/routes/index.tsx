import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Elle Inventory Solutions — Property Inventory Reports" },
      {
        name: "description",
        content:
          "AI-assisted property inventory, check-in, check-out and update reports for letting agents and landlords.",
      },
      { property: "og:title", content: "Elle Inventory Solutions" },
      {
        property: "og:description",
        content: "Fast, AI-assisted property inventory reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/dashboard", replace: true });
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  if (checking) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-xl text-center">
        <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
          Elle Inventory Solutions
        </h1>
        <p className="mt-6 text-2xl text-muted-foreground">
          Fast, AI-assisted property reports.
        </p>
        <div className="mt-12">
          <Button asChild size="lg" className="h-16 px-10 text-xl">
            <Link to="/auth">Sign in to start</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
