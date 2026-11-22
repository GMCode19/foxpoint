import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import '@fontsource-variable/saira/wdth.css'
import '@fontsource/barlow/latin-400.css'
import '@fontsource/barlow/latin-500.css'
import '@fontsource/barlow/latin-600.css'
import '@fontsource/barlow/latin-700.css'
import './styles.css'
createRoot(document.getElementById('root')).render(<App />)

// service worker: notifiche e apertura senza rete (solo nella versione pubblicata)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}))
  navigator.serviceWorker.addEventListener('message', e => { if (e.data?.type === 'open') location.href = e.data.url })
}
