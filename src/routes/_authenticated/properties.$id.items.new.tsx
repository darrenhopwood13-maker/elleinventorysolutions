import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StepIndicator } from "@/components/step-indicator";

const searchSchema = z.object({
  reportId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/properties/$id/items/new")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Add item manually — Elle Inventory Solutions" },
      { name: "description", content: "Add an inventory item by hand." },
      { property: "og:title", content: "Add item manually" },
      { property: "og:description", content: "Add an inventory item by hand." },
    ],
  }),
  component: NewItemPage,
});

type ReportType = "Inventory" | "Check In" | "Check Out" | "Update";

function commentFieldFor(rt: ReportType | null | undefined) {
  if (rt === "Check In") return { key: "check_in_comment", label: "Check-in comment" };
  if (rt === "Check Out") return { key: "check_out_comment", label: "Check-out comment" };
  if (rt === "Update") return { key: "update_comment", label: "Update comment" };
  return null;
}

function NewItemPage() {
  const { id: propertyId } = Route.useParams();
  const { reportId } = Route.useSearch();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState("");
  const [comment, setComment] = useState("");
  const [roomId, setRoomId] = useState<string>("unallocated");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const { data: report } = useQuery({
    queryKey: ["report", reportId],
    enabled: !!reportId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, report_type")
        .eq("id", reportId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms", reportId],
    enabled: !!reportId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, sort_order")
        .eq("report_id", reportId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const reportType = (report?.report_type ?? null) as ReportType | null;
  const commentField = commentFieldFor(reportType);

  function pickFile(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!reportId) {
      toast.error("Missing report");
      return;
    }
    if (!itemName.trim()) {
      toast.error("Item name is required");
      return;
    }
    setSaving(true);
    try {
      let photoUrl: string | null = null;
      if (file) {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData.user) throw userErr ?? new Error("Not signed in");
        const userId = userData.user.id;
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${userId}/${propertyId}/${reportId}/manual-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("property-photos")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: signed, error: signErr } = await supabase.storage
          .from("property-photos")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signErr) throw signErr;
        photoUrl = signed.signedUrl;
      }

      const insert: Record<string, unknown> = {
        report_id: reportId,
        room_id: roomId === "unallocated" ? null : roomId,
        photo_url: photoUrl,
        item_name: itemName.trim(),
        description: description.trim() || null,
        condition: condition.trim() || null,
        source: "manual",
        edited: false,
      };
      if (commentField) {
        insert[commentField.key] = comment.trim() || null;
      }

      const { error } = await supabase.from("items").insert(insert as never);
      if (error) throw error;

      toast.success("Item added");
      navigate({
        to: "/properties/$id/review",
        params: { id: propertyId },
        search: { reportId, processed: 0, unallocated: 0 },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save item";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (!reportId) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto max-w-2xl">
          <p className="text-xl text-foreground">No report selected.</p>
          <Button asChild size="lg" className="mt-6 h-16 w-full text-xl">
            <Link to="/properties/$id" params={{ id: propertyId }}>
              Back to property
            </Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Button asChild variant="ghost" className="mb-4 text-base">
          <Link
            to="/properties/$id/review"
            params={{ id: propertyId }}
            search={{ reportId, processed: 0, unallocated: 0 }}
          >
            ← Back to review
          </Link>
        </Button>

        <StepIndicator current="Review" className="mb-8" />
        <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
          Add item manually
        </h1>
        <span className="gold-rule mt-4" aria-hidden />
        <p className="mt-4 text-lg text-muted-foreground">
          Fill this in yourself — the AI won't touch it.
        </p>

        <form onSubmit={handleSave} className="mt-8 space-y-6">
          <div className="space-y-3">
            <Label className="text-lg">Photo</Label>
            {previewUrl ? (
              <div className="space-y-3">
                <img
                  src={previewUrl}
                  alt="Selected item"
                  className="h-72 w-full rounded-xl object-cover"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full text-base"
                  onClick={() => {
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                    setFile(null);
                    setPreviewUrl(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  Remove photo
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-24 w-full text-xl"
                onClick={() => inputRef.current?.click()}
              >
                Take or choose a photo
              </Button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => pickFile(e.target.files)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="item_name" className="text-lg">Item name</Label>
            <Input
              id="item_name"
              className="h-14 text-lg"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Front door"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-lg">Description</Label>
            <Textarea
              id="description"
              rows={3}
              className="text-lg"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="White painted door, brass numeral 5, spyhole"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="condition" className="text-lg">Condition</Label>
            <Textarea
              id="condition"
              rows={3}
              className="text-lg"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="Scuffed to low level, 1 pin hole under spyhole"
            />
          </div>

          {commentField ? (
            <div className="space-y-2">
              <Label htmlFor="comment" className="text-lg">{commentField.label}</Label>
              <Textarea
                id="comment"
                rows={3}
                className="text-lg"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="room" className="text-lg">Room</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger id="room" className="h-14 text-lg">
                <SelectValue placeholder="Choose a room" />
              </SelectTrigger>
              <SelectContent>
                {(rooms ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-base">
                    {r.name}
                  </SelectItem>
                ))}
                <SelectItem value="unallocated" className="text-base">
                  Unallocated
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            size="lg"
            className="h-16 w-full text-xl"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save item"}
          </Button>
        </form>
      </div>
    </main>
  );
}