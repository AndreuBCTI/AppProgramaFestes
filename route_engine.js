const fs = require('fs');

const data = require('./data/program.json');
const streetsData = JSON.parse(fs.readFileSync('./streets_geom.json'));

const GRAPH = new Map(); // nodeKey -> array of { key, lat, lon, dist }
const NODES = new Map(); // nodeKey -> { lat, lon }
const STREET_NODES = new Map(); // streetName -> Set of nodeKey

const aliases = {
    "carrer cavallers": "c. cavallers",
    "plaça del pallol": "pl. del pallol",
    "plaça pallol": "pl. del pallol",
    "carrer merceria": "c. merceria",
    "carrer pare iglésias": "c. pare iglésias",
    "plaça de les cols": "pl. de les cols",
    "pl. cols": "pl. de les cols",
    "plaça cols": "pl. de les cols",
    "carrer major": "c. major",
    "baixada misericòrdia": "bda. misericòrdia",
    "carrer cós del bou": "c. cós del bou",
    "plaça de la font": "pl. de la font",
    "carrer de la nau": "c. de la nau",
    "baixada pescateria": "bda. pescateria",
    "plaça de l'esperidió": "pl. de l'esperidió",
    "plaça de l’esperidió": "pl. de l'esperidió",
    "pl. de l’esperidió": "pl. de l'esperidió",
    "carrer portalet": "c. portalet",
    "carrer sant oleguer": "c. sant oleguer",
    "jardins de la casa de la festa": "casa de la festa",
    "carrer dels descalços": "c. dels descalços",
    "carrer de les coques": "c. de les coques",
    "plaça del rei": "pl. del rei",
    "carrer santa anna": "c. santa anna",
    "plaça del fòrum": "pl. del fòrum",
    "carrer nou del patriarca": "c. nou del patriarca",
    "carrer comte de rius": "c. comte de rius",
    "carrer sant agustí": "c. sant agustí",
    "carrer unió": "c. unió",
    "plaça mitja lluna": "pl. mitja lluna",
    "carrer apodaca": "c. apodaca",
    "carrer orosi": "c. orosi",
    "carrer del comerç": "c. del comerç",
    "carrer anselm clavé": "c. anselm clavé",
    "plaça dels carros": "pl. dels carros",
    "c. del riu montsant": "c. riu montsant",
    "carrer riu montsant": "c. riu montsant",
    "carrer del riu montsant": "c. riu montsant",
    "carrer riu glorieta": "c. riu glorieta",
    "carrer riu glorieta": "c. riu glorieta",
    "carrer del riu glorieta": "c. riu glorieta",
    "c. del riu glorieta": "c. riu glorieta",
    "carrer riu fluvià amb sant benilde": "c. riu fluvià amb sant benilde",
    "carrer del riu fluvià": "c. riu fluvià",
    "c. del riu fluvià": "c. riu fluvià",
    "carrer prades": "c. prades",
    "carrer amposta": "c. amposta",
    "plaça pilar pradells": "pl. pilar pradells"
};

function cleanToken(p) {
  if (!p) return "";
  let c = p.trim().replace(/^\./, "").replace(/\.$/, "").replace(/[\(\)]/g, "").trim().toLowerCase();
  c = c.replace(/[\u200B-\u200D\uFEFF]/g, ""); 
  c = c.replace(/c\. merceria c\. pare iglésias/, "c. merceria"); 
  c = c.replace(/coca central/, "");
  c = c.replace(/tram teatre metropol/, "");
  c = c.replace(/més informació:.*/, "");
  
  c = c.replace(/^carrer\s+/i, "c. ");
  c = c.replace(/^plaça\s+/i, "pl. ");
  c = c.replace(/^baixada\s+/i, "bda. ");
  c = c.replace(/^passeig\s+/i, "pg. ");
  c = c.replace(/^passatge\s+/i, "ptge. ");
  c = c.replace(/^avinguda\s+/i, "av. ");
  
  c = c.trim();
  if (aliases[c]) return aliases[c];
  if (c === "pg. de sant antoni") return "passeig de sant antoni";
  return c;
}

function distSq(lat1, lon1, lat2, lon2) {
  return Math.pow(lat1 - lat2, 2) + Math.pow(lon1 - lon2, 2);
}
function getDist(lat1, lon1, lat2, lon2) {
  return Math.sqrt(distSq(lat1, lon1, lat2, lon2));
}

