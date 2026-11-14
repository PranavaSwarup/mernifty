/**
 * Canonical Bengaluru Arterial Road Waypoints.
 * Snaps corridor polyline links to actual physical highway curves
 * (Outer Ring Road, Hosur Road, Bannerghatta Road, Bellary Road, Central Arterials).
 */

export const BENGALURU_ROAD_WAYPOINTS = {
  // 1. ORR East: Silk Board <-> Bellandur EcoSpace (traces Agara Lake & Iblur Flyover curve)
  'JNC-BLR-001::JNC-BLR-005': [
    [12.9172, 77.6228], // Silk Board Junction
    [12.9174, 77.6360], // HSR Layout 14th Main
    [12.9234, 77.6520], // Agara Lake Junction
    [12.9250, 77.6690], // Iblur Junction (Sarjapur-ORR)
    [12.9260, 77.6762], // Bellandur EcoSpace
  ],

  // 2. ORR East: Bellandur EcoSpace <-> Marathahalli Bridge
  'JNC-BLR-005::JNC-BLR-007': [
    [12.9260, 77.6762], // Bellandur EcoSpace
    [12.9350, 77.6890], // Devarabisanahalli Flyover
    [12.9440, 77.6975], // Kadubeesanahalli / JP Morgan
    [12.9562, 77.7011], // Marathahalli Bridge
  ],

  // 3. ORR East: Marathahalli Bridge <-> Tin Factory / KR Puram
  'JNC-BLR-006::JNC-BLR-007': [
    [12.9562, 77.7011], // Marathahalli Bridge
    [12.9690, 77.6980], // Doddanekundi Junction
    [12.9830, 77.6930], // Bagmane Tech Park
    [12.9915, 77.6830], // Mahadevapura Flyover
    [12.9982, 77.6695], // Tin Factory / KR Puram
  ],

  // 4. ORR North: Tin Factory <-> Hebbal Flyover
  'JNC-BLR-006::JNC-BLR-008': [
    [12.9982, 77.6695], // Tin Factory
    [13.0080, 77.6600], // Ramamurthy Nagar Underpass
    [13.0180, 77.6490], // Kasturi Nagar
    [13.0240, 77.6360], // Kalyan Nagar / Babusapalya
    [13.0330, 77.6220], // Hennur Cross
    [13.0420, 77.6110], // Nagavara / Manyata Tech Park
    [13.0358, 77.5970], // Hebbal Flyover
  ],

  // 5. ORR West: Hebbal Flyover <-> Goraguntepalya / Yeshwantpur
  'JNC-BLR-008::JNC-BLR-009': [
    [13.0358, 77.5970], // Hebbal Flyover
    [13.0410, 77.5800], // Bhadrappa Layout
    [13.0415, 77.5650], // Kuvempu Circle
    [13.0360, 77.5510], // BEL Circle
    [13.0285, 77.5408], // Goraguntepalya
  ],

  // 6. ORR South: Jayadeva Underpass <-> Silk Board Junction
  'JNC-BLR-001::JNC-BLR-004': [
    [12.9180, 77.5970], // Jayadeva Underpass
    [12.9168, 77.6100], // BTM 29th Main Water Tank
    [12.9172, 77.6228], // Silk Board Junction
  ],

  // 7. Bannerghatta Road: Jayadeva Underpass <-> Dairy Circle
  'JNC-BLR-003::JNC-BLR-004': [
    [12.9180, 77.5970], // Jayadeva Underpass
    [12.9250, 77.5980], // Shoppers Stop / BTM
    [12.9320, 77.5982], // Sagar Apollo Hospital
    [12.9372, 77.5985], // Dairy Circle
  ],

  // 8. Hosur Road: Silk Board <-> Dairy Circle (via Madiwala)
  'JNC-BLR-001::JNC-BLR-003': [
    [12.9172, 77.6228], // Silk Board
    [12.9220, 77.6190], // Madiwala Police Station
    [12.9280, 77.6120], // St. John's Hospital
    [12.9340, 77.6040], // Forum Mall
    [12.9372, 77.5985], // Dairy Circle
  ],

  // 9. Koramangala 80ft Road: Silk Board <-> Sony World Signal
  'JNC-BLR-001::JNC-BLR-002': [
    [12.9172, 77.6228], // Silk Board
    [12.9240, 77.6250], // Madiwala checkpost
    [12.9280, 77.6260], // Koramangala Water Tank
    [12.9345, 77.6265], // Sony World Signal
  ],

  // 10. Koramangala 100ft Road: Dairy Circle <-> Sony World Signal
  'JNC-BLR-002::JNC-BLR-003': [
    [12.9372, 77.5985], // Dairy Circle
    [12.9360, 77.6080], // Adugodi Jn
    [12.9350, 77.6180], // Koramangala 5th Block
    [12.9345, 77.6265], // Sony World Signal
  ],

  // 11. Hosur Road Central: Dairy Circle <-> Richmond Circle
  'JNC-BLR-003::JNC-BLR-011': [
    [12.9372, 77.5985], // Dairy Circle
    [12.9460, 77.5990], // Wilson Garden
    [12.9530, 77.5995], // Lalbagh Main Gate
    [12.9610, 77.6002], // Subbaiah Circle
    [12.9667, 77.6006], // Richmond Circle
  ],

  // 12. Central Arterial: Richmond Circle <-> Town Hall
  'JNC-BLR-011::JNC-BLR-012': [
    [12.9667, 77.6006], // Richmond Circle
    [12.9675, 77.5950], // Hudson Circle / Corporation
    [12.9634, 77.5855], // Town Hall
  ],

  // 13. Palace / Bellary Road: Town Hall <-> Mekhri Circle
  'JNC-BLR-010::JNC-BLR-012': [
    [12.9634, 77.5855], // Town Hall
    [12.9770, 77.5880], // Vidhana Soudha
    [12.9880, 77.5875], // Palace Guttahalli
    [12.9990, 77.5850], // Cauvery Theatre Jn
    [13.0076, 77.5835], // Mekhri Circle
  ],

  // 14. Bellary Road Airport Expressway: Mekhri Circle <-> Hebbal Flyover
  'JNC-BLR-008::JNC-BLR-010': [
    [13.0076, 77.5835], // Mekhri Circle
    [13.0180, 77.5890], // Ganganagar
    [13.0280, 77.5940], // Veterinary College
    [13.0358, 77.5970], // Hebbal Flyover
  ],

  // 15. Bellary Connector: Richmond Circle <-> Mekhri Circle (via Cubbon Park & Raj Bhavan)
  'JNC-BLR-010::JNC-BLR-011': [
    [12.9667, 77.6006], // Richmond Circle
    [12.9740, 77.5940], // Cubbon Park / Kasturba Rd
    [12.9825, 77.5900], // GPO / Raj Bhavan
    [12.9950, 77.5870], // Palace Road / High Grounds
    [13.0076, 77.5835], // Mekhri Circle
  ],
};

/**
 * Returns the exact road-following GPS coordinates between two junctions.
 */
export function getCorridorRoadWaypoints(jIdA, jIdB, posA, posB) {
  const key = [jIdA, jIdB].sort().join('::');
  const waypoints = BENGALURU_ROAD_WAYPOINTS[key];
  if (!waypoints || waypoints.length < 2) {
    return [posA, posB];
  }
  const firstId = [jIdA, jIdB].sort()[0];
  if (jIdA === firstId) {
    return waypoints;
  }
  return [...waypoints].reverse();
}
