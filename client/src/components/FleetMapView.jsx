import React, { useEffect, useRef, useState, useMemo } from 'react';
import { MapPin, Navigation, Car, AlertTriangle, ShieldCheck, Activity, Sparkles, Layers, Eye, RefreshCw, Sun, Moon } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 12 Authentic Bengaluru Traffic Junctions with Real GPS Coordinates & Traffic Baselines
const BLR_JUNCTIONS_FALLBACK = [
  // South Bengaluru Zone
  {
    junctionId: 'JNC-BLR-001',
    deviceId: 'JNC-BLR-001',
    name: 'Silk Board Junction (Hosur Rd & ORR)',
    zoneId: 'south-bangalore',
    zoneName: 'South Bengaluru Zone',
    category: 'south-bangalore',
    region: 'Bengaluru South (BTM / HSR / Electronic City)',
    location: { latitude: 12.9172, longitude: 77.6228, label: 'Central Silk Board' },
    defaultQueue: 165,
    defaultSpeed: 7,
    defaultStatus: 'gridlock',
    vehicleMix: { twoWheeler: 48, car: 32, bus: 12, truck: 8 },
    baseApproaches: [
      { road: 'Hosur Rd (from south)', vehiclesPerMin: 44, queueLengthM: 165, avgSpeedKmph: 7, signal: 'red' },
      { road: 'ORR (from east)', vehiclesPerMin: 55, queueLengthM: 85, avgSpeedKmph: 18, signal: 'green' },
      { road: 'Hosur Rd (from north)', vehiclesPerMin: 34, queueLengthM: 110, avgSpeedKmph: 12, signal: 'red' },
      { road: 'BTM Rd (from west)', vehiclesPerMin: 26, queueLengthM: 60, avgSpeedKmph: 16, signal: 'red' },
    ],
  },
  {
    junctionId: 'JNC-BLR-002',
    deviceId: 'JNC-BLR-002',
    name: 'Sony World Signal (Koramangala 80ft & 100ft)',
    zoneId: 'south-bangalore',
    zoneName: 'South Bengaluru Zone',
    category: 'south-bangalore',
    region: 'Bengaluru South (Koramangala 4th Block)',
    location: { latitude: 12.9345, longitude: 77.6265, label: 'Sony World Signal' },
    defaultQueue: 65,
    defaultSpeed: 22,
    defaultStatus: 'healthy',
    vehicleMix: { twoWheeler: 55, car: 35, bus: 8, truck: 2 },
    baseApproaches: [
      { road: '80ft Rd (from north)', vehiclesPerMin: 28, queueLengthM: 65, avgSpeedKmph: 22, signal: 'green' },
      { road: '100ft Rd (from east)', vehiclesPerMin: 32, queueLengthM: 70, avgSpeedKmph: 19, signal: 'red' },
    ],
  },
  {
    junctionId: 'JNC-BLR-003',
    deviceId: 'JNC-BLR-003',
    name: 'Dairy Circle (Bannerghatta & Hosur Rd)',
    zoneId: 'south-bangalore',
    zoneName: 'South Bengaluru Zone',
    category: 'south-bangalore',
    region: 'Bengaluru South (Adugodi / Wilson Garden)',
    location: { latitude: 12.9372, longitude: 77.5985, label: 'Dairy Circle Flyover' },
    defaultQueue: 115,
    defaultSpeed: 12,
    defaultStatus: 'congested',
    vehicleMix: { twoWheeler: 50, car: 30, bus: 14, truck: 6 },
    baseApproaches: [
      { road: 'Bannerghatta Rd (from south)', vehiclesPerMin: 36, queueLengthM: 115, avgSpeedKmph: 12, signal: 'red' },
      { road: 'Hosur Rd (from east)', vehiclesPerMin: 30, queueLengthM: 80, avgSpeedKmph: 16, signal: 'green' },
    ],
  },
  {
    junctionId: 'JNC-BLR-004',
    deviceId: 'JNC-BLR-004',
    name: 'Jayadeva Underpass (Bannerghatta & ORR)',
    zoneId: 'south-bangalore',
    zoneName: 'South Bengaluru Zone',
    category: 'south-bangalore',
    region: 'Bengaluru South (Jayanagar / BTM)',
    location: { latitude: 12.9180, longitude: 77.5970, label: 'Jayadeva Multi-Tier Underpass' },
    defaultQueue: 120,
    defaultSpeed: 11,
    defaultStatus: 'congested',
    vehicleMix: { twoWheeler: 45, car: 35, bus: 15, truck: 5 },
    baseApproaches: [
      { road: 'Bannerghatta Rd (from south)', vehiclesPerMin: 38, queueLengthM: 120, avgSpeedKmph: 11, signal: 'red' },
      { road: 'ORR (from east)', vehiclesPerMin: 44, queueLengthM: 90, avgSpeedKmph: 16, signal: 'green' },
    ],
  },

  // East Bengaluru Zone
  {
    junctionId: 'JNC-BLR-005',
    deviceId: 'JNC-BLR-005',
    name: 'Bellandur EcoSpace (Outer Ring Road)',
    zoneId: 'east-bangalore',
    zoneName: 'East Bengaluru Zone',
    category: 'east-bangalore',
    region: 'Bengaluru East (ORR IT Corridor / Sarjapur)',
    location: { latitude: 12.9260, longitude: 77.6762, label: 'EcoSpace Tech Park Gate' },
    defaultQueue: 150,
    defaultSpeed: 9,
    defaultStatus: 'gridlock',
    vehicleMix: { twoWheeler: 40, car: 42, bus: 14, truck: 4 },
    baseApproaches: [
      { road: 'ORR (from south)', vehiclesPerMin: 50, queueLengthM: 150, avgSpeedKmph: 9, signal: 'red' },
      { road: 'ORR (from north)', vehiclesPerMin: 46, queueLengthM: 120, avgSpeedKmph: 12, signal: 'green' },
    ],
  },
  {
    junctionId: 'JNC-BLR-006',
    deviceId: 'JNC-BLR-006',
    name: 'Tin Factory / KR Puram Hanging Bridge',
    zoneId: 'east-bangalore',
    zoneName: 'East Bengaluru Zone',
    category: 'east-bangalore',
    region: 'Bengaluru East (Old Madras Rd / KR Puram)',
    location: { latitude: 12.9982, longitude: 77.6695, label: 'KR Puram Cable Stayed Bridge' },
    defaultQueue: 180,
    defaultSpeed: 6,
    defaultStatus: 'gridlock',
    vehicleMix: { twoWheeler: 52, car: 24, bus: 16, truck: 8 },
    baseApproaches: [
      { road: 'Old Madras Rd (from east)', vehiclesPerMin: 54, queueLengthM: 180, avgSpeedKmph: 6, signal: 'red' },
      { road: 'ORR (from north)', vehiclesPerMin: 42, queueLengthM: 110, avgSpeedKmph: 13, signal: 'green' },
    ],
  },
  {
    junctionId: 'JNC-BLR-007',
    deviceId: 'JNC-BLR-007',
    name: 'Marathahalli Bridge (ORR & Airport Rd)',
    zoneId: 'east-bangalore',
    zoneName: 'East Bengaluru Zone',
    category: 'east-bangalore',
    region: 'Bengaluru East (Marathahalli Multiplex)',
    location: { latitude: 12.9562, longitude: 77.7011, label: 'Marathahalli Flyover' },
    defaultQueue: 110,
    defaultSpeed: 14,
    defaultStatus: 'congested',
    vehicleMix: { twoWheeler: 46, car: 36, bus: 12, truck: 6 },
    baseApproaches: [
      { road: 'Varthur Rd (from east)', vehiclesPerMin: 36, queueLengthM: 95, avgSpeedKmph: 15, signal: 'green' },
      { road: 'ORR (from south)', vehiclesPerMin: 42, queueLengthM: 110, avgSpeedKmph: 14, signal: 'red' },
    ],
  },

  // North Bengaluru Zone
  {
    junctionId: 'JNC-BLR-008',
    deviceId: 'JNC-BLR-008',
    name: 'Hebbal Flyover Junction (Bellary Rd & ORR)',
    zoneId: 'north-bangalore',
    zoneName: 'North Bengaluru Zone',
    category: 'north-bangalore',
    region: 'Bengaluru North (Airport Corridor & Manyata)',
    location: { latitude: 13.0358, longitude: 77.5970, label: 'Hebbal Lake Rotary' },
    defaultQueue: 40,
    defaultSpeed: 32,
    defaultStatus: 'healthy',
    vehicleMix: { twoWheeler: 38, car: 45, bus: 12, truck: 5 },
    baseApproaches: [
      { road: 'Bellary Rd (from north)', vehiclesPerMin: 48, queueLengthM: 40, avgSpeedKmph: 32, signal: 'green' },
      { road: 'ORR (from east)', vehiclesPerMin: 42, queueLengthM: 75, avgSpeedKmph: 22, signal: 'red' },
    ],
  },
  {
    junctionId: 'JNC-BLR-009',
    deviceId: 'JNC-BLR-009',
    name: 'Goraguntepalya Junction (Tumkur & Ring Rd)',
    zoneId: 'north-bangalore',
    zoneName: 'North Bengaluru Zone',
    category: 'north-bangalore',
    region: 'Bengaluru North (Peenya / Yeshwanthpur)',
    location: { latitude: 13.0285, longitude: 77.5408, label: 'Goraguntepalya Metro' },
    defaultQueue: 155,
    defaultSpeed: 10,
    defaultStatus: 'gridlock',
    vehicleMix: { twoWheeler: 35, car: 30, bus: 15, truck: 20 },
    baseApproaches: [
      { road: 'Tumkur Rd NH48 (from north)', vehiclesPerMin: 48, queueLengthM: 155, avgSpeedKmph: 10, signal: 'red' },
      { road: 'Ring Rd (from east)', vehiclesPerMin: 34, queueLengthM: 90, avgSpeedKmph: 15, signal: 'green' },
    ],
  },
  {
    junctionId: 'JNC-BLR-010',
    deviceId: 'JNC-BLR-010',
    name: 'Mekhri Circle (Bellary Rd & CV Raman)',
    zoneId: 'north-bangalore',
    zoneName: 'North Bengaluru Zone',
    category: 'north-bangalore',
    region: 'Bengaluru North (Sadashivanagar / Palace)',
    location: { latitude: 13.0076, longitude: 77.5835, label: 'Mekhri Circle Underpass' },
    defaultQueue: 85,
    defaultSpeed: 20,
    defaultStatus: 'congested',
    vehicleMix: { twoWheeler: 40, car: 44, bus: 12, truck: 4 },
    baseApproaches: [
      { road: 'Bellary Rd (from north)', vehiclesPerMin: 40, queueLengthM: 75, avgSpeedKmph: 24, signal: 'green' },
      { road: 'Sadashivanagar (from south)', vehiclesPerMin: 36, queueLengthM: 85, avgSpeedKmph: 20, signal: 'red' },
    ],
  },

  // Central Bengaluru Zone
  {
    junctionId: 'JNC-BLR-011',
    deviceId: 'JNC-BLR-011',
    name: 'Richmond Circle Flyover (Hosur & Residency Rd)',
    zoneId: 'central-bangalore',
    zoneName: 'Central Bengaluru Zone',
    category: 'central-bangalore',
    region: 'Bengaluru Central (MG Road / Brigade)',
    location: { latitude: 12.9667, longitude: 77.6006, label: 'Richmond Circle Flyover' },
    defaultQueue: 80,
    defaultSpeed: 17,
    defaultStatus: 'congested',
    vehicleMix: { twoWheeler: 42, car: 45, bus: 11, truck: 2 },
    baseApproaches: [
      { road: 'Residency Rd (from north)', vehiclesPerMin: 36, queueLengthM: 80, avgSpeedKmph: 17, signal: 'green' },
      { road: 'Hosur Rd (from south)', vehiclesPerMin: 34, queueLengthM: 85, avgSpeedKmph: 16, signal: 'red' },
    ],
  },
  {
    junctionId: 'JNC-BLR-012',
    deviceId: 'JNC-BLR-012',
    name: 'Town Hall / Corporation Circle (KG & JC Rd)',
    zoneId: 'central-bangalore',
    zoneName: 'Central Bengaluru Zone',
    category: 'central-bangalore',
    region: 'Bengaluru Central (Majestic / KR Market)',
    location: { latitude: 12.9634, longitude: 77.5855, label: 'Town Hall Traffic Island' },
    defaultQueue: 105,
    defaultSpeed: 13,
    defaultStatus: 'congested',
    vehicleMix: { twoWheeler: 54, car: 26, bus: 16, truck: 4 },
    baseApproaches: [
      { road: 'KG Road (from north)', vehiclesPerMin: 38, queueLengthM: 95, avgSpeedKmph: 15, signal: 'green' },
      { road: 'JC Road (from south)', vehiclesPerMin: 40, queueLengthM: 105, avgSpeedKmph: 13, signal: 'red' },
    ],
  },
];

