// Variables d'estat de l'aplicació
let map = null;
let markersLayer = null;
let activeRouteLayerGroup = null;
let currentDay = "2026-09-12";
let currentHour = 9;
let showAllDay = false;
let isAllDayCollapsed = false;
let animationClass = "";

let eventsData = [];
let locationsData = {};
let pdfOfficialUrl = "https://www.tarragona.cat/cultura/festes-i-cultura-popular/santa-tecla/fitxers/altres/programes/programa-dactes-de-santa-tecla-2026";

function getEventLoc(ev) {
  if (ev.location_id && locationsData[ev.location_id]) {
    const loc = locationsData[ev.location_id];
    return {
      place: loc.name || loc.address || ev.location,
      lat: loc.lat !== undefined ? loc.lat : ev.lat,
      lng: loc.lng !== undefined ? loc.lng : ev.lng
    };
  }
  return {
    place: ev.location || ev.address || "Tarragona",
    lat: ev.lat !== undefined ? ev.lat : 41.1175,
    lng: ev.lng !== undefined ? ev.lng : 1.253
  };
}

function getEventRouteInfo(ev) {
  if (ev.location_id && locationsData[ev.location_id] && locationsData[ev.location_id].route_info) {
    return locationsData[ev.location_id].route_info;
  }
  return ev.route_info || null;
}

function parseHour(timeStr) {
  if (!timeStr) return 10;
  const parts = timeStr.split(":");
  return parseInt(parts[0], 10) || 10;
}

function getEffectiveHour(e) {
  let h = e.hour !== undefined ? e.hour : parseHour(e.time);
  if (h === 0) return 24;
  if (h === 1) return 25;
  if (h === 2) return 26;
  if (h === 3) return 27;
  if (h === 4) return 28;
  return h;
}

function initData(data) {
  eventsData = Array.isArray(data) ? data : (data.events || []);

  eventsData.forEach((e) => {
    e.hour = parseHour(e.time);
  });

  renderSchedule();
  renderReader();
}

// Carregar ubicacions des del JSON (amb fallback a window.locationsData i window.LOCATIONS_DATA)
async function loadLocationsData() {
  try {
    const res = await fetch("data/locations.json");
    if (res.ok) {
      locationsData = await res.json();
      return;
    }
  } catch (e) {
    console.warn("Fetch de locations.json ha fallat (normal en file://):", e);
  }

  if (window.locationsData) {
    locationsData = window.locationsData;
  } else if (window.LOCATIONS_DATA) {
    locationsData = window.LOCATIONS_DATA;
  }
}

// Carregar dades del programa des del JSON (amb fallback a window.programData i window.PROGRAM_DATA)
async function loadProgramData() {
  await loadLocationsData();

  try {
    const response = await fetch("data/program.json?v=" + new Date().getTime());
    if (response.ok) {
      const data = await response.json();
      initData(data);
      return;
    }
  } catch (error) {
    console.warn("Fetch de program.json directament ha fallat (normal en file://):", error);
  }

  if (window.programData) {
    initData(window.programData);
  } else if (window.PROGRAM_DATA) {
    initData(window.PROGRAM_DATA);
  } else {
    console.error("No s'han trobat les dades del programa.");
  }
}

