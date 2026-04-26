import { ref, onMounted, onUnmounted } from 'vue'
import maplibregl from 'maplibre-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import * as turf from '@turf/turf'
import api from '../api'
import { useAuthStore } from '../stores/auth'

type ZoneStatus = 'AVAILABLE' | 'IN_AUCTION' | 'IN_TENDER' | 'AWARDED' | 'RESTRICTED'
type ZoneType = 'RESIDENTIAL' | 'INDUSTRIAL' | 'COMMERCIAL' | 'PUBLIC_INFRA' | 'RESTRICTED'

type ZoneProperties = {
  id: string
  type: ZoneType
  status: ZoneStatus
  minPrice: number
  description: string | null
  publishedAt: string | null
}

type ZoneFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  ZoneProperties
>

type DrawFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  Record<string, unknown>
>

type MapRuntime = {
  on: maplibregl.Map['on']
  addSource: maplibregl.Map['addSource']
  addLayer: maplibregl.Map['addLayer']
  getSource: maplibregl.Map['getSource']
  fitBounds: maplibregl.Map['fitBounds']
  getCanvas: maplibregl.Map['getCanvas']
  setFeatureState: maplibregl.Map['setFeatureState']
  addControl: maplibregl.Map['addControl']
  remove: maplibregl.Map['remove']
}

