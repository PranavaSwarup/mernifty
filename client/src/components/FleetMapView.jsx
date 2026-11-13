import React, { useEffect, useRef, useState } from 'react';
import { Truck, BatteryCharging, Gauge, Thermometer, Navigation, MapPin } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import L from 'leaflet';

export function FleetMapView({ devices = [] }) {
  const { latestByDevice } = useSocket();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef(new Map());

  // Filter fleet devices
  const fleetDevices = devices.filter((d) => d.category === 'fleet');
  const [selectedVehicleId, setSelectedVehicleId] = useState(fleetDevices[0]?.deviceId || 'fleet-ev-01');

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Center on US continent
    const map = L.map(mapContainerRef.current, {
      center: [38.5, -98.0],
      zoom: 4,
      zoomControl: true,
      attributionControl: false,
    });

    // Dark cyber map tile layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
      subdomains: 'abcd',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update or create markers when latestByDevice updates
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    for (const dev of fleetDevices) {
      const liveEvt = latestByDevice[dev.deviceId];
      const loc = liveEvt?.location || dev.lastLocation || dev.location;
      const metrics = liveEvt?.metrics || dev.lastMetrics || dev.baseMetrics || {};

      if (!loc || !loc.latitude || !loc.longitude) continue;

      let marker = markersRef.current.get(dev.deviceId);

      // Custom cyber vehicle marker HTML icon
      const iconHtml = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <div style="width: 28px; height: 28px; border-radius: 50%; background: #0F172A; border: 2px solid #10B981; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="3" width="15" height="13"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
          </div>
          <div style="position: absolute; -top: 18px; white-space: nowrap; font-size: 10px; font-weight: bold; background: #0B0F19; color: #E2E8F0; padding: 1px 5px; border-radius: 4px; border: 1px solid #334155;">
            ${dev.name.split(' ')[0]} • ${metrics.speedKmh ? Math.round(metrics.speedKmh) : 0} km/h
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'fleet-custom-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      if (!marker) {
        marker = L.marker([loc.latitude, loc.longitude], { icon: customIcon }).addTo(map);
        marker.on('click', () => setSelectedVehicleId(dev.deviceId));
        markersRef.current.set(dev.deviceId, marker);
      } else {
        marker.setLatLng([loc.latitude, loc.longitude]);
        marker.setIcon(customIcon);
      }
    }
  }, [latestByDevice, fleetDevices]);

  // Center on selected vehicle
  const focusVehicle = (dev) => {
    setSelectedVehicleId(dev.deviceId);
    const liveEvt = latestByDevice[dev.deviceId];
    const loc = liveEvt?.location || dev.lastLocation || dev.location;
    if (mapInstanceRef.current && loc) {
      mapInstanceRef.current.flyTo([loc.latitude, loc.longitude], 8, { duration: 1.5 });
    }
  };

  const selectedDev = fleetDevices.find((d) => d.deviceId === selectedVehicleId) || fleetDevices[0];
  const selectedLive = selectedDev ? latestByDevice[selectedDev.deviceId] : null;
  const currentMetrics = selectedLive?.metrics || selectedDev?.lastMetrics || selectedDev?.baseMetrics || {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Map Container */}
      <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-[#0B101D] overflow-hidden flex flex-col">
        {/* Map Header */}
        <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">Live Logistics & Fleet Geo-Tracker</h3>
              <p className="text-[11px] text-slate-400">Real-time GPS coordinate streaming and route monitoring</p>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            {fleetDevices.length} Active Autonomous Trucks
          </span>
        </div>

        {/* Leaflet Canvas */}
        <div ref={mapContainerRef} className="h-96 lg:h-[480px] w-full z-10" />
      </div>

      {/* Fleet Sidebar & Selected Telemetry Card */}
      <div className="flex flex-col gap-4">
        {/* Selected Vehicle Card */}
        {selectedDev && (
          <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  Focused Transponder
                </span>
                <h4 className="font-bold text-slate-100 text-base">{selectedDev.name}</h4>
                <p className="text-xs text-slate-400">{selectedDev.region}</p>
              </div>
              <span className="px-2 py-0.5 text-xs font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {selectedLive?.status || 'Active'}
              </span>
            </div>

            {/* Live Metrics Grid */}
            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                  <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Ground Speed</span>
                </div>
                <div className="mt-1 font-mono font-bold text-lg text-white">
                  {currentMetrics.speedKmh ? Math.round(currentMetrics.speedKmh) : 0}{' '}
                  <span className="text-xs text-slate-500 font-normal">km/h</span>
                </div>
              </div>

              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                  <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Battery SoC</span>
                </div>
                <div className="mt-1 font-mono font-bold text-lg text-emerald-400">
                  {currentMetrics.batteryLevel ? currentMetrics.batteryLevel : 0}%
                </div>
              </div>

              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                  <Thermometer className="w-3.5 h-3.5 text-rose-400" />
                  <span>Motor Temp</span>
                </div>
                <div className="mt-1 font-mono font-bold text-lg text-white">
                  {currentMetrics.motorTempC ? Math.round(currentMetrics.motorTempC) : 0}°C
                </div>
              </div>

              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                  <Navigation className="w-3.5 h-3.5 text-amber-400" />
                  <span>Heading</span>
                </div>
                <div className="mt-1 font-mono font-bold text-lg text-white">
                  {currentMetrics.headingDeg || 180}°
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fleet Roster List */}
        <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-3 flex-1 flex flex-col">
          <span className="text-xs font-bold text-slate-300 mb-2 px-1">Fleet Telemetry Matrix</span>
          <div className="space-y-2 overflow-y-auto max-h-72">
            {fleetDevices.map((dev) => {
              const live = latestByDevice[dev.deviceId];
              const m = live?.metrics || dev.lastMetrics || dev.baseMetrics || {};
              const isSelected = dev.deviceId === selectedVehicleId;
              return (
                <div
                  key={dev.deviceId}
                  onClick={() => focusVehicle(dev)}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-cyan-500/10 border-cyan-500/50 shadow-sm'
                      : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">{dev.name}</span>
                    <span className="text-[11px] font-mono font-semibold text-cyan-400">
                      {m.speedKmh ? Math.round(m.speedKmh) : 0} km/h
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                    <span>{dev.region}</span>
                    <span className="text-emerald-400 font-mono">Batt: {m.batteryLevel || 0}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
