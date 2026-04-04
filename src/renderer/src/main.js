import '@fontsource/inter/400.css'
import '@fontsource/inter/700.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/700.css'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/700.css'
import '@fontsource/oswald/400.css'
import '@fontsource/oswald/700.css'
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/bebas-neue/400.css'
import '@fontsource/raleway/400.css'
import '@fontsource/raleway/700.css'
import '@fontsource/lato/400.css'
import '@fontsource/lato/700.css'
import '@fontsource/source-code-pro/400.css'
import '@fontsource/source-code-pro/700.css'
import { createApp } from 'vue'
import App from './App.vue'
import './assets/modal-themes.css'
import './assets/futuristic-theme.css'

const app = createApp(App)

// Global error handler — prevents blank screen on unhandled errors
app.config.errorHandler = (err, instance, info) => {
  console.error('[Pluto] Vue error:', err, '\nInfo:', info)
}

// Catch unhandled promise rejections at the window level
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Pluto] Unhandled promise rejection:', event.reason)
})

app.mount('#app')