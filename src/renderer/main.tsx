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
        {window.repoAssist ? (
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        ) : (
          <div className="bridge-error">
            <h1>Repo Assist desktop bridge unavailable</h1>
            <p>This interface must be opened by the Electron app. Close this browser tab and start Repo Assist with <code>npm run dev</code>.</p>
          </div>
        )}
      </BaseStyles>
    </ThemeProvider>
  </React.StrictMode>
)
