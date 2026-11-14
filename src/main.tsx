import React from 'react'
import { createRoot } from 'react-dom/client'
import { setWorkerUrl } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles/tokens.css'
import './styles/app.css'
import { App } from './ui/App'

setWorkerUrl(mapWorkerUrl)

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
