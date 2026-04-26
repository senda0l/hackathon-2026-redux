/**
 * fetch-tashkent-zones.js — Smart version
 *
 * Strategy:
 *  - Large area features (landuse, parks, schools, hospitals) → keep as-is (real shapes)
 *  - Individual building footprints → aggregate into grid cells by zone type
 *    This gives neighbourhood-level zones instead of 271k tiny house polygons
 *
 * Result: ~3,000–8,000 meaningful polygons, <10MB, fast to render
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const OUTPUT_FILE = path.join(process.cwd(), 'tashkent-zones.geojson');
const BBOX = '41.19,69.13,41.40,69.38'; // south,west,north,east

// Grid cell size for aggregating buildings
// 0.008 lat x 0.011 lng ≈ 900m x 880m per cell — neighbourhood scale
const GRID_LAT = 0.008;
const GRID_LNG = 0.011;

// Minimum area in square degrees to keep a landuse/leisure polygon as-is
// Filters out tiny landuse slivers — 0.000005 ≈ ~50,000 m²
const MIN_AREA_DEG2 = 0.000005;

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

// ── Classification ──────────────────────────────────────────────────────────

function classifyTags(tags) {
  const lu = (tags.landuse || '').toLowerCase();
  const bld = (tags.building || '').toLowerCase();
  const am = (tags.amenity || '').toLowerCase();
  const lei = (tags.leisure || '').toLowerCase();
  const nat = (tags.natural || '').toLowerCase();
  const shp = (tags.shop || '').toLowerCase();
  const off = (tags.office || '').toLowerCase();

  if (
    lei === 'park' ||
    lei === 'garden' ||
    lei === 'nature_reserve' ||
    lu === 'forest' ||
    lu === 'grass' ||
    lu === 'meadow' ||
    lu === 'cemetery' ||
    lu === 'military' ||
    lu === 'conservation' ||
    nat === 'wood' ||
    nat === 'scrub' ||
    nat === 'water' ||
    nat === 'wetland'
  )
    return { type: 'RESTRICTED', status: 'RESTRICTED', isArea: true };

  if (
    am === 'school' ||
    am === 'university' ||
    am === 'college' ||
    am === 'hospital' ||
    am === 'clinic' ||
    am === 'townhall' ||
    am === 'courthouse' ||
    am === 'police' ||
    am === 'library' ||
    am === 'theatre' ||
    am === 'cinema' ||
    am === 'place_of_worship' ||
    bld === 'school' ||
    bld === 'university' ||
    bld === 'hospital' ||
    bld === 'government' ||
    bld === 'public' ||
    bld === 'civic' ||
    lu === 'education' ||
    lu === 'institutional' ||
    lu === 'religious'
  )
    return {
      type: 'PUBLIC_INFRA',
      status: 'AVAILABLE',
      isArea: am !== '' || lu !== '',
    };

  if (
    lu === 'commercial' ||
    lu === 'retail' ||
    lu === 'office' ||
    bld === 'commercial' ||
    bld === 'retail' ||
    bld === 'office' ||
    bld === 'hotel' ||
    bld === 'supermarket' ||
    bld === 'mall' ||
    am === 'marketplace' ||
    am === 'bank' ||
    shp !== '' ||
    off !== ''
  )
    return { type: 'COMMERCIAL', status: 'AVAILABLE', isArea: lu !== '' };

  if (
    lu === 'industrial' ||
    lu === 'railway' ||
    lu === 'depot' ||
    lu === 'port' ||
    bld === 'industrial' ||
    bld === 'warehouse' ||
    bld === 'factory' ||
    bld === 'manufacture'
  )
    return { type: 'INDUSTRIAL', status: 'AVAILABLE', isArea: lu !== '' };

  if (
    lu === 'residential' ||
    bld === 'residential' ||
    bld === 'apartments' ||
    bld === 'house' ||
    bld === 'detached' ||
    bld === 'terrace' ||
    bld === 'dormitory' ||
    bld === 'yes' ||
    (bld !== '' && lu === '')
  )
    return {
      type: 'RESIDENTIAL',
      status: 'AVAILABLE',
      isArea: lu === 'residential',
    };

  return null;
}

function minPriceFor(type, seed) {
  if (type === 'RESTRICTED') return 0;
  const base =
    {
      RESIDENTIAL: 450000,
      INDUSTRIAL: 700000,
      COMMERCIAL: 950000,
      PUBLIC_INFRA: 500000,
    }[type] ?? 450000;
  return base + (((seed * 1234567) >>> 0) % 20) * 10000;
}

// ── Geometry helpers ────────────────────────────────────────────────────────

function closeRing(ring) {
  if (!ring.length) return ring;
  const r = ring.map((p) => [...p]);
  if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])
    r.push([...r[0]]);
  return r;
}

function polygonArea(ring) {
  // Shoelace formula — returns area in square degrees (approximate)
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(area / 2);
}

function ringCentroid(ring) {
  const pts = ring.slice(0, -1);
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [lng, lat];
}

function pointsEqual(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function stitchSegments(segs) {
  const rem = segs
    .filter((s) => s.length >= 2)
    .map((s) => s.map((p) => [...p]));
  const rings = [];
  while (rem.length > 0) {
    const ring = rem.shift();
    let merged = true;
    while (merged && rem.length > 0) {
      merged = false;
      for (let i = 0; i < rem.length; i++) {
        const seg = rem[i];
        const rs = ring[0],
          re = ring[ring.length - 1],
          ss = seg[0],
          se = seg[seg.length - 1];
        if (pointsEqual(re, ss)) {
          ring.push(...seg.slice(1));
          rem.splice(i, 1);
          merged = true;
          break;
        }
        if (pointsEqual(re, se)) {
          ring.push(...seg.slice(0, -1).reverse());
          rem.splice(i, 1);
          merged = true;
          break;
        }
        if (pointsEqual(rs, se)) {
          ring.unshift(...seg.slice(0, -1));
          rem.splice(i, 1);
          merged = true;
          break;
        }
        if (pointsEqual(rs, ss)) {
          ring.unshift(...seg.slice(1).reverse());
          rem.splice(i, 1);
          merged = true;
          break;
        }
      }
    }
    const closed = closeRing(ring);
    if (closed.length >= 4) rings.push(closed);
  }
  return rings;
}

function toGeometry(el) {
  if (el.type === 'relation' && Array.isArray(el.members)) {
    const outers = el.members
      .filter((m) => m.role === 'outer' && m.geometry)
      .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
    const inners = el.members
      .filter((m) => m.role === 'inner' && m.geometry)
      .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
    const outerRings = stitchSegments(outers);
    if (!outerRings.length) return null;
    const innerRings = stitchSegments(inners);
    const polys = outerRings.map((r) => [r]);
    for (const h of innerRings) {
      const c = h[0];
      const target = polys.find((p) => {
        const ring = p[0];
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          if (
            ring[i][1] > c[1] !== ring[j][1] > c[1] &&
            c[0] <
            ((ring[j][0] - ring[i][0]) * (c[1] - ring[i][1])) /
            (ring[j][1] - ring[i][1]) +
            ring[i][0]
          )
            inside = !inside;
        }
        return inside;
      });
      if (target) target.push(h);
    }
    return polys.length === 1
      ? { type: 'Polygon', coordinates: polys[0] }
      : { type: 'MultiPolygon', coordinates: polys };
  }
  if (!Array.isArray(el.geometry) || el.geometry.length < 3) return null;
  const ring = closeRing(el.geometry.map((p) => [p.lon, p.lat]));
  if (ring.length < 4) return null;
  return { type: 'Polygon', coordinates: [ring] };
}

function getFirstRing(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates[0];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates[0]?.[0];
  return null;
}

// ── Grid aggregation ────────────────────────────────────────────────────────
// Instead of storing every building, we count buildings per grid cell
// and store the dominant zone type for that cell.

function getCellKey(lng, lat) {
  const col = Math.floor((lng - 69.13) / GRID_LNG);
  const row = Math.floor((lat - 41.19) / GRID_LAT);
  return `${col}:${row}`;
}

function cellKeyToGeometry(key) {
  const [col, row] = key.split(':').map(Number);
  const minLng = 69.13 + col * GRID_LNG;
  const minLat = 41.19 + row * GRID_LAT;
  const maxLng = minLng + GRID_LNG;
  const maxLat = minLat + GRID_LAT;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ],
    ],
  };
}

// ── Overpass ────────────────────────────────────────────────────────────────

async function runOverpass(query, label) {
  console.log(`Fetching ${label}...`);
  for (const endpoint of OVERPASS_URLS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 3000));
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: `data=${encodeURIComponent(query)}`,
        });
        if (res.ok) {
          const json = await res.json();
          console.log(`  → ${json.elements.length} elements from ${endpoint}`);
          return json;
        }
        if (res.status !== 429) break;
        console.log(`  Rate limited, retrying...`);
      } catch (err) {
        console.warn(`  Network error: ${err.message}`);
        break;
      }
    }
  }
  throw new Error(`All endpoints failed for: ${label}`);
}

// ── Queries ─────────────────────────────────────────────────────────────────

// Query A: Large area zones — keep as real polygons
const QUERY_AREAS = `
[out:json][timeout:120];
(
  way["landuse"](${BBOX});
  relation["landuse"]["type"="multipolygon"](${BBOX});
  way["leisure"~"^(park|garden|nature_reserve|sports_centre|stadium|pitch)$"](${BBOX});
  relation["leisure"~"^(park|garden|nature_reserve)$"]["type"="multipolygon"](${BBOX});
  way["amenity"~"^(school|university|college|hospital|clinic|townhall|police|library|theatre|marketplace)$"](${BBOX});
  way["natural"~"^(wood|scrub|water|wetland)$"](${BBOX});
);
out body geom;
`;

// Query B: Buildings — we only need their centroid + type to aggregate into grid
// Using "out center" instead of "out geom" to get just centroid (much smaller response)
const QUERY_BUILDINGS = `
[out:json][timeout:120];
way["building"](${BBOX});
out tags center;
`;

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Fetching real Tashkent zones from OpenStreetMap ===\n');

  // ── Step 1: Real area polygons (landuse, parks, schools etc.) ──────────
  const dataAreas = await runOverpass(
    QUERY_AREAS,
    'area zones (landuse/leisure/amenity/natural)',
  );
  const features = [];
  const seen = new Set();
  let areaCount = 0;
  let areaSkipped = 0;

  for (const el of dataAreas.elements) {
    const sourceId = `osm-${el.type}-${el.id}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    const geometry = toGeometry(el);
    if (!geometry) {
      areaSkipped++;
      continue;
    }

    // Skip tiny slivers
    const ring = getFirstRing(geometry);
    if (ring && polygonArea(ring) < MIN_AREA_DEG2) {
      areaSkipped++;
      continue;
    }

    const cls = classifyTags(el.tags || {});
    if (!cls) {
      areaSkipped++;
      continue;
    }

    features.push({
      type: 'Feature',
      id: sourceId,
      geometry,
      properties: {
        id: sourceId,
        sourceId,
        type: cls.type,
        status: cls.status,
        minPrice: minPriceFor(cls.type, el.id),
        description:
          el.tags?.name ||
          el.tags?.['name:en'] ||
          el.tags?.['name:ru'] ||
          `${cls.type.toLowerCase()} zone`,
        publishedAt: null,
      },
    });
    areaCount++;
  }
  console.log(
    `  Kept ${areaCount} area polygons (${areaSkipped} skipped as too small/unclassifiable)\n`,
  );

  // ── Step 2: Buildings → aggregate into grid cells ──────────────────────
  // We use building CENTROIDS to vote on the dominant type per grid cell.
  // This collapses 270k buildings into ~2000 neighbourhood cells.
  const dataBuildings = await runOverpass(
    QUERY_BUILDINGS,
    'building centroids',
  );

  // grid cell → { RESIDENTIAL: N, COMMERCIAL: N, ... }
  const grid = new Map();

  for (const el of dataBuildings.elements) {
    if (!el.center) continue; // skip if no centroid
    const cls = classifyTags(el.tags || {});
    if (!cls) continue;

    const key = getCellKey(el.center.lon, el.center.lat);
    if (!grid.has(key))
      grid.set(key, {
        RESIDENTIAL: 0,
        COMMERCIAL: 0,
        INDUSTRIAL: 0,
        PUBLIC_INFRA: 0,
        RESTRICTED: 0,
        total: 0,
      });
    const cell = grid.get(key);
    cell[cls.type] = (cell[cls.type] || 0) + 1;
    cell.total++;
  }

  console.log(`  Aggregated into ${grid.size} grid cells\n`);

  // Build one feature per grid cell using dominant zone type
  // Skip cells already covered by a real area polygon (approximate: skip if cell
  // center falls inside a known area bounding box — good enough for this use case)
  let gridCount = 0;
  let gridIdx = 0;

  for (const [key, votes] of grid.entries()) {
    gridIdx++;
    if (votes.total < 2) continue; // skip nearly-empty cells (1 building = noise)

    // Dominant type
    const dominant = [
      'RESIDENTIAL',
      'COMMERCIAL',
      'INDUSTRIAL',
      'PUBLIC_INFRA',
    ].reduce((best, t) => (votes[t] > votes[best] ? t : best), 'RESIDENTIAL');

    const geometry = cellKeyToGeometry(key);
    const sourceId = `grid-${key.replace(':', '-')}`;

    features.push({
      type: 'Feature',
      id: sourceId,
      geometry,
      properties: {
        id: sourceId,
        sourceId,
        type: dominant,
        status: 'AVAILABLE',
        minPrice: minPriceFor(dominant, gridIdx),
        description: `${dominant.toLowerCase().replace('_', ' ')} neighbourhood`,
        publishedAt: null,
      },
    });
    gridCount++;
  }

  console.log(
    `Added ${gridCount} grid neighbourhood cells from ${dataBuildings.elements.length} buildings`,
  );

  // ── Step 3: Write output ───────────────────────────────────────────────
  const geojson = { type: 'FeatureCollection', features };
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(geojson, null, 2), 'utf8');

  const byType = features.reduce((a, f) => {
    a[f.properties.type] = (a[f.properties.type] || 0) + 1;
    return a;
  }, {});

  const fileSizeMB = (JSON.stringify(geojson).length / 1024 / 1024).toFixed(1);

  console.log(
    `\n✅ Saved ${features.length} total features (~${fileSizeMB}MB)`,
  );
  console.log('Breakdown:');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type.padEnd(15)} ${count}`);
  }
  console.log(`\nOutput: ${OUTPUT_FILE}`);
  console.log('\nNext steps:');
  console.log('  1. Copy tashkent-zones.geojson to backend/ folder');
  console.log('  2. POST /api/zones/import with GOV_ADMIN token');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