// Arterial Corridors connecting junctions with independent traffic flow health
const ARTERIAL_CORRIDORS = [
  {
    id: 'corr-orr-south',
    name: 'Outer Ring Road (ORR) IT Corridor',
    description: 'Silk Board ↔ Bellandur EcoSpace ↔ Marathahalli',
    junctionIds: ['JNC-BLR-001', 'JNC-BLR-005', 'JNC-BLR-007'],
    baseStatus: 'gridlock',
    baseQueue: 155,
    path: [
      [12.9172, 77.6228], // Silk Board
      [12.9260, 77.6762], // Bellandur EcoSpace
      [12.9562, 77.7011], // Marathahalli
    ],
  },
  {
    id: 'corr-orr-north',
    name: 'ORR North Arterial Corridor',
    description: 'Marathahalli ↔ Tin Factory ↔ Hebbal ↔ Goraguntepalya',
    junctionIds: ['JNC-BLR-007', 'JNC-BLR-006', 'JNC-BLR-008', 'JNC-BLR-009'],
    baseStatus: 'gridlock',
    baseQueue: 165,
    path: [
      [12.9562, 77.7011], // Marathahalli
      [12.9982, 77.6695], // Tin Factory
      [13.0358, 77.5970], // Hebbal
      [13.0285, 77.5408], // Goraguntepalya
    ],
  },
  {
    id: 'corr-hosur',
    name: 'Hosur Road Central Corridor',
    description: 'Silk Board ↔ Sony World ↔ Dairy Circle ↔ Richmond Circle',
    junctionIds: ['JNC-BLR-001', 'JNC-BLR-002', 'JNC-BLR-003', 'JNC-BLR-011'],
    baseStatus: 'congested',
    baseQueue: 110,
    path: [
      [12.9172, 77.6228], // Silk Board
      [12.9345, 77.6265], // Sony World
      [12.9372, 77.5985], // Dairy Circle
      [12.9667, 77.6006], // Richmond Circle
    ],
  },
  {
    id: 'corr-bellary',
    name: 'Bellary Road Airport Expressway',
    description: 'Hebbal Flyover ↔ Mekhri Circle ↔ Town Hall',
    junctionIds: ['JNC-BLR-008', 'JNC-BLR-010', 'JNC-BLR-012'],
    baseStatus: 'healthy',
    baseQueue: 40,
    path: [
      [13.0358, 77.5970], // Hebbal
      [13.0076, 77.5835], // Mekhri Circle
      [12.9634, 77.5855], // Town Hall
    ],
  },
  {
    id: 'corr-bannerghatta',
    name: 'Bannerghatta Road Corridor',
    description: 'Jayadeva Underpass ↔ Dairy Circle',
    junctionIds: ['JNC-BLR-004', 'JNC-BLR-003'],
    baseStatus: 'congested',
    baseQueue: 115,
    path: [
      [12.9180, 77.5970], // Jayadeva
      [12.9372, 77.5985], // Dairy Circle
    ],
  },
];

