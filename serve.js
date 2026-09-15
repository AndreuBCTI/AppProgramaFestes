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
        const locPath = path.join(__dirname, 'data', 'locations.json');
        const locJsPath = path.join(__dirname, 'data', 'locations.js');
        
        const locationsData = JSON.parse(fs.readFileSync(locPath, 'utf8'));
        const locId = payload.location_id || payload.id;

        if (locId && locationsData[locId]) {
          const loc = locationsData[locId];
          if (!loc.route_info) loc.route_info = { has_route: true };
          loc.route_info.waypoints = payload.waypoints || [];
          loc.route_info.coordinates = payload.coordinates || [];
          loc.route_info.is_configured = true;
          loc.route_info.is_manual = true;
          loc.route_info.has_route = true;

          if (payload.waypoints && payload.waypoints.length > 0) {
            loc.lat = payload.waypoints[0].lat;
            loc.lng = payload.waypoints[0].lng;
          }

          fs.writeFileSync(locPath, JSON.stringify(locationsData, null, 2));
          fs.writeFileSync(locJsPath, 'window.locationsData = ' + JSON.stringify(locationsData, null, 2) + ';\n');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Itinerari guardat correctament a locations.json!' }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Ubicació no trobada: ' + locId }));
        }
      } catch (err) {
        console.error("Error saving route:", err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
    return;
  }

  // Handle POST /api/save-location
  if (req.method === 'POST' && reqUrl === '/api/save-location') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const locPath = path.join(__dirname, 'data', 'locations.json');
        const locJsPath = path.join(__dirname, 'data', 'locations.js');
        
        const locationsData = JSON.parse(fs.readFileSync(locPath, 'utf8'));
        if (payload.id) {
          if (!locationsData[payload.id]) {
            locationsData[payload.id] = { id: payload.id };
          }
          const loc = locationsData[payload.id];
          if (payload.name !== undefined) loc.name = payload.name;
          if (payload.address !== undefined) loc.address = payload.address;
          if (payload.lat !== undefined) loc.lat = parseFloat(payload.lat);
          if (payload.lng !== undefined) loc.lng = parseFloat(payload.lng);

          fs.writeFileSync(locPath, JSON.stringify(locationsData, null, 2));
          fs.writeFileSync(locJsPath, 'window.locationsData = ' + JSON.stringify(locationsData, null, 2) + ';\n');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Ubicació guardada correctament a locations.json!' }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'ID d\'ubicació requerit' }));
        }
      } catch (err) {
        console.error("Error saving location:", err);
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
