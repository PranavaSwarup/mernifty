// Bengaluru Smart City Road Network Graph
// Defines the 12 junctions, bi-directional road links, and shortest path routing.

export const JUNCTION_COORDINATES = {
  'JNC-BLR-001': { latitude: 12.9172, longitude: 77.6228, name: 'Silk Board Junction', zoneId: 'south-bangalore' },
  'JNC-BLR-002': { latitude: 12.9345, longitude: 77.6265, name: 'Sony World Signal', zoneId: 'south-bangalore' },
  'JNC-BLR-003': { latitude: 12.9372, longitude: 77.5985, name: 'Dairy Circle', zoneId: 'south-bangalore' },
  'JNC-BLR-004': { latitude: 12.9180, longitude: 77.5970, name: 'Jayadeva Underpass', zoneId: 'south-bangalore' },
  'JNC-BLR-005': { latitude: 12.9260, longitude: 77.6762, name: 'Bellandur EcoSpace Junction', zoneId: 'east-bangalore' },
  'JNC-BLR-006': { latitude: 12.9982, longitude: 77.6695, name: 'Tin Factory / KR Puram', zoneId: 'east-bangalore' },
  'JNC-BLR-007': { latitude: 12.9562, longitude: 77.7011, name: 'Marathahalli Bridge Junction', zoneId: 'east-bangalore' },
  'JNC-BLR-008': { latitude: 13.0358, longitude: 77.5970, name: 'Hebbal Flyover Junction', zoneId: 'north-bangalore' },
  'JNC-BLR-009': { latitude: 13.0285, longitude: 77.5408, name: 'Goraguntepalya Junction', zoneId: 'north-bangalore' },
  'JNC-BLR-010': { latitude: 13.0076, longitude: 77.5835, name: 'Mekhri Circle Underpass', zoneId: 'north-bangalore' },
  'JNC-BLR-011': { latitude: 12.9667, longitude: 77.6006, name: 'Richmond Circle Flyover', zoneId: 'central-bangalore' },
  'JNC-BLR-012': { latitude: 12.9634, longitude: 77.5855, name: 'Town Hall / Corporation Circle', zoneId: 'central-bangalore' },
};

// Raw links stored in one direction
const RAW_LINKS = [
  ['JNC-BLR-001', 'JNC-BLR-002'], // Silk Board <-> Sony World
  ['JNC-BLR-001', 'JNC-BLR-003'], // Silk Board <-> Dairy Circle
  ['JNC-BLR-001', 'JNC-BLR-004'], // Silk Board <-> Jayadeva
  ['JNC-BLR-001', 'JNC-BLR-005'], // Silk Board <-> Bellandur EcoSpace
  ['JNC-BLR-002', 'JNC-BLR-003'], // Sony World <-> Dairy Circle
  ['JNC-BLR-003', 'JNC-BLR-004'], // Dairy Circle <-> Jayadeva
  ['JNC-BLR-003', 'JNC-BLR-011'], // Dairy Circle <-> Richmond Circle
  ['JNC-BLR-005', 'JNC-BLR-007'], // Bellandur EcoSpace <-> Marathahalli Bridge
  ['JNC-BLR-006', 'JNC-BLR-007'], // Tin Factory <-> Marathahalli Bridge
  ['JNC-BLR-006', 'JNC-BLR-008'], // Tin Factory <-> Hebbal Flyover
  ['JNC-BLR-008', 'JNC-BLR-009'], // Hebbal Flyover <-> Goraguntepalya
  ['JNC-BLR-008', 'JNC-BLR-010'], // Hebbal Flyover <-> Mekhri Circle
  ['JNC-BLR-009', 'JNC-BLR-010'], // Goraguntepalya <-> Mekhri Circle
  ['JNC-BLR-010', 'JNC-BLR-012'], // Mekhri Circle <-> Town Hall
  ['JNC-BLR-011', 'JNC-BLR-012'], // Richmond Circle <-> Town Hall
];

// Calculate Haversine distance in kilometers between two GPS coordinates
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Build symmetric adjacency list
function buildSymmetricGraph() {
  const adj = {};
  for (const id of Object.keys(JUNCTION_COORDINATES)) {
    adj[id] = [];
  }

  for (const [u, v] of RAW_LINKS) {
    if (!adj[u]) adj[u] = [];
    if (!adj[v]) adj[v] = [];
    if (!adj[u].includes(v)) adj[u].push(v);
    if (!adj[v].includes(u)) adj[v].push(u);
  }

  return adj;
}

export const JUNCTION_GRAPH = buildSymmetricGraph();

// Find shortest route between two junctions using Dijkstra with distance edge weights
export function getShortestRoute(startId, endId) {
  if (startId === endId) return [startId];
  if (!JUNCTION_GRAPH[startId] || !JUNCTION_GRAPH[endId]) return null;

  const distances = {};
  const previous = {};
  const unvisited = new Set(Object.keys(JUNCTION_GRAPH));

  for (const node of unvisited) {
    distances[node] = Infinity;
  }
  distances[startId] = 0;

  while (unvisited.size > 0) {
    // Pick unvisited node with smallest distance
    let current = null;
    let smallestDist = Infinity;
    for (const node of unvisited) {
      if (distances[node] < smallestDist) {
        smallestDist = distances[node];
        current = node;
      }
    }

    if (!current || smallestDist === Infinity) break;
    if (current === endId) break;

    unvisited.delete(current);

    const currCoords = JUNCTION_COORDINATES[current];
    const neighbors = JUNCTION_GRAPH[current] || [];

    for (const neighbor of neighbors) {
      if (!unvisited.has(neighbor)) continue;
      const nbrCoords = JUNCTION_COORDINATES[neighbor];
      const dist = haversineDistanceKm(
        currCoords.latitude,
        currCoords.longitude,
        nbrCoords.latitude,
        nbrCoords.longitude
      );
      const alt = distances[current] + dist;
      if (alt < distances[neighbor]) {
        distances[neighbor] = alt;
        previous[neighbor] = current;
      }
    }
  }

  if (distances[endId] === Infinity) return null;

  // Reconstruct path
  const path = [];
  let curr = endId;
  while (curr) {
    path.unshift(curr);
    curr = previous[curr];
  }

  return path;
}

// Format graph for client /api/junctions/graph
export function getGraphPayload() {
  const nodes = Object.entries(JUNCTION_COORDINATES).map(([id, info]) => ({
    junctionId: id,
    name: info.name,
    zoneId: info.zoneId,
    location: { latitude: info.latitude, longitude: info.longitude },
    neighbors: JUNCTION_GRAPH[id] || [],
  }));

  const links = RAW_LINKS.map(([from, to]) => ({
    from,
    to,
    fromCoords: [JUNCTION_COORDINATES[from].latitude, JUNCTION_COORDINATES[from].longitude],
    toCoords: [JUNCTION_COORDINATES[to].latitude, JUNCTION_COORDINATES[to].longitude],
    distanceKm: parseFloat(
      haversineDistanceKm(
        JUNCTION_COORDINATES[from].latitude,
        JUNCTION_COORDINATES[from].longitude,
        JUNCTION_COORDINATES[to].latitude,
        JUNCTION_COORDINATES[to].longitude
      ).toFixed(2)
    ),
  }));

  return { nodes, links, count: nodes.length };
}
