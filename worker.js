const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;

const RETRYABLE_STATUS = new Set([
  401, // API key bermasalah
  403, // API key/project ditolak
  429, // Rate limit / quota
  500,
  502,
  503,
  504
]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders()
    }
  });
}

async function callGemini(apiKey, payload) {
  const geminiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  return fetch(geminiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(payload)
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ==========================================
    // Gemini API endpoint
    // ==========================================
    if (url.pathname === "/api/gemini") {

      // CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders()
        });
      }

      // Only POST is allowed
      if (request.method !== "POST") {
        return jsonResponse(
          { error: "Method tidak diizinkan." },
          405
        );
      }

      // ==========================================
      // Check Gemini Secrets
      // ==========================================
      const apiKeys = [
        env.GEMINI_API_KEY_1,
        env.GEMINI_API_KEY_2
      ].filter(Boolean);

      if (apiKeys.length === 0) {
        return jsonResponse(
          {
            error:
              "AI service belum dikonfigurasi di server."
          },
          503
        );
      }

      // ==========================================
      // Request size protection
      // ==========================================
      const contentLength =
        Number(request.headers.get("content-length") || 0);

      if (contentLength > MAX_REQUEST_BYTES) {
        return jsonResponse(
          {
            error:
              "Foto/request terlalu besar. Silakan gunakan foto yang lebih kecil."
          },
          413
        );
      }

      // ==========================================
      // Read request body
      // ==========================================
      let payload;

      try {
        const raw = await request.text();

        if (raw.length > MAX_REQUEST_BYTES) {
          return jsonResponse(
            { error: "Request terlalu besar." },
            413
          );
        }

        payload = JSON.parse(raw);

      } catch {
        return jsonResponse(
          { error: "Request AI tidak valid." },
          400
        );
      }

      // ==========================================
      // Validate Gemini request
      // ==========================================
      if (!payload || !Array.isArray(payload.contents)) {
        return jsonResponse(
          {
            error:
              "Format request AI tidak valid."
          },
          400
        );
      }

      // ==========================================
      // Gemini Failover
      //
      // KEY 1 = Primary
      // KEY 2 = Backup
      // ==========================================
      let lastStatus = 502;

      for (let i = 0; i < apiKeys.length; i++) {

        const apiKey = apiKeys[i];

        try {
          const upstream =
            await callGemini(apiKey, payload);

          const text = await upstream.text();

          // Gemini berhasil
          if (upstream.ok) {
            return new Response(text, {
              status: upstream.status,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
                ...corsHeaders()
              }
            });
          }

          lastStatus = upstream.status;

          // ========================================
          // Kalau error yang bisa dicoba ulang,
          // lanjut ke API Key berikutnya.
          // ========================================
          if (RETRYABLE_STATUS.has(upstream.status)) {

            // Kalau masih ada key berikutnya,
            // coba key berikutnya.
            if (i < apiKeys.length - 1) {
              continue;
            }

            // Semua key sudah dicoba
            return jsonResponse(
              {
                error:
                  "Layanan AI sedang sibuk atau kuota sementara tercapai. Silakan coba lagi beberapa saat."
              },
              upstream.status === 429 ? 429 : 503
            );
          }

          // ========================================
          // Error 400 dan error request lainnya
          // tidak perlu pindah API Key.
          // ========================================
          return new Response(text, {
            status: upstream.status,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              ...corsHeaders()
            }
          });

        } catch (error) {

          // Network error → coba key berikutnya
          lastStatus = 502;

          if (i < apiKeys.length - 1) {
            continue;
          }
        }
      }

      // ==========================================
      // Semua API Key gagal
      // ==========================================
      return jsonResponse(
        {
          error:
            "Tidak dapat terhubung ke layanan Gemini. Silakan coba lagi."
        },
        lastStatus
      );
    }

    // ==========================================
    // Serve PWA/static frontend
    // ==========================================
    return env.ASSETS.fetch(request);
  }
};
