import React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, BaseStyles } from '@primer/react'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

// Global unhandled error/rejection logging — surfaces in dev console and
// can be captured by tools.
window.addEventListener('error', (e) => {
  console.error('[Unhandled Error]', e.error?.message ?? e.message, '\n', e.error?.stack ?? '')
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Promise Rejection]', e.reason?.message ?? e.reason, '\n', e.reason?.stack ?? '')
})

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <ThemeProvider colorMode="auto">
      <BaseStyles>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BaseStyles>
    </ThemeProvider>
  </React.StrictMode>
)
