import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AdminGuard, ManagerGuard, StaffGuard, RootRedirect, SetupGate } from './ProtectedRoute'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { PageLoader } from '@/components/common/PageLoader'

// ── Auth pages ────────────────────────────────────────────────────────────────
const LoginPage          = lazy(() => import('@/pages/auth/LoginPage'))
const SetupWizardPage    = lazy(() => import('@/pages/auth/SetupWizardPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage  = lazy(() => import('@/pages/auth/ResetPasswordPage'))
const AccessDeniedPage   = lazy(() => import('@/pages/common/AccessDeniedPage'))

// ── Landing ───────────────────────────────────────────────────────────────────
const HomePage = lazy(() => import('@/pages/home/HomePage'))

// ── AI Assistant ─────────────────────────────────────────────────────────────
const AIAssistantPage = lazy(() => import('@/pages/assistant/AIAssistantPage'))

// ── Dashboard (single unified dashboard for all roles) ────────────────────────
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'))

// ── Shared pages (visible to all roles) ──────────────────────────────────────
const InventoryPage       = lazy(() => import('@/pages/inventory/InventoryPage'))
const ProductDetailPage   = lazy(() => import('@/pages/products/ProductDetailPage'))
const ForecastingPage     = lazy(() => import('@/pages/forecasting/ForecastingPage'))
const AlertsPage          = lazy(() => import('@/pages/alerts/AlertsPage'))
const RecommendationsPage = lazy(() => import('@/pages/recommendations/RecommendationsPage'))
const ReportsPage         = lazy(() => import('@/pages/reports/ReportsPage'))
const ProfilePage         = lazy(() => import('@/pages/profile/ProfilePage'))
const AnalyticsPage       = lazy(() => import('@/pages/analytics/AnalyticsPage'))
const ModelsPage          = lazy(() => import('@/pages/models/ModelsPage'))
const SalesPage           = lazy(() => import('@/pages/sales/SalesPage'))
const PurchasesPage       = lazy(() => import('@/pages/purchases/PurchasesPage'))

// ── Admin-only pages ──────────────────────────────────────────────────────────
const ProductsPage       = lazy(() => import('@/pages/products/ProductsPage'))
const CategoriesPage     = lazy(() => import('@/pages/categories/CategoriesPage'))
const UnitsPage          = lazy(() => import('@/pages/units/UnitsPage'))
const SuppliersPage      = lazy(() => import('@/pages/suppliers/SuppliersPage'))
const SyntheticDataPage  = lazy(() => import('@/pages/synthetic/SyntheticDataPage'))
const UsersPage          = lazy(() => import('@/pages/users/UsersPage'))
const AuditLogsPage      = lazy(() => import('@/pages/auditlogs/AuditLogsPage'))
const SettingsPage       = lazy(() => import('@/pages/settings/SettingsPage'))
const StockMovementsPage = lazy(() => import('@/pages/stock-movements/StockMovementsPage'))

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <SetupGate>
        <Routes>
          {/* ── Setup wizard (only accessible when no admin exists) ── */}
          <Route path="/setup" element={<SetupWizardPage />} />

          {/* ── Public ── */}
          <Route path="/"   element={<HomePage />} />

          {/* ── Auth (no sidebar layout) ── */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
          <Route path="/forgot-password"           element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token"     element={<ResetPasswordPage />} />

        {/* ── Admin routes ── */}
        <Route element={<AdminGuard />}>
          <Route element={<DashboardLayout />}>
            <Route path="/admin/dashboard"       element={<AdminDashboard />} />
            <Route path="/admin/products"        element={<ProductsPage />} />
            <Route path="/admin/products/:id"    element={<ProductDetailPage />} />
            <Route path="/admin/categories"      element={<CategoriesPage />} />
            <Route path="/admin/units"           element={<UnitsPage />} />
            <Route path="/admin/suppliers"       element={<SuppliersPage />} />
            <Route path="/admin/inventory"       element={<InventoryPage />} />
            <Route path="/admin/inventory/:id"   element={<ProductDetailPage />} />
            <Route path="/admin/sales"           element={<SalesPage />} />
            <Route path="/admin/purchases"       element={<PurchasesPage />} />
            <Route path="/admin/stock-movements" element={<StockMovementsPage />} />
            <Route path="/admin/synthetic-data"  element={<SyntheticDataPage />} />
            <Route path="/admin/forecasting"     element={<ForecastingPage />} />
            <Route path="/admin/models"          element={<ModelsPage />} />
            <Route path="/admin/recommendations" element={<RecommendationsPage />} />
            <Route path="/admin/alerts"          element={<AlertsPage />} />
            <Route path="/admin/analytics"       element={<AnalyticsPage />} />
            <Route path="/admin/reports"         element={<ReportsPage />} />
            <Route path="/admin/users"           element={<UsersPage />} />
            <Route path="/admin/audit-logs"      element={<AuditLogsPage />} />
            <Route path="/admin/settings"        element={<SettingsPage />} />
            <Route path="/admin/profile"         element={<ProfilePage />} />
            <Route path="/admin/assistant"       element={<AIAssistantPage />} />
          </Route>
        </Route>

        {/* ── Inventory Manager routes ── */}
        <Route element={<ManagerGuard />}>
          <Route element={<DashboardLayout />}>
            <Route path="/manager/dashboard"       element={<AdminDashboard />} />
            <Route path="/manager/products"        element={<ProductsPage />} />
            <Route path="/manager/products/:id"    element={<ProductDetailPage />} />
            <Route path="/manager/suppliers"       element={<SuppliersPage />} />
            <Route path="/manager/inventory"       element={<InventoryPage />} />
            <Route path="/manager/inventory/:id"   element={<ProductDetailPage />} />
            <Route path="/manager/purchases"       element={<PurchasesPage />} />
            <Route path="/manager/sales"           element={<SalesPage />} />
            <Route path="/manager/forecasting"     element={<ForecastingPage />} />
            <Route path="/manager/models"          element={<ModelsPage />} />
            <Route path="/manager/recommendations" element={<RecommendationsPage />} />
            <Route path="/manager/alerts"          element={<AlertsPage />} />
            <Route path="/manager/analytics"       element={<AnalyticsPage />} />
            <Route path="/manager/reports"         element={<ReportsPage />} />
            <Route path="/manager/profile"         element={<ProfilePage />} />
            <Route path="/manager/assistant"       element={<AIAssistantPage />} />
          </Route>
        </Route>

        {/* ── Staff routes ── */}
        <Route element={<StaffGuard />}>
          <Route element={<DashboardLayout />}>
            <Route path="/staff/dashboard"     element={<AdminDashboard />} />
            <Route path="/staff/sales"         element={<SalesPage />} />
            <Route path="/staff/inventory"     element={<InventoryPage />} />
            <Route path="/staff/inventory/:id" element={<ProductDetailPage />} />
            <Route path="/staff/products"      element={<ProductsPage />} />
            <Route path="/staff/products/:id"  element={<ProductDetailPage />} />
            <Route path="/staff/alerts"        element={<AlertsPage />} />
            <Route path="/staff/profile"       element={<ProfilePage />} />
            <Route path="/staff/assistant"     element={<AIAssistantPage />} />
          </Route>
        </Route>

          {/* ── Misc ── */}
          <Route path="/access-denied" element={<AccessDeniedPage />} />
          <Route path="*"              element={<RootRedirect />} />
        </Routes>
      </SetupGate>
    </Suspense>
  )
}
