import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  PageOrientation,
  WidthType,
  BorderStyle,
  HeadingLevel,
  TableOfContents,
  ShadingType,
  VerticalAlign,
} from "docx";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFImage } from "pdf-lib";

type ImgKind = "jpg" | "png";
type FetchedImg = { bytes: Uint8Array; kind: ImgKind };

function detectKind(bytes: Uint8Array): ImgKind | null {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  return null;
}

async function fetchImage(url: string | null | undefined): Promise<FetchedImg | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const kind = detectKind(bytes);
    if (!kind) return null;
    return { bytes, kind };
  } catch {
    return null;
  }
}

// --- DOCX helpers -----------------------------------------------------------

const PAGE_W = 12240;
const PAGE_H = 15840;
const MARGIN = 720;
// Landscape content width = long edge - 2 * margin
const CONTENT_W_DXA = PAGE_H - MARGIN * 2; // 14400 DXA

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: none, bottom: none, left: none, right: none };
}

function imageParagraph(img: FetchedImg | null, widthPx: number, heightPx: number) {
  if (!img) {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "[no photo]",
          color: "888888",
        }),
      ],
    });
  }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: img.kind,
        data: img.bytes,
        transformation: { width: widthPx, height: heightPx },
        altText: { title: "photo", description: "photo", name: "photo" },
      }),
    ],
  });
}

function textParagraph(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        size: opts.size,
        color: opts.color,
      }),
    ],
  });
}

// --- Server function --------------------------------------------------------

type Report = {
  id: string;
  report_type: "Inventory" | "Check In" | "Check Out" | "Update";
  property_id: string;
  created_at: string;
};

type Property = {
  id: string;
  address: string;
  postcode: string;
  client_name: string | null;
};

type Room = { id: string; name: string; sort_order: number };

type WideShot = { id: string; room_id: string; photo_url: string; sort_order: number };

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
};

function commentFor(reportType: Report["report_type"], item: Item): { label: string; value: string } | null {
  if (reportType === "Check In" && item.check_in_comment)
    return { label: "Check-in", value: item.check_in_comment };
  if (reportType === "Check Out" && item.check_out_comment)
    return { label: "Check-out", value: item.check_out_comment };
  if (reportType === "Update" && item.update_comment)
    return { label: "Update", value: item.update_comment };
  return null;
}

