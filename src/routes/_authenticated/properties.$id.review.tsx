import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { generateReport } from "@/lib/report.functions";

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

type ReportType = "Inventory" | "Check In" | "Check Out" | "Update";

type Room = { id: string; name: string; sort_order: number };

type Item = {
  id: string;
  room_id: string | null;
  photo_url: string | null;
  item_name: string | null;
  description: string | null;
  condition: string | null;
  check_in_comment: string | null;
  check_out_comment: string | null;
  update_comment: string | null;
  source: "ai" | "manual";
  edited: boolean;
  created_at: string;
};

function commentFieldFor(rt: ReportType | null): keyof Item | null {
  if (rt === "Check In") return "check_in_comment";
  if (rt === "Check Out") return "check_out_comment";
  if (rt === "Update") return "update_comment";
  return null;
}

function ReviewPage() {
  const { id } = Route.useParams();
  const { reportId } = Route.useSearch();

  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Item | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);
  const [reportStatus, setReportStatus] = useState<"draft" | "complete" | null>(null);
  const [docxPath, setDocxPath] = useState<string | null>(null);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const runGenerate = useServerFn(generateReport);

  async function loadAll() {
    if (!reportId) return;
    setLoading(true);
    const { data: report } = await supabase
      .from("reports")
      .select("id, report_type, status, docx_path, pdf_path")
      .eq("id", reportId)
      .maybeSingle();
    if (report) {
      setReportType(report.report_type as ReportType);
      setReportStatus((report as { status: "draft" | "complete" }).status);
      setDocxPath((report as { docx_path: string | null }).docx_path ?? null);
      setPdfPath((report as { pdf_path: string | null }).pdf_path ?? null);
    }

    const { data: rms } = await supabase
      .from("rooms")
      .select("id, name, sort_order")
      .eq("report_id", reportId)
      .order("sort_order", { ascending: true });
    setRooms(rms ?? []);

    const { data: its } = await supabase
      .from("items")
      .select("*")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });
    setItems((its ?? []) as Item[]);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const itemsByRoom = useMemo(() => {
    const map = new Map<string | "unallocated", Item[]>();
    for (const it of items) {
      const key = it.room_id ?? "unallocated";
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return map;
  }, [items]);

  async function handleDelete(item: Item) {
    const snapshot = item;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const { error } = await supabase.from("items").delete().eq("id", item.id);
    if (error) {
      toast.error("Could not delete");
      setItems((prev) => [...prev, snapshot]);
      return;
    }
    toast("Item deleted", {
      action: {
        label: "Undo",
        onClick: async () => {
          const { error: reErr } = await supabase.from("items").insert({
            id: snapshot.id,
            room_id: snapshot.room_id,
            report_id: reportId!,
            photo_url: snapshot.photo_url,
            item_name: snapshot.item_name,
            description: snapshot.description,
            condition: snapshot.condition,
            check_in_comment: snapshot.check_in_comment,
            check_out_comment: snapshot.check_out_comment,
            update_comment: snapshot.update_comment,
            source: snapshot.source,
            edited: snapshot.edited,
          });
          if (reErr) {
            toast.error("Could not undo");
            return;
          }
          setItems((prev) => [...prev, snapshot]);
          toast.success("Restored");
        },
      },
    });
  }

  async function handleMove(item: Item, newRoomId: string | null) {
    const prevRoomId = item.room_id;
    if (prevRoomId === newRoomId) return;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, room_id: newRoomId } : i)),
    );
    const { error } = await supabase
      .from("items")
      .update({ room_id: newRoomId })
      .eq("id", item.id);
    if (error) {
      toast.error("Could not move");
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, room_id: prevRoomId } : i)),
      );
      return;
    }
    const destName =
      newRoomId === null
        ? "Unallocated"
        : rooms.find((r) => r.id === newRoomId)?.name ?? "room";
    toast(`Moved to ${destName}`, {
      action: {
        label: "Undo",
        onClick: async () => {
          const { error: rErr } = await supabase
            .from("items")
            .update({ room_id: prevRoomId })
            .eq("id", item.id);
          if (rErr) {
            toast.error("Could not undo");
            return;
          }
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, room_id: prevRoomId } : i)),
          );
        },
      },
    });
  }

  async function handleSaveEdit(updated: Item) {
    const original = items.find((i) => i.id === updated.id);
    if (!original) return;
    const commentField = commentFieldFor(reportType);
    const aiFieldsChanged =
      original.item_name !== updated.item_name ||
      original.description !== updated.description ||
      original.condition !== updated.condition;
    const edited = original.edited || (original.source === "ai" && aiFieldsChanged);

    const patch: Partial<Item> = {
      item_name: updated.item_name,
      description: updated.description,
      condition: updated.condition,
      edited,
    };
    if (commentField) {
      (patch as Record<string, unknown>)[commentField] =
        updated[commentField] ?? null;
    }

    const { error } = await supabase
      .from("items")
      .update(patch as never)
      .eq("id", updated.id);
    if (error) {
      toast.error("Could not save");
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === updated.id ? { ...updated, edited } : i)),
    );
    setEditing(null);
    toast.success("Saved");
  }

  if (!reportId) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto max-w-2xl">
          <p className="text-xl text-foreground">No report selected.</p>
          <Button asChild size="lg" className="mt-6 h-16 w-full text-xl">
            <Link to="/properties/$id" params={{ id }}>Back to property</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      <div className="px-6 pt-8">
        <div className="mx-auto max-w-6xl">
          <Button asChild variant="ghost" className="mb-4 text-base">
            <Link to="/properties/$id" params={{ id }}>← Back to property</Link>
          </Button>
          <h1 className="text-4xl font-bold text-foreground">Review items</h1>
          <p className="mt-2 text-xl text-muted-foreground">
            {reportType ? `${reportType} report` : "Report"} · {items.length} items ·{" "}
            {itemsByRoom.get("unallocated")?.length ?? 0} unallocated
          </p>
          <Button asChild size="lg" className="mt-6 h-14 text-lg">
            <Link
              to="/properties/$id/items/new"
              params={{ id }}
              search={{ reportId }}
            >
              + Add item manually
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="mt-10 px-6 text-center text-xl text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-8 space-y-10">
          {rooms.map((room) => (
            <RoomDeck
              key={room.id}
              title={room.name}
              items={itemsByRoom.get(room.id) ?? []}
              onOpen={setEditing}
              onDelete={setConfirmDelete}
              onMove={handleMove}
              rooms={rooms}
              currentRoomId={room.id}
            />
          ))}
          <RoomDeck
            title="Unallocated"
            items={itemsByRoom.get("unallocated") ?? []}
            onOpen={setEditing}
            onDelete={setConfirmDelete}
            onMove={handleMove}
            rooms={rooms}
            currentRoomId={null}
            emptyLabel="No unallocated items."
          />
        </div>
      )}

      <EditItemDialog
        item={editing}
        reportType={reportType}
        onClose={() => setEditing(null)}
        onSave={handleSaveEdit}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl">Delete this item?</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              You'll be able to undo this straight away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 text-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-12 text-lg"
              onClick={() => {
                if (confirmDelete) handleDelete(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function RoomDeck({
  title,
  items,
  onOpen,
  onDelete,
  onMove,
  rooms,
  currentRoomId,
  emptyLabel,
}: {
  title: string;
  items: Item[];
  onOpen: (item: Item) => void;
  onDelete: (item: Item) => void;
  onMove: (item: Item, newRoomId: string | null) => void;
  rooms: Room[];
  currentRoomId: string | null;
  emptyLabel?: string;
}) {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-2xl font-bold text-foreground">
          {title}{" "}
          <span className="text-lg font-normal text-muted-foreground">
            ({items.length})
          </span>
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="mx-auto mt-3 max-w-6xl px-6 text-lg text-muted-foreground">
          {emptyLabel ?? "No items yet."}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div className="flex gap-4 px-6 pb-4">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                rooms={rooms}
                currentRoomId={currentRoomId}
                onOpen={() => onOpen(item)}
                onDelete={() => onDelete(item)}
                onMove={(newRoomId) => onMove(item, newRoomId)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ItemCard({
  item,
  rooms,
  currentRoomId,
  onOpen,
  onDelete,
  onMove,
}: {
  item: Item;
  rooms: Room[];
  currentRoomId: string | null;
  onOpen: () => void;
  onDelete: () => void;
  onMove: (newRoomId: string | null) => void;
}) {
  return (
    <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
      >
        {item.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photo_url}
            alt={item.item_name ?? "Item"}
            className="h-56 w-full object-cover"
          />
        ) : (
          <div className="flex h-56 w-full items-center justify-center bg-muted text-muted-foreground">
            No photo
          </div>
        )}
        <div className="space-y-2 p-4">
          <p className="text-xl font-semibold text-foreground">
            {item.item_name || "Unnamed item"}
          </p>
          {item.description ? (
            <p className="text-base text-foreground/80">{item.description}</p>
          ) : null}
          {item.condition ? (
            <p className="text-base text-foreground/70">
              <span className="font-medium">Condition:</span> {item.condition}
            </p>
          ) : null}
          {item.edited ? (
            <p className="text-sm text-muted-foreground">Edited</p>
          ) : null}
        </div>
      </button>
      <div className="flex items-center gap-2 border-t border-border p-3">
        <Select
          value={currentRoomId ?? "unallocated"}
          onValueChange={(v) => onMove(v === "unallocated" ? null : v)}
        >
          <SelectTrigger className="h-12 flex-1 text-base">
            <SelectValue placeholder="Move to…" />
          </SelectTrigger>
          <SelectContent>
            {rooms.map((r) => (
              <SelectItem key={r.id} value={r.id} className="text-base">
                {r.name}
              </SelectItem>
            ))}
            <SelectItem value="unallocated" className="text-base">
              Unallocated
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="h-12 text-base"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

function EditItemDialog({
  item,
  reportType,
  onClose,
  onSave,
}: {
  item: Item | null;
  reportType: ReportType | null;
  onClose: () => void;
  onSave: (item: Item) => void;
}) {
  const [draft, setDraft] = useState<Item | null>(item);

  useEffect(() => {
    setDraft(item);
  }, [item]);

  if (!draft) return null;
  const commentField = commentFieldFor(reportType);
  const commentLabel =
    reportType === "Check In"
      ? "Check-in comment"
      : reportType === "Check Out"
        ? "Check-out comment"
        : reportType === "Update"
          ? "Update comment"
          : null;

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">Edit item</DialogTitle>
        </DialogHeader>
        {draft.photo_url ? (
          <img
            src={draft.photo_url}
            alt={draft.item_name ?? "Item"}
            className="h-56 w-full rounded-lg object-cover"
          />
        ) : null}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="item_name" className="text-base">Item name</Label>
            <Input
              id="item_name"
              className="h-12 text-lg"
              value={draft.item_name ?? ""}
              onChange={(e) => setDraft({ ...draft, item_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description" className="text-base">Description</Label>
            <Textarea
              id="description"
              rows={3}
              className="text-lg"
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="condition" className="text-base">Condition</Label>
            <Textarea
              id="condition"
              rows={3}
              className="text-lg"
              value={draft.condition ?? ""}
              onChange={(e) => setDraft({ ...draft, condition: e.target.value })}
            />
          </div>
          {commentField && commentLabel ? (
            <div className="space-y-2">
              <Label htmlFor="comment" className="text-base">{commentLabel}</Label>
              <Textarea
                id="comment"
                rows={3}
                className="text-lg"
                value={(draft[commentField] as string | null) ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, [commentField]: e.target.value } as Item)
                }
              />
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 text-lg"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-12 text-lg"
            onClick={() => onSave(draft)}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}