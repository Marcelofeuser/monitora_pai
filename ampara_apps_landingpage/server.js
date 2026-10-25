const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const APPS = {
  crianca: {
    title: 'Ampara Criança',
    description: 'O app para a criança conversar com a família e usar o código de 8 dígitos gerado pelo responsável.',
    android: process.env.CHILD_ANDROID_APK_URL,
    ios: process.env.CHILD_IOS_DISTRIBUTION_URL,
  },
  responsavel: {
    title: 'Ampara Responsáveis',
    description: 'O app para responsáveis gerenciarem os perfis da família e criarem o pareamento seguro da criança.',
    android: process.env.PARENT_ANDROID_APK_URL,
    ios: process.env.PARENT_IOS_DISTRIBUTION_URL,
  },
};

function validDownloadUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(appKey, available, detectedPlatform) {
  const app = APPS[appKey];
  const downloads = [
    ['android', 'APK Android', available.android],
    ['ios', 'Distribuição iOS', available.ios],
  ].filter(([platform, , downloadUrl]) => downloadUrl && (!detectedPlatform || platform === detectedPlatform));
  const status = detectedPlatform && !available[detectedPlatform]
    ? detectedPlatform === 'ios'
      ? 'A instalação pública de apps pelo site no Brasil exige um marketplace alternativo autorizado pela Apple. Essa distribuição ainda não está disponível.'
      : 'O APK de lançamento deste app ainda não está disponível para download.'
    : downloads.length
      ? detectedPlatform === 'android'
        ? 'Baixe o APK. O Android poderá pedir autorização para instalar apps baixados pelo navegador.'
        : 'Continue para a instalação oferecida pelo marketplace autorizado.'
      : 'Os links de download ainda estão sendo preparados.';
  const downloadLinks = downloads.map(([platform, name, url]) =>
    `<a class="store" href="${escapeHtml(url)}">${platform === 'android' ? 'Baixar' : 'Continuar para'} ${name}</a>`,
  ).join('');
  const switchLink = appKey === 'crianca'
    ? '<a class="secondary" href="/responsavel">Precisa do app de responsável?</a>'
    : '<a class="secondary" href="/crianca">Precisa do app da criança?</a>';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f3fbf8">
  <title>Baixar ${escapeHtml(app.title)} | Ampara Kids</title>
  <style>
    :root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172b3b;background:#f3fbf8;font-synthesis:none;text-rendering:optimizeLegibility}
    *{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px}
    main{width:min(100%,520px);padding:clamp(28px,7vw,52px);border:1px solid #dcebe5;border-radius:28px;background:#fff;box-shadow:0 20px 60px #173c2d12;text-align:center}
    .mark{width:62px;height:62px;margin:0 auto 22px;display:grid;place-items:center;border-radius:22px;background:#e5f7f0;color:#087b68;font-size:36px;font-weight:700}
    .eyebrow{margin:0 0 10px;color:#087b68;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
    h1{margin:0;font-size:clamp(28px,7vw,38px);letter-spacing:-.04em}p{color:#607281;line-height:1.65}
    .status{margin:24px 0 16px;padding:16px;border-radius:16px;background:#f1f8f5;color:#35564d;font-size:15px}
    .store{display:block;margin-top:10px;padding:15px;border-radius:14px;background:#087b68;color:#fff;font-weight:700;text-decoration:none}
    .secondary{display:inline-block;margin-top:20px;color:#087b68;font-size:14px;font-weight:650;text-decoration:none}
    footer{margin-top:30px;color:#82919b;font-size:12px}
  </style>
</head>
<body><main>
  <div class="mark" aria-hidden="true">♡</div>
  <p class="eyebrow">Ampara Kids</p>
  <h1>${escapeHtml(app.title)}</h1>
  <p>${escapeHtml(app.description)}</p>
  <div class="status" role="status">${escapeHtml(status)}</div>
  ${downloadLinks}
  ${switchLink}
  <footer>Depois de instalar, abra o app e siga as instruções de pareamento.</footer>
</main></body></html>`;
}

function detectPlatform(userAgent = '') {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && /Mobile/i.test(userAgent))) return 'ios';
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname.replace(/\/+$/, '') || '/';
  const appKey = ['/responsavel', '/baixar/responsavel'].includes(route) ? 'responsavel' : 'crianca';
  const supportedRoutes = ['/', '/crianca', '/responsavel', '/baixar/crianca', '/baixar/responsavel'];

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  if (!supportedRoutes.includes(route)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Página não encontrada.');
  }

  const available = {
    android: validDownloadUrl(APPS[appKey].android),
    ios: validDownloadUrl(APPS[appKey].ios),
  };
  const platform = detectPlatform(req.headers['user-agent']);
  if (platform && available[platform]) {
    res.writeHead(302, { Location: available[platform] });
    return res.end();
  }

  const body = page(appKey, available, platform);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  return res.end(req.method === 'HEAD' ? undefined : body);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Ampara app download page listening on ${PORT}`);
});