export const generateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reportId: string }) =>
    z.object({ reportId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { reportId } = data;

    const { data: report, error: repErr } = await supabase
      .from("reports")
      .select("id, report_type, property_id, created_at")
      .eq("id", reportId)
      .single();
    if (repErr || !report) throw new Error("Report not found");
    const r = report as Report;

    const { data: property, error: propErr } = await supabase
      .from("properties")
      .select("id, address, postcode, client_name")
      .eq("id", r.property_id)
      .single();
    if (propErr || !property) throw new Error("Property not found");
    const p = property as Property;

    const { data: roomsData } = await supabase
      .from("rooms")
      .select("id, name, sort_order")
      .eq("report_id", reportId)
      .order("sort_order", { ascending: true });
    const rooms = (roomsData ?? []) as Room[];
    const roomIds = rooms.map((x) => x.id);

    let wideShots: WideShot[] = [];
    if (roomIds.length > 0) {
      const { data: wsData } = await supabase
        .from("wide_shots")
        .select("id, room_id, photo_url, sort_order")
        .in("room_id", roomIds)
        .order("sort_order", { ascending: true });
      wideShots = (wsData ?? []) as WideShot[];
    }

    const { data: itemsData } = await supabase
      .from("items")
      .select(
        "id, room_id, photo_url, item_name, description, condition, check_in_comment, check_out_comment, update_comment, created_at",
      )
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });
    const items = (itemsData ?? []) as Item[];

    // Fetch all images once, cache by URL.
    const urls = new Set<string>();
    for (const w of wideShots) if (w.photo_url) urls.add(w.photo_url);
    for (const it of items) if (it.photo_url) urls.add(it.photo_url);
    const cache = new Map<string, FetchedImg | null>();
    await Promise.all(
      Array.from(urls).map(async (u) => {
        cache.set(u, await fetchImage(u));
      }),
    );

    // Group data per room.
    const wideByRoom = new Map<string, WideShot[]>();
    for (const w of wideShots) {
      const arr = wideByRoom.get(w.room_id) ?? [];
      arr.push(w);
      wideByRoom.set(w.room_id, arr);
    }
    const itemsByRoom = new Map<string | "unallocated", Item[]>();
    for (const it of items) {
      const key = it.room_id ?? "unallocated";
      const arr = itemsByRoom.get(key) ?? [];
      arr.push(it);
      itemsByRoom.set(key, arr);
    }

    const dateStr = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Build ordered room list, with an "Unallocated" pseudo room at the end if needed.
    const orderedRooms: Array<{ id: string | "unallocated"; name: string; wides: WideShot[] }> = [];
    for (const room of rooms) {
      orderedRooms.push({
        id: room.id,
        name: room.name,
        wides: wideByRoom.get(room.id) ?? [],
      });
    }
    if ((itemsByRoom.get("unallocated") ?? []).length > 0) {
      orderedRooms.push({ id: "unallocated", name: "Unallocated", wides: [] });
    }

    // --- Build DOCX ---------------------------------------------------------

    const docxBytes = await buildDocx({
      property: p,
      report: r,
      dateStr,
      orderedRooms,
      itemsByRoom,
      cache,
    });

    // --- Build PDF ----------------------------------------------------------

    const pdfBytes = await buildPdf({
      property: p,
      report: r,
      dateStr,
      orderedRooms,
      itemsByRoom,
      cache,
    });

    // --- Upload -------------------------------------------------------------

    const ts = Date.now();
    const docxPath = `${userId}/${reportId}/${ts}-report.docx`;
    const pdfPath = `${userId}/${reportId}/${ts}-report.pdf`;

    const { error: docxUpErr } = await supabase.storage
      .from("reports")
      .upload(docxPath, docxBytes, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (docxUpErr) throw new Error(`Word upload failed: ${docxUpErr.message}`);

    const { error: pdfUpErr } = await supabase.storage
      .from("reports")
      .upload(pdfPath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (pdfUpErr) throw new Error(`PDF upload failed: ${pdfUpErr.message}`);

    const { error: updErr } = await supabase
      .from("reports")
      .update({
        status: "complete",
        docx_path: docxPath,
        pdf_path: pdfPath,
      })
      .eq("id", reportId);
    if (updErr) throw new Error(`Report update failed: ${updErr.message}`);

    return { docxPath, pdfPath };
  });

// ---------------------------------------------------------------------------
// DOCX construction
// ---------------------------------------------------------------------------

