const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;

// Status yang memungkinkan Worker mencoba API Key berikutnya.
const RETRYABLE_STATUS = new Set([
  401, // Unauthorized / API key bermasalah
  403, // Forbidden / project atau permission bermasalah
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
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      ...corsHeaders()
    }
  });
}

/**
 * Mengambil pesan error yang aman dan mudah dibaca
 * dari response Gemini.
 */
function extractGeminiError(text, status) {
  let data = null;

  try {
    data = JSON.parse(text);
  } catch {
    // Response bukan JSON
  }

  const geminiError = data?.error;

  // Jika Gemini mengembalikan:
  // { error: { message: "...", status: "...", code: 429 } }
  if (geminiError && typeof geminiError === "object") {
    if (geminiError.message) {
      return geminiError.message;
    }

    if (geminiError.status) {
      return geminiError.status;
    }
  }

  // Jika error berupa string
  if (typeof geminiError === "string") {
    return geminiError;
  }

  // Response text biasa
  if (text && typeof text === "string") {
    return text.slice(0, 500);
  }

  return `Layanan Gemini gagal (HTTP ${status}).`;
}

/**
 * Pesan yang lebih ramah untuk pengguna.
 */
function getFriendlyError(status, originalMessage = "") {
  if (status === 429) {
    return "Layanan AI sedang sibuk atau kuota sementara tercapai. Silakan coba lagi beberapa saat.";
  }

  if (status === 401 || status === 403) {
    return "Layanan AI sedang mengalami kendala konfigurasi. Silakan coba lagi nanti.";
  }

  if (status >= 500) {
    return "Layanan AI sedang mengalami gangguan sementara. Silakan coba lagi.";
  }

  return originalMessage || `Layanan AI gagal (HTTP ${status}).`;
}

/**
 * Memanggil Gemini.
 */
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
    // GEMINI API
    // ==========================================
    if (url.pathname === "/api/gemini") {

      // ------------------------------------------
      // CORS Preflight
      // ------------------------------------------
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders()
        });
      }

      // ------------------------------------------
      // Hanya POST
      // ------------------------------------------
      if (request.method !== "POST") {
        return jsonResponse(
          {
            error: "Method tidak diizinkan."
          },
          405
        );
      }

      // ------------------------------------------
      // Ambil kedua Secret
      // ------------------------------------------
      const apiKeys = [
        env.GEMINI_API_KEY_1,
        env.GEMINI_API_KEY_2
      ].filter(
        key => typeof key === "string" && key.trim().length > 0
      );

      if (apiKeys.length === 0) {
        return jsonResponse(
          {
            error:
              "AI service belum dikonfigurasi di server."
          },
          503
        );
      }

      // ------------------------------------------
      // Proteksi ukuran request
      // ------------------------------------------
      const contentLength = Number(
        request.headers.get("content-length") || 0
      );

      if (contentLength > MAX_REQUEST_BYTES) {
        return jsonResponse(
          {
            error:
              "Foto/request terlalu besar. Silakan gunakan foto yang lebih kecil."
          },
          413
        );
      }

      // ------------------------------------------
      // Baca request body
      // ------------------------------------------
      let payload;

      try {
        const raw = await request.text();

        if (raw.length > MAX_REQUEST_BYTES) {
          return jsonResponse(
            {
              error: "Request terlalu besar."
            },
            413
          );
        }

        payload = JSON.parse(raw);

      } catch {
        return jsonResponse(
          {
            error: "Request AI tidak valid."
          },
          400
        );
      }

      // ------------------------------------------
      // Validasi format Gemini
      // ------------------------------------------
      if (
        !payload ||
        !Array.isArray(payload.contents)
      ) {
        return jsonResponse(
          {
            error:
              "Format request AI tidak valid."
          },
          400
        );
      }

      // ==========================================
      // GEMINI FAILOVER
      // ==========================================

      let lastStatus = 502;
      let lastMessage =
        "Tidak dapat terhubung ke layanan Gemini.";

      for (let i = 0; i < apiKeys.length; i++) {

        const apiKey = apiKeys[i];

        try {
          const upstream = await callGemini(
            apiKey,
            payload
          );

          const text = await upstream.text();

          // ----------------------------------------
          // BERHASIL
          // ----------------------------------------
          if (upstream.ok) {
            return new Response(text, {
              status: upstream.status,
              headers: {
                "Content-Type":
                  "application/json; charset=UTF-8",
                "Cache-Control": "no-store",
                ...corsHeaders()
              }
            });
          }

          // ----------------------------------------
          // GAGAL
          // ----------------------------------------
          lastStatus = upstream.status;

          const rawError = extractGeminiError(
            text,
            upstream.status
          );

          lastMessage = getFriendlyError(
            upstream.status,
            rawError
          );

          // ----------------------------------------
          // Jika error bisa di-fallback,
          // lanjut ke API Key berikutnya.
          // ----------------------------------------
          if (
            RETRYABLE_STATUS.has(
              upstream.status
            ) &&
            i < apiKeys.length - 1
          ) {
            continue;
          }

          // ----------------------------------------
          // Tidak ada key lagi / error bukan
          // error yang perlu fallback.
          //
          // Penting:
          // error dikembalikan sebagai STRING,
          // bukan object.
          //
          // Ini memperbaiki:
          // "Maaf, terjadi kesalahan: [object Object]"
          // ----------------------------------------
          return jsonResponse(
            {
              error: lastMessage,
              code: upstream.status
            },
            upstream.status >= 500
              ? 503
              : upstream.status
          );

        } catch (error) {

          // ----------------------------------------
          // Network / fetch error
          // ----------------------------------------
          lastStatus = 502;
          lastMessage =
            "Tidak dapat terhubung ke layanan Gemini.";

          // Kalau masih ada API Key berikutnya,
          // coba key berikutnya.
          if (i < apiKeys.length - 1) {
            continue;
          }

          return jsonResponse(
            {
              error: lastMessage,
              code: 502
            },
            502
          );
        }
      }

      // ==========================================
      // Semua API Key gagal
      // ==========================================
      return jsonResponse(
        {
          error: lastMessage,
          code: lastStatus
        },
        lastStatus
      );
    }

    // ==========================================
    // STATIC / PWA ASSETS
    // ==========================================
    return env.ASSETS.fetch(request);
  }
};
