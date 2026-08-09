const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/gemini") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        });
      }

      if (request.method !== "POST") {
        return Response.json({ error: "Method tidak diizinkan." }, { status: 405 });
      }

      if (!env.GEMINI_API_KEY) {
        return Response.json(
          { error: "AI service belum dikonfigurasi di server." },
          { status: 503 }
        );
      }

      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > MAX_REQUEST_BYTES) {
        return Response.json(
          { error: "Foto/request terlalu besar. Silakan gunakan foto yang lebih kecil." },
          { status: 413 }
        );
      }

      let payload;
      try {
        const raw = await request.text();
        if (raw.length > MAX_REQUEST_BYTES) {
          return Response.json(
            { error: "Request terlalu besar." },
            { status: 413 }
          );
        }
        payload = JSON.parse(raw);
      } catch {
        return Response.json({ error: "Request AI tidak valid." }, { status: 400 });
      }

      if (!payload || !Array.isArray(payload.contents)) {
        return Response.json(
          { error: "Format request AI tidak valid." },
          { status: 400 }
        );
      }

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

      try {
        const upstream = await fetch(geminiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify(payload)
        });

        const text = await upstream.text();
        return new Response(text, {
          status: upstream.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        });
      } catch {
        return Response.json(
          { error: "Tidak dapat terhubung ke layanan Gemini." },
          { status: 502 }
        );
      }
    }

    // Serve the PWA/static frontend from Cloudflare Workers Assets.
    return env.ASSETS.fetch(request);
  }
};