async function buildDocx(args: {
  property: Property;
  report: Report;
  dateStr: string;
  orderedRooms: Array<{ id: string | "unallocated"; name: string; wides: WideShot[] }>;
  itemsByRoom: Map<string | "unallocated", Item[]>;
  cache: Map<string, FetchedImg | null>;
}): Promise<Uint8Array> {
  const { property, report, dateStr, orderedRooms, itemsByRoom, cache } = args;

  const children: Paragraph[] | Array<Paragraph | Table> = [];

  // Title page
  children.push(new Paragraph({ children: [new TextRun("")], spacing: { before: 2400 } }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
      children: [
        new TextRun({ text: "Elle Inventory Solutions", bold: true, size: 72, color: "1F3A68" }),
      ],
    }),
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 200 },
      children: [new TextRun({ text: `${report.report_type} report`, bold: true, size: 56 })],
    }),
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: property.address, size: 40 })],
    }),
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: property.postcode, size: 32, color: "555555" })],
    }),
  );
  if (property.client_name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: property.client_name, size: 28, color: "555555" })],
      }),
    );
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800 },
      children: [new TextRun({ text: dateStr, size: 28 })],
    }),
  );

  // Contents page
  children.push(
    new Paragraph({
      pageBreakBefore: true,
      spacing: { after: 300 },
      children: [new TextRun({ text: "Contents", bold: true, size: 48 })],
    }),
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "If page numbers below are blank, press F9 in Word to update the table.",
          italics: true,
          size: 20,
          color: "666666",
        }),
      ],
      spacing: { after: 300 },
    }),
  );
  children.push(new TableOfContents("Rooms", { hyperlink: true, headingStyleRange: "1-1" }));

  // Rooms
  const thirdW = Math.floor(CONTENT_W_DXA / 3);
  const wideImgW = 300; // px
  const wideImgH = 200;
  const itemImgW = 260;
  const itemImgH = 190;

  for (const room of orderedRooms) {
    children.push(
      new Paragraph({
        pageBreakBefore: true,
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 240 },
        children: [new TextRun({ text: room.name, bold: true, size: 44 })],
      }),
    );

    if (room.wides.length > 0) {
      const wideCells: TableCell[] = [];
      for (let i = 0; i < 3; i++) {
        const w = room.wides[i];
        const img = w ? cache.get(w.photo_url) ?? null : null;
        wideCells.push(
          new TableCell({
            width: { size: thirdW, type: WidthType.DXA },
            borders: noBorders(),
            margins: { top: 60, bottom: 60, left: 60, right: 60 },
            children: [imageParagraph(img, wideImgW, wideImgH)],
          }),
        );
      }
      children.push(
        new Table({
          width: { size: CONTENT_W_DXA, type: WidthType.DXA },
          columnWidths: [thirdW, thirdW, CONTENT_W_DXA - thirdW * 2],
          rows: [new TableRow({ children: wideCells })],
        }),
      );
      children.push(new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }));
    }

    const roomItems = itemsByRoom.get(room.id) ?? [];
    // 3-column grid of items
    for (let i = 0; i < roomItems.length; i += 3) {
      const rowItems = roomItems.slice(i, i + 3);
      const cells: TableCell[] = [];
      for (let c = 0; c < 3; c++) {
        const it = rowItems[c];
        if (!it) {
          cells.push(
            new TableCell({
              width: { size: thirdW, type: WidthType.DXA },
              borders: noBorders(),
              children: [new Paragraph("")],
            }),
          );
          continue;
        }
        const img = it.photo_url ? cache.get(it.photo_url) ?? null : null;
        const cellChildren: Paragraph[] = [imageParagraph(img, itemImgW, itemImgH)];
        cellChildren.push(textParagraph(it.item_name || "Unnamed", { bold: true, size: 24 }));
        if (it.description)
          cellChildren.push(textParagraph(it.description, { size: 20 }));
        if (it.condition)
          cellChildren.push(
            textParagraph(`Condition: ${it.condition}`, { size: 20, color: "444444" }),
          );
        const comment = commentFor(report.report_type, it);
        if (comment)
          cellChildren.push(
            textParagraph(`${comment.label}: ${comment.value}`, { size: 20, color: "1F3A68" }),
          );
        cells.push(
          new TableCell({
            width: { size: thirdW, type: WidthType.DXA },
            borders: noBorders(),
            margins: { top: 100, bottom: 200, left: 100, right: 100 },
            verticalAlign: VerticalAlign.TOP,
            children: cellChildren,
          }),
        );
      }
      children.push(
        new Table({
          width: { size: CONTENT_W_DXA, type: WidthType.DXA },
          columnWidths: [thirdW, thirdW, CONTENT_W_DXA - thirdW * 2],
          rows: [new TableRow({ children: cells, cantSplit: true })],
        }),
      );
    }

    if (roomItems.length === 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "No items in this room.", italics: true, color: "666666" }),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    creator: "Elle Inventory Solutions",
    title: `${report.report_type} — ${property.address}`,
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 44, bold: true, font: "Arial", color: "1F3A68" },
          paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: PAGE_W,
              height: PAGE_H,
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
          },
        },
        children,
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// PDF construction
// ---------------------------------------------------------------------------