// 1. Build Graph
if (streetsData.elements) {
  streetsData.elements.forEach(el => {
    if (el.type === 'way' && el.geometry) {
      let name = el.tags && el.tags.name ? cleanToken(el.tags.name) : null;
      
      const denseGeom = [];
      for (let i = 0; i < el.geometry.length; i++) {
        denseGeom.push(el.geometry[i]);
        if (i < el.geometry.length - 1) {
          const p1 = el.geometry[i];
          const p2 = el.geometry[i+1];
          const d = getDist(p1.lat, p1.lon, p2.lat, p2.lon);
          const steps = Math.floor(d / 0.00005);
          for (let s = 1; s <= steps; s++) {
            denseGeom.push({
              lat: p1.lat + (p2.lat - p1.lat) * (s / (steps + 1)),
              lon: p1.lon + (p2.lon - p1.lon) * (s / (steps + 1))
            });
          }
        }
      }

      for (let i = 0; i < denseGeom.length; i++) {
        const pt = denseGeom[i];
        const key = `${pt.lat.toFixed(6)},${pt.lon.toFixed(6)}`;
        if (!NODES.has(key)) NODES.set(key, { lat: pt.lat, lon: pt.lon });
        
        if (!GRAPH.has(key)) GRAPH.set(key, []);
        
        if (name) {
          if (!STREET_NODES.has(name)) STREET_NODES.set(name, new Set());
          STREET_NODES.get(name).add(key);
        }
        
        if (i > 0) {
          const prev = denseGeom[i-1];
          const prevKey = `${prev.lat.toFixed(6)},${prev.lon.toFixed(6)}`;
          const d = getDist(pt.lat, pt.lon, prev.lat, prev.lon);
          
          if (!GRAPH.get(key).find(e => e.key === prevKey)) {
            GRAPH.get(key).push({ key: prevKey, lat: prev.lat, lon: prev.lon, dist: d });
          }
          if (!GRAPH.get(prevKey).find(e => e.key === key)) {
            GRAPH.get(prevKey).push({ key: key, lat: pt.lat, lon: pt.lon, dist: d });
          }
        }
      }
    }
  });
}

function addGraphConnection(lat1, lon1, lat2, lon2) {
  const k1 = `${lat1.toFixed(6)},${lon1.toFixed(6)}`;
  const k2 = `${lat2.toFixed(6)},${lon2.toFixed(6)}`;
  if (!NODES.has(k1)) NODES.set(k1, { lat: lat1, lon: lon1 });
  if (!NODES.has(k2)) NODES.set(k2, { lat: lat2, lon: lon2 });
  if (!GRAPH.has(k1)) GRAPH.set(k1, []);
  if (!GRAPH.has(k2)) GRAPH.set(k2, []);

  const d = getDist(lat1, lon1, lat2, lon2);
  if (!GRAPH.get(k1).find(e => e.key === k2)) {
    GRAPH.get(k1).push({ key: k2, lat: lat2, lon: lon2, dist: d });
  }
  if (!GRAPH.get(k2).find(e => e.key === k1)) {
    GRAPH.get(k2).push({ key: k1, lat: lat1, lon: lon1, dist: d });
  }
}

// Connect small gaps in Torreforta street network
addGraphConnection(41.1179003, 1.2147194, 41.1180359, 1.214708);
addGraphConnection(41.1160899, 1.214881, 41.1159784, 1.2149016);
addGraphConnection(41.1159784, 1.2149016, 41.1157059, 1.2128403);

function findNearestNode(lat, lon) {
  let minDist = Infinity;
  let nearest = null;
  for (const [key, node] of NODES.entries()) {
    const d = distSq(lat, lon, node.lat, node.lon);
    if (d < minDist) {
      minDist = d;
      nearest = key;
    }
  }
  if (minDist > 0.000002) return null;
  return nearest;
}

