import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { StepIndicator } from "@/components/step-indicator";

type ReportType = "Inventory" | "Check In" | "Check Out" | "Update";

const REPORT_TYPES: ReportType[] = ["Inventory", "Check In", "Check Out", "Update"];

const STATUS_FOR_REPORT: Record<
  ReportType,
  "Inventory Pending" | "Awaiting Check In" | "Check Out Booked" | "In Tenancy"
> = {
  Inventory: "Inventory Pending",
  "Check In": "Awaiting Check In",
  "Check Out": "Check Out Booked",
  Update: "In Tenancy",
};

export const Route = createFileRoute("/_authenticated/properties/new")({
  head: () => ({
    meta: [
      { title: "New property — Elle Inventory Solutions" },
      { name: "description", content: "Create a new property to start an inventory report." },
      { property: "og:title", content: "New property" },
      { property: "og:description", content: "Create a new property to start an inventory report." },
    ],
  }),
  component: NewProperty,
});

function NewProperty() {
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [clientName, setClientName] = useState("");
  const [reportType, setReportType] = useState<ReportType>("Inventory");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("You must be signed in.");

      const { data: property, error: propError } = await supabase
        .from("properties")
        .insert({
          user_id: userData.user.id,
          address: address.trim(),
          postcode: postcode.trim(),
          client_name: clientName.trim() || null,
          status: STATUS_FOR_REPORT[reportType],
        })
        .select("id")
        .single();
      if (propError) throw propError;

      const { data: report, error: reportError } = await supabase
        .from("reports")
        .insert({
          property_id: property.id,
          report_type: reportType,
          status: "draft",
        })
        .select("id")
        .single();
      if (reportError) throw reportError;

      toast.success("Property created");
      navigate({
        to: "/properties/$id/photos",
        params: { id: property.id },
        search: { reportId: report.id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create property");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-xl">
        <Link to="/dashboard" className="text-base text-muted-foreground underline underline-offset-4">
          ← Back
        </Link>
        <StepIndicator current="Property" className="mt-6" />
        <h1 className="font-serif mt-8 text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
          New property
        </h1>
        <span className="gold-rule mt-4" aria-hidden />
        <p className="mt-4 text-lg text-muted-foreground">
          Property first — then photos, review and the finished report.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-8">
          <div className="space-y-2">
            <Label htmlFor="address" className="text-lg">Address</Label>
            <Input
              id="address"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="h-14 text-lg"
              autoComplete="street-address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="postcode" className="text-lg">Postcode</Label>
            <Input
              id="postcode"
              required
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              className="h-14 text-lg"
              autoComplete="postal-code"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client" className="text-lg">Letting agent / client</Label>
            <Input
              id="client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="h-14 text-lg"
            />
          </div>

          <div className="space-y-3">
            <span className="text-lg font-medium text-foreground">Report type</span>
            <div className="grid grid-cols-2 gap-3">
              {REPORT_TYPES.map((type) => {
                const selected = reportType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setReportType(type)}
                    aria-pressed={selected}
                    className={
                      "h-16 rounded-lg border-2 px-4 text-lg font-medium transition-colors " +
                      (selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:bg-accent")
                    }
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="h-16 w-full text-xl"
          >
            {busy ? "Creating…" : "Create property"}
          </Button>
        </form>
      </div>
    </main>
  );
}