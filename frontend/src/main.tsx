import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import App from "./App.tsx";
import { FlashProvider } from "./components/FlashProvider.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FlashProvider>
      <App />
    </FlashProvider>
  </StrictMode>,
);
