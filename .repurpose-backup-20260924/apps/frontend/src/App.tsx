import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.js";
import NavBar from "./components/NavBar.js";
import Login from "./pages/Login.js";
import Plans from "./pages/Plans.js";
import PlanDetail from "./pages/PlanDetail.js";
import Calendar from "./pages/Calendar.js";
import Sessions from "./pages/Sessions.js";
import SessionDetail from "./pages/SessionDetail.js";

function AppRoutes() {
  const { status } = useAuth();

  if (status === "checking") return <p className="centered-page">Loading...</p>;
  if (status === "unauthenticated") return <Login />;

  return (
    <>
      <NavBar />
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/calendar" replace />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/plans/:id" element={<PlanDetail />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="*" element={<Navigate to="/calendar" replace />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