const KNOWN_LOCATIONS = {
    "jardins del camp de mart": {lat: 41.118893, lng: 1.254791},
    "portal del roser": {lat: 41.118510, lng: 1.254835},
    "pl. del pallol": {lat: 41.117969, lng: 1.255134},
    "c. cavallers": {lat: 41.117377, lng: 1.256685},
    "c. merceria": {lat: 41.117921, lng: 1.258422},
    "c. pare iglésias": {lat: 41.118451, lng: 1.258242},
    "pla de la seu": {lat: 41.118702, lng: 1.257842},
    "escales de la catedral": {lat: 41.118250, lng: 1.257900},
    "pl. de les cols": {lat: 41.118400, lng: 1.257350},
    "c. major": {lat: 41.117590, lng: 1.256863},
    "bda. misericòrdia": {lat: 41.117118, lng: 1.256313},
    "c. cós del bou": {lat: 41.116763, lng: 1.255971},
    "pl. de la font": {lat: 41.116700, lng: 1.256150},
    "c. de la nau": {lat: 41.116660, lng: 1.257400},
    "bda. pescateria": {lat: 41.116490, lng: 1.257363},
    "pl. de l'esperidió": {lat: 41.116150, lng: 1.256750},
    "c. portalet": {lat: 41.116000, lng: 1.256850},
    "rambla vella": {lat: 41.115458, lng: 1.257170},
    "via augusta": {lat: 41.115960, lng: 1.259572},
    "c. sant oleguer": {lat: 41.115350, lng: 1.256850},
    "casa de la festa": {lat: 41.115500, lng: 1.257600},
    "passeig de sant antoni": {lat: 41.117650, lng: 1.260550},
    "portal de sant antoni": {lat: 41.117250, lng: 1.259950},
    "c. dels descalços": {lat: 41.118500, lng: 1.259250},
    "c. de les coques": {lat: 41.118250, lng: 1.258050},
    "pilats": {lat: 41.116550, lng: 1.258200},
    "pl. del rei": {lat: 41.116750, lng: 1.258100},
    "c. santa anna": {lat: 41.117000, lng: 1.258300},
    "pl. del fòrum": {lat: 41.117350, lng: 1.258750},
    "c. nou del patriarca": {lat: 41.118453, lng: 1.258256},
    "rambla nova": {lat: 41.117483, lng: 1.248992},
    "c. comte de rius": {lat: 41.115899, lng: 1.253704},
    "c. sant agustí": {lat: 41.115752, lng: 1.255103},
    "al balcó del mediterrani": {lat: 41.113600, lng: 1.256300},
    "c. unió": {lat: 41.114337, lng: 1.251493},
    "pl. mitja lluna": {lat: 41.113201, lng: 1.251115},
    "c. apodaca": {lat: 41.111495, lng: 1.250377},
    "c. orosi": {lat: 41.111786, lng: 1.253005},
    "c. del comerç": {lat: 41.113200, lng: 1.253050},
    "c. anselm clavé": {lat: 41.112000, lng: 1.252000},
    "pl. dels carros": {lat: 41.112100, lng: 1.253000},
    "rambla de campclar": {lat: 41.116500, lng: 1.210400},
    "c. riu fluvià amb sant benilde": {lat: 41.120003, lng: 1.214196},
    "pl. pilar pradells": {lat: 41.115706, lng: 1.212840},
    "al davant de la font del centenari": {lat: 41.117129, lng: 1.249135},
    "c. sant domènec": {lat: 41.117286, lng: 1.255540},
    "pl. sedassos": {lat: 41.117168, lng: 1.255970},
    "c. cañellas": {lat: 41.115800, lng: 1.251000},
    "pl. corsini": {lat: 41.115626, lng: 1.250108},
    "c. lleida": {lat: 41.114500, lng: 1.250500},
    "c. sevilla": {lat: 41.114200, lng: 1.249500},
    "c. vapor": {lat: 41.113500, lng: 1.248500},
    "pl. dels infants": {lat: 41.112800, lng: 1.249000},
    "c. reial": {lat: 41.111800, lng: 1.251500},
    "c. pere martell": {lat: 41.112500, lng: 1.245000},
    "al moll de costa": {lat: 41.110500, lng: 1.248000}
};

