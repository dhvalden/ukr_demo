const svg = d3.select("#map");
const zoomGroup = svg.append("g")
                   .attr("class", "zoom-group");

    /* ---- GLOBAL store for counts ---- */
const counts = new Map();   // key: place name, value: count so far

// Projection and path
const projection = d3.geoMercator()
  .center([32, 48.5])
  .scale(4000)
  .translate([500, 500]);

const path = d3.geoPath().projection(projection);

const zoom = d3.zoom()
  .scaleExtent([1, 12])
  .on("zoom", event => {
    zoomGroup.attr("transform", event.transform);
  });

svg.call(zoom);


// Load and draw the map
d3.json("ukraine_map.geojson").then(ukraine => {
  zoomGroup.append("g")
    .attr("class", "map")
    .selectAll("path")
    .data(ukraine.features)
    .enter()
    .append("path")
    .attr("d", path)
    .style("fill", "#ccc")
    .style("stroke", "#333")
    .style("stroke-width", 0.5);
});

// Load and plot cities AND towns with different symbols
d3.json("ukraine_places.geojson").then(places => {

  // Separate the two groups
  const cities =  places.features.filter(d => d.properties.place === "city");
  const towns  =  places.features.filter(d => d.properties.place === "town");

  const placesGroup = zoomGroup.append("g").attr("class", "places");

  /* ───────────────────────── 1. CITIES  ───────────────────────── */
  placesGroup
    .selectAll("g.city-marker")
    .data(cities)
    .enter()
    .append("g")
      .attr("class", "city-marker")
      .attr("transform", d => {
        const [x, y] = projection(d.geometry.coordinates);
        return `translate(${x}, ${y})`;
      })
      .each(function(d) {
        const g = d3.select(this);

        // outer ring
        g.append("circle")
          .attr("r", 5)
          .style("fill", "none")
          .style("stroke", "black")
          .style("stroke-width", 1);

        // centre dot
        g.append("circle")
          .attr("r", 1.5)
          .style("fill", "black");

        // tooltip
        g.append("title")
          .text(d.properties["name:en"] || d.properties.name);
        /* ──────── NEW: city label ──────── */
        g.append("text")
        .text(d.properties["name:en"] || d.properties.name)
        .attr("x", 7)               // slight offset to the right
        .attr("y", 3)               // slight offset down
        .style("font-size", "9px")
        .style("font-family", "sans-serif")
        .style("fill", "#000")
        .style("pointer-events", "none");  // keeps text from capturing hover
      });

  /* ───────────────────────── 2. TOWNS  ───────────────────────── */
  placesGroup
    .selectAll("circle.town-marker")
    .data(towns)
    .enter()
    .append("circle")
      .attr("class", "town-marker")
      .attr("cx", d => projection(d.geometry.coordinates)[0])
      .attr("cy", d => projection(d.geometry.coordinates)[1])
      .attr("r", .7)
      .style("fill", "black")
      .style("stroke", "black")
      .style("stroke-width", 0.5)
      .append("title")
      .text(d => d.properties["name:en"] || d.properties.name);
});

/********************************************************************
 * 1.  LOAD PLACES  &  BUILD A FUZZY INDEX
 *******************************************************************/
