const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    // Se o pedido for para descarregar o APK
    if (req.url.endsWith('.apk')) {
        const apkPath = path.join(__dirname, req.url);
        fs.readFile(apkPath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Ficheiro APK nao encontrado.');
            } else {
                res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive' });
                res.end(data);
            }
        });
        return;
    }

    // Caso contrário, serve o index.html da landing page
    const indexPath = path.join(__dirname, 'index.html');
    fs.readFile(indexPath, 'utf8', (err, data) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Erro ao carregar a página de downloads.');
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Servidor da landing page a correr na porta ${PORT}`);
});