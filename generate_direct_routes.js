const fs = require('fs');

const data = require('./data/program.json');
const db = require('./data/intersections.json');

function cleanToken(p) {
  if (!p) return "";
  let c = p.trim().replace(/^\./, "").replace(/[\(\)]/g, "").trim().toLowerCase();
  c = c.replace(/[\u200B-\u200D\uFEFF]/g, ""); // zero width chars
  c = c.replace(/c\. merceria c\. pare iglésias/, "c. merceria"); 
  c = c.replace(/coca central/, "");
  c = c.replace(/tram teatre metropol/, "");
  c = c.replace(/més informació:.*/, "");
  
  // Standardize prefixes
  c = c.replace(/^carrer\s+/i, "c. ");
  c = c.replace(/^plaça\s+/i, "pl. ");
  c = c.replace(/^baixada\s+/i, "bda. ");
  c = c.replace(/^passeig\s+/i, "pg. ");
  c = c.replace(/^passatge\s+/i, "ptge. ");
  c = c.replace(/^avinguda\s+/i, "av. ");

  c = c.trim();
  // Alias lookup
  if (db.aliases && db.aliases[c]) {
    return db.aliases[c];
  }
  return c;
}

let updated = 0;
let missingIntersectionsCount = 0;
const missingIntersections = new Map();

for (const ev of data) {
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
      const directCoords = [];

      // Add start position
      const firstToken = tokens[0];
      const firstPair = `${tokens[0]} -> ${tokens[1]}`;
      if (db.intersections[firstPair] && db.intersections[firstPair].length > 0) {
        directCoords.push([db.intersections[firstPair][0].lat, db.intersections[firstPair][0].lng]);
      } else if (db.single_fallbacks[firstToken]) {
        directCoords.push([db.single_fallbacks[firstToken].lat, db.single_fallbacks[firstToken].lng]);
      }

      // Process each transition
      for (let i = 0; i < tokens.length - 1; i++) {
        const source = tokens[i];
        const dest = tokens[i+1];
        const pairKey = `${source} -> ${dest}`;

        if (db.intersections[pairKey]) {
          const pts = db.intersections[pairKey];
          pts.forEach(pt => {
            // Avoid duplicate contiguous points
            const last = directCoords[directCoords.length - 1];
            if (!last || last[0] !== pt.lat || last[1] !== pt.lng) {
              directCoords.push([pt.lat, pt.lng]);
            }
          });
        } else {
          // Intersection missing in dictionary
          missingIntersectionsCount++;
          missingIntersections.set(pairKey, (missingIntersections.get(pairKey) || 0) + 1);

          // Fallback to single location coordinate for destination
          if (db.single_fallbacks[dest]) {
            const pt = db.single_fallbacks[dest];
            const last = directCoords[directCoords.length - 1];
            if (!last || last[0] !== pt.lat || last[1] !== pt.lng) {
              directCoords.push([pt.lat, pt.lng]);
            }
          }
        }
      }

      if (directCoords.length >= 2) {
        ev.route_info.waypoints = waypoints;
        ev.route_info.coordinates = directCoords;
        ev.route_info.has_route = true;
        updated++;
      }
    }
  }
}

fs.writeFileSync('./data/program.json', JSON.stringify(data, null, 2));
fs.writeFileSync('./data/program.js', 'window.PROGRAM_DATA = ' + JSON.stringify(data, null, 2) + ';\n');

console.log(`Updated ${updated} routes using Intersections Dictionary!`);
console.log(`Missing intersection definitions: ${missingIntersections.size} unique pairs.`);

if (missingIntersections.size > 0) {
  console.log("\n--- TOP MISSING INTERSECTIONS TO FILL IN data/intersections.json ---");
  const sorted = Array.from(missingIntersections.entries()).sort((a, b) => b[1] - a[1]);
  sorted.slice(0, 15).forEach(([pair, cnt]) => {
    console.log(`${cnt}x : ${pair}`);
  });
}
