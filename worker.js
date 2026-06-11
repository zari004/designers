// ═══════════════════════════════════════════════
// CLOUDFLARE WORKER — Notion API CORS Proxy
//
// Joylashtirish:
//   1. https://workers.cloudflare.com/ → Log in
//   2. Workers & Pages → Create application → Create Worker
//   3. Ushbu kodni to'liq nusxalab "Edit code" oynasiga joylashtiring
//   4. Deploy → sizning URL'ingiz chiqadi, masalan:
//      https://notion-proxy.SIZNING-ISM.workers.dev
//   5. EXON Paneli → Sozlamalar → Notion → CORS proxy URL maydoniga
//      ushbu URL'ni kiriting va Saqlash bosing
// ═══════════════════════════════════════════════

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  const target = 'https://api.notion.com' + url.pathname + url.search;

  // Yuborishdan oldin brauzer qo'shgan xizmat sarlavhalarini olib tashlash
  const headers = new Headers(request.headers);
  const REMOVE = ['host','cf-connecting-ip','cf-ipcountry','cf-ray','cf-visitor','x-forwarded-for','x-real-ip'];
  REMOVE.forEach(h => headers.delete(h));

  const init = {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'follow',
  };

  let response;
  try {
    response = await fetch(target, init);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  // Notion javobiga CORS sarlavhalarini qo'shib qaytarish
  const respHeaders = new Headers(response.headers);
  Object.entries(corsHeaders()).forEach(([k, v]) => respHeaders.set(k, v));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: respHeaders,
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Notion-Version',
    'Access-Control-Max-Age': '86400',
  };
}
