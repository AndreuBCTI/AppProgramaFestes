const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqUrl = req.url.split('?')[0];

  // Alias /mapRuteConfig to /mapRuteConfig.html
  if (reqUrl === '/mapRuteConfig' || reqUrl === '/mapRuteConfig/') {
    reqUrl = '/mapRuteConfig.html';
  }
  if (reqUrl === '/') reqUrl = '/index.html';

  // Handle POST /api/save-route
  if (req.method === 'POST' && reqUrl === '/api/save-route') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const programPath = path.join(__dirname, 'data', 'program.json');
        const programJsPath = path.join(__dirname, 'data', 'program.js');
        
        const programData = JSON.parse(fs.readFileSync(programPath, 'utf8'));
        const ev = programData.find(x => x.id === payload.id);

        if (ev) {
          if (!ev.route_info) ev.route_info = {};
          ev.route_info.waypoints = payload.waypoints || [];
          ev.route_info.coordinates = payload.coordinates || [];
          ev.route_info.is_configured = true;
          ev.route_info.is_manual = true;
          ev.route_info.has_route = true;

          fs.writeFileSync(programPath, JSON.stringify(programData, null, 2));
          fs.writeFileSync(programJsPath, 'window.PROGRAM_DATA = ' + JSON.stringify(programData, null, 2) + ';\n');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Itinerari guardat correctament!' }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Acte no trobat' }));
        }
      } catch (err) {
        console.error("Error saving route:", err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
    return;
  }
  
  const filePath = path.join(__dirname, reqUrl);
  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
      }
    } else {
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Local server running at http://localhost:${PORT}/`);
  console.log(`Configurador d'itineraris disponible a http://localhost:${PORT}/mapRuteConfig`);
});
