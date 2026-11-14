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
