import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  photoUrl: z.string().url(),
  reportType: z.enum(["Inventory", "Check In", "Check Out", "Update"]),
});

const COMMENT_FIELD_BY_TYPE = {
  Inventory: null,
  "Check In": "check_in_comment",
  "Check Out": "check_out_comment",
  Update: "update_comment",
} as const;

export const analyzeItemPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // Fetch the brain for this report type at call time so prompt edits
    // take effect without a code change.
    const { data: brain, error: brainErr } = await context.supabase
      .from("brains")
      .select("prompt_content")
      .eq("report_type", data.reportType)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (brainErr) throw brainErr;
    if (!brain?.prompt_content) {
      throw new Error(
        `No AI brain is configured for "${data.reportType}" reports yet. Ask an admin to add one in Settings → Brains, then try again.`,
      );
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: brain.prompt_content },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Report type: ${data.reportType}. Analyse the photo and produce inventory notes as strict JSON.`,
              },
              { type: "image_url", image_url: { url: data.photoUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("AI rate limit reached, please retry.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`AI error ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const item_name =
      typeof parsed.item_name === "string" && (parsed.item_name as string).trim()
        ? (parsed.item_name as string).trim()
        : "Unidentified item";
    const description =
      typeof parsed.description === "string" ? (parsed.description as string).trim() : "";
    const condition =
      typeof parsed.condition === "string" ? (parsed.condition as string).trim() : "";

    const commentField = COMMENT_FIELD_BY_TYPE[data.reportType];
    let comment = "";
    if (commentField) {
      const v = parsed[commentField];
      comment = typeof v === "string" ? v.trim() : "";
    }

    return {
      item_name,
      description,
      condition,
      check_in_comment: commentField === "check_in_comment" ? comment : "",
      check_out_comment: commentField === "check_out_comment" ? comment : "",
      update_comment: commentField === "update_comment" ? comment : "",
    };
  });