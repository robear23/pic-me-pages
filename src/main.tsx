import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";

// Prevent auth refresh storms (429 rate limit) on app boot.
try {
  supabase.auth.stopAutoRefresh();
} catch {
  // ignore
}

createRoot(document.getElementById("root")!).render(<App />);
