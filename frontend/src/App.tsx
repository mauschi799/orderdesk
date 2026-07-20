import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useBrandStore } from './store/brandStore';
import LoginPage from './pages/LoginPage';
import Layout from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import KanbanPage from './pages/KanbanPage';
import DeliveriesPage from './pages/DeliveriesPage';
import DeliveryDetailPage from './pages/DeliveryDetailPage';
import DeliveryFormPage from './pages/DeliveryFormPage';
import ImportPage from './pages/ImportPage';
import UsersPage from './pages/UsersPage';
import AuditPage from './pages/AuditPage';
import SettingsPage from './pages/SettingsPage';
import MapPage from './pages/MapPage';
import ToursPage from './pages/ToursPage';
import AutoImportPage from './pages/AutoImportPage';
import WhitelabelPage from './pages/WhitelabelPage';
import LagerMeldenPage from './pages/LagerMeldenPage';
import LagerUebersichtPage from './pages/LagerUebersichtPage';
import LagerProduktverwaltungPage from './pages/LagerProduktverwaltungPage';
import ApiTesterPage from './pages/ApiTesterPage';
import FahrzeugePage from './pages/FahrzeugePage';
import FahrerPage from './pages/FahrerPage';
import TourBuilderPage from './pages/TourBuilderPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasRole } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasRole('administrator')) return <Navigate to="/" replace />;
  return <>{children}</>;
}
function LageristRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasRole } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasRole('lagerist', 'administrator')) return <Navigate to="/" replace />;
  return <>{children}</>;
}
function DefaultRedirect() {
  const { hasRole } = useAuthStore();
  if (hasRole('filialen')) return <Navigate to="/lager/melden" replace />;
  return <Navigate to="/kanban" replace />;
}

export default function App() {
  const { features } = useBrandStore(s => s.settings);
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<DefaultRedirect />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="kanban" element={<KanbanPage />} />
          <Route path="lieferscheine" element={<DeliveriesPage />} />
          <Route path="lieferscheine/neu" element={<DeliveryFormPage />} />
          <Route path="lieferscheine/:id/bearbeiten" element={<DeliveryFormPage />} />
          <Route path="lieferscheine/:id" element={<DeliveryDetailPage />} />
          {features?.showMapView !== false && <Route path="karte" element={<MapPage />} />}
          {features?.showTourPlanning !== false && <Route path="touren" element={<ToursPage />} />}
          {features?.showTourPlanning !== false && <Route path="touren/neu" element={<TourBuilderPage />} />}
          {features?.showTourPlanning !== false && <Route path="touren/:id/bearbeiten" element={<TourBuilderPage />} />}
          <Route path="import" element={<ImportPage />} />
          {features?.showAutoImport !== false && <Route path="auto-import" element={<AutoImportPage />} />}
          {features?.showAuditLog !== false && <Route path="audit" element={<AuditPage />} />}
          <Route path="lager/melden" element={<PrivateRoute><LagerMeldenPage /></PrivateRoute>} />
          <Route path="lager/uebersicht" element={<LageristRoute><LagerUebersichtPage /></LageristRoute>} />
          <Route path="lager/produkte" element={<AdminRoute><LagerProduktverwaltungPage /></AdminRoute>} />
          <Route path="api-tester" element={<AdminRoute><ApiTesterPage /></AdminRoute>} />
          <Route path="fahrzeuge" element={<AdminRoute><FahrzeugePage /></AdminRoute>} />
          <Route path="fahrer" element={<AdminRoute><FahrerPage /></AdminRoute>} />
          <Route path="benutzer" element={<AdminRoute><UsersPage /></AdminRoute>} />
          <Route path="whitelabel" element={<AdminRoute><WhitelabelPage /></AdminRoute>} />
          <Route path="einstellungen" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/kanban" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
