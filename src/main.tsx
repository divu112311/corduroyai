  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import "./index.css";
  import { initSentry } from "./lib/sentry";

  // Initialize Sentry error monitoring (no-op if VITE_SENTRY_DSN is not set)
  initSentry();

  createRoot(document.getElementById("root")!).render(<App />);
  