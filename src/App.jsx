import { useEffect, useRef, useState } from 'react'
import Map, { Marker, Popup } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import mapboxgl from 'mapbox-gl'
import { supabase } from './supabaseClient'
import './App.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Simple per-brewery visual identity — colour/icon nods to each brewery's own branding
function getBreweryTheme(name) {
  const themes = {
    'Garage Project': { fill: '#A0338F', stroke: '#FFF', iconColor: '#FFF', icon: '🍺' },
    'Panhead Custom Ales': { fill: '#1A1A1A', stroke: '#D4720A', iconColor: '#D4720A', icon: '🍺' },
  }
  return themes[name] || { fill: '#D4720A', stroke: '#FFF', iconColor: '#FFF', icon: '🍺' }
}

function App() {
  const [breweries, setBreweries] = useState([])
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)
  const mapRef = useRef(null)

  useEffect(() => {
    async function fetchBreweries() {
      const { data, error } = await supabase.from('breweries').select('*')
      if (error) {
        setError(error.message)
      } else {
        setBreweries(data)
      }
    }
    fetchBreweries()
  }, [])

  // Once breweries load and the map is ready, fit the view to show both pins
  useEffect(() => {
    if (breweries.length > 0 && mapRef.current) {
      const bounds = new mapboxgl.LngLatBounds()
      breweries.forEach((b) => bounds.extend([b.longitude, b.latitude]))
     mapRef.current.fitBounds(bounds, {
  padding: { top: 100, bottom: 80, left: 80, right: 80 },
  duration: 0,
})
    }
  }, [breweries])

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>craftbeer.kiwi</h1>
        <p>Wellington's craft brewery trail</p>
      </header>

      {error && <p style={{ color: 'red', padding: '8px' }}>Error: {error}</p>}

      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          longitude: 174.85,
          latitude: -41.23,
          zoom: 10,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/light-v11"
      >
{breweries.map((b) => {
  const theme = getBreweryTheme(b.name)
  return (
    <Marker
      key={b.id}
      longitude={b.longitude}
      latitude={b.latitude}
      onClick={(e) => {
        e.originalEvent.stopPropagation()
        setSelected(b)
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
            {theme.icon}
          </text>
        </svg>
      </div>
    </Marker>
  )
})} 

        {selected && (
          <Popup
            longitude={selected.longitude}
            latitude={selected.latitude}
            onClose={() => setSelected(null)}
            closeOnClick={false}
            offset={30}
            className="brewery-popup"
          >
            <div className="popup-content" style={{ borderTop: `4px solid 		${getBreweryTheme(selected.name).fill}` }}>
              <h3>{selected.name}</h3>
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