import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { QueuesPage } from "./pages/QueuesPage";
import { HierarchyPage } from "./pages/HierarchyPage";
import { RuleBuilderPage } from "./pages/RuleBuilderPage";
import { PayerMapsPage } from "./pages/PayerMapsPage";
import { AccountMapsPage } from "./pages/AccountMapsPage";
import { AccountsPage } from "./pages/AccountsPage";
import { AccountWorkbenchPage } from "./pages/AccountWorkbenchPage";
import { TransactionFocusPage } from "./pages/TransactionFocusPage";
import { AdminClientsPage } from "./pages/AdminClientsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { AdminClientReasonsPage } from "./pages/AdminClientReasonsPage";
import { ImportPage } from "./pages/ImportPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminEpicPage } from "./pages/AdminEpicPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const ok =
    user?.role === "SUPER_ADMIN" ||
    user?.role === "TENANT_ADMIN" ||
    user?.role === "CLIENT_ADMIN";
  if (!ok) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Tenant / super admins only (users + client CRUD). */
function TenantAdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const ok = user?.role === "SUPER_ADMIN" || user?.role === "TENANT_ADMIN";
  if (!ok) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/accounts/:id/transactions"
        element={
          <Protected>
            <TransactionFocusPage />
          </Protected>
        }
      />
      <Route
        path="/*"
        element={
          <Protected>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/queues" element={<QueuesPage />} />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/accounts/:id" element={<AccountWorkbenchPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/security" element={<Navigate to="/profile" replace />} />
                <Route path="/rules" element={<HierarchyPage />} />
                <Route path="/rules/new" element={<RuleBuilderPage />} />
                <Route
                  path="/mappings/payers"
                  element={<Navigate to="/admin/mappings/payers" replace />}
                />
                <Route
                  path="/mappings/accounts"
                  element={<Navigate to="/admin/mappings/accounts" replace />}
                />
                <Route
                  path="/admin/clients"
                  element={
                    <TenantAdminOnly>
                      <AdminClientsPage />
                    </TenantAdminOnly>
                  }
                />
                <Route
                  path="/admin/clients/:clientId/reasons"
                  element={
                    <AdminOnly>
                      <AdminClientReasonsPage />
                    </AdminOnly>
                  }
                />
                <Route
                  path="/admin/clients/:clientId/epic"
                  element={
                    <AdminOnly>
                      <AdminEpicPage />
                    </AdminOnly>
                  }
                />
                <Route
                  path="/admin/epic"
                  element={
                    <AdminOnly>
                      <AdminEpicPage />
                    </AdminOnly>
                  }
                />
                <Route
                  path="/admin/users"
                  element={
                    <TenantAdminOnly>
                      <AdminUsersPage />
                    </TenantAdminOnly>
                  }
                />
                <Route
                  path="/admin/mappings/payers"
                  element={
                    <AdminOnly>
                      <PayerMapsPage />
                    </AdminOnly>
                  }
                />
                <Route
                  path="/admin/mappings/accounts"
                  element={
                    <AdminOnly>
                      <AccountMapsPage />
                    </AdminOnly>
                  }
                />
              </Routes>
            </Layout>
          </Protected>
        }
      />
    </Routes>
  );
}
