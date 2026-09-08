import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Layout } from "../components/Layout";
import { LoginPage } from "../pages/LoginPage";
import { AttendancePage } from "../pages/AttendancePage";
import { ChessboardPage } from "../pages/ChessboardPage";
import { ChatPage } from "../pages/ChatPage";
import { PrintPage } from "../pages/PrintPage";
import { PhonesPage } from "../pages/PhonesPage";
import { HelpPage } from "../pages/HelpPage";
import { StroevkaReviewPage } from "../pages/StroevkaReviewPage";
import { ShiftChangePage } from "../pages/ShiftChangePage";
import { AdminUnitsPage, AuditPage } from "../pages/AdminPages";
import { AdminDutyContactsPage } from "../pages/AdminDutyContactsPage";
import { ChiefOverviewPage } from "../pages/ChiefOverviewPage";
import { ChiefTrendsPage } from "../pages/ChiefTrendsPage";
import { homePath } from "../lib/homePath";

function HomeRedirect() {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={homePath(session.role, session.shell)} replace />;
}

function ExcludeRoles({
  roles,
  children,
}: {
  roles: string[];
  children: React.ReactNode;
}) {
  const { session } = useAuth();
  if (session && roles.includes(session.role)) {
    return <Navigate to={homePath(session.role, session.shell)} replace />;
  }
  return <>{children}</>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Загрузка...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireShell({
  children,
  shells,
}: {
  children: React.ReactNode;
  shells: string[];
}) {
  const { session } = useAuth();
  if (!session || !shells.includes(session.shell)) {
    return <Navigate to={homePath(session?.role ?? "", session?.shell ?? "")} replace />;
  }
  return <>{children}</>;
}

function RequireRole({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles: string[];
}) {
  const { session } = useAuth();
  if (!session || !roles.includes(session.role)) {
    return <Navigate to={homePath(session?.role ?? "", session?.shell ?? "")} replace />;
  }
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout>
              <Routes>
                <Route path="/" element={<HomeRedirect />} />
                <Route
                  path="/attendance"
                  element={
                    <ExcludeRoles roles={["dpa"]}>
                      <AttendancePage />
                    </ExcludeRoles>
                  }
                />
                <Route
                  path="/stroevka"
                  element={
                    <RequireRole roles={["dpa", "dpf"]}>
                      <StroevkaReviewPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/chessboard"
                  element={
                    <RequireRole roles={["dpa"]}>
                      <ChessboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/chat"
                  element={
                    <RequireRole roles={["dpa", "dpf", "dpk"]}>
                      <ChatPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/phones"
                  element={
                    <RequireRole roles={["dpf", "dpa", "dpk", "chief"]}>
                      <PhonesPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/print"
                  element={
                    <RequireRole roles={["dpa", "dpf", "dpk"]}>
                      <PrintPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/shift-change"
                  element={
                    <RequireRole roles={["dpa", "dpf", "dpk"]}>
                      <ShiftChangePage />
                    </RequireRole>
                  }
                />
                <Route path="/help" element={<HelpPage />} />
                <Route
                  path="/overview"
                  element={
                    <RequireShell shells={["chief"]}>
                      <ChiefOverviewPage />
                    </RequireShell>
                  }
                />
                <Route
                  path="/trends"
                  element={
                    <RequireShell shells={["chief"]}>
                      <ChiefTrendsPage />
                    </RequireShell>
                  }
                />
                <Route
                  path="/admin/units"
                  element={
                    <RequireShell shells={["admin"]}>
                      <AdminUnitsPage />
                    </RequireShell>
                  }
                />
                <Route
                  path="/admin/duty-contacts"
                  element={
                    <RequireShell shells={["admin"]}>
                      <AdminDutyContactsPage />
                    </RequireShell>
                  }
                />
                <Route
                  path="/audit"
                  element={
                    <RequireShell shells={["admin"]}>
                      <AuditPage />
                    </RequireShell>
                  }
                />
              </Routes>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
    </>
  );
}
