import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import './index.css'

Sentry.init({
  dsn: 'https://4e7e6e9d958f41bbf6420535a2a0845f@o4511917900169216.ingest.de.sentry.io/4511917913342032',
  environment: import.meta.env.MODE, // 'production' or 'development'
  integrations: [
    Sentry.browserTracingIntegration(),
  ],
  // Capture 100% of errors, 10% of performance traces
  tracesSampleRate: 0.1,
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