export function FleetMapView({ devices = [] }) {
  const { latestByDevice } = useSocket();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef(new Map());
  const circlesRef = useRef(new Map());
  const polylinesRef = useRef([]);
  const lastIconHtmlRef = useRef(new Map());

  const [basemapStyle, setBasemapStyle] = useState('voyager'); // 'voyager' (colored) or 'dark' (stealth)
  const [showCorridors, setShowCorridors] = useState(true);
  const [showHalos, setShowHalos] = useState(true);
  const [filterZone, setFilterZone] = useState('all');

  // Filter for authentic Bangalore junctions only, fallback to 12 junctions
  const activeJunctions = useMemo(() => {
    const blrOnly = devices.filter(
      (d) =>
        d.junctionId ||
        d.zoneId ||
        (d.deviceId && d.deviceId.startsWith('JNC')) ||
        (d.location && d.location.latitude > 12.8 && d.location.latitude < 13.2)
    );
    return blrOnly.length >= 6 ? blrOnly : BLR_JUNCTIONS_FALLBACK;
  }, [devices]);

  const [selectedJunctionId, setSelectedJunctionId] = useState('JNC-BLR-001');

  // Helper to extract live or default traffic data for a junction
  const getJunctionState = (junc) => {
    const live = latestByDevice[junc.deviceId];
    const loc = live?.location || junc.lastLocation || junc.location || { latitude: 12.9716, longitude: 77.5946 };
    const m = live?.metrics || live?.data || junc.lastMetrics || junc.lastData || {};
    const queue = m.maxQueueLengthM || junc.defaultQueue || 65;
    const speed = m.avgSpeedKmph || junc.defaultSpeed || 18;
    const status = live?.status || (queue > 140 ? 'gridlock' : queue > 80 ? 'congested' : junc.defaultStatus || 'healthy');
    const stalled = Boolean(live?.data?.stalledVehicleDetected || m.stalledVehicleDetected || junc.stalledVehicleDetected);
    const ambulance = Boolean(live?.data?.ambulanceDetected || m.ambulanceDetected || junc.ambulanceDetected);
    const approaches = live?.data?.approaches || junc.approaches || junc.baseApproaches || [];
    const vehicleMix = live?.data?.vehicleMix || junc.vehicleMix || { twoWheeler: 45, car: 35, bus: 14, truck: 6 };

    return { loc, queue, speed, status, stalled, ambulance, approaches, vehicleMix };
  };

  // Initialize Leaflet Map centered on Bengaluru
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [12.9716, 77.6200],
      zoom: 12,
      zoomControl: true,
      attributionControl: false,
    });

    const cartoKey = import.meta.env.VITE_CARTO_API_KEY || 'cb1_58v3_1_04116f2e1f7c9a0bff6bff6f';
    const subpath = basemapStyle === 'voyager' ? 'voyager' : 'dark_all';
    const tileUrl = `https://{s}.basemaps.cartocdn.com/rastertiles/${subpath}/{z}/{x}/{y}.png?key=${cartoKey}`;

    const tileLayer = L.tileLayer(tileUrl, {
      maxZoom: 18,
      subdomains: 'abcd',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);

    tileLayerRef.current = tileLayer;
    mapInstanceRef.current = map;

    // Force Leaflet recalculation after DOM renders
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Basemap Tiles when toggling between Voyager & Dark Matter
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    const cartoKey = import.meta.env.VITE_CARTO_API_KEY || 'cb1_58v3_1_04116f2e1f7c9a0bff6bff6f';
    const subpath = basemapStyle === 'voyager' ? 'voyager' : 'dark_all';
    const newUrl = `https://{s}.basemaps.cartocdn.com/rastertiles/${subpath}/{z}/{x}/{y}.png?key=${cartoKey}`;
    tileLayerRef.current.setUrl(newUrl);
  }, [basemapStyle]);

  // Draw Arterial Corridors (Polylines with Google Maps-style traffic colors)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing corridor layers
    polylinesRef.current.forEach((l) => map.removeLayer(l));
    polylinesRef.current = [];

    if (!showCorridors) return;

    for (const corr of ARTERIAL_CORRIDORS) {
      // Determine corridor status from its connected junctions
      let maxQueue = corr.baseQueue || 50;
      let hasGridlock = corr.baseStatus === 'gridlock';
      let hasAmbulance = false;

      for (const juncId of corr.junctionIds) {
        const junc = activeJunctions.find((j) => j.deviceId === juncId || j.junctionId === juncId);
        if (junc) {
          const state = getJunctionState(junc);
          if (state.queue > maxQueue) maxQueue = state.queue;
          if (state.queue > 140 || state.status === 'gridlock' || state.stalled) hasGridlock = true;
          if (state.ambulance) hasAmbulance = true;
        }
      }

      let corrColor = '#10B981'; // Flow Normal (Emerald Green)
      let glowColor = 'rgba(16, 185, 129, 0.45)';
      let statusText = 'Normal Flow (Clear)';

      if (hasAmbulance) {
        corrColor = '#3B82F6'; // Emergency Ambulance Corridor (Blue)
        glowColor = 'rgba(59, 130, 246, 0.7)';
        statusText = 'Emergency Ambulance Priority Active';
      } else if (hasGridlock || maxQueue > 140) {
        corrColor = '#EF4444'; // Gridlock (Red)
        glowColor = 'rgba(239, 68, 68, 0.6)';
        statusText = 'Gridlock / Critical Queuing';
      } else if (maxQueue > 80) {
        corrColor = '#F59E0B'; // Heavy Queue (Amber)
        glowColor = 'rgba(245, 158, 11, 0.5)';
        statusText = 'Heavy Congestion / Slow Crawl';
      }

      // Outer glow polyline for rich cyber contrast
      const glowLine = L.polyline(corr.path, {
        color: glowColor,
        weight: 12,
        opacity: 0.5,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      // Inner crisp arterial polyline (Google Maps traffic style)
      const crispLine = L.polyline(corr.path, {
        color: corrColor,
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: hasAmbulance ? '10, 8' : undefined,
      }).addTo(map);

      crispLine.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <b style="color: #FFFFFF;">${corr.name}</b><br/>
          <span style="color: #94A3B8;">${corr.description}</span><br/>
          <span style="color: ${corrColor}; font-weight: bold;">Status: ${statusText}</span>
        </div>`,
        {
          sticky: true,
          className: 'bg-slate-950 text-white font-mono text-xs border border-slate-800 p-2.5 rounded-xl shadow-xl',
        }
      );

      polylinesRef.current.push(glowLine, crispLine);
    }
  }, [showCorridors, activeJunctions, latestByDevice]);

  // Update or create Custom Traffic Markers & Pulsing Halos
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    for (const dev of activeJunctions) {
      const state = getJunctionState(dev);
      const loc = state.loc;
      if (!loc || !loc.latitude || !loc.longitude) continue;

      const queue = state.queue;
      const speed = state.speed;
      const shortName = dev.name.split(' ')[0];

      let markerColor = '#10B981'; // Green
      let glowColor = 'rgba(16, 185, 129, 0.85)';
      let haloColor = '#10B981';

      if (state.ambulance) {
        markerColor = '#3B82F6'; // Blue
        glowColor = 'rgba(59, 130, 246, 0.95)';
        haloColor = '#3B82F6';
      } else if (state.stalled || state.status === 'gridlock' || queue > 140) {
        markerColor = '#EF4444'; // Red
        glowColor = 'rgba(239, 68, 68, 0.95)';
        haloColor = '#EF4444';
      } else if (state.status === 'congested' || queue > 80) {
        markerColor = '#F59E0B'; // Amber
        glowColor = 'rgba(245, 158, 11, 0.85)';
        haloColor = '#F59E0B';
      }

      // 1. Draw or Update Congestion Halo (Pulsing circular impact radius)
      let halo = circlesRef.current.get(dev.deviceId);
      if (showHalos) {
        if (!halo) {
          halo = L.circle([loc.latitude, loc.longitude], {
            radius: 400,
            color: haloColor,
            fillColor: haloColor,
            fillOpacity: 0.22,
            weight: 2,
            dashArray: '4, 4',
          }).addTo(map);
          circlesRef.current.set(dev.deviceId, halo);
        } else {
          halo.setLatLng([loc.latitude, loc.longitude]);
          halo.setStyle({ color: haloColor, fillColor: haloColor });
        }
      } else if (halo) {
        map.removeLayer(halo);
        circlesRef.current.delete(dev.deviceId);
      }

      // 2. Custom Cyber Traffic Signal Node Marker with Live Meter Badge
      const isUrgent = state.stalled || state.ambulance || queue > 140;
      const iconHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
          <!-- Glowing Pulse Outer Ring -->
          <div style="width: 32px; height: 32px; border-radius: 50%; background: #070B14; border: 3px solid ${markerColor}; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 16px ${glowColor};">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: ${markerColor}; ${isUrgent ? 'animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;' : ''}"></div>
          </div>
          <!-- Road Label & Live Queue Meter -->
          <div style="margin-top: 4px; white-space: nowrap; font-size: 11px; font-weight: 800; background: #060911; color: #FFFFFF; padding: 2px 7px; border-radius: 6px; border: 1.5px solid ${markerColor}; font-family: monospace; box-shadow: 0 4px 10px rgba(0,0,0,0.85);">
            ${shortName} • <span style="color: ${markerColor};">${queue}m</span>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'traffic-custom-marker',
        iconSize: [90, 50],
        iconAnchor: [45, 16],
      });

      let marker = markersRef.current.get(dev.deviceId);
      const prevHtml = lastIconHtmlRef.current.get(dev.deviceId);

      if (!marker) {
        marker = L.marker([loc.latitude, loc.longitude], { icon: customIcon }).addTo(map);
        marker.on('click', () => setSelectedJunctionId(dev.deviceId));
        markersRef.current.set(dev.deviceId, marker);
        lastIconHtmlRef.current.set(dev.deviceId, iconHtml);
      } else {
        marker.setLatLng([loc.latitude, loc.longitude]);
        // Only update icon DOM when visual state actually changes to prevent cursor hover flickering
        if (prevHtml !== iconHtml) {
          marker.setIcon(customIcon);
          lastIconHtmlRef.current.set(dev.deviceId, iconHtml);
        }
      }
    }
  }, [latestByDevice, activeJunctions, showHalos]);

  // Center / FlyTo Junction
  const focusJunction = (dev) => {
    setSelectedJunctionId(dev.deviceId);
    const state = getJunctionState(dev);
    if (mapInstanceRef.current && state.loc) {
      mapInstanceRef.current.flyTo([state.loc.latitude, state.loc.longitude], 14, { duration: 1.0 });
    }
  };

  const fitAllBengaluru = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([12.9716, 77.6200], 12, { duration: 1.0 });
    }
  };

  const filteredJunctions = useMemo(() => {
    if (filterZone === 'all') return activeJunctions;
    return activeJunctions.filter((j) => (j.zoneId || j.category) === filterZone);
  }, [activeJunctions, filterZone]);

  const selectedDev = activeJunctions.find((d) => d.deviceId === selectedJunctionId) || activeJunctions[0];
  const selectedState = selectedDev ? getJunctionState(selectedDev) : null;

  return (
    <div className="space-y-4">
      {/* Top Banner & GIS Controls */}
      <div className="rounded-2xl border border-slate-800 bg-[#0B101D] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl">
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

        {/* View Controls & Toggles */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Basemap Toggle: Voyager (Colored Roads) vs Dark Matter */}
          <button
            onClick={() => setBasemapStyle((prev) => (prev === 'voyager' ? 'dark' : 'voyager'))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono font-bold transition-all bg-indigo-500/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30"
            title="Toggle between Voyager (Colored Roads) and Dark Matter"
          >
            {basemapStyle === 'voyager' ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5 text-indigo-300" />}
            Basemap: {basemapStyle === 'voyager' ? 'Voyager (Color)' : 'Dark Matter'}
          </button>

          <button
            onClick={() => setShowCorridors((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg border font-mono font-bold transition-all ${
              showCorridors
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            Corridors: {showCorridors ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => setShowHalos((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg border font-mono font-bold transition-all ${
              showHalos
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            Halos: {showHalos ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={fitAllBengaluru}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-mono transition-colors"
          >
            Fit All BLR
          </button>
        </div>
      </div>

      {/* Main Map Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left Sidebar: Junction List with Real-Time Traffic Status */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-[#0B101D] p-3 flex flex-col max-h-[660px] overflow-hidden shadow-xl">
          <div className="pb-2 mb-2 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200">Bengaluru Nodes</span>
            <span className="text-[10px] text-slate-400 font-mono">{filteredJunctions.length} sites</span>
          </div>

          {/* Zone Filter Tabs */}
          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[10px] mb-2 font-semibold">
            {['all', 'south-bangalore', 'east-bangalore', 'north-bangalore'].map((z) => (
              <button
                key={z}
                onClick={() => setFilterZone(z)}
                className={`flex-1 py-1 rounded text-center transition-colors ${
                  filterZone === z
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {z === 'all' ? 'All' : z.replace('-bangalore', '')}
              </button>
            ))}
          </div>

          {/* Junction List */}
          <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
            {filteredJunctions.map((d) => {
              const state = getJunctionState(d);
              const q = state.queue;
              const spd = state.speed;
              const isSelected = d.deviceId === selectedJunctionId;

              let dotColor = 'bg-emerald-400';
              if (state.ambulance) dotColor = 'bg-blue-400 animate-ping';
              else if (state.stalled || q > 140) dotColor = 'bg-rose-500 animate-pulse';
              else if (q > 80) dotColor = 'bg-amber-400';

              return (
                <div
                  key={d.deviceId}
                  onClick={() => focusJunction(d)}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'bg-emerald-950/40 border-emerald-500/60 shadow-md shadow-emerald-500/15'
                      : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-100 truncate">
                      {d.name.split('(')[0]}
                    </span>
                    <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] font-mono text-slate-400">
                    <span className="text-cyan-400">
                      {d.zoneName ? d.zoneName.replace(' Bengaluru Zone', '') : d.zoneId}
                    </span>
                    <span className={`font-semibold ${q > 140 ? 'text-rose-400 font-bold' : q > 80 ? 'text-amber-400 font-bold' : 'text-emerald-400'}`}>
                      {q}m • {spd}km/h
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center / Right: The Leaflet Map & Selected Detail */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-slate-800 overflow-hidden relative shadow-2xl h-[490px] bg-[#070A10]">
            <div ref={mapContainerRef} className="w-full h-full z-0" />

            {/* Google-Maps-Style Traffic Congestion Legend */}
            <div className="absolute bottom-3 left-3 z-10 bg-slate-950/90 backdrop-blur-md p-2.5 rounded-xl border border-slate-800 text-[11px] font-mono flex flex-wrap items-center gap-3 shadow-2xl">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-400" />
                <span className="text-slate-200">Flow Normal (&lt;80m)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="text-slate-200">Heavy Queue (80-140m)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-slate-200 font-bold">Gridlock (&gt;140m)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-400 animate-ping" />
                <span className="text-blue-300 font-bold">Ambulance Corridor</span>
              </div>
            </div>
          </div>

          {/* Selected Junction Live Telemetry HUD */}
          {selectedDev && selectedState && (
            <div className="rounded-2xl border border-slate-800 bg-[#0B101D] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
                    {selectedDev.zoneName || selectedDev.zoneId}
                  </span>
                  {selectedState.ambulance && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/40 animate-pulse">
                      AMBULANCE PREEMPTION
                    </span>
                  )}
                  {selectedState.stalled && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                      STALLED VEHICLE
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-white mt-0.5">{selectedDev.name}</h3>
                <span className="text-xs text-slate-400 font-mono">
                  GPS: [{selectedState.loc.latitude?.toFixed(4)}, {selectedState.loc.longitude?.toFixed(4)}] • ID: {selectedDev.deviceId}
                </span>
              </div>

              {/* Approaches Live Pill Bar */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedState.approaches.slice(0, 4).map((app, idx) => (
                  <div
                    key={idx}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono flex items-center gap-2"
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        app.signal === 'green' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                      }`}
                    />
                    <span className="text-slate-300 truncate max-w-[120px]">
                      {app.road.split('(')[0]}
                    </span>
                    <span className={`font-bold ${app.queueLengthM > 120 ? 'text-rose-400' : app.queueLengthM > 80 ? 'text-amber-400' : 'text-slate-300'}`}>
                      {app.queueLengthM}m
                    </span>
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
