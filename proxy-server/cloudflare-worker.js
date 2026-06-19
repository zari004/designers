export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Health check
    if (request.method === 'GET') {
      return json({ status: 'ok', service: 'EXON TG Proxy', version: '2.0.0' });
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/bot([^/]+)\/(.+)$/);
    if (!match) {
      return json({ ok: false, description: 'Invalid path' }, 400);
    }

    const [, token, method] = match;
    const tgUrl = `https://api.telegram.org/bot${token}/${method}`;

    try {
      // So'rovni to'g'ridan-to'g'ri Telegram API ga uzatish (stream)
      const tgRes = await fetch(tgUrl, {
        method: 'POST',
        body: request.body,
        headers: {
          'Content-Type': request.headers.get('Content-Type') || 'application/json',
        },
        duplex: 'half',
      });

      const data = await tgRes.text();
      return new Response(data, {
        status: tgRes.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (err) {
      return json({ ok: false, description: err.message }, 500);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
