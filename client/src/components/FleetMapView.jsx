import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, Car, AlertTriangle, ShieldCheck, Activity, Sparkles } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import L from 'leaflet';

export function FleetMapView({ devices = [] }) {
  const { latestByDevice } = useSocket();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef(new Map());

  const [selectedJunctionId, setSelectedJunctionId] = useState(devices[0]?.deviceId || 'JNC-BLR-001');

  // Initialize Leaflet Map centered on Bengaluru
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Center on Bengaluru: 12.9716° N, 77.5946° E
    const map = L.map(mapContainerRef.current, {
      center: [12.9650, 77.6200],
      zoom: 12,
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

    for (const dev of devices) {
      const liveEvt = latestByDevice[dev.deviceId];
      const loc = liveEvt?.location || dev.lastLocation || dev.location;
      const metrics = liveEvt?.metrics || liveEvt?.data || dev.lastMetrics || dev.lastData || {};
      const status = liveEvt?.status || dev.status || 'healthy';
      const stalled = Boolean(liveEvt?.data?.stalledVehicleDetected || metrics.stalledVehicleDetected || dev.stalledVehicleDetected);
      const ambulance = Boolean(liveEvt?.data?.ambulanceDetected || metrics.ambulanceDetected || dev.ambulanceDetected);

      if (!loc || !loc.latitude || !loc.longitude) continue;

      let markerColor = '#10B981'; // green
      let glowColor = 'rgba(16, 185, 129, 0.4)';
      let statusText = 'FLOW';

      if (ambulance) {
        markerColor = '#3B82F6';
        glowColor = 'rgba(59, 130, 246, 0.7)';
        statusText = 'AMBULANCE';
      } else if (stalled || status === 'gridlock' || status === 'critical') {
        markerColor = '#EF4444';
        glowColor = 'rgba(239, 68, 68, 0.6)';
        statusText = 'GRIDLOCK';
      } else if (status === 'congested' || status === 'warning') {
        markerColor = '#F59E0B';
        glowColor = 'rgba(245, 158, 11, 0.5)';
        statusText = 'QUEUE';
      }

      const queue = metrics.maxQueueLengthM || 45;
      const speed = metrics.avgSpeedKmph || 18;
      const shortName = dev.name.split(' ')[0];

      // Custom cyber junction marker HTML
      const iconHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
          <div style="width: 26px; height: 26px; border-radius: 50%; background: #0B0F19; border: 2.5px solid ${markerColor}; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 12px ${glowColor};">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${markerColor}; ${stalled || ambulance ? 'animation: pulse 1s infinite;' : ''}"></div>
          </div>
          <div style="margin-top: 3px; white-space: nowrap; font-size: 10px; font-weight: 700; background: rgba(11, 15, 25, 0.92); color: #F1F5F9; padding: 2px 6px; border-radius: 5px; border: 1px solid rgba(51, 65, 85, 0.8); font-family: monospace; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">
            ${shortName} • ${queue}m
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'traffic-custom-marker',
        iconSize: [80, 42],
        iconAnchor: [40, 13],
      });

      let marker = markersRef.current.get(dev.deviceId);
      if (!marker) {
        marker = L.marker([loc.latitude, loc.longitude], { icon: customIcon }).addTo(map);
        marker.on('click', () => setSelectedJunctionId(dev.deviceId));
        markersRef.current.set(dev.deviceId, marker);
      } else {
        marker.setIcon(customIcon);
      }
    }
  }, [latestByDevice, devices]);

  // Focus junction
  const focusJunction = (dev) => {
    setSelectedJunctionId(dev.deviceId);
    const liveEvt = latestByDevice[dev.deviceId];
    const loc = liveEvt?.location || dev.lastLocation || dev.location;
    if (mapInstanceRef.current && loc) {
      mapInstanceRef.current.flyTo([loc.latitude, loc.longitude], 14, { duration: 1.2 });
    }
  };

  const selectedDev = devices.find((d) => d.deviceId === selectedJunctionId) || devices[0];
  const selectedLive = selectedDev ? latestByDevice[selectedDev.deviceId] : null;
  const m = selectedLive?.metrics || selectedLive?.data || selectedDev?.lastMetrics || selectedDev?.lastData || {};
  const approaches = selectedLive?.data?.approaches || selectedDev?.approaches || [];
  const stalled = Boolean(selectedLive?.data?.stalledVehicleDetected || m.stalledVehicleDetected || selectedDev?.stalledVehicleDetected);
  const ambulance = Boolean(selectedLive?.data?.ambulanceDetected || m.ambulanceDetected || selectedDev?.ambulanceDetected);

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="rounded-2xl border border-slate-800 bg-[#0B101D] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              Bengaluru Traffic Command & Control GIS
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold text-white">
              Live Arterial Corridors & Signal Junctions Map
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>12 Monitored Bengaluru Junctions Active</span>
        </div>
      </div>

      {/* Map Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left Sidebar: Junction List */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-[#0B101D] p-3 flex flex-col max-h-[620px] overflow-hidden">
          <div className="pb-2 mb-2 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200">Corridor Nodes</span>
            <span className="text-[10px] text-slate-400 font-mono">{devices.length} sites</span>
          </div>

          <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
            {devices.map((d) => {
              const live = latestByDevice[d.deviceId];
              const q = live?.metrics?.maxQueueLengthM || 45;
              const spd = live?.metrics?.avgSpeedKmph || 18;
              const isSelected = d.deviceId === selectedJunctionId;
              const isStalled = Boolean(live?.data?.stalledVehicleDetected || d.stalledVehicleDetected);
              const isAmb = Boolean(live?.data?.ambulanceDetected || d.ambulanceDetected);

              return (
                <div
                  key={d.deviceId}
                  onClick={() => focusJunction(d)}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'bg-emerald-950/30 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-100 truncate">
                      {d.name.split('(')[0]}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isAmb
                          ? 'bg-blue-400 animate-ping'
                          : isStalled
                          ? 'bg-rose-500 animate-pulse'
                          : q > 130
                          ? 'bg-rose-500'
                          : q > 80
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                      }`}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] font-mono text-slate-400">
                    <span>{d.zoneName ? d.zoneName.replace(' Bengaluru Zone', '') : d.zoneId}</span>
                    <span className="text-slate-200 font-semibold">{q}m • {spd}km/h</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center / Right: The Leaflet Map & Selected Detail */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-slate-800 overflow-hidden relative shadow-2xl h-[460px] bg-[#070A10]">
            <div ref={mapContainerRef} className="w-full h-full z-0" />

            {/* Map Legend */}
            <div className="absolute bottom-3 left-3 z-10 bg-slate-950/90 backdrop-blur-md p-2.5 rounded-xl border border-slate-800 text-[11px] font-mono flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="text-slate-300">Flow Normal (&lt;80m)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="text-slate-300">Heavy Queue (80-140m)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-slate-300">Gridlock (&gt;140m)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping" />
                <span className="text-blue-300">Ambulance Priority</span>
              </div>
            </div>
          </div>

          {/* Selected Junction Live Telemetry Drawer */}
          {selectedDev && (
            <div className="rounded-2xl border border-slate-800 bg-[#0B101D] p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-slate-100">{selectedDev.name}</h3>
                  <span className="text-xs font-mono text-slate-400">[{selectedDev.deviceId}]</span>
                  {ambulance && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 animate-pulse">
                      AMBULANCE PREEMPTION
                    </span>
                  )}
                  {stalled && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                      STALLED VEHICLE DETECTED
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Location: {selectedDev.location?.label || selectedDev.region} • GPS: ({selectedDev.location?.latitude?.toFixed(4)}, {selectedDev.location?.longitude?.toFixed(4)})
                </p>
              </div>

              {/* Approaches Quick Pill */}
              <div className="flex flex-wrap items-center gap-2">
                {approaches.slice(0, 4).map((app, idx) => (
                  <div key={idx} className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${app.signal === 'green' ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                    <span className="text-slate-300 truncate max-w-[110px]">{app.road.split('(')[0]}</span>
                    <span className="text-slate-400 font-bold">{app.queueLengthM}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
