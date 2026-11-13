import React, { useState, useEffect } from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { KpiOverview } from './components/KpiOverview';
import { TelemetryCharts } from './components/TelemetryCharts';
import { AlertsFeed } from './components/AlertsFeed';
import { DeviceGrid } from './components/DeviceGrid';
import { DeviceDetailModal } from './components/DeviceDetailModal';
import { FleetMapView } from './components/FleetMapView';
import { HistoricalAnalytics } from './components/HistoricalAnalytics';
import { SimulatorControls } from './components/SimulatorControls';
import { PerformanceBenchmark } from './components/PerformanceBenchmark';
import { ArchitectureView } from './components/ArchitectureView';
import { api } from './services/api';

function MainApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [alertsList, setAlertsList] = useState([]);
  const { alerts } = useSocket();

  // Load devices on mount
  const loadDevices = async () => {
    try {
      const res = await api.getDevices();
      if (res.devices) setDevices(res.devices);
    } catch (err) {
      console.error('Failed to load devices:', err);
    }
  };

  // Load alerts on mount
  const loadAlerts = async () => {
    try {
      const res = await api.getAlerts({ limit: 40 });
      if (res.alerts) setAlertsList(res.alerts);
    } catch (err) {
      console.error('Failed to load alerts:', err);
    }
  };

  useEffect(() => {
    loadDevices();
    loadAlerts();
  }, []);

  // Sync incoming socket alerts into local alert list
  useEffect(() => {
    if (alerts.length > 0) {
      setAlertsList((prev) => {
        const ids = new Set(prev.map((a) => a.alertId));
        const newOnes = alerts.filter((a) => !ids.has(a.alertId));
        return [...newOnes, ...prev].slice(0, 50);
      });
    }
  }, [alerts]);

  const unresolvedCount = alertsList.filter((a) => !a.resolved).length;

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {activeTab === 'dashboard' && (
          <>
            {/* KPI Overview Cards */}
            <KpiOverview
              unresolvedAlertsCount={unresolvedCount}
              totalDevicesCount={devices.length}
            />

            {/* Split Section: Real-time Telemetry Charts & Live Alerts Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2">
                <TelemetryCharts devices={devices} />
              </div>
              <div className="lg:col-span-1">
                <AlertsFeed alerts={alertsList} onAlertsChange={loadAlerts} />
              </div>
            </div>

            {/* Monitored Nodes Matrix */}
            <DeviceGrid
              devices={devices}
              onSelectDevice={(dev) => setSelectedDevice(dev)}
            />
          </>
        )}

        {activeTab === 'map' && <FleetMapView devices={devices} />}

        {activeTab === 'historical' && <HistoricalAnalytics devices={devices} />}

        {activeTab === 'simulator' && <SimulatorControls />}

        {activeTab === 'benchmarks' && <PerformanceBenchmark />}

        {activeTab === 'architecture' && <ArchitectureView />}
      </main>

      {/* Deep-Dive Device Modal */}
      {selectedDevice && (
        <DeviceDetailModal
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#0B101D] px-6 py-4 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>HyperPulse Telemetry Platform • MERNIFY Hackathon 2026</span>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Node.js + Express.js</span>
            <span>•</span>
            <span>MongoDB Ingestion Pipeline</span>
            <span>•</span>
            <span>React.js</span>
            <span>•</span>
            <span>Socket.IO Real-time</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <MainApp />
      </SocketProvider>
    </AuthProvider>
  );
}