d3.json("ukraine_places.geojson").then(placesGeo => {

  // keep only city & town features
  const places = placesGeo.features.filter(d =>
    d.properties.place === "city" || d.properties.place === "town"
  );

  // build Fuse index on both "name" and "name:en" where present
  const fuse = new Fuse(
    places.map(p => ({
      name: p.properties["name:en"] || p.properties.name,
      feature: p
    })),
    {
      keys: ["name"],
      threshold: 0.3     // fuzziness (0 = exact, 1 = everything)
    }
  );

  /*****************************************************************
   * 2.  GENERATE 1000 SYNTHETIC MENTIONS  (place + datetime)
   ****************************************************************/
  const now      = new Date();
  const oneWeek  = 7 * 24 * 60 * 60 * 1000;    // milliseconds
  const mentions = d3.range(1000).map(() => {
    const rndPlace = places[Math.floor(Math.random() * places.length)];
    return {
      placeText : rndPlace.properties["name:en"] || rndPlace.properties.name, // what social media “said”
      dateObj   : new Date(now - Math.random() * oneWeek)
    };
  });

  // sort by time ASC so animation is chronological
  mentions.sort((a, b) => a.dateObj - b.dateObj);

  /*****************************************************************
   * 3.  PREPARE A SCALED RADIUS FUNCTION  (pulse size)
   ****************************************************************/
  const pulseScale = d3.scaleLinear()
    .domain([0, 1])
    .range([1e-6, 50]);   // from invisibly small to 15 px

  /*****************************************************************
   * 4.  ANIMATE ONE MENTION AT A TIME
   ****************************************************************/
  let i = 0;
  const step = 400; // ms between mentions

  d3.interval(() => {
    if (i >= mentions.length) return;

    const m       = mentions[i++];
    const search  = fuse.search(m.placeText, { limit: 1 });
    if (!search.length) return;   // skip if we can’t match

    const feat    = search[0].item.feature;
    const coords  = projection(feat.geometry.coordinates);

    // create a transient pulse
    const pulse = svg.append("circle")
      .attr("cx", coords[0])
      .attr("cy", coords[1])
      .attr("r", 1e-6)
      .style("fill", "red")
      .style("fill-opacity", 0.4)
      .style("stroke", "red")
      .style("stroke-opacity", 0.8);

    pulse.transition().duration(step * 10.5)
      .attrTween("r", () => t => pulseScale(t))
      .style("fill-opacity", 0)
      .style("stroke-opacity", 0)
      .remove();

/* ---- in your interval right after you find feat / coords ---- */
    const nameEn = feat.properties["name:en"] || feat.properties.name;
    counts.set(nameEn, (counts.get(nameEn) || 0) + 1);

/* convert to array & redraw */
    const dataArray = Array.from(counts, ([name,count]) => ({name, count}));
    updateBarChart(dataArray);
  }, step);

});  // end of places load

/*************************************************************
 *  BAR-CHART SET-UP
 ************************************************************/
const barSvg   = d3.select("#bar-chart"),
      barWidth = 300,
      barHeight= 600,
      margin   = {top:10, right:10, bottom:30, left:60};

const innerW = barWidth  - margin.left - margin.right,
      innerH = barHeight - margin.top  - margin.bottom;

const gBar = barSvg.append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const xScale = d3.scaleBand()
  .range([0, innerW])
  .paddingInner(0.2);

const yScale = d3.scaleLinear()
  .range([innerH, 0]);

const xAxisG = gBar.append("g")
  .attr("class","x-axis")
  .attr("transform", `translate(0,${innerH})`);

const yAxisG = gBar.append("g").attr("class","y-axis");

/* helper: redraw chart with latest counts array [{name,count},…] */
function updateBarChart(data) {

  // keep only top N, sort descending
  const topN = 10;
  const top  = data.sort((a,b)=>d3.descending(a.count,b.count))
                   .slice(0, topN);

  xScale.domain(top.map(d=>d.name));
  yScale.domain([0, d3.max(top, d=>d.count)]).nice();

  /* ---- BARS ---- */
  const bars = gBar.selectAll("rect").data(top, d=>d.name);

  bars.enter().append("rect")
      .attr("x", d=>xScale(d.name))
      .attr("y", innerH)
      .attr("width", xScale.bandwidth())
      .attr("height", 0)
      .style("fill", "steelblue")
    .merge(bars)
      .transition().duration(300)
      .attr("x", d=>xScale(d.name))
      .attr("y", d=>yScale(d.count))
      .attr("height", d=>innerH - yScale(d.count));

  bars.exit()
      .transition().duration(300)
      .attr("y", innerH)
      .attr("height", 0)
      .remove();

  /* ---- AXES ---- */
  xAxisG.transition().duration(300)
        .call(d3.axisBottom(xScale).tickSizeOuter(0))
        .selectAll("text")
        .attr("transform","rotate(-40)")
        .style("text-anchor","end");

  yAxisG.transition().duration(300)
        .call(d3.axisLeft(yScale).ticks(5));
}
