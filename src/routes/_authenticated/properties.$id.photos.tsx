import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { analyzeItemPhoto } from "@/lib/ai.functions";
import { StepIndicator } from "@/components/step-indicator";

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

type LocalPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  isWide: boolean;
};

type Stage =
  | { kind: "idle" }
  | { kind: "processing"; done: number; total: number; message: string };

const WIDE_SHOTS_PER_ROOM = 3;

function PhotosPage() {
  const { id: propertyId } = Route.useParams();
  const { reportId } = Route.useSearch();
  const navigate = useNavigate();
  const analyze = useServerFn(analyzeItemPhoto);
  const inputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  const { data: report } = useQuery({
    queryKey: ["report", reportId],
    enabled: !!reportId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, report_type, property_id")
        .eq("id", reportId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: property } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("address, postcode, status")
        .eq("id", propertyId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next: LocalPhoto[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      next.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        isWide: false,
      });
    }
    setPhotos((prev) => [...prev, ...next]);
  }

  function toggleWide(pid: string) {
    setPhotos((prev) =>
      prev.map((p) => (p.id === pid ? { ...p, isWide: !p.isWide } : p)),
    );
  }

  function removePhoto(pid: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === pid);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== pid);
    });
  }

  async function handleProcess() {
    if (!reportId || !report) {
      toast.error("Missing report — start a new report first.");
      return;
    }
    if (photos.length === 0) {
      toast.error("Add at least one photo.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      toast.error("Not signed in");
      return;
    }
    const userId = userData.user.id;

    const total = photos.length;
    setStage({ kind: "processing", done: 0, total, message: "Uploading photos…" });

    // Upload all photos first
    const uploaded: Array<{ photo: LocalPhoto; path: string; signedUrl: string }> = [];
    try {
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        const ext = p.file.name.split(".").pop() || "jpg";
        const path = `${userId}/${propertyId}/${reportId}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("property-photos")
          .upload(path, p.file, { contentType: p.file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: signed, error: signErr } = await supabase.storage
          .from("property-photos")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signErr) throw signErr;
        uploaded.push({ photo: p, path, signedUrl: signed.signedUrl });
        setStage({
          kind: "processing",
          done: i + 1,
          total,
          message: `Uploading photos (${i + 1} of ${total})…`,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setStage({ kind: "idle" });
      return;
    }

    // Walk photos in order, grouping wide shots into rooms.
    let currentRoomId: string | null = null;
    let wideBuffer: typeof uploaded = [];
    let roomCount = 0;
    let itemsProcessed = 0;
    let unallocated = 0;

    async function flushWideBuffer() {
      if (wideBuffer.length < WIDE_SHOTS_PER_ROOM) return;
      roomCount += 1;
      const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .insert({
          report_id: reportId!,
          name: `Room ${roomCount}`,
          sort_order: roomCount,
        })
        .select("id")
        .single();
      if (roomErr) throw roomErr;
      currentRoomId = room.id;

      const wideRows = wideBuffer.map((w, idx) => ({
        room_id: room.id,
        photo_url: w.signedUrl,
        sort_order: idx,
      }));
      const { error: wsErr } = await supabase.from("wide_shots").insert(wideRows);
      if (wsErr) throw wsErr;
      wideBuffer = [];
    }

    try {
      for (let i = 0; i < uploaded.length; i++) {
        const u = uploaded[i];

        if (u.photo.isWide) {
          wideBuffer.push(u);
          if (wideBuffer.length === WIDE_SHOTS_PER_ROOM) {
            setStage({
              kind: "processing",
              done: i,
              total,
              message: `Creating room ${roomCount + 1}…`,
            });
            await flushWideBuffer();
          }
          setStage({
            kind: "processing",
            done: i + 1,
            total,
            message: `Processing photo ${i + 1} of ${total}…`,
          });
          continue;
        }

        // Non-wide photo. If wide buffer has partial (<3) shots when a
        // non-wide arrives, those trailing wides don't form a room — attach
        // them to current room as wide shots if we have one, else drop back
        // as items are not wide. For simplicity: leave partial buffer in
        // place; only complete groups of 3 start new rooms.

        setStage({
          kind: "processing",
          done: i,
          total,
          message: `Analysing photo ${i + 1} of ${total}…`,
        });

        let result: {
          item_name: string;
          description: string;
          condition: string;
          check_in_comment: string;
          check_out_comment: string;
          update_comment: string;
        };
        try {
          result = await analyze({
            data: { photoUrl: u.signedUrl, reportType: report.report_type as never },
          });
        } catch (err) {
          console.error("AI analyse failed", err);
          const msg = err instanceof Error ? err.message : "";
          if (/No AI brain is configured/i.test(msg)) {
            toast.error(msg);
            setStage({ kind: "idle" });
            return;
          }
          result = {
            item_name: "Unidentified item",
            description: "",
            condition: "",
            check_in_comment: "",
            check_out_comment: "",
            update_comment: "",
          };
        }

        const { error: itemErr } = await supabase.from("items").insert({
          report_id: reportId!,
          room_id: currentRoomId,
          photo_url: u.signedUrl,
          item_name: result.item_name,
          description: result.description || null,
          condition: result.condition || null,
          check_in_comment: result.check_in_comment || null,
          check_out_comment: result.check_out_comment || null,
          update_comment: result.update_comment || null,
          source: "ai",
          edited: false,
        });
        if (itemErr) throw itemErr;

        itemsProcessed += 1;
        if (!currentRoomId) unallocated += 1;

        setStage({
          kind: "processing",
          done: i + 1,
          total,
          message: `Processing photo ${i + 1} of ${total}…`,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Processing failed");
      setStage({ kind: "idle" });
      return;
    }

    toast.success(`Processed ${itemsProcessed} item${itemsProcessed === 1 ? "" : "s"}`);
    navigate({
      to: "/properties/$id/review",
      params: { id: propertyId },
      search: { reportId, processed: itemsProcessed, unallocated },
    });
  }

  const wideCount = photos.filter((p) => p.isWide).length;
  const itemCount = photos.length - wideCount;
  const roomsPreview = Math.floor(wideCount / WIDE_SHOTS_PER_ROOM);
  const isProcessing = stage.kind === "processing";

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Button asChild variant="ghost" className="mb-4 text-base">
          <Link to="/properties/$id" params={{ id: propertyId }}>← Back</Link>
        </Button>

        <StepIndicator current="Upload" className="mb-8" />
        {report ? (
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-muted-foreground">
            {report.report_type} report
          </p>
        ) : null}
        <h1 className="font-serif mt-3 text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
          {property?.address ?? "Property"}
        </h1>
        <span className="gold-rule mt-4" aria-hidden />

        <div className="mt-6 rounded-xl border border-border bg-card p-5 text-base leading-relaxed text-foreground/90">
          <p>
            Add photos in the order you take them. Mark <strong>3 wide shots</strong> at
            the start of each new room; the photos that follow are items in that room.
          </p>
        </div>

        {!isProcessing ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="lg"
              onClick={() => inputRef.current?.click()}
              className="mt-6 h-16 w-full text-xl"
            >
              + Add photos
            </Button>

            {photos.length > 0 ? (
              <>
                <div className="mt-6 flex flex-wrap gap-4 text-base text-foreground/80">
                  <span>{photos.length} photo{photos.length === 1 ? "" : "s"}</span>
                  <span>·</span>
                  <span>{wideCount} wide</span>
                  <span>·</span>
                  <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
                  <span>·</span>
                  <span>~{roomsPreview} room{roomsPreview === 1 ? "" : "s"}</span>
                </div>

                <ul className="mt-4 space-y-3">
                  {photos.map((p, idx) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-4 rounded-lg border border-border bg-card p-3"
                    >
                      <img
                        src={p.previewUrl}
                        alt={`Photo ${idx + 1}`}
                        className="h-20 w-20 flex-none rounded object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-medium text-foreground">
                          #{idx + 1}
                        </p>
                        <label className="mt-1 flex items-center gap-2 text-base">
                          <input
                            type="checkbox"
                            checked={p.isWide}
                            onChange={() => toggleWide(p.id)}
                            className="h-5 w-5"
                          />
                          Wide shot
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePhoto(p.id)}
                        className="text-base text-muted-foreground underline underline-offset-4"
                        aria-label={`Remove photo ${idx + 1}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>

                <Button
                  type="button"
                  size="lg"
                  onClick={handleProcess}
                  className="mt-8 h-16 w-full text-xl"
                >
                  Process {photos.length} photo{photos.length === 1 ? "" : "s"}
                </Button>
              </>
            ) : (
              <p className="mt-6 text-lg text-muted-foreground">
                No photos added yet.
              </p>
            )}
          </>
        ) : (
          <div className="mt-10 rounded-lg border-2 border-primary bg-card p-8 text-center">
            <p className="text-xl font-semibold text-foreground">{stage.message}</p>
            <div className="mt-6 h-4 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(stage.done / stage.total) * 100}%` }}
              />
            </div>
            <p className="mt-4 text-lg text-muted-foreground">
              {stage.done} of {stage.total}
            </p>
            <p className="mt-4 text-base text-muted-foreground">
              This can take a while for a full property. Keep this tab open.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}