export function useMap(containerId: string) {
  const map = ref<MapRuntime | null>(null)
  const draw = ref<MapboxDraw | null>(null)
  const selectedZone = ref<ZoneProperties | null>(null)
  const selectedZoneGeometry = ref<GeoJSON.Geometry | null>(null)
  const selectedDrawZone = ref<ZoneProperties | null>(null)
  const drawnParcel = ref<GeoJSON.Feature | null>(null)
  const drawError = ref<string>('')
  const zonesError = ref<string>('')
  const zoneCount = ref<number>(0)
  const hoveredZoneId = ref<string | number | null>(null)
  let didFitBounds = false
  const auth = useAuthStore()

  onMounted(async () => {
    map.value = new maplibregl.Map({
      container: containerId,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [69.2401, 41.2995],
      zoom: 11,
    }) as unknown as MapRuntime

    const mapRef = map.value as unknown as MapRuntime

    mapRef.on('load', async () => {
      try {
        await loadZones()
      } catch {
        zonesError.value =
          'Could not load zones from API. Check backend server and VITE_API_BASE_URL.'
      }

      // Only companies can draw parcels
      if (auth.isCompany) {
        initDraw()
      }

      // Click to inspect zone
      mapRef.on('click', 'zones-fill', (e: maplibregl.MapLayerMouseEvent) => {
        const feature = e.features?.[0]
        if (!feature) {
          return
        }

        const props = feature.properties as ZoneProperties | undefined
        if (props) {
          selectedZone.value = props
          selectedZoneGeometry.value = feature.geometry ?? null
        }
      })

      mapRef.on('mousemove', 'zones-fill', (e: maplibregl.MapLayerMouseEvent) => {
        mapRef.getCanvas().style.cursor = 'pointer'

        const feature = e.features?.[0]
        if (!feature || feature.id == null) {
          return
        }

        if (hoveredZoneId.value !== null && hoveredZoneId.value !== feature.id) {
          mapRef.setFeatureState(
            { source: 'zones', id: hoveredZoneId.value },
            { hover: false },
          )
        }

        hoveredZoneId.value = feature.id
        mapRef.setFeatureState(
          { source: 'zones', id: feature.id },
          { hover: true },
        )
      })

      mapRef.on('mouseenter', 'zones-fill', () => {
        mapRef.getCanvas().style.cursor = 'pointer'
      })

      mapRef.on('mouseleave', 'zones-fill', () => {
        mapRef.getCanvas().style.cursor = ''

        if (hoveredZoneId.value !== null) {
          mapRef.setFeatureState(
            { source: 'zones', id: hoveredZoneId.value },
            { hover: false },
          )
          hoveredZoneId.value = null
        }
      })
    })
  })

  onUnmounted(() => map.value?.remove())

  async function loadZones() {
    zonesError.value = ''
    const res = await api.get<ZoneFeatureCollection>('/zones')
    const geojson = res.data
    zoneCount.value = Array.isArray(geojson?.features) ? geojson.features.length : 0

    if (map.value!.getSource('zones')) {
      ;(map.value!.getSource('zones') as maplibregl.GeoJSONSource).setData(geojson)
      if (!didFitBounds) {
        fitMapToZones(geojson)
      }
      return
    }

    map.value!.addSource('zones', { type: 'geojson', data: geojson })

    map.value!.addLayer({
      id: 'zones-hover-outline',
      type: 'line',
      source: 'zones',
      paint: {
        'line-color': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          '#ffffff',
          'rgba(255,255,255,0)',
        ],
        'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 3, 0],
        'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
      },
    })

    // Fill layer
    map.value!.addLayer({
      id: 'zones-fill',
      type: 'fill',
      source: 'zones',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'status'], 'RESTRICTED'], '#ef4444',
          ['==', ['get', 'status'], 'IN_AUCTION'], '#ec4899',
          ['==', ['get', 'status'], 'IN_TENDER'], '#06b6d4',
          ['==', ['get', 'status'], 'AWARDED'], '#334155',
          ['==', ['get', 'type'], 'RESIDENTIAL'], '#22c55e',
          ['==', ['get', 'type'], 'INDUSTRIAL'], '#3b82f6',
          ['==', ['get', 'type'], 'COMMERCIAL'], '#f59e0b',
          ['==', ['get', 'type'], 'PUBLIC_INFRA'], '#8b5cf6',
          '#cbd5e1',
        ],
        'fill-opacity': 0.68,
      },
    })

    // Outline layer
    map.value!.addLayer({
      id: 'zones-outline',
      type: 'line',
      source: 'zones',
      paint: {
        'line-color': '#1e293b',
        'line-width': 1.2,
        'line-opacity': 0.6,
      },
    })

    map.value!.addLayer({
      id: 'zones-labels',
      type: 'symbol',
      source: 'zones',
      minzoom: 13,
      layout: {
        'symbol-placement': 'point',
        'text-field': ['get', 'type'],
        'text-size': 11,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-anchor': 'center',
        'text-justify': 'center',
      },
      paint: {
        'text-color': '#0f172a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    })

    fitMapToZones(geojson)
  }

  function fitMapToZones(geojson: ZoneFeatureCollection) {
    if (didFitBounds || !geojson.features.length || !map.value) {
      return
    }

    const [minX, minY, maxX, maxY] = turf.bbox(geojson)
    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    ) {
      return
    }

    map.value.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      {
        padding: 48,
        duration: 0,
        maxZoom: 14,
      },
    )

    didFitBounds = true
  }

  function initDraw() {
    draw.value = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    })

    map.value!.addControl(draw.value as unknown as maplibregl.IControl)

    map.value!.on('draw.create', validateDrawn)
    map.value!.on('draw.update', validateDrawn)
    map.value!.on('draw.delete', () => {
      drawnParcel.value = null
      selectedDrawZone.value = null
      drawError.value = ''
    })
  }

  function validateDrawn(e: { features: GeoJSON.Feature[] }) {
    const polygon = e.features[0]
    if (!polygon || !polygon.geometry) {
      return
    }

    drawError.value = ''

    const parcelArea = turf.area(polygon)
    if (parcelArea > 500000) {
      if (polygon.id != null) {
        draw.value?.delete(String(polygon.id))
      }
      drawnParcel.value = null
      selectedDrawZone.value = null
      drawError.value = 'Drawn parcel is too large. Maximum allowed area is 500,000 m².'
      return
    }

    // Get all zone features
    const source = map.value!.getSource('zones') as maplibregl.GeoJSONSource
    const sourceData = source as maplibregl.GeoJSONSource & {
      _data?: DrawFeatureCollection
    }
    const allFeatures = sourceData._data?.features ?? []

    // Check if drawn parcel overlaps any RESTRICTED / non-available zone
    for (const zone of allFeatures) {
      const zoneProperties = zone.properties as ZoneProperties | undefined
      const zoneStatus = zoneProperties?.status
      if (zoneStatus && zoneStatus !== 'AVAILABLE') {
        try {
          const overlaps = turf.booleanIntersects(polygon, zone)
          if (overlaps) {
            if (polygon.id != null) {
              draw.value?.delete(String(polygon.id))
            }
            drawnParcel.value = null
            drawError.value =
              zoneStatus === 'RESTRICTED'
                ? '🔴 This area is restricted. Construction is not permitted here.'
                : `⚠️ This area is already ${zoneStatus.toLowerCase()}. Select a green available zone.`
            return
          }
        } catch {}
      }
    }

    // Ensure the polygon intersects an available zone and pin request to that zone.
    const availableZone = allFeatures.find((zone) => {
      const zoneProperties = zone.properties as ZoneProperties | undefined
      if (zoneProperties?.status !== 'AVAILABLE') return false
      try {
        return turf.booleanIntersects(polygon, zone)
      } catch {
        return false
      }
    })

    if (!availableZone) {
      if (polygon.id != null) {
        draw.value?.delete(String(polygon.id))
      }
      drawnParcel.value = null
      selectedDrawZone.value = null
      drawError.value = 'No available zone found under selected parcel. Draw inside a green area.'
      return
    }

    drawnParcel.value = polygon
    selectedDrawZone.value = availableZone.properties as ZoneProperties
    selectedZone.value = availableZone.properties as ZoneProperties
  }

  return {
    map,
    selectedZone,
    selectedZoneGeometry,
    selectedDrawZone,
    drawnParcel,
    drawError,
    zonesError,
    zoneCount,
  }
}
