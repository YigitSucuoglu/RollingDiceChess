import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import authentication from './bootstrap/Authentication.ts'
import AppErrorBoundary from './observability/AppErrorBoundary.tsx'
import { initializeObservability } from './observability/Observability.ts'

initializeObservability()
void authentication.restoreSession()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
