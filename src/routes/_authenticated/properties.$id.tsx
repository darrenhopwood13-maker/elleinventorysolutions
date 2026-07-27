import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PropertyDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: property, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, postcode, client_name, status, exterior_photo_url, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: reports } = useQuery({
    queryKey: ["property-reports", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, report_type, status, created_at")
        .eq("property_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const latestReport = reports?.[0];

  async function handleExteriorUpload(file: File) {
    if (!property) return;
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userData.user.id}/${property.id}/exterior-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("property-photos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from("property-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      const { error: updErr } = await supabase
        .from("properties")
        .update({ exterior_photo_url: signed.signedUrl })
        .eq("id", property.id);
      if (updErr) throw updErr;
      await queryClient.invalidateQueries({ queryKey: ["property", id] });
      toast.success("Photo saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateReport(type: ReportType) {
    if (!property || creating) return;
    setCreating(true);
    try {
      const { data: report, error } = await supabase
        .from("reports")
        .insert({
          property_id: property.id,
          report_type: type,
          status: "draft",
          previous_report_id: latestReport?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      await supabase
        .from("properties")
        .update({ status: STATUS_FOR_REPORT[type] })
        .eq("id", property.id);

      toast.success(`${type} report started`);
      setDialogOpen(false);
      navigate({
        to: "/properties/$id/photos",
        params: { id: property.id },
        search: { reportId: report.id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create report");
    } finally {
      setCreating(false);
    }
  }

  function openReport(r: { id: string; status: string }) {
    if (r.status === "draft") {
      navigate({
        to: "/properties/$id/photos",
        params: { id },
        search: { reportId: r.id },
      });
    } else {
      toast("Completed report view coming soon");
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <p className="text-lg text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (!property) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <Button asChild variant="ghost" className="mb-6 text-base">
            <Link to="/dashboard">← Back</Link>
          </Button>
          <p className="text-lg text-muted-foreground">Property not found.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Button asChild variant="ghost" className="mb-6 text-base">
          <Link to="/dashboard">← Back</Link>
        </Button>

        <StepIndicator current="Property" className="mb-8" />
        <p className="text-xs font-medium uppercase tracking-[0.32em] text-muted-foreground">
          {property.postcode}
        </p>
        <h1 className="font-serif mt-3 text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
          {property.address}
        </h1>
        <span className="gold-rule mt-4" aria-hidden />
        {property.client_name ? (
          <p className="mt-4 text-xl text-foreground/80">{property.client_name}</p>
        ) : null}
        <p className="mt-4 inline-block rounded-full border border-gold/50 bg-gold/10 px-4 py-1.5 text-base font-medium">
          {property.status}
        </p>

        {/* Exterior photo */}
        <section className="mt-8">
          <h2 className="font-serif text-2xl font-medium tracking-tight text-foreground">
            Exterior photo
          </h2>
          <div className="mt-4">
            {property.exterior_photo_url ? (
              <img
                src={property.exterior_photo_url}
                alt={`Exterior of ${property.address}`}
                className="w-full rounded-lg border border-border object-cover"
              />
            ) : (
              <div className="flex h-56 items-center justify-center rounded-lg border-2 border-dashed border-border bg-card">
                <p className="text-lg text-muted-foreground">No exterior photo yet</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleExteriorUpload(f);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 h-14 w-full text-lg"
            >
              {uploading
                ? "Uploading…"
                : property.exterior_photo_url
                  ? "Replace exterior photo"
                  : "Add exterior photo"}
            </Button>
          </div>
        </section>

        {/* Reports */}
        <section className="mt-10">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-serif text-2xl font-medium tracking-tight text-foreground">
              Reports
            </h2>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="h-14 px-6 text-lg">
                  + New report
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-serif text-2xl font-medium">
                    Start a new report
                  </DialogTitle>
                </DialogHeader>
                <p className="text-base text-muted-foreground">
                  {latestReport
                    ? `Will follow on from your ${latestReport.report_type} report from ${formatDate(latestReport.created_at)}.`
                    : "This will be the first report for this property."}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {REPORT_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      disabled={creating}
                      onClick={() => handleCreateReport(type)}
                      className="h-16 rounded-lg border-2 border-border bg-card px-4 text-lg font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mt-4 space-y-3">
            {reports && reports.length > 0 ? (
              reports.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openReport(r)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-5 text-left transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <div>
                    <p className="text-xl font-semibold text-foreground">
                      {r.report_type}
                    </p>
                    <p className="mt-1 text-base text-muted-foreground">
                      {formatDate(r.created_at)}
                    </p>
                  </div>
                  <span
                    className={
                      "rounded-full px-3 py-1 text-sm font-medium " +
                      (r.status === "draft"
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-primary/10 text-primary")
                    }
                  >
                    {r.status === "draft" ? "Draft" : "Complete"}
                  </span>
                </button>
              ))
            ) : (
              <p className="text-lg text-muted-foreground">No reports yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}