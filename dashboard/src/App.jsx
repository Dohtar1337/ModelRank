import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Play,
  GitCompare,
  Cpu,
  Download,
  Settings as SettingsIcon
} from 'lucide-react'
import { getSetupStatus } from './lib/api'

// Pages (lazy load or import as needed)
import Overview from './pages/Overview'
import NewRun from './pages/NewRun'
import Compare from './pages/Compare'
import Models from './pages/Models'
import Import from './pages/Import'
import SettingsPage from './pages/Settings'
import RunDetail from './pages/RunDetail'
import Setup from './pages/Setup'

function Layout() {
  const navigate = useNavigate()

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const status = await getSetupStatus()
        if (!status.setupComplete) {
          navigate('/setup')
        }
      } catch (err) {
        console.error('Failed to check setup status:', err)
      }
    }

    checkSetup()
  }, [navigate])

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 w-[220px] h-screen bg-[#141414] border-r border-[#252525] overflow-y-auto">
        <div className="p-4">
          {/* Logo */}
          <div className="mb-8">
            <div className="text-[#00ff88] font-bold text-lg leading-tight">
              MODEL
            </div>
            <div className="text-[#ffaa00] font-bold text-lg leading-tight">
              RANK
            </div>
            <div className="text-[#666666] text-xs mt-1 font-normal">
              By <a href="https://github.com/Dohtar1337" target="_blank" rel="noopener noreferrer" style={{ color: '#00ddff', textDecoration: 'none' }}>Dohtar1337</a>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-1">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <LayoutDashboard size={18} />
              <span>Overview</span>
            </NavLink>

            <NavLink
              to="/new-run"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <Play size={18} />
              <span>New Run</span>
            </NavLink>

            <NavLink
              to="/compare"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <GitCompare size={18} />
              <span>Compare</span>
            </NavLink>

            <NavLink
              to="/models"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <Cpu size={18} />
              <span>Models</span>
            </NavLink>

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <SettingsIcon size={18} />
              <span>Settings</span>
            </NavLink>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-[220px] p-6 w-[calc(100%-220px)] min-h-screen flex flex-col">
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/new-run" element={<NewRun />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/models" element={<Models />} />
            <Route path="/import" element={<Import />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/runs/:runId" element={<RunDetail />} />
            <Route path="/setup" element={<Setup />} />
          </Routes>
        </div>

        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid #1a1a1a',
          textAlign: 'center',
          fontSize: '11px',
          color: '#444',
          fontFamily: 'monospace'
        }}>
          Help me buy Claude Pro Max<br /><span style={{ color: '#ffaa00', userSelect: 'all' }}>bc1q24qhjfhyudqkldn5lc9vemgpfv9hesanvcw70d</span>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
