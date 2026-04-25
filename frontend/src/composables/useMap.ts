import { ref, onMounted, onUnmounted } from 'vue'
import maplibregl from 'maplibre-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import * as turf from '@turf/turf'
import api from '../api'
import { useAuthStore } from '../stores/auth'

export function useMap(containerId: string) {
  const map = ref<any | null>(null)
  const draw = ref<any | null>(null)
  const selectedZone = ref<any | null>(null)
  const selectedZoneGeometry = ref<any | null>(null)
  const selectedDrawZone = ref<any | null>(null)
  const drawnParcel = ref<any | null>(null)
  const drawError = ref<string>('')
  const zonesError = ref<string>('')
  const zoneCount = ref<number>(0)
  const auth = useAuthStore()

  onMounted(async () => {
    map.value = new maplibregl.Map({
      container: containerId,
      style: {
        version: 8,
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
    })

    const mapRef = map.value as any

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
      mapRef.on('click', 'zones-fill', (e: any) => {
        const feature = e.features?.[0]
        const props = feature?.properties
        if (props) {
          selectedZone.value = props
          selectedZoneGeometry.value = feature.geometry
        }
      })

      mapRef.on('mouseenter', 'zones-fill', () => {
        mapRef.getCanvas().style.cursor = 'pointer'
      })
      mapRef.on('mouseleave', 'zones-fill', () => {
        mapRef.getCanvas().style.cursor = ''
      })
    })
  })

  onUnmounted(() => map.value?.remove())

  async function loadZones() {
    zonesError.value = ''
    const res = await api.get('/zones')
    const geojson = res.data
    zoneCount.value = Array.isArray(geojson?.features) ? geojson.features.length : 0

    if (map.value!.getSource('zones')) {
      ;(map.value!.getSource('zones') as maplibregl.GeoJSONSource).setData(geojson)
      return
    }

    map.value!.addSource('zones', { type: 'geojson', data: geojson })

    // Fill layer
    map.value!.addLayer({
      id: 'zones-fill',
      type: 'fill',
      source: 'zones',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'status'], 'RESTRICTED'], '#ef4444',
          ['==', ['get', 'status'], 'IN_AUCTION'], '#f97316',
          ['==', ['get', 'status'], 'IN_TENDER'], '#6366f1',
          ['==', ['get', 'status'], 'AWARDED'], '#64748b',
          ['==', ['get', 'type'], 'RESIDENTIAL'], '#22c55e',
          ['==', ['get', 'type'], 'INDUSTRIAL'], '#3b82f6',
          ['==', ['get', 'type'], 'COMMERCIAL'], '#f59e0b',
          '#8b5cf6',
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
  }

  function initDraw() {
    draw.value = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    }) as any

    map.value!.addControl(draw.value as any)

    map.value!.on('draw.create', validateDrawn)
    map.value!.on('draw.update', validateDrawn)
    map.value!.on('draw.delete', () => {
      drawnParcel.value = null
      selectedDrawZone.value = null
      drawError.value = ''
    })
  }

  function validateDrawn(e: any) {
    const polygon = e.features[0]
    drawError.value = ''

    // Get all zone features
    const source = map.value!.getSource('zones') as maplibregl.GeoJSONSource
    // @ts-ignore
    const allFeatures: any[] = source._data?.features ?? []

    // Check if drawn parcel overlaps any RESTRICTED / non-available zone
    for (const zone of allFeatures) {
      if (zone.properties.status !== 'AVAILABLE') {
        try {
          const overlaps = turf.booleanIntersects(polygon, zone)
          if (overlaps) {
            draw.value?.delete(polygon.id)
            drawnParcel.value = null
            drawError.value =
              zone.properties.status === 'RESTRICTED'
                ? '🔴 This area is restricted. Construction is not permitted here.'
                : `⚠️ This area is already ${zone.properties.status.toLowerCase()}. Select a green available zone.`
            return
          }
        } catch {}
      }
    }

    // Ensure the polygon intersects an available zone and pin request to that zone.
    const availableZone = allFeatures.find((zone) => {
      if (zone.properties.status !== 'AVAILABLE') return false
      try {
        return turf.booleanIntersects(polygon, zone)
      } catch {
        return false
      }
    })

    if (!availableZone) {
      draw.value?.delete(polygon.id)
      drawnParcel.value = null
      selectedDrawZone.value = null
      drawError.value = 'No available zone found under selected parcel. Draw inside a green area.'
      return
    }

    drawnParcel.value = polygon
    selectedDrawZone.value = availableZone.properties
    selectedZone.value = availableZone.properties
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
