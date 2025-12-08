//frontend/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ⬇️ add this line
import "./theme.css";

// (optional but nice) respect stored theme before React paints
if (typeof window !== "undefined") {
  const storedTheme = window.localStorage.getItem("velo_theme");
  const initialTheme =
    storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";
  document.documentElement.dataset.theme = initialTheme;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
