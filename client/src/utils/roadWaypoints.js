/**
 * Canonical Bengaluru Arterial Road Waypoints.
 * Snaps corridor polyline links to actual physical highway curves
 * (Outer Ring Road, Hosur Road, Bannerghatta Road, Bellary Road, Central Arterials).
 */

export const BENGALURU_ROAD_WAYPOINTS = {
  // 1. ORR East: Silk Board <-> Bellandur EcoSpace (traces Agara Lake & Iblur Flyover curve)
  'JNC-BLR-001::JNC-BLR-005': [
    [12.9172, 77.6228], // Silk Board
    [12.9176, 77.6330], // HSR BDA Complex / 14th Main
    [12.9185, 77.6430], // HSR 19th Main
    [12.9200, 77.6505], // HSR 24th Main
    [12.9238, 77.6538], // Agara Lake Jn / Flyover
    [12.9248, 77.6620], // Agara-Iblur stretch
    [12.9252, 77.6685], // Iblur Junction (Sarjapur-ORR)
    [12.9256, 77.6730], // Bellandur Central Mall
    [12.9260, 77.6762], // Bellandur EcoSpace
  ],

  // 2. ORR East: Bellandur EcoSpace <-> Marathahalli Bridge
  'JNC-BLR-005::JNC-BLR-007': [
    [12.9260, 77.6762], // Bellandur EcoSpace
    [12.9285, 77.6815], // RMZ Ecoworld entrance
    [12.9340, 77.6880], // Devarabisanahalli Flyover
    [12.9430, 77.6970], // Kadubeesanahalli / JP Morgan
    [12.9485, 77.7000], // Innovative Multiplex
    [12.9562, 77.7011], // Marathahalli Bridge
  ],

  // 3. ORR East: Marathahalli Bridge <-> Tin Factory / KR Puram
  'JNC-BLR-006::JNC-BLR-007': [
    [12.9562, 77.7011], // Marathahalli Bridge
    [12.9640, 77.6995], // Kalamandir
    [12.9715, 77.6975], // Doddanekundi Junction
    [12.9790, 77.6950], // Rainbow Children's Hospital
    [12.9860, 77.6915], // Bagmane Tech Park
    [12.9915, 77.6830], // Mahadevapura Flyover
    [12.9950, 77.6750], // Lowry Memorial
    [12.9982, 77.6695], // Tin Factory / KR Puram
  ],

  // 4. ORR North: Tin Factory <-> Hebbal Flyover (Nagavara & Manyata)
  'JNC-BLR-006::JNC-BLR-008': [
    [12.9982, 77.6695], // Tin Factory / KR Puram
    [13.0040, 77.6640], // B Channasandra
    [13.0110, 77.6580], // Ramamurthy Nagar Underpass
    [13.0180, 77.6510], // Kasturi Nagar
    [13.0235, 77.6430], // Babusapalya
    [13.0300, 77.6340], // Kalyan Nagar / HRBR Layout
    [13.0350, 77.6250], // Hennur Cross / Flyover
    [13.0390, 77.6160], // HBR Layout 4th Block
    [13.0420, 77.6120], // Nagavara Junction / Thanisandra
    [13.0410, 77.6060], // Manyata Tech Park Main Gate
    [13.0385, 77.6015], // Anand Nagar / Kempapura
    [13.0358, 77.5970], // Hebbal Flyover Rotary
  ],

  // 5. ORR West: Hebbal Flyover <-> Goraguntepalya / Yeshwantpur
  'JNC-BLR-008::JNC-BLR-009': [
    [13.0358, 77.5970], // Hebbal Flyover
    [13.0375, 77.5880], // Hebbal Lake North Bund
    [13.0400, 77.5800], // Bhadrappa Layout
    [13.0410, 77.5710], // Kuvempu Circle
    [13.0380, 77.5580], // BEL Circle
    [13.0335, 77.5480], // Jalahalli Cross link
    [13.0285, 77.5408], // Goraguntepalya
  ],

  // 6. ORR South: Jayadeva Underpass <-> Silk Board Junction
  'JNC-BLR-001::JNC-BLR-004': [
    [12.9180, 77.5970], // Jayadeva Underpass
    [12.9175, 77.6050], // BTM 7th Main
    [12.9172, 77.6110], // BTM 16th Main / Udupi Garden
    [12.9170, 77.6170], // BTM 29th Main Water Tank
    [12.9172, 77.6228], // Silk Board Junction
  ],

  // 7. Bannerghatta Road: Jayadeva Underpass <-> Dairy Circle
  'JNC-BLR-003::JNC-BLR-004': [
    [12.9180, 77.5970], // Jayadeva Underpass
    [12.9230, 77.5975], // Shoppers Stop / BTM 2nd Stage
    [12.9290, 77.5980], // Sagar Apollo Hospital
    [12.9340, 77.5982], // Christ University
    [12.9372, 77.5985], // Dairy Circle
  ],

  // 8. Hosur Road: Silk Board <-> Dairy Circle (via Madiwala)
  'JNC-BLR-001::JNC-BLR-003': [
    [12.9172, 77.6228], // Silk Board
    [12.9215, 77.6185], // Madiwala Police Station
    [12.9265, 77.6130], // St. John's Medical College
    [12.9315, 77.6070], // Total Mall / Madivala
    [12.9345, 77.6030], // Forum Mall
    [12.9372, 77.5985], // Dairy Circle
  ],

  // 9. Koramangala 80ft Road: Silk Board <-> Sony World Signal
  'JNC-BLR-001::JNC-BLR-002': [
    [12.9172, 77.6228], // Silk Board
    [12.9220, 77.6235], // Madiwala Checkpost
    [12.9265, 77.6250], // Koramangala 4th Block / 80ft Rd
    [12.9310, 77.6260], // Maharaja Signal
    [12.9345, 77.6265], // Sony World Signal
  ],

  // 10. Koramangala 100ft Road: Dairy Circle <-> Sony World Signal
  'JNC-BLR-002::JNC-BLR-003': [
    [12.9372, 77.5985], // Dairy Circle
    [12.9365, 77.6070], // Adugodi Police Quarters
    [12.9360, 77.6120], // Koramangala 8th Block
    [12.9355, 77.6190], // Koramangala 5th Block / Jyoti Nivas
    [12.9345, 77.6265], // Sony World Signal
  ],

  // 11. Hosur Road Central: Dairy Circle <-> Richmond Circle
  'JNC-BLR-003::JNC-BLR-011': [
    [12.9372, 77.5985], // Dairy Circle
    [12.9430, 77.5988], // Wilson Garden 12th Cross
    [12.9490, 77.5992], // Wilson Garden Police Station
    [12.9550, 77.5996], // Lalbagh Main Gate / Double Rd
    [12.9615, 77.6002], // Subbaiah Circle
    [12.9667, 77.6006], // Richmond Circle
  ],

  // 12. Central Arterial: Richmond Circle <-> Town Hall
  'JNC-BLR-011::JNC-BLR-012': [
    [12.9667, 77.6006], // Richmond Circle
    [12.9675, 77.5940], // Hudson Circle / Corporation
    [12.9660, 77.5895], // NR Road / Silver Jubilee Park
    [12.9634, 77.5855], // Town Hall
  ],

  // 13. Palace / Bellary Road: Town Hall <-> Mekhri Circle
  'JNC-BLR-010::JNC-BLR-012': [
    [12.9634, 77.5855], // Town Hall
    [12.9710, 77.5840], // Mysore Bank Circle
    [12.9775, 77.5855], // Maharani College / Palace Rd
    [12.9850, 77.5868], // Chalukya Circle (Basaveshwara Circle)
    [12.9930, 77.5862], // Windsor Manor Bridge
    [13.0005, 77.5848], // Cauvery Theatre Jn
    [13.0076, 77.5835], // Mekhri Circle
  ],

  // 14. Bellary Road Airport Expressway: Mekhri Circle <-> Hebbal Flyover (NH 44 / AH 43)
  'JNC-BLR-008::JNC-BLR-010': [
    [13.0076, 77.5835], // Mekhri Circle
    [13.0130, 77.5836], // Palace Grounds North Gate
    [13.0195, 77.5840], // Ganganagar / CBI Junction on Bellary Rd
    [13.0250, 77.5850], // Bangalore Baptist Hospital
    [13.0300, 77.5865], // Veterinary College / Hebbal Police Station
    [13.0335, 77.5900], // Esteem Mall / Hebbal Lake South
    [13.0358, 77.5970], // Hebbal Flyover Underpass
  ],

  // 15. Bellary Connector: Richmond Circle <-> Mekhri Circle (via Queen's Rd & Jayamahal Rd)
  'JNC-BLR-010::JNC-BLR-011': [
    [12.9667, 77.6006], // Richmond Circle
    [12.9740, 77.5975], // Kasturba Road / MG Road
    [12.9815, 77.5930], // GPO / Raj Bhavan
    [12.9900, 77.5938], // Cantonment / High Grounds
    [12.9995, 77.5895], // Jayamahal Road
    [13.0076, 77.5835], // Mekhri Circle
  ],
};

/**
 * Returns the exact road-following GPS coordinates between two junctions.
 * Distance matching guarantees polyline always flows from posA to posB.
 */
export function getCorridorRoadWaypoints(jIdA, jIdB, posA, posB) {
  const key = [jIdA, jIdB].sort().join('::');
  const waypoints = BENGALURU_ROAD_WAYPOINTS[key];
  if (!waypoints || waypoints.length < 2) {
    return [posA, posB];
  }
  if (posA) {
    const dStart = Math.hypot(waypoints[0][0] - posA[0], waypoints[0][1] - posA[1]);
    const dEnd = Math.hypot(waypoints[waypoints.length - 1][0] - posA[0], waypoints[waypoints.length - 1][1] - posA[1]);
    if (dEnd < dStart) {
      return [...waypoints].reverse();
    }
    return waypoints;
  }
  return waypoints;
}
