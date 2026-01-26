import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { cleanupSupabaseAuthStorage } from "@/contexts/auth/cleanupSupabaseAuthStorage";

// Run before React mounts to avoid any stale auth token triggering refresh loops.
cleanupSupabaseAuthStorage();

createRoot(document.getElementById("root")!).render(<App />);
