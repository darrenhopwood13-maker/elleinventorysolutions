import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  photoUrl: z.string().url(),
  reportType: z.enum(["Inventory", "Check In", "Check Out", "Update"]),
});

const SYSTEM_PROMPT = `You are an inventory clerk assistant. Analyse a single photo of an item or feature inside a UK residential property and return concise inventory notes.

Style rules:
- Telegraphic fragments, NOT full sentences.
- No liability language, no opinions about who caused damage.
- item_name: short noun phrase, capitalised (e.g. "Front door", "Cream carpet").
- description: material / colour / fittings only. No condition, no damage.
- condition: existing wear or damage with precise counts and locations. If none visible, return "Good, no visible damage".

Example:
  item_name: "Front door"
  description: "White painted door with brass numeral 5, spyhole"
  condition: "Scuffed to low level, 1 pin hole under spyhole"

Return ONLY strict JSON: {"item_name": string, "description": string, "condition": string}. No prose, no markdown.`;

export const analyzeItemPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
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

    let parsed: { item_name?: unknown; description?: unknown; condition?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const item_name =
      typeof parsed.item_name === "string" && parsed.item_name.trim()
        ? parsed.item_name.trim()
        : "Unidentified item";
    const description =
      typeof parsed.description === "string" ? parsed.description.trim() : "";
    const condition =
      typeof parsed.condition === "string" ? parsed.condition.trim() : "";

    return { item_name, description, condition };
  });