const ROUTE_OVERRIDES = {
  "st26_cleaned_0149": [
    { name: "c. Riu Fluvià amb Sant Benilde", lat: 41.1200028, lng: 1.2141964 },
    { name: "Carrer Riu Fluvià amb Carrer Prades", lat: 41.1179003, lng: 1.2147194 },
    { name: "Carrer Prades amb Carrer Amposta", lat: 41.1185533, lng: 1.2165505 },
    { name: "Carrer Amposta amb Carrer Riu Glorieta", lat: 41.1169765, lng: 1.2173239 },
    { name: "Carrer Riu Glorieta amb Plaça Pilar Pradells", lat: 41.1160189, lng: 1.2149759 },
    { name: "Plaça Pilar Pradells", lat: 41.1157059, lng: 1.2128403 }
  ],
  "st26_cleaned_0154": [
    { name: "c. Riu Fluvià amb Sant Benilde", lat: 41.1200028, lng: 1.2141964 },
    { name: "Carrer Riu Fluvià amb Carrer Prades", lat: 41.1179003, lng: 1.2147194 },
    { name: "Carrer Prades amb Carrer Amposta", lat: 41.1185533, lng: 1.2165505 },
    { name: "Carrer Amposta amb Carrer Riu Glorieta", lat: 41.1169765, lng: 1.2173239 },
    { name: "Carrer Riu Glorieta amb Plaça Pilar Pradells", lat: 41.1160189, lng: 1.2149759 },
    { name: "Plaça Pilar Pradells", lat: 41.1157059, lng: 1.2128403 }
  ],
  "st26_cleaned_0402": [
    { name: "Pla de la Seu", lat: 41.118702, lng: 1.257842 },
    { name: "pl. de les Cols", lat: 41.118400, lng: 1.257350 },
    { name: "c. Merceria", lat: 41.117921, lng: 1.258422 },
    { name: "pl. del Fòrum", lat: 41.117350, lng: 1.258750 },
    { name: "c. Santa Anna", lat: 41.117000, lng: 1.258300 },
    { name: "pl. del Rei", lat: 41.116750, lng: 1.258100 },
    { name: "bda. Pescateria", lat: 41.116490, lng: 1.257363 },
    { name: "c. Cós del Bou", lat: 41.116763, lng: 1.255971 },
    { name: "pl. de la Font", lat: 41.116700, lng: 1.256150 }
  ],
  "st26_cleaned_0405": [
    { name: "pl. del Rei", lat: 41.116750, lng: 1.258100 },
    { name: "bda. Pescateria", lat: 41.116490, lng: 1.257363 },
    { name: "c. Cós del Bou", lat: 41.116763, lng: 1.255971 },
    { name: "pl. de la Font", lat: 41.116700, lng: 1.256150 }
  ],
  "st26_cleaned_0419": [
    { name: "Pla de la Seu", lat: 41.118702, lng: 1.257842 },
    { name: "pl. de les Cols", lat: 41.118400, lng: 1.257350 },
    { name: "c. Merceria", lat: 41.117921, lng: 1.258422 },
    { name: "pl. del Fòrum", lat: 41.117350, lng: 1.258750 },
    { name: "c. Santa Anna", lat: 41.117000, lng: 1.258300 },
    { name: "pl. del Rei", lat: 41.116750, lng: 1.258100 },
    { name: "bda. Pescateria", lat: 41.116490, lng: 1.257363 },
    { name: "c. Cós del Bou", lat: 41.116763, lng: 1.255971 },
    { name: "pl. de la Font", lat: 41.116700, lng: 1.256150 }
  ]
};

function getStreetSet(token) {
  let s = new Set();
  if (KNOWN_LOCATIONS[token]) {
    const p = KNOWN_LOCATIONS[token];
    const n = findNearestNode(p.lat, p.lng);
    if (n) s.add(n);
  } else if (STREET_NODES.has(token)) {
    s = STREET_NODES.get(token);
  }
  return s.size > 0 ? s : null;
}

function findShortestPathSets(startSet, endSet) {
  if (!startSet || !endSet || startSet.size === 0 || endSet.size === 0) return null;
  
  for (const k of startSet) {
    if (endSet.has(k)) return [NODES.get(k)];
  }

  const openSet = new Set(startSet);
  const cameFrom = new Map();
  const gScore = new Map();

  for (const key of NODES.keys()) {
    gScore.set(key, Infinity);
  }
  for (const key of startSet) {
    gScore.set(key, 0);
  }

  while (openSet.size > 0) {
    let current = null;
    let minG = Infinity;
    for (const key of openSet) {
      if (gScore.get(key) < minG) {
        minG = gScore.get(key);
        current = key;
      }
    }

    if (current === null) break;

    if (endSet.has(current)) {
      const path = [NODES.get(current)];
      let curr = current;
      while (cameFrom.has(curr)) {
        curr = cameFrom.get(curr);
        path.unshift(NODES.get(curr));
      }
      return path;
    }

    openSet.delete(current);

    const neighbors = GRAPH.get(current) || [];
    for (const neighbor of neighbors) {
      const tentativeG = gScore.get(current) + neighbor.dist;
      if (tentativeG < gScore.get(neighbor.key)) {
        cameFrom.set(neighbor.key, current);
        gScore.set(neighbor.key, tentativeG);
        openSet.add(neighbor.key);
      }
    }
  }
  return null;
}

let updated = 0;
let errors = 0;

