import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/reports/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = (params as { token: string }).token;
        if (!token || token.length < 16 || !/^[a-f0-9]+$/i.test(token)) {
          return new Response("Not found", { status: 404 });
        }
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: rep } = await supabaseAdmin
          .from("reports")
          .select("pdf_path")
          .eq("share_token", token)
          .maybeSingle();
        const pdfPath = (rep as { pdf_path: string | null } | null)?.pdf_path;
        if (!pdfPath) return new Response("Not found", { status: 404 });
        const { data: file, error } = await supabaseAdmin.storage
          .from("reports")
          .download(pdfPath);
        if (error || !file) return new Response("Not found", { status: 404 });
        const buf = await file.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'inline; filename="report.pdf"',
            "cache-control": "private, max-age=60",
          },
        });
      },
    },
  },
});