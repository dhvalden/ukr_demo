/* -----------------------------------------------------------------------------
 * LEAFLET MAP  –  tiny build: background tiles + boundary outline + event dots
 * -------------------------------------------------------------------------- */
const MAP_CFG = {
  center   : [48.5, 32],     // Ukraine geographic centre
  zoom     : 6,
  eventMax : 1000,           // how many synthetic mentions to drop
  dotColor : "#E53",
  dotRadius: 20,
  dropMs   : 1200
};

const fmt    = d3.timeFormat("%d %b %Y");
const label  = d3.select("#time-label");

/* 1  Initialise Leaflet map ----------------------------------------------- */
const map = L.map("map", {
  zoomSnap: 0.25, zoomDelta: 0.25, wheelPxPerZoomLevel: 120
}).setView(MAP_CFG.center, MAP_CFG.zoom);

/* simple OSM raster tiles */
/*L.tileLayer(  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
/*  { maxZoom: 18, attribution: "© Esri, Earthstar Geographics" }).addTo(map);

/* simple OSM raster tiles */
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18, attribution: "© OpenStreetMap contributors"
}).addTo(map);

/* 2  Draw a grey outline for Ukraine (ADM0) -------------------------------- */
d3.json("ukr_adm0.json").then(geo => {
  L.geoJSON(geo, {
    style: { color:"#555", weight:1, fill:false }
  }).addTo(map);
});

/* 2b  Draw ADM-1 and ADM-2 subdivisions & add a layer switcher ---------- */
Promise.all([
  d3.json("admin_UKR_level_1.geojson"),   // Oblasts
  d3.json("admin_UKR_level_2.geojson")    // Raions
]).then(([adm1, adm2]) => {

  const adm1Layer = L.geoJSON(adm1, {
    style: { color: "#2c7be5", weight: 1, fill: false }   // mid-blue
  });

  const adm2Layer = L.geoJSON(adm2, {
    style: { color: "#67a9ff", weight: 0.8, fill: false } // light-blue
  });

  /* add ADM-1 on by default, keep ADM-2 off until user checks */
  adm1Layer.addTo(map);

  L.control.layers(
    null,                                   // no extra basemaps for now
    {
      "Oblasts (ADM-1)": adm1Layer,
      "Raions (ADM-2)": adm2Layer
    },
    { collapsed: false, position: "topright" }
  ).addTo(map);
});

/* 3  Load real alerts & animate oldest-to-newest -------------------------- */
d3.json("red_alert_anomalies.json").then(alerts => {

  // sort chronologically oldest → newest
  alerts.sort((a, b) => new Date(a.date) - new Date(b.date));

  const colorFor = {
    red   : "#E53",
    yellow: "#F7B500",
    green : "#2ecc71"
  };

  let idx = 0;
  const ticker = d3.interval(() => {
    if (idx >= alerts.length) { ticker.stop(); return; }

    const d = alerts[idx++];
    const col = colorFor[d.alert] || "#555";
    label.text( fmt(new Date(d.date)) );   // show current alert’s timestamp


    // start tiny so we can grow it
    const mark = L.circleMarker([d.lat, d.lon], {
      radius      : 0.1,
      color       : col,
      weight      : 1,
      fillColor   : col,
      fillOpacity : 0.8,
      opacity     : 1
    }).addTo(map);

    mark.bindPopup(
      `<b>${d.place}</b><br>` +
      `${d3.timeFormat("%d %b %Y %H:%M")(new Date(d.date))}<br>` +
      `Alert: <span style="color:${col}">${d.alert}</span>`
    );

    /* ------- animate radius & fade with d3.timer ---------------------- */
    const R0 = 0.1, R1 = MAP_CFG.dotRadius * 4, DUR = 3000;
    const timer = d3.timer(elapsed => {
      const t = Math.min(elapsed / DUR, 1);        // 0 → 1
      const r = R0 + (R1 - R0) * t;
      mark.setRadius(r)
          .setStyle({ opacity: 1 - t, fillOpacity: 0.8 * (1 - t) });
      if (t === 1) { map.removeLayer(mark); timer.stop(); }
    });

  }, MAP_CFG.dropMs);   // drop one alert every 400 ms
});