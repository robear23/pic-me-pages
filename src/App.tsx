import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import { Navigation } from "./components/Navigation";
import WaitingList from "./pages/WaitingList";
import App from "./pages/App";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import AdminEmailTemplates from "./pages/AdminEmailTemplates";
import EmailTemplateEditor from "./pages/EmailTemplateEditor";
import TestPdfGeneration from "./pages/TestPdfGeneration";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppRoot = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<WaitingList />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <>
                  <Navigation />
                  <Dashboard />
                </>
              </ProtectedRoute>
            } />
            <Route path="/app" element={
              <ProtectedRoute>
                <>
                  <Navigation />
                  <App />
                </>
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <AdminRoute>
                <>
                  <Navigation />
                  <AdminPanel />
                </>
              </AdminRoute>
            } />
            <Route path="/admin/emails" element={
              <AdminRoute>
                <AdminEmailTemplates />
              </AdminRoute>
            } />
            <Route path="/admin/emails/:templateId" element={
              <AdminRoute>
                <EmailTemplateEditor />
              </AdminRoute>
            } />
            <Route path="/test-pdf" element={
              <ProtectedRoute>
                <TestPdfGeneration />
              </ProtectedRoute>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default AppRoot;
