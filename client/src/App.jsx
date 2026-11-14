import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { api } from './services/api';
import { ThemeProvider, ZONE_LIST } from './utils/semantics';

const NetworkWorkspace = lazy(() =>
  import('./workspaces/NetworkWorkspace').then((m) => ({ default: m.NetworkWorkspace }))
);
const JunctionWorkspace = lazy(() =>
  import('./workspaces/JunctionWorkspace').then((m) => ({ default: m.JunctionWorkspace }))
);
const DesksWorkspace = lazy(() =>
  import('./workspaces/DesksWorkspace').then((m) => ({ default: m.DesksWorkspace }))
);
const EngineeringWorkspace = lazy(() =>
  import('./workspaces/EngineeringWorkspace').then((m) => ({ default: m.EngineeringWorkspace }))
);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught]', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-2xl mx-auto my-12 p-6 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-200">
          <h2 className="text-sm font-bold text-rose-400 mb-2">Workspace Encountered an Error</h2>
          <p className="text-xs text-rose-300/80 mb-4 font-mono">{this.state.error?.message || 'Unknown runtime error'}</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/40"
          >
            Reload Workspace
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function WorkspaceFallback() {
  return (
    <div className="max-w-[1680px] mx-auto px-4 py-12 text-center text-xs text-ink-muted">
      Loading workspace module...
    </div>
  );
}

function ControlConsole() {
  const [activeWorkspace, setActiveWorkspace] = useState('network');
  const [devices, setDevices] = useState([]);
  const [zoneFilter, setZoneFilter] = useState('all');
  const [drawerJunctionId, setDrawerJunctionId] = useState(null);
  const [activeJunctionId, setActiveJunctionId] = useState('JNC-BLR-001');
  const { setAlerts, setViewSubscription, subscribeDevice, unsubscribeDevice } = useSocket();

  // Fetch initial device directory & alert feed cleanly on mount
  useEffect(() => {
    let active = true;
    api
      .getDevices()
      .then((res) => {
        if (!active || !Array.isArray(res?.devices)) return;
        setDevices(res.devices);
        if (res.devices.length > 0) {
          const firstId = res.devices[0].junctionId || res.devices[0].deviceId;
          if (firstId) setActiveJunctionId((prev) => prev || firstId);
        }
      })
      .catch(() => {});

    api
      .getAlerts({ limit: 40 })
      .then((res) => {
        if (active && Array.isArray(res?.alerts)) {
          setAlerts(res.alerts);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [setAlerts]);

  // Synchronize selective Socket.IO rooms cleanly per open workspace & target junction
  useEffect(() => {
    const activeZones = zoneFilter === 'all' ? ZONE_LIST : [zoneFilter];
    const alertsScope = zoneFilter === 'all' ? ['all'] : [zoneFilter];

    if (activeWorkspace === 'network') {
      setViewSubscription({
        city: true,
        engineering: false,
        zones: activeZones,
        junctions: drawerJunctionId ? [drawerJunctionId] : [],
        alerts: alertsScope,
      });
      return;
    }

    if (activeWorkspace === 'junction') {
      setViewSubscription({
        city: true,
        engineering: false,
        zones: [],
        junctions: activeJunctionId ? [activeJunctionId] : [],
        alerts: ['all'],
      });
      return;
    }

    if (activeWorkspace === 'desks') {
      setViewSubscription({
        city: true,
        engineering: false,
        zones: [],
        junctions: [],
        alerts: ['all'],
      });
      return;
    }

    if (activeWorkspace === 'engineering') {
      setViewSubscription({
        city: true,
        engineering: true,
        zones: ZONE_LIST,
        junctions: [],
        alerts: ['all'],
      });
    }
  }, [activeWorkspace, zoneFilter, drawerJunctionId, activeJunctionId, setViewSubscription]);

  const handleOpenDrawer = useCallback(
    (junctionId) => {
      if (drawerJunctionId && drawerJunctionId !== junctionId) {
        unsubscribeDevice(drawerJunctionId);
      }
      setDrawerJunctionId(junctionId);
      setActiveJunctionId(junctionId);
      subscribeDevice(junctionId);
    },
    [drawerJunctionId, subscribeDevice, unsubscribeDevice]
  );

  const handleCloseDrawer = useCallback(() => {
    if (drawerJunctionId) {
      unsubscribeDevice(drawerJunctionId);
    }
    setDrawerJunctionId(null);
  }, [drawerJunctionId, unsubscribeDevice]);

  const handleWorkspaceChange = useCallback(
    (nextWs) => {
      if (drawerJunctionId) {
        unsubscribeDevice(drawerJunctionId);
        setDrawerJunctionId(null);
      }
      setActiveWorkspace(nextWs);
    },
    [drawerJunctionId, unsubscribeDevice]
  );

  return (
    <div className="min-h-screen bg-ground text-ink-primary flex flex-col">
      <Navbar
        activeWorkspace={activeWorkspace}
        onChangeWorkspace={handleWorkspaceChange}
      />

      <main className="flex-1">
        <ErrorBoundary>
          <Suspense fallback={<WorkspaceFallback />}>
            {activeWorkspace === 'network' && (
              <NetworkWorkspace
                devices={devices}
                selectedZone={zoneFilter}
                onZoneChange={setZoneFilter}
                selectedJunctionId={drawerJunctionId}
                onOpenJunction={handleOpenDrawer}
                onCloseJunction={handleCloseDrawer}
              />
            )}

            {activeWorkspace === 'junction' && (
              <JunctionWorkspace
                devices={devices}
                selectedJunctionId={activeJunctionId}
                onSelectJunction={setActiveJunctionId}
              />
            )}

            {activeWorkspace === 'desks' && <DesksWorkspace />}

            {activeWorkspace === 'engineering' && <EngineeringWorkspace devices={devices} />}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <ControlConsole />
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
