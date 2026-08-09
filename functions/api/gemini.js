export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.GEMINI_API_KEY) return Response.json({error:"AI service belum dikonfigurasi di server."},{status:503});
  let payload;
  try {
    const raw=await request.text();
    if(raw.length>50000) return Response.json({error:"Request terlalu besar."},{status:413});
    payload=JSON.parse(raw);
  } catch { return Response.json({error:"Request AI tidak valid."},{status:400}); }
  if(!payload || !Array.isArray(payload.contents)) return Response.json({error:"Format request AI tidak valid."},{status:400});
  const url="https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";
  try {
    const upstream=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},body:JSON.stringify(payload)});
    return new Response(await upstream.text(),{status:upstream.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  } catch { return Response.json({error:"Tidak dapat terhubung ke layanan Gemini."},{status:502}); }
}
export async function onRequest(context) {
  if(context.request.method==="POST") return onRequestPost(context);
  if(context.request.method==="OPTIONS") return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"}});
  return Response.json({error:"Method tidak diizinkan."},{status:405});
}
