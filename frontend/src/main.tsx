import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Register high-performance Service Worker for Official Mobile App PWA
if ('serviceWorker' in navigator && !window.location.hostname.includes('localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(<App />)