// Inicialització del mapa Leaflet
function initMap() {
  map = L.map("map", {
    center: [41.1175, 1.253],
    zoom: 14,
    zoomControl: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  setTimeout(() => {
    if (map) map.invalidateSize();
  }, 250);
}

// Formateig d'hores
function formatRange(h) {
  if (h >= 24) {
    const realH = h === 24 ? 0 : h - 24;
    const pad = String(realH).padStart(2, "0");
    const label = realH === 0 ? "Nit" : "Matinada";
    return `🌙 ${pad}:00 h - ${pad}:59 h (${label})`;
  }
  const pad = String(h).padStart(2, "0");
  return `${pad}:00 h - ${pad}:59 h`;
}

// Selecció de dia
function setDay(dayStr) {
  currentDay = dayStr;

  const dayButtons = document.querySelectorAll(".btn-group button");
  dayButtons.forEach((btn) => {
    if (btn.getAttribute("onclick") && btn.getAttribute("onclick").includes(dayStr)) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  const row2 = document.querySelector(".controls-row-2");
  const hourSlider = document.getElementById("hour-slider");
  const arrowBtns = document.querySelectorAll(".nav-arrow-btn");
  const chkAllDay = document.getElementById("chk-all-day");
  const filterMode = document.querySelector(".filter-mode");
  const timeVal = document.getElementById("time-val");

  if (dayStr === "2026-09-22 to 2026-09-23") {
    showAllDay = true;
    if (chkAllDay) {
      chkAllDay.checked = true;
      chkAllDay.disabled = true;
    }
    if (filterMode) filterMode.classList.add("disabled");
    if (row2) row2.classList.add("disabled");
    if (hourSlider) hourSlider.disabled = true;
    arrowBtns.forEach((b) => (b.disabled = true));
    if (timeVal) timeVal.textContent = "🌙 Nit de Revetlles (Tota la nit)";
  } else {
    if (chkAllDay) chkAllDay.disabled = false;
    if (filterMode) filterMode.classList.remove("disabled");
    if (row2) row2.classList.remove("disabled");
    if (hourSlider) hourSlider.disabled = false;
    arrowBtns.forEach((b) => (b.disabled = false));
    if (timeVal) timeVal.textContent = showAllDay ? "Tot el dia" : formatRange(currentHour);
  }

  renderSchedule();
}

// Canvi d'hora des del slider
function updateTimeSliderManual(val) {
  if (currentDay === "2026-09-22 to 2026-09-23") return;
  const newH = parseInt(val, 10);
  if (newH === currentHour) return;
  animationClass = newH > currentHour ? "animate-next" : "animate-prev";
  currentHour = newH;
  const timeVal = document.getElementById("time-val");
  if (timeVal) timeVal.textContent = formatRange(currentHour);
  if (showAllDay) {
    const chkAllDay = document.getElementById("chk-all-day");
    if (chkAllDay) chkAllDay.checked = false;
    showAllDay = false;
  }
  renderSchedule();
}

// Canvi d'hora amb botons d'avançament
function shiftHour(direction) {
  if (currentDay === "2026-09-22 to 2026-09-23") return;
  let nextH = currentHour + direction;
  if (nextH < 8) nextH = 8;
  if (nextH > 26) nextH = 26;
  if (nextH === currentHour) return;

  animationClass = direction > 0 ? "animate-next" : "animate-prev";
  currentHour = nextH;
  const hourSlider = document.getElementById("hour-slider");
  if (hourSlider) hourSlider.value = nextH;
  const timeVal = document.getElementById("time-val");
  if (timeVal) timeVal.textContent = formatRange(currentHour);

  if (showAllDay) {
    const chkAllDay = document.getElementById("chk-all-day");
    if (chkAllDay) chkAllDay.checked = false;
    showAllDay = false;
  }

  renderSchedule();
}

// Filtre tot el dia
function toggleAllDay(checked) {
  if (currentDay === "2026-09-22 to 2026-09-23") return;
  showAllDay = checked;
  animationClass = "";
  renderSchedule();
}

// Canvi de pestanya (Mapa vs Llibret)
function switchTab(tabId) {
  const tabMap = document.getElementById("tab-map");
  const tabReader = document.getElementById("tab-reader");
  const btnMap = document.getElementById("nav-btn-map");
  const btnReader = document.getElementById("nav-btn-reader");

  if (tabId === "map") {
    if (tabMap) tabMap.classList.remove("hidden");
    if (tabReader) tabReader.classList.add("hidden");
    if (btnMap) btnMap.classList.add("active");
    if (btnReader) btnReader.classList.remove("active");

    if (map) {
      setTimeout(() => map.invalidateSize(), 150);
    }
  } else {
    if (tabMap) tabMap.classList.add("hidden");
    if (tabReader) tabReader.classList.remove("hidden");
    if (btnMap) btnMap.classList.remove("active");
    if (btnReader) btnReader.classList.add("active");
  }
}

// Centrar mapa exactament en un esdeveniment (Logic per eventId)
function focusEvent(eventId, lat, lng) {
  if (!map) return;
  switchTab("map");

  const mapElem = document.getElementById("map");
  if (mapElem && window.innerWidth < 768) {
    mapElem.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  setTimeout(() => {
    if (!map) return;
    map.invalidateSize();
    map.flyTo([lat, lng], 16, { duration: 0.8 });

    if (markersLayer) {
      markersLayer.eachLayer((layer) => {
        if (layer.eventId === eventId) {
          layer.openPopup();
        }
      });
    }
  }, 180);
}

// Calculador de color de degradat (Verd #22c55e -> Blau #3b82f6)
function getGradientColor(ratio) {
  const r = Math.round(34 + (59 - 34) * ratio);
  const g = Math.round(197 + (130 - 197) * ratio);
  const b = Math.round(94 + (246 - 94) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

// Esborra la ruta dibuixada anteriorment al mapa
function clearRouteOnMap() {
  if (activeRouteLayerGroup && map) {
    map.removeLayer(activeRouteLayerGroup);
    activeRouteLayerGroup = null;
  }
}

// Dibuixa la línia de ruta de l'itinerari amb degradat Verd -> Blau
function drawGradientRoute(routeInfo) {
  if (!map || !routeInfo || !routeInfo.coordinates || routeInfo.coordinates.length < 2) return;

  clearRouteOnMap();
  activeRouteLayerGroup = L.layerGroup().addTo(map);

  const coords = routeInfo.coordinates;
  const waypoints = routeInfo.waypoints || [];

  // Ombra o capa inferior de profunditat
  L.polyline(coords, {
    color: "#0f172a",
    weight: 9,
    opacity: 0.35,
    lineCap: "round",
    lineJoin: "round"
  }).addTo(activeRouteLayerGroup);

  // Trams amb color degradat segons el progrés del recorregut (0.0 Verd -> 1.0 Blau)
  const numSegments = coords.length - 1;
  for (let i = 0; i < numSegments; i++) {
    const ratio = i / Math.max(1, numSegments - 1);
    const color = getGradientColor(ratio);
    L.polyline([coords[i], coords[i + 1]], {
      color: color,
      weight: 6,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(activeRouteLayerGroup);
  }

  // Marcadors dels punts de pas (Waypoints) i de l'Inici / Final
  waypoints.forEach((wp, idx) => {
    const isStart = idx === 0;
    const isEnd = idx === waypoints.length - 1;

    let lat = wp.lat;
    let lng = wp.lng;
    
    if (lat === undefined || lng === undefined) {
      let coordObj;
      if (isStart) {
        coordObj = coords[0];
      } else if (isEnd) {
        coordObj = coords[coords.length - 1];
      } else {
        const coordIdx = Math.floor((idx / Math.max(1, waypoints.length - 1)) * (coords.length - 1));
        coordObj = coords[coordIdx];
      }
      lat = Array.isArray(coordObj) ? coordObj[0] : coordObj.lat;
      lng = Array.isArray(coordObj) ? coordObj[1] : coordObj.lng;
    }

    if (isStart) {
      const startIcon = L.divIcon({
        className: "route-badge-marker",
        html: `<div class="route-badge badge-start">Inici</div>`,
        iconSize: [60, 26],
        iconAnchor: [30, 13]
      });
      L.marker([lat, lng], { icon: startIcon, zIndexOffset: 1000 }).addTo(activeRouteLayerGroup);
    } else if (isEnd) {
      const endIcon = L.divIcon({
        className: "route-badge-marker",
        html: `<div class="route-badge badge-end">Final</div>`,
        iconSize: [60, 26],
        iconAnchor: [30, 13]
      });
      L.marker([lat, lng], { icon: endIcon, zIndexOffset: 1000 }).addTo(activeRouteLayerGroup);
    } else {
      const circle = L.circleMarker([lat, lng], {
        radius: 5,
        fillColor: "#ffffff",
        color: "#2563eb",
        weight: 2.5,
        fillOpacity: 1
      });
      circle.bindTooltip(`📍 <b>${escapeHtml(wp.name)}</b>`, { direction: "top", offset: [0, -6] });
      circle.addTo(activeRouteLayerGroup);
    }
  });

  // Ajust de zoom del mapa per emmarcar tota la ruta
  const bounds = L.latLngBounds(coords);
  map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17, animate: false });
}

// Mostrar ruta de l'esdeveniment (Logic per eventId)
function showEventRoute(eventId) {
  const ev = eventsData.find((e) => e.id === eventId);
  if (!ev) return;
  
  switchTab("map");

  const mapElem = document.getElementById("map");
  if (mapElem && window.innerWidth < 768) {
    mapElem.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  setTimeout(() => {
    if (!map) return;
    map.invalidateSize();

    const routeInfo = getEventRouteInfo(ev);
    if (routeInfo && routeInfo.has_route && routeInfo.coordinates && routeInfo.coordinates.length >= 2) {
      drawGradientRoute(routeInfo);
      const bounds = L.latLngBounds(routeInfo.coordinates);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: false });
    } else {
      clearRouteOnMap();
      const loc = getEventLoc(ev);
      focusEvent(ev.id, loc.lat, loc.lng);
      return;
    }

    if (markersLayer) {
      markersLayer.eachLayer((layer) => {
        if (layer.eventId === eventId) {
          layer.openPopup();
        }
      });
    }
  }, 180);
}

// Cerca d'acte anterior i posterior per a franges buides
function findPrevAndNextEvents(curDay, curHour) {
  if (!eventsData || !eventsData.length) return { prevEv: null, nextEv: null };

  const sortedEvents = [...eventsData].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const hA = getEffectiveHour(a);
    const hB = getEffectiveHour(b);
    if (hA !== hB) return hA - hB;
    return (a.time || "").localeCompare(b.time || "");
  });

  let prevEv = null;
  let nextEv = null;

  for (let i = 0; i < sortedEvents.length; i++) {
    const e = sortedEvents[i];
    const eH = getEffectiveHour(e);

    const isBefore = e.date < curDay || (e.date === curDay && eH < curHour);
    if (isBefore) {
      prevEv = e;
    }

    const isAfter = e.date > curDay || (e.date === curDay && eH > curHour);
    if (isAfter && !nextEv) {
      nextEv = e;
    }
  }

  return { prevEv, nextEv };
}

function formatNavDateLabel(targetDate, curDay) {
  if (targetDate === curDay) return "avui";
  const dParts = targetDate.split("-");
  const dNum = dParts[2] || targetDate;

  const dayNames = {
    "2026-09-12": "Ds 12",
    "2026-09-13": "Dg 13",
    "2026-09-14": "Dl 14",
    "2026-09-15": "Dm 15",
    "2026-09-16": "Dc 16",
    "2026-09-17": "Dj 17",
    "2026-09-18": "Dv 18",
    "2026-09-19": "Ds 19",
    "2026-09-20": "Dg 20",
    "2026-09-21": "Dl 21",
    "2026-09-22": "Dm 22",
    "2026-09-22 to 2026-09-23": "Del 22 al 23",
    "2026-09-23": "Dc 23",
    "2026-09-24": "Dj 24",
  };
  return dayNames[targetDate] || `Dia ${dNum}`;
}

// Navega a un acte específic (Dia, Hora i focus al mapa)
function navigateToEvent(dayStr, effHour, eventId) {
  setDay(dayStr);
  const hourSlider = document.getElementById("hour-slider");
  if (hourSlider) hourSlider.value = effHour;

  currentHour = effHour;
  const timeVal = document.getElementById("time-val");
  if (timeVal) timeVal.textContent = formatRange(currentHour);

  if (showAllDay) {
    const chkAllDay = document.getElementById("chk-all-day");
    if (chkAllDay) chkAllDay.checked = false;
    showAllDay = false;
  }

  renderSchedule();

  if (eventId) {
    setTimeout(() => {
      const locEv = eventsData.find((e) => e.id === eventId);
      if (locEv) {
        const coords = getEventLoc(locEv);
        focusEvent(eventId, coords.lat, coords.lng);
      }
    }, 120);
  }
}

function isEventOnDay(e, dayStr) {
  if (!e.date) return false;
  if (dayStr === "2026-09-22 to 2026-09-23") {
    return !!(e.is_all_night || (e.date && e.date.includes(" to ")));
  }
  // Exclude all-night range events from regular day tabs (they belong strictly to 'Del 22 al 23' tab)
  if (e.is_all_night || (e.date && e.date.includes(" to "))) {
    return false;
  }
  return e.date === dayStr;
}

// Renderització de la secció interactiva (Horaris i Mapa)
function renderSchedule() {
  const container = document.getElementById("schedule-list");
  if (!container) return;
  container.innerHTML = "";
  if (markersLayer) markersLayer.clearLayers();

  const dayEvents = eventsData.filter((e) => isEventOnDay(e, currentDay));

  const hint = document.createElement("div");
  hint.className = "swipe-hint";
  let dayLabelHtml = "";
  if (currentDay === "2026-09-22 to 2026-09-23") {
    dayLabelHtml = `<span>🌙 Nit Especial: <b>Del 22 al 23 de Setembre</b></span><span><b>La Nit de les Revetlles</b></span>`;
  } else {
    const dNum = currentDay.split("-")[2] || "12";
    const rangeLabel = showAllDay ? "Tot el dia" : formatRange(currentHour);
    dayLabelHtml = `<span>📅 Dia <b>${dNum} de Setembre</b></span><span>Franja: <b>${rangeLabel}</b></span>`;
  }

  hint.innerHTML = dayLabelHtml;
  container.appendChild(hint);

  let timeEvents = [];
  if (showAllDay || currentDay === "2026-09-22 to 2026-09-23") {
    timeEvents = dayEvents;
  } else {
    timeEvents = dayEvents.filter((e) => {
      return getEffectiveHour(e) === currentHour;
    });
  }

  if (timeEvents.length === 0) {
    const { prevEv, nextEv } = findPrevAndNextEvents(currentDay, currentHour);

    const emptyNotice = document.createElement("div");
    emptyNotice.className = "empty-schedule-card";

    let navHtml = `
      <div class="empty-schedule-header" style="text-align:center; padding: 20px; color: #64748b;">
        <div style="font-size:1rem; margin-bottom: 5px; color: #64748b; font-weight: normal;">No hi ha actes programats en aquesta franja horària.</div>
      </div>
      <div class="nav-event-buttons" style="display:flex; gap:10px; margin:0 auto; justify-content:center;">
    `;

    if (prevEv) {
      const pDateLabel = formatNavDateLabel(prevEv.date, currentDay);
      navHtml += `
        <button class="nav-event-btn prev-btn" style="background:#f1f5f9; border:1px solid #e2e8f0; color:#475569; padding:12px; border-radius:8px; cursor:pointer;" onclick="navigateToEvent('${prevEv.date}', ${getEffectiveHour(prevEv)}, '${prevEv.id}')">
          <div style="font-size:0.85rem; color:#64748b;">Anterior acte a les ${prevEv.time}h (${pDateLabel})</div>
          <div style="font-weight:600; margin-top:4px; color:#334155;">${escapeHtml(prevEv.title)}</div>
        </button>
      `;
    }

    if (nextEv) {
      const nDateLabel = formatNavDateLabel(nextEv.date, currentDay);
      navHtml += `
        <button class="nav-event-btn next-btn" style="background:#f1f5f9; border:1px solid #e2e8f0; color:#475569; padding:12px; border-radius:8px; cursor:pointer;" onclick="navigateToEvent('${nextEv.date}', ${getEffectiveHour(nextEv)}, '${nextEv.id}')">
          <div style="font-size:0.85rem; color:#64748b;">Pròxim acte a partir de les ${nextEv.time}h (${nDateLabel})</div>
          <div style="font-weight:600; margin-top:4px; color:#334155;">${escapeHtml(nextEv.title)}</div>
        </button>
      `;
    }

    navHtml += `</div>`;
    emptyNotice.innerHTML = navHtml;
    container.appendChild(emptyNotice);
    return;
  }

  const grouped = {};
  timeEvents.forEach((e) => {
    let tStr = e.time || "10:00";
    if (e.time && e.time.includes(" to ")) {
      tStr = e.time.split(" to ")[0].trim();
    }
    if (!grouped[tStr]) grouped[tStr] = [];
    grouped[tStr].push(e);
  });

  Object.keys(grouped).sort().forEach((timeKey) => {
    const items = grouped[timeKey];
    const timeBlock = document.createElement("div");
    timeBlock.className = "time-block";

    const isNightTab = currentDay === "2026-09-22 to 2026-09-23";
    const badgeLabel = isNightTab ? `🌙 ${escapeHtml(timeKey)} h (Revetlla)` : `${escapeHtml(timeKey)} h`;
    const badgeHtml = isNightTab 
      ? `<span class="time-badge night-time-badge">${badgeLabel}</span>`
      : `<span class="time-badge">${badgeLabel}</span>`;

    const header = document.createElement("div");
    header.className = "time-block-header";
    header.innerHTML = `
      <div class="time-block-title">
        ${badgeHtml}
        <span style="font-size:0.8rem; font-weight:600; color:#444;">${items.length} acte${items.length > 1 ? "s" : ""}</span>
      </div>
      <span class="collapse-icon">▼</span>
    `;

    const content = document.createElement("div");
    content.className = "time-block-content";

    items.forEach((ev) => {
      const loc = getEventLoc(ev);
      const isNightEvent = ev.is_all_night || (ev.date && ev.date.includes(" to "));
      const card = document.createElement("div");
      card.className = `event-card ${isNightEvent ? 'night-event-card' : ''}`;

      const routeInfo = getEventRouteInfo(ev);
      const route = (routeInfo && routeInfo.description) ? routeInfo.description.replace(/^Itinerari:\s*/i, "") : getEventItinerary(ev.description);

      const imgSrc = ev.image || "img/image.jpeg";
      const imgHtml = `<img class="event-card-img" src="${imgSrc}" alt="${escapeHtml(ev.title)}" loading="lazy" onerror="this.onerror=null; this.src='img/image.jpeg';">`;

      const hasRoute = routeInfo && routeInfo.has_route;

      card.innerHTML = `
        ${imgHtml}
        <div class="event-card-body">
          <span class="category-badge">${ev.category || "Tradició"}</span>
          <h4>${escapeHtml(ev.title)}</h4>
          <div class="location">📍 ${escapeHtml(loc.place)}</div>
          ${route ? `<div class="reader-highlight-box reader-route" style="margin:6px 0 8px 0; padding:6px 10px; font-size:0.8rem; cursor:pointer;" onclick="event.stopPropagation(); showEventRoute('${ev.id}')"><strong>🗺️ Itinerari:</strong> ${escapeHtml(route)}</div>` : ""}
          <div class="description">${formatFormattedDescription(ev.description || "", !!route)}</div>
          ${ev.url ? `<a class="official-btn" href="${ev.url}" target="_blank" onclick="event.stopPropagation()">🔗 Veure a Tarragona.cat</a>` : ""}
        </div>
      `;

      card.onclick = (e) => {
        e.stopPropagation();
        showEventRoute(ev.id);
      };
      content.appendChild(card);

      if (map && markersLayer) {
        const hourLabel = ev.time ? ev.time.split(":")[0] : String(ev.hour).padStart(2, "0");
        const markerIconHtml = isNightEvent ? `<span>${hourLabel}h</span>` : `<span>${hourLabel}h</span>`;

        const customIcon = L.divIcon({
          className: "custom-marker",
          html: markerIconHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        let markerLat = loc.lat;
        let markerLng = loc.lng;
        if (routeInfo && routeInfo.coordinates && routeInfo.coordinates.length > 0) {
          markerLat = routeInfo.coordinates[0][0];
          markerLng = routeInfo.coordinates[0][1];
        }

        const marker = L.marker([markerLat, markerLng], { icon: customIcon });
        marker.eventId = ev.id;

        const popupTimeStr = isNightEvent
          ? `🌙 ${ev.time && ev.time.includes(" to ") ? ev.time.split(" to ")[0] + " h (fins a les 7:00 h)" : ev.time + " h"}`
          : `${ev.time} h`;

        marker.bindPopup(`
          <div style="display:flex; gap:12px; min-width:220px; max-width:280px; align-items:flex-start;">
            <img src="${imgSrc}" style="width:75px; height:75px; object-fit:cover; border-radius:6px; flex-shrink:0;" onerror="this.onerror=null; this.src='img/image.jpeg';">
            <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
              <b style="color:#c8102e; font-size:0.95em; line-height:1.2;">${popupTimeStr}</b>
              <strong style="font-size:0.95em; line-height:1.2; margin:4px 0;">${escapeHtml(ev.title)}</strong>
              <span style="color:#666; font-size:0.85em; line-height:1.2; display:block; margin-bottom:4px;">📍 ${escapeHtml(loc.place)}</span>
              ${ev.url ? `<a href="${ev.url}" target="_blank" style="font-size:0.8em; color:#0d6efd; text-decoration:none;">🔗 Tarragona.cat</a>` : ""}
            </div>
          </div>
        `);
        markersLayer.addLayer(marker);
      }
    });

    header.onclick = () => {
      timeBlock.classList.toggle("collapsed");
    };

    timeBlock.appendChild(header);
    timeBlock.appendChild(content);
    container.appendChild(timeBlock);
  });
}

const DAY_NAMES_CA = {
  "2026-09-12": "Dissabte 12 de setembre",
  "2026-09-13": "Diumenge 13 de setembre",
  "2026-09-14": "Dilluns 14 de setembre",
  "2026-09-15": "Dimarts 15 de setembre",
  "2026-09-16": "Dimecres 16 de setembre",
  "2026-09-17": "Dijous 17 de setembre",
  "2026-09-18": "Divendres 18 de setembre",
  "2026-09-19": "Dissabte 19 de setembre",
  "2026-09-20": "Diumenge 20 de setembre",
  "2026-09-21": "Dilluns 21 de setembre",
  "2026-09-22": "Dimarts 22 de setembre",
  "2026-09-23": "Dimecres 23 de setembre - Diada de Santa Tecla",
  "2026-09-24": "Dijous 24 de setembre - Diada de la Mercè",
};

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getEventItinerary(desc) {
  if (!desc) return null;
  const lines = desc.split("\n");
  for (let l of lines) {
    const clean = l.replace(/^[•\-\*]\s*/, "").trim();
    if (/^Itinerari[:\.]/i.test(clean)) {
      return clean.replace(/^Itinerari[:\.]\s*/i, "").trim();
    }
  }
  return null;
}

function formatFormattedDescription(desc, skipRoute = false) {
  if (!desc || !desc.trim()) return "";

  const blocks = desc
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  let html = "";

  blocks.forEach((block) => {
    const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);

    lines.forEach((line) => {
      const cleanLine = line.replace(/^[•\-\*]\s*/, "").trim();
      if (/^Itinerari[:\.]/i.test(cleanLine)) {
        if (!skipRoute) {
          html += `<div class="reader-highlight-box reader-route"><strong>🗺️ Itinerari:</strong> ${escapeHtml(cleanLine.replace(/^Itinerari[:\.]\s*/i, ""))}</div>`;
        }
      } else if (/^(Organitza|Organització):/i.test(cleanLine)) {
        html += `<div class="reader-meta-line"><strong>🏛️ Organitza:</strong> ${escapeHtml(cleanLine.replace(/^(Organitza|Organització):\s*/i, ""))}</div>`;
      } else if (/^(Hi col·labora|Col·labora):/i.test(cleanLine)) {
        html += `<div class="reader-meta-line"><strong>🤝 Hi col·labora:</strong> ${escapeHtml(cleanLine.replace(/^(Hi col·labora|Col·labora):\s*/i, ""))}</div>`;
      } else if (/^Categoria:/i.test(cleanLine)) {
        html += `<div class="reader-meta-line"><span class="reader-category-badge">🏷️ ${escapeHtml(cleanLine.replace(/^Categoria:\s*/i, ""))}</span></div>`;
      } else if (/^(Preu|Entrades|Venda de tiquets|Tiquets|Inscripcions):/i.test(cleanLine)) {
        html += `<div class="reader-highlight-box reader-tickets"><strong>🎟️ ${escapeHtml(line)}</strong></div>`;
      } else if (/^(Fotografia:|Acte retransmès)/i.test(cleanLine)) {
        html += `<div class="reader-caption">📷 <em>${escapeHtml(line)}</em></div>`;
      } else if (/^[•\-\*]\s*/.test(line)) {
        let cleanLine = line.replace(/^[•\-\*]\s*/, "");
        let subMatch = cleanLine.match(/^(\d{1,2}[\.:]\d{2}\s*h),?\s*(.*)/i);
        if (subMatch) {
            html += `<div class="reader-bullet-item"><span class="bullet-dot">•</span> <strong>${escapeHtml(subMatch[1])}</strong>: <span>${escapeHtml(subMatch[2])}</span></div>`;
        } else {
            html += `<div class="reader-bullet-item"><span class="bullet-dot">•</span> <span>${escapeHtml(cleanLine)}</span></div>`;
        }
      } else {
        html += `<p class="reader-paragraph">${escapeHtml(line)}</p>`;
      }
    });
  });

  return html;
}

// Renderització del Llibret des de les dades del programa
function renderReader() {
  const readerContainer = document.getElementById("reader-content");
  if (!readerContainer || !eventsData.length) return;

  readerContainer.innerHTML = "";

  const groupedByDate = {};
  eventsData.forEach((ev) => {
    const d = ev.date || "2026-09-12";
    if (!groupedByDate[d]) groupedByDate[d] = [];
    groupedByDate[d].push(ev);
  });

  Object.keys(groupedByDate).sort().forEach((dateStr) => {
    const daySec = document.createElement("div");
    daySec.id = `sec-day-${dateStr}`;

    const dayName = DAY_NAMES_CA[dateStr] || `Programació del Dia ${dateStr.split("-")[2]} de Setembre`;

    const dayTitle = document.createElement("div");
    dayTitle.className = "reader-day-title";
    dayTitle.innerHTML = `📅 ${dayName}`;
    daySec.appendChild(dayTitle);

    groupedByDate[dateStr].forEach((ev) => {
      const loc = getEventLoc(ev);
      const entryDiv = document.createElement("div");
      entryDiv.className = "reader-entry";
      entryDiv.style.cursor = "pointer";

      const imgSrc = ev.image || "img/image.jpeg";
      const imgHtml = `<img class="reader-entry-img" src="${imgSrc}" alt="${escapeHtml(ev.title)}" loading="lazy" onerror="this.onerror=null; this.src='img/image.jpeg';">`;

      const formattedDesc = formatFormattedDescription(ev.description);

      entryDiv.innerHTML = `
        ${imgHtml}
        <div class="reader-entry-body">
          <div class="reader-badges">
            <span class="badge-pill badge-time">🕒 ${ev.time} h</span>
            <span class="badge-pill badge-loc">📍 ${escapeHtml(loc.place)}</span>
          </div>
          <div class="reader-entry-title">${escapeHtml(ev.title)}</div>
          <div class="reader-entry-text">${formattedDesc}</div>
          ${ev.url ? `<a class="official-btn" href="${ev.url}" target="_blank" onclick="event.stopPropagation()" style="margin-top:10px; display:inline-block;">🔗 Fitxa oficial a Tarragona.cat</a>` : ""}
        </div>
      `;

      entryDiv.onclick = () => {
        focusEvent(ev.id, loc.lat, loc.lng);
      };

      daySec.appendChild(entryDiv);
    });

    readerContainer.appendChild(daySec);
  });
}

// Gestió Swipe Bidireccional i Pull-to-Refresh
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let isPullingDown = false;
let isSwipingHorizontal = false;
let canPullToRefresh = false;
let ptrThreshold = 75;

function setupSwipeGestures() {
  const swipeArea = document.getElementById("swipe-area");
  const scheduleList = document.getElementById("schedule-list");
  const ptrIndicator = document.getElementById("ptr-indicator");
  const ptrIcon = document.getElementById("ptr-icon");
  const ptrLabel = document.getElementById("ptr-label");
  if (!swipeArea) return;

  // Initial check for onboarding swipe hint banner
  if (localStorage.getItem("swipeHintDismissed") === "true") {
    const hintBanner = document.getElementById("swipe-hint-banner");
    if (hintBanner) hintBanner.style.display = "none";
  }

  swipeArea.addEventListener(
    "touchstart",
    function (e) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isPullingDown = false;
      isSwipingHorizontal = false;
      canPullToRefresh = (swipeArea.scrollTop <= 0);

      if (scheduleList) {
        scheduleList.style.transition = "none";
      }
    },
    { passive: true }
  );

  swipeArea.addEventListener(
    "touchmove",
    function (e) {
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const dx = currentX - touchStartX;
      const dy = currentY - touchStartY;

      // Check if user is starting a horizontal swipe (elements follow finger in real-time)
      if (!isPullingDown && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        isSwipingHorizontal = true;
        if (scheduleList) {
          scheduleList.style.transform = `translateX(${dx}px)`;
          scheduleList.style.opacity = `${Math.max(0.4, 1 - Math.abs(dx) / 450)}`;
        }
        return;
      }

      // Enable Pull to Refresh only if vertical pull down from top
      if (canPullToRefresh && !isSwipingHorizontal && dy > 12 && Math.abs(dy) > Math.abs(dx) * 1.8 && swipeArea.scrollTop <= 0) {
        isPullingDown = true;
        const pullDist = Math.min((dy - 12) * 0.38, 85);

        if (ptrIndicator) {
          ptrIndicator.classList.add("active");
          ptrIndicator.style.height = `${pullDist}px`;
          
          if (pullDist >= ptrThreshold) {
            ptrIcon.classList.add("rotate");
            ptrLabel.textContent = "Deixa anar per actualitzar!";
          } else {
            ptrIcon.classList.remove("rotate");
            ptrLabel.textContent = "Estira cap avall per actualitzar...";
          }
        }

        if (scheduleList) {
          scheduleList.style.transform = `translateY(${pullDist * 0.35}px)`;
        }
      } else if (!isPullingDown && ptrIndicator) {
        ptrIndicator.style.height = "0px";
        ptrIndicator.classList.remove("active");
        if (scheduleList && !isSwipingHorizontal) {
          scheduleList.style.transform = "none";
        }
      }
    },
    { passive: true }
  );

  swipeArea.addEventListener(
    "touchend",
    function (e) {
      touchEndX = e.changedTouches[0].clientX;
      touchEndY = e.changedTouches[0].clientY;
      
      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;
      const pullDist = Math.max(0, (dy - 12) * 0.38);

      if (isPullingDown && pullDist >= ptrThreshold && canPullToRefresh) {
        if (scheduleList) {
          scheduleList.style.transition = "transform 0.2s ease";
          scheduleList.style.transform = "translateY(54px)";
        }
        triggerPullToRefresh();
      } else if (isPullingDown) {
        if (ptrIndicator) {
          ptrIndicator.style.height = "0px";
          ptrIndicator.classList.remove("active");
        }
        if (scheduleList) {
          scheduleList.style.transition = "transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)";
          scheduleList.style.transform = "translateY(0)";
        }
      }

      if (isSwipingHorizontal && scheduleList) {
        scheduleList.style.transition = "transform 0.22s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.22s ease";
        if (Math.abs(dx) > 55) {
          // Slide out current cards
          const direction = dx < 0 ? -1 : 1;
          scheduleList.style.transform = `translateX(${direction * 100}%)`;
          scheduleList.style.opacity = "0";

          setTimeout(() => {
            shiftHour(direction < 0 ? 1 : -1);
            // Position new cards on opposite side and animate in
            scheduleList.style.transition = "none";
            scheduleList.style.transform = `translateX(${-direction * 100}%)`;
            
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                scheduleList.style.transition = "transform 0.25s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.25s ease";
                scheduleList.style.transform = "translateX(0)";
                scheduleList.style.opacity = "1";
              });
            });
          }, 180);
        } else {
          // Snap back if threshold not reached
          scheduleList.style.transform = "translateX(0)";
          scheduleList.style.opacity = "1";
        }
      }

      isPullingDown = false;
      isSwipingHorizontal = false;
      canPullToRefresh = false;
    },
    { passive: true }
  );
}

