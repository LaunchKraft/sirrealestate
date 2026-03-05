// ci trigger 4
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import { amplifyConfig } from '@/config/amplify'
import ThemeProvider from '@/theme/theme-provider'
import App from './App'
import './index.css'
import '@/theme/mui-extend'

Amplify.configure(amplifyConfig)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
