import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Map, { Marker, Popup, GeolocateControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import mapboxgl from 'mapbox-gl'
import Supercluster from 'supercluster'
import { supabase } from './supabaseClient'
import './App.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Per-brewery visual identity — colour/icon nods to each brewery's own branding.
// Falls back to a default orange pin for any brewery not listed here.
function getBreweryTheme(name) {
  const themes = {
    'Garage Project': { fill: '#A0338F', stroke: '#FFF', iconColor: '#FFF' },
    'Garage Project Leeds Street': { fill: '#C64FB0', stroke: '#FFF', iconColor: '#FFF' },
    'Panhead Custom Ales': { fill: '#1A1A1A', stroke: '#D4720A', iconColor: '#D4720A' },
    'Fork & Brewer': { fill: '#1B4F72', stroke: '#FFF', iconColor: '#FFF' },
    'Heyday Beer Co': { fill: '#4CAF7D', stroke: '#FFF', iconColor: '#FFF' },
    'Mean Doses': { fill: '#E91E8C', stroke: '#FFF', iconColor: '#FFF' },
    'Choice Bros Brewing': { fill: '#16A085', stroke: '#FFF', iconColor: '#FFF' },
    'Parrotdog Brewery': { fill: '#27AE60', stroke: '#FFF', iconColor: '#FFF' },
    'Double Vision Brewing': { fill: '#6C5CE7', stroke: '#FFF', iconColor: '#FFF' },
    'Baylands Brewery': { fill: '#2C5F8A', stroke: '#FFF', iconColor: '#FFF' },
    'Abandoned Brewery': { fill: '#B7472A', stroke: '#FFF', iconColor: '#FFF' },
    'Boneface Brewing Co': { fill: '#3A3A3A', stroke: '#FFF', iconColor: '#FFF' },
    'Te Aro Brewing Company': { fill: '#922B21', stroke: '#FFF', iconColor: '#FFF' },
    'Tuatara Brewery': { fill: '#556B2F', stroke: '#FFF', iconColor: '#FFF' },
    'Kereru Brewing': { fill: '#6D4C41', stroke: '#FFF', iconColor: '#FFF' },
    'North End Brewing': { fill: '#C9A66B', stroke: '#FFF', iconColor: '#FFF' },
    "Duncan's Brewing Company": { fill: '#D4AC0D', stroke: '#FFF', iconColor: '#FFF' },
    'Waitoa': { fill: '#3A3A3A', stroke: '#E8720C', iconColor: '#FFF' },
  }
  return themes[name] || { fill: '#D4720A', stroke: '#FFF', iconColor: '#FFF' }
}
function App() {
  const [breweries, setBreweries] = useState([])
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)
  const [bounds, setBounds] = useState(null)
  const [zoom, setZoom] = useState(10)
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('mapTheme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    localStorage.setItem('mapTheme', darkMode ? 'dark' : 'light');
  }, [darkMode]);
  const mapRef = useRef(null)

  useEffect(() => {
    async function fetchBreweries() {
      const { data, error } = await supabase.from('breweries').select('*').eq('is_active', true)
      if (error) {
        setError(error.message)
      } else {
        setBreweries(data)
      }
    }
    fetchBreweries()
  }, [])

  // Fit the initial view to show all breweries once data + map are ready
  useEffect(() => {
    if (breweries.length > 0 && mapRef.current) {
      const b = new mapboxgl.LngLatBounds()
      breweries.forEach((br) => b.extend([br.longitude, br.latitude]))
      mapRef.current.fitBounds(b, {
        padding: { top: 100, bottom: 80, left: 80, right: 80 },
        duration: 0,
      })
    }
  }, [breweries])

  // Build the supercluster index whenever brewery data changes
  const supercluster = useMemo(() => {
    if (breweries.length === 0) return null
    const index = new Supercluster({ radius: 60, maxZoom: 16 })
    index.load(
      breweries.map((b) => ({
        type: 'Feature',
        properties: { cluster: false, breweryId: b.id, brewery: b },
        geometry: { type: 'Point', coordinates: [b.longitude, b.latitude] },
      }))
    )
    return index
  }, [breweries])

  // Recalculate visible clusters whenever bounds/zoom change
  const clusters = useMemo(() => {
    if (!supercluster || !bounds) return []
    return supercluster.getClusters(bounds, Math.floor(zoom))
  }, [supercluster, bounds, zoom])

  const updateBoundsAndZoom = useCallback(() => {
    if (!mapRef.current) return
    const b = mapRef.current.getBounds()
    setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
    setZoom(mapRef.current.getZoom())
  }, [])

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>craftbeer.kiwi</h1>
        <p>Wellington's craft brewery trail</p>
        <button
          onClick={() => setDarkMode(d => !d)}
          aria-label="Toggle dark mode"
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            background: darkMode ? '#333' : '#EEE',
            color: darkMode ? '#FFF' : '#333',
          }}
        >
          {darkMode ? 'Light' : 'Dark'}
        </button>
      </header>

      {error && <p style={{ color: 'red', padding: '8px' }}>Error: {error}</p>}

      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: 174.85, latitude: -41.23, zoom: 10 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={darkMode ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11"}
        onLoad={updateBoundsAndZoom}
        onMoveEnd={updateBoundsAndZoom}
      >
        <GeolocateControl position="top-right" trackUserLocation={true} showUserHeading={true} />
        {clusters.map((feature) => {
          const [longitude, latitude] = feature.geometry.coordinates
          const { cluster: isCluster, point_count: pointCount } = feature.properties

          if (isCluster) {
            return (
              <Marker
                key={`cluster-${feature.id}`}
                longitude={longitude}
                latitude={latitude}
                onClick={() => {
                  const expansionZoom = Math.min(
                    supercluster.getClusterExpansionZoom(feature.id),
                    18
                  )
                  mapRef.current.flyTo({ center: [longitude, latitude], zoom: expansionZoom })
                }}
              >
                <div className="cluster-pin">{pointCount}</div>
              </Marker>
            )
          }

          const b = feature.properties.brewery
          const isTempClosed = b.status === 'temporarily_closed'
          const theme = isTempClosed
            ? { fill: '#9E9E9E', stroke: '#FFF', iconColor: '#FFF' }
            : getBreweryTheme(b.name)
          return (
            <Marker
              key={b.id}
              longitude={longitude}
              latitude={latitude}
              onClick={(e) => {
                e.originalEvent.stopPropagation()
                setSelected(b)
                mapRef.current.flyTo({ center: [longitude, latitude], zoom: Math.max(zoom, 14), duration: 800, padding: { top: 120, bottom: 0, left: 0, right: 0 } })
              }}
            >
              <div className="brewery-pin">
                <svg viewBox="0 0 24 24" width="32" height="32">
                  <path
                    d="M12 0C7 0 3 4 3 9c0 6.5 9 15 9 15s9-8.5 9-15c0-5-4-9-9-9z"
                    fill={theme.fill}
                    stroke={theme.stroke}
                    strokeWidth="1.5"
                  />
                  <text x="12" y="12" fontSize="10" textAnchor="middle" fill={theme.iconColor}>
                    🍺
                  </text>
                </svg>
              </div>
            </Marker>
          )
        })}

        {selected && (
          <Popup
            key={selected.id}
            longitude={selected.longitude}
            latitude={selected.latitude}
            onClose={() => setSelected(null)}
            closeOnClick={false}
            anchor="bottom"
            offset={30}
          >
            <div
              className="popup-content"
              style={{ borderTop: `4px solid ${getBreweryTheme(selected.name).fill}` }}
            >
              <h3>{selected.name}</h3>
              {selected.status === 'temporarily_closed' && (
                <p className="popup-status-badge">Temporarily Closed</p>
              )}
              {selected.status_note && <p className="popup-status-note">{selected.status_note}</p>}
              <p className="popup-address">{selected.address}</p>
              {selected.description && <p className="popup-description">{selected.description}</p>}
              {selected.website && (
                <a href={selected.website} target="_blank" rel="noopener noreferrer">
                  Visit website →
                </a>
              )}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  )
}

export default App