function handleGesture() {
  const deltaX = touchEndX - touchStartX;
  const deltaY = touchEndY - touchStartY;

  // Horizontal Swipe for changing hour/time
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 35) {
    if (deltaX < 0) {
      shiftHour(1);
    } else {
      shiftHour(-1);
    }
  }
}

async function triggerPullToRefresh() {
  const ptrIndicator = document.getElementById("ptr-indicator");
  const ptrIcon = document.getElementById("ptr-icon");
  const ptrLabel = document.getElementById("ptr-label");

  if (ptrIndicator) {
    ptrIndicator.classList.add("active");
    ptrIndicator.style.height = "54px";
    if (ptrIcon) {
      ptrIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
      ptrIcon.classList.add("spinning");
    }
    if (ptrLabel) ptrLabel.textContent = "Actualitzant aplicació...";
  }

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (let reg of registrations) {
        await reg.update();
      }
    }
  } catch (err) {
    console.warn("SW update error:", err);
  }

  setTimeout(() => {
    window.location.reload();
  }, 400);
}

function dismissSwipeHint() {
  const hintBanner = document.getElementById("swipe-hint-banner");
  if (hintBanner) hintBanner.style.display = "none";
  localStorage.setItem("swipeHintDismissed", "true");
}

function showAppToast(msg) {
  const toast = document.getElementById("app-toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// Inicialitza el dia i l'hora actuals segons l'hora real del dispositiu
function initCurrentTimeAndDay() {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const hour = now.getHours();

  if (dayOfMonth >= 12 && dayOfMonth <= 24) {
    currentDay = `2026-09-${String(dayOfMonth).padStart(2, "0")}`;
  } else {
    currentDay = "2026-09-12";
  }

  let h = hour;
  if (h === 0) h = 24;
  if (h < 8) h = 8;
  if (h > 24) h = 24;
  currentHour = h;

  setDay(currentDay);

  const hourSlider = document.getElementById("hour-slider");
  if (hourSlider) hourSlider.value = currentHour;

  const timeVal = document.getElementById("time-val");
  if (timeVal) timeVal.textContent = formatRange(currentHour);
}

// Registre de Service Worker per a suport PWA i mode Offline
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('PWA Service Worker registrat amb èxit:', reg.scope);
        })
        .catch((err) => {
          console.error('Error en registrar el Service Worker:', err);
        });
    });
  }
}

// Esdeveniments d'inicialització
window.addEventListener("DOMContentLoaded", () => {
  initCurrentTimeAndDay();
  initMap();
  setupSwipeGestures();
  loadProgramData();
  registerServiceWorker();
});

window.addEventListener("resize", () => {
  if (map) map.invalidateSize();
});