async function buildPdf(args: {
  property: Property;
  report: Report;
  dateStr: string;
  orderedRooms: Array<{ id: string | "unallocated"; name: string; wides: WideShot[] }>;
  itemsByRoom: Map<string | "unallocated", Item[]>;
  cache: Map<string, FetchedImg | null>;
}): Promise<Uint8Array> {
  const { property, report, dateStr, orderedRooms, itemsByRoom, cache } = args;

  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const helvI = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const PW = 792;
  const PH = 612;
  const M = 36;
  const CW = PW - M * 2; // 720
  const NAVY = rgb(0.12, 0.23, 0.41);
  const GREY = rgb(0.33, 0.33, 0.33);
  const LIGHT = rgb(0.85, 0.85, 0.85);

  // Embed images helper
  const embedded = new Map<string, PDFImage | null>();
  async function embed(url: string | null | undefined): Promise<PDFImage | null> {
    if (!url) return null;
    if (embedded.has(url)) return embedded.get(url)!;
    const img = cache.get(url);
    if (!img) {
      embedded.set(url, null);
      return null;
    }
    try {
      const emb = img.kind === "png" ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
      embedded.set(url, emb);
      return emb;
    } catch {
      embedded.set(url, null);
      return null;
    }
  }

  function drawTextLine(page: ReturnType<typeof pdf.addPage>, text: string, x: number, y: number, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    page.drawText(text, {
      x,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? helv,
      color: opts.color ?? rgb(0, 0, 0),
    });
  }

  function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(trial, size) > maxWidth && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = trial;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function drawImageBox(
    page: ReturnType<typeof pdf.addPage>,
    img: PDFImage | null,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    // frame
    page.drawRectangle({ x, y, width: w, height: h, borderColor: LIGHT, borderWidth: 0.5 });
    if (!img) {
      const label = "no photo";
      const size = 10;
      const tw = helv.widthOfTextAtSize(label, size);
      drawTextLine(page, label, x + (w - tw) / 2, y + h / 2 - 4, { color: GREY, size });
      return;
    }
    const iw = img.width;
    const ih = img.height;
    const scale = Math.min(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    page.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
  }

  // Room pages: build first, tracking start page (1-based, will offset by title+TOC pages later)
  type RoomStart = { name: string; page: number };
  const roomStarts: RoomStart[] = [];

  // helper to add a room page and return its index
  function newPage() {
    return pdf.addPage([PW, PH]);
  }

  // Card dimensions
  const cardGap = 12;
  const cardsPerRow = 3;
  const cardW = (CW - cardGap * (cardsPerRow - 1)) / cardsPerRow;
  const imgH = 130;
  const textLines = 4; // approx
  const textLineH = 11;
  const cardH = imgH + 8 + textLines * textLineH + 8; // ~ 190
  const roomTitleH = 30;
  const wideRowH = 130;
  const wideGap = 12;
  const wideW = (CW - wideGap * (cardsPerRow - 1)) / cardsPerRow;

  function drawRoomHeader(page: ReturnType<typeof pdf.addPage>, name: string) {
    page.drawRectangle({ x: M, y: PH - M - roomTitleH, width: CW, height: roomTitleH, color: NAVY });
    drawTextLine(page, name, M + 12, PH - M - 20, {
      font: helvB,
      size: 16,
      color: rgb(1, 1, 1),
    });
  }

  function drawContinuationHeader(page: ReturnType<typeof pdf.addPage>, name: string) {
    drawTextLine(page, `${name} (continued)`, M, PH - M - 12, {
      font: helvB,
      size: 12,
      color: NAVY,
    });
  }

  function drawItemCard(
    page: ReturnType<typeof pdf.addPage>,
    x: number,
    y: number,
    it: Item,
    img: PDFImage | null,
  ) {
    // y is the top of the card
    const topY = y;
    drawImageBox(page, img, x, topY - imgH, cardW, imgH);
    let ty = topY - imgH - 4;
    // Item name
    const nameSize = 10;
    const nameLines = wrapText(it.item_name || "Unnamed", helvB, nameSize, cardW);
    for (const line of nameLines.slice(0, 2)) {
      ty -= 11;
      drawTextLine(page, line, x, ty, { font: helvB, size: nameSize });
    }
    // Description
    if (it.description) {
      const lines = wrapText(it.description, helv, 9, cardW);
      for (const line of lines.slice(0, 2)) {
        ty -= 10;
        drawTextLine(page, line, x, ty, { size: 9 });
      }
    }
    // Condition
    if (it.condition) {
      const lines = wrapText(`Condition: ${it.condition}`, helv, 9, cardW);
      for (const line of lines.slice(0, 2)) {
        ty -= 10;
        drawTextLine(page, line, x, ty, { size: 9, color: GREY });
      }
    }
    // Comment
    const comment = commentFor(report.report_type, it);
    if (comment) {
      const lines = wrapText(`${comment.label}: ${comment.value}`, helv, 9, cardW);
      for (const line of lines.slice(0, 2)) {
        ty -= 10;
        drawTextLine(page, line, x, ty, { size: 9, color: NAVY });
      }
    }
  }

  // Draw rooms
  for (const room of orderedRooms) {
    let page = newPage();
    const startIdx = pdf.getPageCount() - 1; // 0-based
    roomStarts.push({ name: room.name, page: startIdx });

    drawRoomHeader(page, room.name);
    let cursorTop = PH - M - roomTitleH - 12;

    // Wide shots
    if (room.wides.length > 0) {
      for (let i = 0; i < 3; i++) {
        const w = room.wides[i];
        const x = M + i * (wideW + wideGap);
        const img = w ? await embed(w.photo_url) : null;
        drawImageBox(page, img, x, cursorTop - wideRowH, wideW, wideRowH);
      }
      cursorTop = cursorTop - wideRowH - 16;
    }

    const roomItems = itemsByRoom.get(room.id) ?? [];
    if (roomItems.length === 0) {
      drawTextLine(page, "No items in this room.", M, cursorTop - 12, {
        font: helvI,
        size: 11,
        color: GREY,
      });
      continue;
    }

    // Flow item cards
    let col = 0;
    let rowTop = cursorTop;

    for (let i = 0; i < roomItems.length; i++) {
      const it = roomItems[i];
      const img = await embed(it.photo_url);

      // New row needed?
      if (col === 0) {
        // Check vertical space
        if (rowTop - cardH < M) {
          // new continuation page
          page = newPage();
          drawContinuationHeader(page, room.name);
          rowTop = PH - M - 20;
        }
      }

      const x = M + col * (cardW + cardGap);
      drawItemCard(page, x, rowTop, it, img);
      col += 1;
      if (col >= cardsPerRow) {
        col = 0;
        rowTop -= cardH + 12;
      }
    }
  }

  // Now insert title + TOC pages at the front (2 pages)
  const roomPagesShift = 2;

  const titlePage = pdf.insertPage(0, [PW, PH]);
  // Elle Inventory Solutions
  const brandSize = 36;
  const brandText = "Elle Inventory Solutions";
  const brandW = helvB.widthOfTextAtSize(brandText, brandSize);
  titlePage.drawText(brandText, {
    x: (PW - brandW) / 2,
    y: PH - 160,
    size: brandSize,
    font: helvB,
    color: NAVY,
  });
  const typeText = `${report.report_type} report`;
  const typeSize = 28;
  const typeW = helvB.widthOfTextAtSize(typeText, typeSize);
  titlePage.drawText(typeText, {
    x: (PW - typeW) / 2,
    y: PH - 250,
    size: typeSize,
    font: helvB,
  });
  const addrSize = 20;
  const addrW = helv.widthOfTextAtSize(property.address, addrSize);
  titlePage.drawText(property.address, {
    x: (PW - addrW) / 2,
    y: PH - 320,
    size: addrSize,
    font: helv,
  });
  const pcSize = 16;
  const pcW = helv.widthOfTextAtSize(property.postcode, pcSize);
  titlePage.drawText(property.postcode, {
    x: (PW - pcW) / 2,
    y: PH - 348,
    size: pcSize,
    font: helv,
    color: GREY,
  });
  if (property.client_name) {
    const cnW = helv.widthOfTextAtSize(property.client_name, pcSize);
    titlePage.drawText(property.client_name, {
      x: (PW - cnW) / 2,
      y: PH - 376,
      size: pcSize,
      font: helv,
      color: GREY,
    });
  }
  const dateW = helv.widthOfTextAtSize(dateStr, 14);
  titlePage.drawText(dateStr, {
    x: (PW - dateW) / 2,
    y: 100,
    size: 14,
    font: helv,
  });

  const tocPage = pdf.insertPage(1, [PW, PH]);
  tocPage.drawText("Contents", {
    x: M,
    y: PH - M - 20,
    size: 24,
    font: helvB,
    color: NAVY,
  });
  let ty = PH - M - 60;
  for (const rs of roomStarts) {
    const pageNum = rs.page + roomPagesShift + 1; // 1-based, after shift
    const label = rs.name;
    tocPage.drawText(label, { x: M, y: ty, size: 14, font: helv });
    const numStr = String(pageNum);
    const nw = helv.widthOfTextAtSize(numStr, 14);
    tocPage.drawText(numStr, { x: PW - M - nw, y: ty, size: 14, font: helv });
    // dot leader
    const dotStartX = M + helv.widthOfTextAtSize(label, 14) + 6;
    const dotEndX = PW - M - nw - 6;
    if (dotEndX > dotStartX) {
      tocPage.drawLine({
        start: { x: dotStartX, y: ty + 2 },
        end: { x: dotEndX, y: ty + 2 },
        thickness: 0.5,
        color: LIGHT,
        dashArray: [1, 3],
      });
    }
    ty -= 22;
    if (ty < M) break;
  }

  const bytes = await pdf.save();
  return bytes;
}