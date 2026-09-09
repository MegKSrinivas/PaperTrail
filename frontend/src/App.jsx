import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { DashboardProvider } from './context/DashboardContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import LibraryPage from './pages/LibraryPage'
import ArXivPage from './pages/ArXivPage'
import ResearchPage from './pages/ResearchPage'
import GraphPage from './pages/GraphPage'

function ProtectedRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/" replace />
}

function DashboardRoutes() {
  return (
    <DashboardProvider>
      <Layout>
        <Routes>
          <Route index element={<Navigate to="library" replace />} />
          <Route path="library"  element={<LibraryPage />} />
          <Route path="arxiv"    element={<ArXivPage />} />
          <Route path="research" element={<ResearchPage />} />
<Route path="graph"    element={<GraphPage />} />
        </Routes>
      </Layout>
    </DashboardProvider>
  )
}

export default function App() {
  const { token } = useAuth()

  return (
    <Routes>
      <Route
        path="/"
        element={token ? <Navigate to="/library" replace /> : <LoginPage />}
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <DashboardRoutes />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