for (const ev of data) {
  // If route was manually configured by user, DO NOT OVERWRITE
  if (ev.route_info && ev.route_info.is_configured && ev.route_info.is_manual) {
    continue;
  }

  if (ROUTE_OVERRIDES[ev.id]) {
    const overrides = ROUTE_OVERRIDES[ev.id];
    const waypoints = overrides.map(w => ({ name: w.name, lat: w.lat, lng: w.lng }));
    let finalCoords = [];
    
    for (let i = 0; i < overrides.length - 1; i++) {
      const p1 = overrides[i];
      const p2 = overrides[i+1];
      const n1Key = findNearestNode(p1.lat, p1.lng);
      const n2Key = findNearestNode(p2.lat, p2.lng);
      
      if (n1Key && n2Key) {
        const path = findShortestPathSets(new Set([n1Key]), new Set([n2Key]));
        if (path && path.length > 0) {
          if (finalCoords.length > 0) path.shift();
          finalCoords.push(...path.map(n => [n.lat, n.lon]));
        } else {
          if (finalCoords.length === 0) finalCoords.push([p1.lat, p1.lng]);
          finalCoords.push([p2.lat, p2.lng]);
        }
      } else {
        if (finalCoords.length === 0) finalCoords.push([p1.lat, p1.lng]);
        finalCoords.push([p2.lat, p2.lng]);
      }
    }
    
    if (!ev.route_info) ev.route_info = {};
    if (!ev.route_info.description) {
      ev.route_info.description = "Itinerari: " + waypoints.map(w => w.name).join(", ");
    }
    ev.route_info.waypoints = waypoints;
    ev.route_info.coordinates = finalCoords;
    ev.route_info.has_route = true;
    ev.route_info.is_configured = false;
    updated++;
    continue;
  }

  if (ev.route_info && ev.route_info.description) {
    const it = ev.route_info.description.replace(/^Itinerari:\s*/i, "");
    const rawTokens = it.split(/,|\si\s|\sfins\s(a\s)?|\sper\s(la\s)?|\sdes\sdels\s|\sdes\sdel\s|\scap\sa\s/);
    
    const tokens = [];
    const waypoints = [];
    for (const t of rawTokens) {
      if (!t || t.trim().length <= 2) continue;
      let clean = cleanToken(t);
      if (clean.includes("arribar") || clean.includes("inici") || clean.includes("final")) continue;
      if (clean) {
        tokens.push(clean);
        waypoints.push({ name: t.trim() });
      }
    }

    if (tokens.length >= 2) {
      let finalCoords = [];
      let ok = true;
      let currentStartSet = getStreetSet(tokens[0]);

      if (!currentStartSet) {
        console.log(`Missing start location: ${tokens[0]}`);
        ok = false;
      } else {
        for (let i = 0; i < tokens.length - 1; i++) {
          const dst = tokens[i+1];
          const dstSet = getStreetSet(dst);

          if (dstSet) {
            const path = findShortestPathSets(currentStartSet, dstSet);
            if (path) {
              const lastNode = path[path.length - 1];
              const lastKey = `${lastNode.lat.toFixed(6)},${lastNode.lon.toFixed(6)}`;

              if (i === 0 && path.length > 0) {
                 waypoints[0].lat = path[0].lat;
                 waypoints[0].lng = path[0].lon;
              }
              waypoints[i+1].lat = lastNode.lat;
              waypoints[i+1].lng = lastNode.lon;

              if (finalCoords.length > 0 && path.length > 0) {
                 path.shift();
              }
              if (path.length > 0) {
                 finalCoords.push(...path.map(n => [n.lat, n.lon]));
              } else if (finalCoords.length === 0) {
                 finalCoords.push([lastNode.lat, lastNode.lon]);
              }
              
              currentStartSet = new Set([lastKey]);
            } else {
              // Path not found, fallback to first node of dstSet
              const p2key = Array.from(dstSet)[0];
              const p2 = NODES.get(p2key);
              const p1key = Array.from(currentStartSet)[0];
              const p1 = NODES.get(p1key);
              if (i === 0) {
                 waypoints[0].lat = p1.lat;
                 waypoints[0].lng = p1.lon;
              }
              waypoints[i+1].lat = p2.lat;
              waypoints[i+1].lng = p2.lon;

              if (finalCoords.length > 0) finalCoords.shift();
              finalCoords.push([p1.lat, p1.lon], [p2.lat, p2.lon]);
              currentStartSet = new Set([p2key]);
            }
          } else {
            console.log(`Missing location: ${dst}`);
            ok = false;
            break;
          }
        }
      }

      if (finalCoords.length >= 2 && ok) {
        ev.route_info.waypoints = waypoints;
        ev.route_info.coordinates = finalCoords;
        ev.route_info.has_route = true;
        updated++;
      } else {
        errors++;
        console.log(`Failed to route event ${ev.id}: ${ev.title}`);
      }
    }
  }
}

fs.writeFileSync('./data/program.json', JSON.stringify(data, null, 2));
fs.writeFileSync('./data/program.js', 'window.PROGRAM_DATA = ' + JSON.stringify(data, null, 2) + ';\n');

console.log(`Updated ${updated} routes using internal Graph A* routing! Errors: ${errors}`);
