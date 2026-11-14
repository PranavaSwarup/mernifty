# Build brief: finishing MetroPulse BLR for the MERNIFY hackathon

You are picking up a hackathon project that is partly built. This brief tells you what the project is, what the judges want, what our team has already decided, what the repository contains today, and what is still missing. Please read all of it before you change anything. It is long because the decisions behind the work matter as much as the work, and you will make better choices in the gaps if you know why each decision was made.

The repository is `https://github.com/PranavaSwarup/mernifty`. The findings in this brief come from reading the code at commit `b561105` on `main` ("fix(ci): unref timers and exit clean in tests; feat(gis): add color traffic corridors and basemap toggle"). If `main` has moved on since then, pull first, re-check each finding against the current code, and skip anything that has already been fixed.

---

## 1. The situation

We are a team of three students in the MERNIFY hackathon, in the track called "High-Throughput Streams & Telemetry". We have enough time before the deadline to finish everything described here properly, so the goal is a complete and correct build, not a cut-down one. The time still has to cover testing, deploying, writing the README, and recording a three to five minute demo video. The whole project is being built with AI assistance, which the rules allow, on one condition that shapes how you should work: every team member must be able to explain and demonstrate the implementation to the judges.

That condition has three practical consequences for you.

First, prefer simple, readable code over clever code. If two designs work, choose the one a second-year student can explain in two sentences. Avoid deep abstractions, generic frameworks, and anything that needs a paragraph of theory to justify.

Second, commit in small steps with plain commit messages, one logical change per commit. The rules say the repository should show work developed during the hackathon, and a readable history is also how the three of us will learn what you built. Do not squash everything into one commit.

Third, at the end, write a short "how it works" note for each feature you add (a few sentences each, in plain language) so the person who ran you can study it before the evaluation. Section 9 describes the report I want.

The work is organised into four phases, and the order matters because later phases build on earlier ones. Phases 1, 2 and 3 are all required. Phase 4 is a set of extras to add once the first three are finished and verified. Finish and verify each phase before starting the next, so the app is in a working, demonstrable state at every point. A feature that works in the demo is worth more to us than a larger feature that half works. If you find yourself stuck on one item for a long time, stop, leave the code in a working state, and tell the human what is blocking you.

---

## 2. What the judges asked for

The problem statement asks for a real-time telemetry monitoring platform built on MongoDB, Express, React, Node.js and Socket.IO. All five must do real work in the system. Here is what it requires, in my own words.

The application must take in continuous streams of data from multiple sources, process those events and keep an up-to-date state, store records in MongoDB for later retrieval, broadcast relevant updates to connected clients through Socket.IO, and show interactive visualizations of changing metrics. Data sources may be simulated.

The technical guidelines add specific obligations:

- Incoming data must be handled efficiently using batching, throttling or aggregation.
- Socket.IO rooms or namespaces must let multiple clients subscribe to the streams relevant to them.
- Historical data fetched from MongoDB must be combined with live updates without duplicate or inconsistent records.
- Each telemetry event must identify its source and the event itself and carry a timestamp, so that duplicates and out-of-order events can be handled.
- The client must stay responsive under frequent updates, which means it must not re-render on every event.
- There must be input validation and rate limiting against malformed or excessive events.
- There must be basic authentication and access control where relevant.
- The interface should be clean and use charts, maps, heatmaps or similar.

Scoring is 30% functionality, 20% user experience and interface, 20% technical implementation, 20% originality, and 10% presentation and documentation.

Bonus points are available for: handling high-frequency streams with low latency, sending optimized payloads and selective broadcasts instead of whole application states, client-side batching and windowing, independent subscriptions per client, historical analysis next to live data, anomaly detection with alerts, backpressure and rate limiting, real stress-test measurements (events handled and clients connected), and hosting the app on a platform such as Render, Railway, Vercel or AWS.

The deliverables are a working application, a GitHub repository whose README covers eight named topics (listed in section 7), a three to five minute demo video, and optionally an architecture document. The video must show continuous ingestion and a live dashboard, multiple clients receiving the updates relevant to each of them, and historical data combined with live data.

Keep the judging criteria in mind whenever you have to choose between two pieces of work. Anything that makes the two-browser-window demonstration true, or makes the history and live merge correct, is worth more than visual polish on a screen the video will not show.

---

## 3. What the team has decided

These decisions were made after a long discussion. Please build to them. If you believe one of them is a mistake, say so in your report, but do not silently build something different.

### 3.1 The domain

The app monitors road traffic at major junctions in Bengaluru. It is called MetroPulse BLR. Air quality and noise monitoring were considered and dropped. The reason is focus: we would sooner do one problem well than two problems badly. The current README gives a different reason (that dropping air quality frees GPU compute and bandwidth). That reason does not hold up, because air sensor data would be far smaller and cheaper than traffic data, so please replace it with the focus reason wherever it appears.

### 3.2 Where the data comes from

In the real world, roadside cameras would send video to a central city data centre, software there would turn the video into numbers, and those numbers would arrive at our system as small JSON messages. Our system starts at the JSON. We do not process video and we do not claim to. The simulator stands in for the data centre's output.

Traffic is reported per road entering each junction (the code calls these "approaches"): vehicles per minute, queue length in metres, average speed in km/h, and the current signal state for that road.

### 3.3 Who uses it

There are four roles. The important principle is that traffic data is not secret, so **everyone can view everything**. A role decides two things only: what a user sees first when they open the app, and which actions they are allowed to take. We chose this deliberately. Restricting who can view public traffic data would be theatre, since anyone could screenshot it into a chat group, while restricting actions is real access control because actions have consequences.

| Role | Opens to | Allowed actions |
|---|---|---|
| Citizen | The public city map. No login needed to view. | Submit an incident report (login required). Receives "ambulance approaching, give way" notices for junctions being viewed. |
| Ambulance | The route of its own trip. | Start a green corridor trip for its own vehicle. Its position streams into the system. |
| Officer | The junction or zone assigned to the account. | Acknowledge and resolve alerts, tag the cause of an incident, verify citizen reports, apply a manual override on signals in the assigned area. |
| Admin | The system health panel. | Manage accounts and assign officers to areas, start and stop the simulator, trigger demo scenarios, start a corridor for any vehicle. |

We considered a "city control room" role above the officers and dropped it. With open data, zone officers can already see neighbouring zones, and the one coordination job that remained (warning the next zone that a jam is heading its way) is better done automatically by the system.

Citizens may sign up freely. Nobody may make themselves an officer, ambulance or admin. Those accounts are created by an admin or by the seed script.

### 3.4 Signals are automatic

Signals are adjusted by the system, not by people tapping buttons. This matches how Bengaluru's real adaptive signal system works, where the software runs the signals nearly all the time and manual overrides are rare. In our app, officers monitor and override only in exceptions. Do not build per-officer signal control screens.

Bengaluru's real system already includes signal priority for emergency vehicles, so the README and the demo must not present our green corridor as an invention. Present the project as a live monitoring layer for a system of that kind, with the corridor as something you can watch working in real time.

### 3.5 Incidents: measure the effect, let people supply the cause

A camera cannot reliably tell an accident from a breakdown or a vehicle that has simply stopped. So the system must never label anything an "accident" by itself. It reports what it can measure:

- **Congestion building**: queue growing and speed falling over a few minutes.
- **Jam**: queue very long and speed near zero.
- **Sudden blockage**: speed on one road collapses within seconds. A rush-hour jam builds gradually; a blockage appears almost at once and usually on a single road. That difference is detectable without guessing at causes.

Every alert has a `cause` field that starts as `unknown`. A person fills it in: either a citizen report submitted near that junction attaches to the alert, or an officer tags it. The line we will say to judges is: "Sensors tell us what is happening; people tell us why."

This means the `stalledVehicleDetected` flag, which exists in the code today, should go.

### 3.6 The demo centrepiece

The demo video is built around the **ambulance green corridor**: an ambulance appears on the map, moves along a route through several junctions, the junctions ahead of it switch to green before it arrives and return to normal after it passes, and anyone viewing a junction on the route sees a "give way" notice. This must work every single time it is triggered, because it is the scene the video depends on.

### 3.7 Features agreed

Required: connected junctions, the ambulance green corridor, rooms that really filter, roles that protect actions, real input validation, incident detection that measures effects and leaves causes to people, jams that spread to neighbouring junctions, a live system health panel with real numbers, a correct history and live merge including a clean reconnect, an automatic fix that applies itself when no officer responds to an alert within three minutes with a manual override, and citizen incident reports.

Extras, once all of that works: an accelerated simulation clock with seeded history, comparison of each junction against its usual value for the hour, and incident replay.

Dropped for good: a multi-level escalation chain through a city control room. The automatic fix and the automatic warning to neighbouring zones replace it.

---

## 4. What the repository contains today

The stack is Node.js with Express and Socket.IO on the server, MongoDB through Mongoose, and React 18 with Vite, Tailwind, Recharts and Leaflet on the client. The server test suite uses Node's built-in test runner (`npm test` inside `server/`), has four tests, and all four pass. There is a CI workflow in `.github/workflows/ci.yml`.

Server files that matter:

- `server/src/index.js` wires everything together: connects to the database, seeds data, starts Socket.IO, and starts the simulator.
- `server/src/config/db.js` connects to `MONGODB_URI` and, if that fails, quietly starts an in-memory MongoDB instead.
- `server/src/services/simulatorService.js` defines twelve junctions in `INITIAL_DEVICES` and generates traffic events. On each 100 ms tick it picks junctions at random and produces an event with per-road data. It has an `injectChaos` method that multiplies a metric at one junction for a number of seconds and can set `stalled` and `ambulance` flags. It keeps a signal phase timer per junction in `signalPhases`.
- `server/src/services/ingestionBuffer.js` is the write-behind buffer. It keeps recent event IDs in a `Set` for duplicate detection, refuses events when its queue reaches 10,000 (backpressure), and writes to MongoDB in bulk every 500 ms or 200 events.
- `server/src/services/anomalyEngine.js` keeps the last 30 values per junction and metric, raises alerts on fixed thresholds or when a value is three standard deviations from the recent mean, and applies a 15 second cooldown per junction and metric.
- `server/src/services/socketService.js` owns Socket.IO: connection handling, subscribe and unsubscribe handlers, and a flush every 80 ms that sends queued events.
- `server/src/services/metricsService.js` counts ingested, persisted, broadcast and dropped events, per-second rates, average latency, connected sockets and buffer size.
- `server/src/services/copilotService.js` is a rule-based "diagnosis" feature with canned runbooks. One of them is called `emergency_green_corridor`, and all it does is reset a junction's fields.
- `server/src/middleware/validator.js` contains `normalizeTrafficEvent`, used on the ingest routes.
- `server/src/middleware/auth.js` has `authenticate` and `requireRole`. `server/src/middleware/rateLimiter.js` is a per-IP or per-API-key counter.
- `server/src/models/` has `Telemetry`, `Device`, `Alert`, `User`.
- `server/src/routes/` has routes for telemetry, devices, alerts, the simulator, auth, and the copilot.

Client files that matter:

- `client/src/context/SocketContext.jsx` opens the socket, collects incoming batches in a buffer, and flushes them into React state every 100 ms. This is the client-side throttling the judges ask for, and it works. Keep it.
- `client/src/App.jsx` is a tabbed shell: dashboard, map, topology, multi-client view, stream inspector, historical analytics, simulator controls, benchmarks, architecture.
- `client/src/components/FleetMapView.jsx` is the Leaflet map of the junctions, recently reworked with coloured corridors and a basemap toggle.
- `client/src/components/DeviceDetailModal.jsx` loads the last 40 records for a junction from `/api/telemetry/history`, then appends live events, skipping any `eventId` it has already seen.
- `client/src/components/PerformanceBenchmark.jsx` and `KpiOverview.jsx` show the metrics snapshot.
- `client/src/components/SimulatorControls.jsx` has the controls for rate and chaos injection.

The twelve junctions, which you should keep exactly as they are (IDs, names and coordinates):

| ID | Name | Zone |
|---|---|---|
| JNC-BLR-001 | Silk Board Junction | south-bangalore |
| JNC-BLR-002 | Sony World Signal | south-bangalore |
| JNC-BLR-003 | Dairy Circle | south-bangalore |
| JNC-BLR-004 | Jayadeva Underpass | south-bangalore |
| JNC-BLR-005 | Bellandur EcoSpace Junction | east-bangalore |
| JNC-BLR-006 | Tin Factory / KR Puram | east-bangalore |
| JNC-BLR-007 | Marathahalli Bridge Junction | east-bangalore |
| JNC-BLR-008 | Hebbal Flyover Junction | north-bangalore |
| JNC-BLR-009 | Goraguntepalya Junction | north-bangalore |
| JNC-BLR-010 | Mekhri Circle Underpass | north-bangalore |
| JNC-BLR-011 | Richmond Circle Flyover | central-bangalore |
| JNC-BLR-012 | Town Hall / Corporation Circle | central-bangalore |

Earlier in our planning we sketched a different ID scheme (`BLR-S-J01`) and twenty-five junctions. Ignore that. The scheme in the code is fine and renaming would cost time for no benefit.

---

## 5. What is wrong or missing, and what to build

Each item below explains the problem, why it matters to the judges or the demo, what to build, and how to tell that it is done. Where I describe a design, treat it as a sound default. If the code suggests a simpler way to reach the same outcome, take it and tell me.

### Phase 1: the foundation and the demo centrepiece

#### 5.1 Junctions are not connected

**Problem.** No junction knows which junctions it is linked to. Each one generates traffic independently, so a jam cannot spread, and an ambulance has no route to follow.

**What to build.** Add a small road graph: for each junction, a list of neighbouring junction IDs. Put it in its own file (for example `server/src/data/junctionGraph.js`) so it is easy to find and explain. Store links in one direction and derive the reverse so the graph is always symmetric. These links are a reasonable approximation of Bengaluru's main roads, and the README should say they are a simplified model:

- JNC-BLR-001 Silk Board: 002 Sony World, 003 Dairy Circle, 004 Jayadeva, 005 Bellandur
- JNC-BLR-002 Sony World: 001 Silk Board, 003 Dairy Circle
- JNC-BLR-003 Dairy Circle: 001 Silk Board, 002 Sony World, 004 Jayadeva, 011 Richmond Circle
- JNC-BLR-004 Jayadeva: 001 Silk Board, 003 Dairy Circle
- JNC-BLR-005 Bellandur: 001 Silk Board, 007 Marathahalli
- JNC-BLR-006 Tin Factory: 007 Marathahalli, 008 Hebbal
- JNC-BLR-007 Marathahalli: 005 Bellandur, 006 Tin Factory
- JNC-BLR-008 Hebbal: 006 Tin Factory, 009 Goraguntepalya, 010 Mekhri Circle
- JNC-BLR-009 Goraguntepalya: 008 Hebbal, 010 Mekhri Circle
- JNC-BLR-010 Mekhri Circle: 008 Hebbal, 009 Goraguntepalya, 012 Town Hall
- JNC-BLR-011 Richmond Circle: 003 Dairy Circle, 012 Town Hall
- JNC-BLR-012 Town Hall: 010 Mekhri Circle, 011 Richmond Circle

Add a function that returns the shortest route between two junctions as an ordered list of junction IDs. Use distance between coordinates as the edge weight (the haversine formula is fine) and a plain Dijkstra or breadth-first search. With twelve nodes, no optimisation is needed, so write the simplest version.

Expose the graph to the client through an endpoint such as `GET /api/junctions/graph` so the map can draw the links. If the map already draws corridors from hard-coded data, switch it to read from this endpoint so the server and the map agree.

**Done when.** A unit test shows the route from JNC-BLR-008 (Hebbal) to JNC-BLR-004 (Jayadeva) is 008, 010, 012, 011, 003, 004, that every link is symmetric, and that a route exists between every pair of junctions.

#### 5.2 The ambulance green corridor does not exist

**Problem.** Today "ambulance" is a boolean. The simulator sets `ambulanceDetected: true` on a random junction with a 0.1% chance per event, or when chaos is injected with the ambulance flag. That raises a critical alert whose text recommends a green corridor. The copilot's `emergency_green_corridor` runbook then resets the junction's fields. Nothing moves, there is no route, and no junction ahead is prepared. Our demo centrepiece is missing.

**Why it matters.** This is the scene the video is built around and our main claim to originality. It also uses rooms, live updates and roles together, which is what the technical criteria reward.

**What to build.** Create a corridor service on the server, in its own file, that manages active ambulance trips. One trip works like this:

1. **Start.** A trip starts through `POST /api/corridor/start` with a vehicle ID (for example `AMB-BLR-01`), a start junction and a destination junction. Only the admin role and the ambulance role may call it. The service computes the route with the function from 5.1, creates a trip record with a trip ID, and announces the trip.

2. **Movement.** The service moves the ambulance along the route on a timer, about twice a second. Its position is interpolated in a straight line between the coordinates of consecutive junctions. Real travel across the city would take many minutes, which is useless in a five minute video, so make the speed configurable and choose a default that completes the demo route in roughly 60 to 90 seconds. Say in the README that the trip is time-compressed for demonstration.

3. **Position events are telemetry.** Each position update is a telemetry event from a second kind of source, with its own event ID, a sequence number that increases by one per update, and a timestamp. This matters to the judges because it shows two different kinds of source flowing through one pipeline. Suggested shape:

   ```json
   {
     "eventId": "AMB-BLR-01:TRIP-9f2c:57",
     "type": "ambulance",
     "vehicleId": "AMB-BLR-01",
     "tripId": "TRIP-9f2c",
     "sequence": 57,
     "timestamp": "2026-11-14T12:00:28.500Z",
     "data": {
       "latitude": 12.9921,
       "longitude": 77.5846,
       "speedKmph": 42,
       "lastJunctionId": "JNC-BLR-010",
       "nextJunctionId": "JNC-BLR-012",
       "etaToNextSec": 9,
       "routeJunctionIds": ["JNC-BLR-008", "JNC-BLR-010", "JNC-BLR-012", "JNC-BLR-011", "JNC-BLR-003", "JNC-BLR-004"],
       "progressPct": 34
     }
   }
   ```

4. **Preemption.** When the ambulance is within a lookahead window of a junction on its route (the next junction, or any junction it will reach within about fifteen seconds of demo time), that junction enters corridor mode. In corridor mode, the road the ambulance arrives on shows green and every other road at that junction shows red. The `Device` model already has an `adaptiveSignalMode` field with an `emergency-corridor` value, so use it. The simulator's signal logic must respect this: while a junction is in corridor mode, its normal phase timer is paused and the forced state is what the traffic events report. Otherwise the junction's own events would contradict the corridor a moment later. To decide which road the ambulance arrives on, either store on each graph link which approach of the destination junction it corresponds to, or, if matching road names is too fiddly, pick the approach whose compass direction best matches the direction of travel. If neither is workable in the time, force the whole junction to an "all clear for emergency" state and tell me in the report.

5. **Clearing.** A few seconds after the ambulance passes a junction, the junction leaves corridor mode and returns to `dynamic-ai`, and the normal phase timer resumes.

6. **Queue effect.** While a junction is in corridor mode, make the queue on the ambulance's road shrink and the queues on the held roads grow a little, then recover. This is what makes the corridor visible in the charts, not only on the map.

7. **End.** When the ambulance reaches its destination, the trip ends. Save a trip summary to MongoDB in a new small collection: vehicle, route, start and end time, and for each junction the times it was preempted and cleared. That gives the historical side something to show for corridors.

8. **Safety rails.** Allow one active trip per vehicle. If the simulator is stopped or the server restarts, any junction left in corridor mode must be reset. Add an endpoint to cancel a trip, protected the same way as the start endpoint.

**Socket.IO events.** Use small, specific events instead of resending whole states:

- `corridor:started` with trip ID, vehicle ID and the route.
- `corridor:position` with the position event above.
- `corridor:junction_preempted` and `corridor:junction_cleared` with the junction ID and trip ID.
- `corridor:ended` with the trip summary.
- `corridor:giveway` with the junction ID, an ETA, and a short message. Send this to the room of each junction as it comes into the lookahead window.

Position updates are small, and anyone looking at the map wants them, so send them to a `corridor` room that map viewers join, and send the give-way notice to the junction room and the zone room of the junction concerned.

**Client.** On the map, draw the route as a highlighted line, show the ambulance as a marker that moves smoothly between updates, and show each route junction in one of three states: waiting, green for the ambulance, passed. In the junction detail view, show a clear banner while that junction is in corridor mode. For a viewer of a junction that receives `corridor:giveway`, show a notice such as "Ambulance approaching from Bellary Road. Give way. About 12 seconds away." Put a "Send ambulance" control in the admin's scenario panel with a start and destination picker, and preset it to Hebbal as the start and Jayadeva as the destination. That route crosses the north, central and south zones, which shows the corridor crossing zone boundaries, and Jayadeva is next to a well-known cardiac hospital, which gives the demo a believable story.

**Remove the old ambulance flag.** Delete the random `ambulanceDetected` generation from the simulator, the ambulance branch in the anomaly engine, the `ambulanceDetected` handling in the validator, and the copilot's ambulance runbook, or redirect them to the new service. Leaving both would confuse the demo with random ambulance alerts roughly once a minute.

**Done when.** With the server and client running, clicking "Send ambulance" makes the marker travel the full route; each junction turns green ahead of it and returns to normal behind it; a second browser window viewing a junction on the route shows the give-way notice at the right moment while a window viewing a junction off the route shows none; the trip summary is saved in MongoDB; and triggering it five times in a row works five times. Add unit tests for the route, the lookahead decision, and the reset on cancel.

#### 5.3 Rooms do not filter

**Problem.** In `socketService.js`, every socket joins the `global` and `alerts` rooms on connection, and `flushBroadcasts` sends the complete batch of events for all junctions to `global`, then sends each zone's share again to the `zone:` and `category:` rooms. A client that subscribes to one zone therefore still receives every event, and receives its own zone's events twice. `broadcastAlert` emits each alert separately to `alerts`, `global`, the device room, the junction room, the zone room and the category room, so every client receives each alert at least twice. The README's claim that zonal rooms cut client payload by about 75% is not true as the code stands.

On the client, `SocketContext.jsx` builds its main state from the `telemetry:batch` events it receives through `global`. Its `subscribeCategory('all')` still emits subscriptions for `server`, `fleet` and `turbine`, the categories of the previous version of the project.

**Why it matters.** Room-based subscription is a requirement, selective broadcasting is on the bonus list, and the video must show two clients receiving different updates. At the moment that scene would be staged.

**What to build.** Give each room one clear job and stop joining anything by default except what every client truly needs.

- `city`: a slim summary for the whole-city map. Once a second, send one small object per junction: junction ID, status, congestion score, average speed, longest queue, and signal mode. Do not include the per-road array. This lets the city map stay live without shipping every raw event to every viewer.
- `zone:<zoneId>`: the full events for junctions in that zone, micro-batched as today.
- `junction:<junctionId>`: the full events for one junction.
- `corridor`: ambulance position updates, as described in 5.2.
- `system`: the metrics snapshot for the health panel. Only clients with the health panel open should join it.
- Alerts go to the junction room and the zone room of the junction concerned, and to `city` in a slim form so the city map can show a marker.

Remove the duplicate `category:` and `device:` room names. They are leftovers from the earlier version, and keeping two names for each room doubles every emit. If any client code still depends on the old names, update the client.

When one message must reach several rooms, chain the rooms in a single emit, as in `io.to(roomA).to(roomB).emit(...)`. Socket.IO delivers a chained emit once to each socket even if the socket is in several of those rooms, which removes the duplicate alerts without any client-side workaround.

On the client, subscriptions should follow what the user is looking at. Opening the city map joins `city` and `corridor`. Choosing a zone joins that zone room and leaves the previous one. Opening a junction's detail view joins that junction room and leaves it on close. Opening the health panel joins `system`. Always leave a room when the view that needed it closes, and re-join the current rooms after a reconnect, because the server forgets room membership when a socket reconnects.

Show the filtering honestly. The existing `MultiClientSyncView` tab simulates two clients inside one page. Make sure it opens two real socket connections with different subscriptions and counts what each one actually receives. Better still, add a small indicator in the navbar that lists the rooms this client is in and the events per second it is receiving. In the video we will put two windows side by side, and those two indicators showing different rooms and different rates is the evidence.

After the fix, measure the difference for real: connect one client to a single zone and one to the city room, run the simulator at a fixed rate, and record events and bytes per second received by each. Put the measured numbers in the README in place of the unmeasured 75% claim.

**Done when.** A client subscribed only to `zone:south-bangalore` receives no events for any other zone; a client viewing one junction receives only that junction's full events plus the slim city summary if the map is open; each alert arrives exactly once per client; and switching zones stops the old stream within one flush interval. Add a server test that creates two socket clients with different subscriptions and asserts what each receives.

#### 5.4 Actions are not protected

**Problem.** There are four separate holes.

1. `authenticate` in `auth.js` falls back to a guest user with the `operator` role whenever a request has no valid credentials. So an anonymous request is treated as an operator.
2. The routes in `simulatorRoutes.js` (start, stop, rate, chaos) and `copilotRoutes.js` (remediate) apply no authentication at all. Anyone who can reach the server can stop the simulator or inject incidents.
3. `POST /api/auth/register` reads `role` from the request body, so anyone can register as an admin.
4. Socket connections are not authenticated, so the server does not know who a socket belongs to.

The `User` model's roles are `admin`, `operator` and `viewer`, which do not match the four roles we decided on.

**Why it matters.** Authentication and access control are a stated requirement, and our whole design rests on the statement "we don't hide data, we protect actions". That statement has to be true.

**What to build.**

- Change the role list to `admin`, `officer`, `ambulance`, `citizen`. Add an optional assigned area to the user: a zone ID, a junction ID, or neither. Add a vehicle ID for ambulance accounts.
- Registration always creates a `citizen`. Ignore any role in the request body. Add an admin-only endpoint to create or update officer and ambulance accounts and to set an officer's assigned area.
- Remove the guest-operator fallback. A request without valid credentials is anonymous. Anonymous requests may call the read-only endpoints (junction list, graph, history, aggregates, alerts list) because viewing is public by design, and nothing else.
- Protect every action with `requireRole`: simulator start, stop, rate and scenario triggers are admin only; corridor start and cancel are admin or ambulance, and an ambulance account may only start a trip for its own vehicle; acknowledging, resolving and tagging alerts and applying a manual override are officer or admin; and an officer may act only on junctions inside the assigned area. Write the area check as one small helper function and use it everywhere, so there is a single place to explain.
- The ingest endpoints (`/api/telemetry/ingest` and `/api/telemetry/batch`) should require an API key belonging to a registered data source. The simulator inside the server can call the ingestion functions directly, but the standalone producer script and the stress test should send a key. Document the demo key in the README.
- Read the JWT during the Socket.IO handshake (the client can pass it in `auth`) and attach the user to the socket. Anonymous sockets are allowed and may join viewing rooms. No action should ever be accepted over a socket without a role check.
- Update the seed script to create one demo account per role, with an officer assigned to `south-bangalore` and another assigned to junction `JNC-BLR-001`, and list those demo logins in the README.
- In the client, hide controls a user cannot use, but do not rely on that. The server check is what counts, and hidden buttons are a convenience.

**Done when.** Tests show that an anonymous request to start the simulator or a corridor gets 401, a citizen gets 403, registering with `"role": "admin"` in the body yields a citizen, an officer assigned to the south zone cannot resolve an alert in the north zone, and an anonymous request to the history endpoint still succeeds.

#### 5.5 Validation fills in bad data instead of rejecting it

**Problem.** `normalizeTrafficEvent` in `validator.js` is a normalizer, not a validator. A missing `zoneId` becomes `south-bangalore`. A missing `eventId` is invented. A missing or unparseable timestamp becomes "now". Numeric fields that are missing or not numbers become defaults, and no value is range-checked, so a speed of 5,000 km/h or a negative queue is accepted. The server also trusts values the sender should not control: the zone, the status, and the congestion score. The README says the project uses Zod, but the Zod validation from the earlier version was replaced by this function.

**Why it matters.** Input validation is a requirement. Inventing an event ID also defeats duplicate detection, since a resent event without an ID gets a fresh one each time. Trusting the sender's zone means one bad device could push its data into another zone's room.

**What to build.** Split the function into two steps: validate, then enrich.

Validation rejects the event with HTTP 400 and a message naming the field when any of these fail:

- `eventId` is a non-empty string of reasonable length. Never generate one on the server.
- `junctionId` is one of the registered junctions.
- `timestamp` parses as a date, is not more than five seconds in the future, and is not more than five minutes in the past.
- `sequence` is a non-negative integer.
- `data.approaches` is a non-empty array with at most eight entries, and each entry has a non-empty `road` string, `vehiclesPerMin` between 0 and 300, `queueLengthM` between 0 and 2,000, `avgSpeedKmph` between 0 and 120, and `signal` equal to `red`, `amber` or `green`.

For a batch, validate each event on its own merits, accept the good ones, and return the count of rejected ones with the first few reasons. Rejecting an entire batch because of one bad event would be unkind to a real data source.

Enrichment then adds the values the server owns: `zoneId` and the junction name looked up from the registry by junction ID, `receivedAt` from the server clock, and the totals, congestion score and status computed from the approaches. Ignore any of these that arrive in the payload.

Use Zod if it is still installed, since the schema is short and readable. If it has been removed from `package.json`, write the checks by hand and correct the README. Either way, the README must describe what the code does.

Count rejected events in `metricsService` separately from dropped duplicates and from events refused by backpressure, and show the three counters on the health panel. An honest counter of rejected events is good evidence that validation exists.

Rate limiting: the current limiter counts requests per IP or API key, and one batch request can carry thousands of events. Add a limit on events per source per second, keyed by junction ID, and reject the excess with HTTP 429. A reasonable default is a small multiple of the expected rate, with a higher configured limit for the stress-test key.

Out-of-order and duplicate events: keep the latest sequence number seen per source. An event whose sequence is older than the latest is still stored, since history should be complete, but must not overwrite the junction's "latest state" on the server or the client. An event whose `eventId` has been seen is dropped. The buffer's duplicate set is currently cleared entirely when it passes 50,000 entries, which lets a duplicate through just after a clear. Replace that with a bounded structure that forgets the oldest entries first.

Check one more thing. The `Telemetry` schema declares a MongoDB time-series collection. Time-series collections do not support a unique index, so MongoDB cannot enforce uniqueness of `eventId`. Find out whether the collection really is created as time-series in our setup, then make a choice and document it: either keep time-series and rely on the in-memory duplicate check plus removal of duplicates in the history query, or use a normal collection with a unique index on `eventId` and let `bulkWrite` with `ordered: false` skip duplicate-key errors. The second is easier to explain to a judge and is my preference unless you find a reason against it.

**Done when.** Tests show each kind of bad event is rejected with a clear message, a payload claiming the wrong zone is stored under the correct zone, a duplicate `eventId` is stored once, an event with an older sequence does not replace the latest state, and exceeding the per-source rate returns 429.

### Phase 2: correct detection, realistic traffic, real measurements

#### 5.6 Incident detection should match our decision

**Problem.** The simulator randomly sets `stalledVehicleDetected`, the anomaly engine turns it into a critical alert recommending "emergency towing dispatch", and status becomes `critical`. We decided the system should not guess at causes.

**What to build.** Remove `stalledVehicleDetected` from the simulator, the validator, the anomaly engine, the `Device` model, the copilot and the client. In the anomaly engine, produce three alert types from the measured data, evaluated per road as well as per junction:

- `congestion_building`: the queue has grown and the speed has fallen steadily across the recent window.
- `jam`: the queue is above the critical threshold and the speed is below the critical threshold.
- `sudden_blockage`: the speed on one road falls by a large fraction within a few seconds while that road's signal is green or was green a moment ago, or the standard-deviation check fires on a sharp drop.

Tune the thresholds against the simulator's own baseline so alerts are rare in normal running. Several junctions have a base speed of 7 to 12 km/h and queues over 100 m, and the current thresholds (warning below 11 km/h, critical below 6 km/h, queue warning at 120 m) sit close enough to those baselines that alerts may fire almost continuously. A demo with a constantly scrolling alert feed looks broken. Run the simulator for a few minutes and adjust until the feed is quiet unless a scenario is triggered.

Add `cause` (default `unknown`), `causeSource` (`citizen_report` or `officer`), and `affectedRoad` to the `Alert` model, and an officer endpoint to set the cause. Remove the legacy `cpuPercent` and `vibrationMmS` checks from the anomaly engine and update the test that relies on them.

Replace the chaos controls in the simulator panel with named scenarios that an admin can trigger: "Sudden blockage at a junction" (pick a junction and a road), "Rush hour" (raise volume across a zone), and "Send ambulance" from 5.2.

**Done when.** With no scenario active, fewer than a handful of alerts appear in five minutes; triggering a sudden blockage raises exactly one `sudden_blockage` alert for that road with cause `unknown`; and an officer can tag the cause.

#### 5.7 Jams should spread to neighbours

**What to build.** Using the graph from 5.1, make congestion at one junction affect its neighbours after a delay. A simple model is enough: when a junction's congestion score stays above a threshold, the roads at each neighbouring junction that lead towards it gain queue length and lose speed gradually, starting after a short delay and scaled by how bad the source jam is. Limit the effect to one hop, or two hops with a weaker effect, so one incident cannot lock the whole city. When the source recovers, the neighbours recover.

When the spread reaches a junction in a different zone, raise an informational alert in that zone's room, such as "Congestion from Dairy Circle is reaching Richmond Circle". This replaces the control-room role we dropped.

Because the simulator currently picks junctions at random on each tick, consider giving each junction a persistent state object that carries over between its events, so effects like spread and corridor mode have somewhere to live. Keep it a plain object per junction.

**Done when.** Triggering a blockage at Silk Board visibly worsens Sony World, Dairy Circle, Jayadeva and Bellandur over the next half minute on the map, and they recover when it clears.

#### 5.8 The health panel must show real numbers

**Problem.** The README carries badges reading "Sub-5ms Latency", "7,320+ events/sec" and "Tests Passing (100%)". Nobody on our team has measured the first two on the current code. The rules require us to be able to explain and demonstrate what we claim.

**What to build.** Make sure the health panel shows, live: events ingested per second, events persisted per second, events broadcast per second, peak ingest rate, connected clients, buffer size, and the three separate counters for rejected, duplicate and backpressure-refused events. Label each latency figure with what it measures. There are three different ones and they must not be mixed up:

- Ingest delay: server receive time minus the event's own timestamp.
- Persistence delay: time from receipt to the bulk write completing, which is deliberately up to the batch interval.
- End-to-end delay as seen by this browser: the time the event was drawn minus the event's timestamp.

Note that events from the built-in simulator are stamped at the moment of creation inside the same process, so their ingest delay is close to zero and proves little. The honest measurement comes from the external producer and the stress script, which send over HTTP.

Then run `scripts/stress-test.js` against the running server with several browser windows connected, at a few different event counts and batch sizes, and record the events per second sustained, the number of connected clients, the delays, and the machine it ran on. Put those measured numbers in the README as a small table, and remove or replace every badge and sentence that states a number you did not measure. If the stress script does not report something we need, extend it.

**Done when.** Every performance number in the README and in the app can be traced to a measurement you made in this session, with the command that produced it written next to it.

#### 5.9 History and live data, and reconnecting

**What exists.** The junction detail view loads the last 40 records and appends live events, skipping event IDs it has already seen. That covers the basic case.

**What to check and fix.**

- Subscribe to the junction room before requesting history, and hold live events that arrive while the history request is in flight, then merge them. If the order is the other way round, events that arrive between the response and the subscription are lost and leave a gap.
- After merging, sort by timestamp, with sequence as the tie-breaker, so a late event lands in the right place instead of at the end.
- On reconnect, re-join the rooms and request history from the timestamp of the last event the client holds, then merge with the same duplicate check. This fills the gap left by the disconnection.
- Cap the timeline at a fixed window so memory does not grow.
- Make the history endpoint remove duplicates by `eventId` if the storage choice in 5.5 allows duplicates.
- The history view tags records as `HISTORICAL_MONGODB` or `LIVE_SOCKET_IO`. Keep that and make it visible on the chart, for example a different line style or a marker at the join. It is the simplest way to show the merge in the video.
- The `HistoricalAnalytics` tab should offer at least one real historical view, for example the average congestion score per junction over the last fifteen minutes using the existing `/aggregate` endpoint, with live data continuing on the same chart.

**Done when.** A test or a scripted manual check shows no duplicate and no missing sequence numbers in the merged timeline after: opening the view under load, disconnecting the network for ten seconds and reconnecting, and sending the same event twice.

### Phase 3: closing the loop between the system and its users

#### 5.10 Automatic fix with a countdown and an override

**Why.** Our team decided that an unanswered alert should not simply be passed up a chain of people. If the officer for a junction does not respond within three minutes, the system applies a sensible fix by itself, and the officers keep the power to undo it. This mirrors how a real adaptive signal system runs: software handles the routine, people handle the exceptions. In the demo it gives a clear sequence: an alert appears, a countdown runs, the system acts, the traffic improves, and an officer overrides.

**Suggested actions.** When a `jam` or `sudden_blockage` alert is raised, the server attaches one suggested action chosen by simple, readable rules. Keep the rule table in one file so it can be explained in a minute:

| Situation | Suggested action | Effect on the simulation |
|---|---|---|
| One road at a junction has a much longer queue than the others | `extend_green`: give that road extra green time for a few cycles | That road's queue drains faster; the other roads' queues grow slightly |
| A jam is spreading towards a neighbouring junction | `hold_upstream`: shorten green at the neighbouring junction for the road that feeds the jam | Inflow to the jammed junction falls; the upstream queue grows moderately |
| A sudden blockage on one road | `divert`: publish a diversion notice for that road and rebalance green time to the other roads | Volume on the blocked road falls over the next minute and rises a little at one neighbouring junction |
| A junction's data source has gone silent | `fixed_timer`: switch the junction to fixed signal timing and flag it to the admin | Signal mode changes; no traffic effect |

Each suggestion carries a short human-readable sentence, for example "Give Hosur Road (from south) 25 seconds more green for three cycles".

**Lifecycle of an alert.** Add a status field to the alert with these values: `open`, `acknowledged`, `action_applied`, `auto_applied`, `overridden`, `resolved`. Store the suggested action, the action that was finally applied, who applied it (a user ID or `system`), and the time of each transition.

1. The alert is created as `open` with its suggestion and a deadline three minutes ahead. It is sent to the junction room and the zone room.
2. An officer whose assigned area covers the junction can apply the suggestion, choose a different action from the table, or acknowledge the alert without acting. Acknowledging stops the countdown, because a human has taken responsibility.
3. If the deadline passes while the alert is still `open`, the server applies the suggestion, sets the status to `auto_applied`, and sends a notice to the junction room and the zone room so both the junction officer and the zone officer learn of it.
4. At any time after an action is applied, by a person or by the system, an officer for that junction or its zone can press override. Override undoes the action, sets the junction's `adaptiveSignalMode` to `manual-override`, and sets the alert to `overridden`. A second control returns the junction to `dynamic-ai`.
5. When the measured traffic at the junction returns below the alert thresholds for a sustained period, the alert becomes `resolved` automatically. An officer can also resolve it by hand.

Run the deadline check from a single server timer that scans open alerts every second. Do not create one timer per alert, since a single loop is easier to reason about and survives restarts if open alerts are reloaded from MongoDB at startup.

**Two safety rules.** The system may apply by itself only actions that are easy to undo: the signal timing changes and the diversion notice in the table above. It must never dispatch people or vehicles. Remove "tow dispatch" and anything like it from every automatic path; if you keep it at all, it is a note an officer can record by hand. Second, every action and every override is written to an action log collection in MongoDB with the alert ID, junction ID, action, actor, and time. Add a simple log view in the app. When a judge asks who is accountable for an automatic decision, the log is the answer, and it also gives the historical side of the app another real dataset.

**The action must change the traffic.** If applying `extend_green` only changes a label, the feature is hollow. The per-junction state introduced in 5.7 is where the effect lives: the action modifies green time or inflow for a period, the simulator's next events reflect it, and the charts show the queue falling. The existing copilot service overwrites a junction's metrics with fixed "recovered" values; replace that behaviour with this mechanism, and either rework the copilot modal into the alert action panel or remove it.

**Demo setting.** Make the three minute deadline configurable, with an admin control to set it to twenty seconds for the video. Show the remaining time on the alert as a countdown.

**Socket.IO events.** `alert:new` (already exists) now includes the suggestion and deadline. Add `alert:updated` carrying only the alert ID and the fields that changed, sent to the junction and zone rooms. Do not resend whole alert lists.

**Done when.** Triggering a sudden blockage creates an alert with a suggestion and a countdown; applying it as the right officer visibly reduces the queue; leaving it alone until the deadline makes the system apply it and notify both officers; override undoes it and switches the junction to manual mode; an officer from another zone gets a 403 on every one of these actions; and each step appears in the action log. Add tests for the rule table, the deadline transition, the override, and the area check.

#### 5.11 Citizen incident reports

**Why.** Reports make citizens a second kind of data source, which the problem statement asks for, and they supply the one thing the sensors cannot: the cause. They also give validation and rate limiting a visible, natural use.

**Submitting a report.** Viewing the map needs no login. Submitting a report needs a citizen account. The form has three inputs:

- A category from a fixed list: `accident`, `road_blocked`, `waterlogging`, `signal_not_working`, `construction`, `other`.
- A location, chosen either by picking a junction from the list or by tapping the map. For a map tap, the server finds the nearest junction by distance and rejects the report if the point is more than about two kilometres from every junction, since we have no data to check it against.
- An optional note, plain text, at most 200 characters. Strip markup on the server and render it as text on the client so a note can never inject content into another user's page.

**Server handling.** A new `Report` model stores a report ID, the user ID, the category, the coordinates, the nearest junction ID and its zone ID, the note, the status, the linked alert ID if any, and timestamps. Statuses are `received`, `verified`, `action_taken`, `dismissed`.

- Validate the category against the list and the note length, and reject anything else with a 400 and a clear message.
- Limit each account to three reports per ten minutes and return 429 beyond that. This limit is separate from the telemetry limiter, and the health panel should count rejected reports.
- Group duplicates: if an open report with the same category already exists at the same junction within the last ten minutes, do not create a second visible incident. Record the new report, link it to the same group, and raise the group's count, so officers see "accident at Silk Board, reported by 4 people" as one item.
- Link to alerts: if an open `jam` or `sudden_blockage` alert exists at that junction, attach the report to it and set the alert's `cause` to the report's category with `causeSource` set to `citizen_report`. If no alert exists, the report stands alone as "unverified", and if an alert appears at that junction within the next few minutes, link them then. The alert then reads, for example, "Sudden blockage at Silk Board, Hosur Road (from south). Cause: accident (2 citizen reports)."

**Officer handling.** Officers whose area covers the junction see incoming reports live in a reports list and on the map. They can mark a report group `verified` or `dismissed`. When the linked alert has an action applied, the report status becomes `action_taken`.

**Live updates.** New reports and report status changes go to the junction room and the zone room as `report:new` and `report:updated`. The citizen who submitted a report sees its status change live. To deliver that without exposing it to others, have each logged-in socket join a private room named after its user ID and send that citizen's status updates there.

**Privacy.** Other citizens never see who submitted a report. Officers see the report content and the count, and do not need the reporter's name or email either, so leave those out of every payload sent to clients. Skip photo uploads, comments, and any points or reputation system.

**Done when.** A citizen can submit a report and watch its status move from received to verified to action taken without refreshing; an officer for that area sees it appear live while an anonymous viewer of another zone receives nothing; a fourth report inside ten minutes is refused with 429; four reports of the same category at one junction show as one incident with a count of four; a report at a junction with an open alert sets that alert's cause; and no payload contains the reporter's identity. Add tests for validation, the rate limit, grouping, linking, and the privacy of payloads.

#### 5.12 Clean up leftovers from the earlier version

The project used to be called HyperPulse and monitored servers, vehicle fleets and wind turbines. Traces remain: "HyperPulse" in the health check response, the startup log, the guest user's email, the API key prefix and the database name in `.env.example`; `server`, `fleet` and `turbine` categories in the client; the `category` and `deviceId` fields that duplicate `zoneId` and `junctionId` throughout; and tabs that no longer fit, such as the network topology view. Rename what is visible to users and judges. Remove a tab only if it does not work with traffic data. Do not attempt to remove the duplicate `deviceId` and `category` fields everywhere unless you have spare time, because that change touches most files and risks breaking working code for no visible gain.

### Phase 4: extras, once Phases 1 to 3 are finished and verified

These three add depth to the historical side of the app, which is worth bonus points ("historical data analysis alongside live telemetry"). Build them in this order and stop whenever time runs out. None of them should change the behaviour of anything in Phases 1 to 3.

#### 5.13 Accelerated clock and seeded history

**Problem.** A real day of traffic has a morning rush, a midday lull and an evening rush. A five minute video cannot show that with a real-time simulator, and a freshly started server has no history at all, so every historical chart starts empty.

**What to build.** Two things.

First, give the simulator a time-of-day profile: a multiplier on volume for each hour, with peaks around 9 am and 6 pm and a low overnight, and slightly different shapes per zone if that is easy. Add a simulation clock that can run faster than real time, controlled by an admin setting (for example 1x, 60x, 144x, where 144x makes a full day pass in ten minutes). Keep one clear rule to avoid confusing the duplicate and ordering logic: every event's `timestamp` is always the real wall-clock time at which it was produced, and the simulated time of day travels in a separate field, `data.simulatedTime`. The dashboards use the real timestamp for ordering and latency, and show the simulated time as a label. Show the current simulated time and speed in the navbar whenever the speed is not 1x, so nobody watching mistakes it for real time.

Second, add a seed script that writes a believable previous 24 hours of telemetry for every junction into MongoDB, using the same profile, at a coarser interval such as one record per junction every 30 seconds. Mark seeded records with a field such as `seeded: true`, make the script safe to run twice without creating duplicates, and document the command in the README. With this, the historical views have something to show from the first second of the demo.

**Done when.** Running the seed script and opening the historical view shows a full day with two visible peaks; switching the clock to 144x makes the live charts trace the same daily shape within ten minutes; and the latency numbers on the health panel are unaffected by the clock speed.

#### 5.14 "Now versus usual" for each junction

**Problem.** Fixed thresholds treat every junction and every hour the same, although Silk Board at 6 pm is normally slow and the same speed at 3 am would be alarming.

**What to build.** Compute a baseline per junction and per hour of the simulated day: the average congestion score, average speed, and longest queue, from stored history. A scheduled aggregation that runs every few minutes and writes the results to a small `Baseline` collection is simple and cheap; do not recompute it on every event. Then:

- In the junction detail view, draw the baseline as a faint band or dashed line behind the live line, and show a short label such as "38% slower than usual for this hour".
- On the city map, offer a toggle between colouring junctions by current congestion and colouring them by deviation from usual.
- In the anomaly engine, add the deviation as a second condition: a `jam` alert needs the fixed threshold to be crossed, and a new lower-severity alert, `unusual_for_this_hour`, fires when the value is far from the baseline even though no fixed threshold is crossed. Keep the existing cooldown so this does not flood the feed.

If there is too little history for an hour, show no baseline for it instead of a misleading one.

**Done when.** With seeded history in place, a junction's detail view shows the baseline behind the live data; triggering a rush-hour scenario at a simulated time when traffic is normally light produces an `unusual_for_this_hour` alert while the same volume at a simulated peak hour does not; and the map toggle works.

#### 5.15 Incident replay

**Problem.** Once an incident is over, there is no way to look back at how it unfolded, which is the question an officer or a judge would naturally ask.

**What to build.** For any resolved alert or finished ambulance trip, a "Replay" control that opens the map in replay mode for the window from a minute before the incident began to a minute after it ended. The client fetches that window of telemetry for the affected junction and its neighbours from MongoDB (and the trip's position events for a corridor), then plays it back on the map and charts with play, pause, a speed selector and a scrubber. To support corridor replay, store the ambulance position events, or enough of them to redraw the trip, with the trip summary.

Replay must be clearly separate from live data: a visible "Replay" banner with the incident's date and time, no live events mixed into the replayed view, and one click to return to live. While in replay mode, the client should leave the live rooms for that view and re-join them on exit, so a replay does not waste bandwidth on a stream nobody is watching.

**Done when.** After a sudden blockage has been triggered and resolved, pressing Replay on that alert shows the blockage forming, spreading to neighbours, the action being applied, and the recovery; the same works for a finished ambulance trip; and returning to live resumes the current data with no gap.

---

## 6. Things to leave alone

- The write-behind buffer and its bulk writes. It works, and it is our answer to "how do you handle high-frequency writes".
- The 100 ms client flush in `SocketContext.jsx`. It is our answer to "how do you avoid excessive rendering".
- The junction IDs, names and coordinates.
- The visual design system. Do not restyle the whole app. New screens should match the existing look, and you may tidy a screen where a feature you add needs it.
- The CI workflow, other than keeping it green.
- The fallback to an in-memory MongoDB in `db.js` is acceptable for local development. Add a clear log line and a field in the health endpoint saying which database is in use, and in production mode fail at startup if `MONGODB_URI` is missing, so that a hosted demo can never silently run on a database that forgets everything on restart.

---

## 7. Documentation

Update `README.md` after the code is done so it describes what exists. It must cover these eight topics, because the problem statement lists them:

1. Project overview and the problem being addressed.
2. Setup and execution instructions.
3. Features implemented.
4. Tech stack used.
5. A description of the data generation or ingestion mechanism: the simulator, the standalone producer, the event format with one example each for a traffic event and an ambulance event, and the validation rules.
6. An explanation of the real-time communication mechanism: the rooms, who joins which and when, the events and their payloads, and the batching intervals with the reason for each.
7. Instructions to run and test the application, including the demo logins, how to trigger each scenario, and how to run the tests and the stress test.
8. External libraries, APIs and other resources used, with attribution. Include the map tiles and their attribution requirements.

Also in the README: the measured performance table from 5.8; an honest "limitations" section (simulated data, a simplified road graph, a time-compressed ambulance trip, rule-based detection with no machine learning); and a sentence noting that Bengaluru already runs an adaptive signal system with emergency priority and that this project is a monitoring layer inspired by that kind of system.

Take out wording the code cannot back up. That includes "enterprise-grade", any reference to an "AI copilot" for what is a set of if-statements (call it rule-based diagnosis, or remove it), "GPU" claims about a pipeline we do not build, and "zero frame drops".

Update `ARCHITECTURE.md` to match: one system diagram, one data-flow diagram covering ingestion, processing, storage and broadcasting, the MongoDB collections with their fields and indexes, the room design, and the list of optimisations with the reason for each. Mermaid diagrams in the markdown are fine.

Update `DEMO_SCRIPT.md` to this outline, which fits in under five minutes:

1. What the app is and who uses it (20 seconds).
2. The live city map and a junction's detail view with per-road data (40 seconds).
3. Two browser windows side by side, one officer on the south zone and one citizen viewing a single junction, each with its room indicator showing different rooms and different event rates (50 seconds).
4. The ambulance corridor from Hebbal to Jayadeva, with the give-way notice appearing in the second window (70 seconds).
5. A sudden blockage: the alert with its countdown, the spread to neighbours, a citizen report supplying the cause, the system applying its fix, and an officer overriding it (50 seconds).
6. History and live data on one chart, and a reconnect that fills the gap (30 seconds).
7. The health panel under the stress test, with the measured numbers (30 seconds).

---

## 8. How to work

**Start by running it.** Before changing anything, install dependencies, run the server tests, start the server and the client, and confirm the app loads and data flows. Note anything that is already broken, so we can tell old problems from new ones.

**Order of work.** Phase 1 in the order 5.1, 5.2, 5.3, 5.4, 5.5. Then Phase 2 in the order 5.6 to 5.9. Then Phase 3: 5.10, 5.11, 5.12. After each item, run the tests and start the app to check that nothing else broke. Update the documentation once Phase 3 is complete, so the README is correct even if you stop there. Then Phase 4 in the order 5.13, 5.14, 5.15, updating the documentation again for whatever you add.

**Pacing.** We have time to do this properly, so do not cut corners on verification. At the end of each phase, give the human a short checkpoint: what is finished, what you verified and how, and anything that needs a decision. The ambulance corridor is the one item we cannot ship without. If it is still not working reliably after a sustained effort, tell the human at once, so we can simplify it (for example, by dropping the queue effect) instead of risking the centrepiece.

**Commits.** One logical change per commit, with messages that say what changed and why in plain words, for example "Add junction road graph and shortest-route helper". Work on a branch and open a pull request unless the human tells you to commit to `main`. Never rewrite existing history.

**Tests.** Keep the four existing tests passing, updating them where a decision in this brief changes behaviour. Add tests for the route function, the corridor lookahead and reset, room filtering, role checks, and validation. Use the Node test runner already in place; do not add a test framework.

**Dependencies.** Do not add heavy dependencies. A small, well-known library is acceptable if it saves real time, and it must then be listed in the README's attribution section. Do not replace any of MongoDB, Express, React, Node.js or Socket.IO, and do not route live data around Socket.IO, since the rules require it to be an integral part of live delivery.

**Honesty in the output.** Never write a number in the README, the architecture document or the interface that you did not measure in this session. Never describe a feature as present unless you ran it and saw it work. If something is simulated, simplified or incomplete, say so in the limitations section. The judges will ask us to demonstrate our claims, and a modest claim we can show is worth more than an impressive one we cannot.

**When to ask.** Make reasonable decisions on small matters yourself and list them in the report. Stop and ask the human before any of the following: a change that would discard working features, a change to the decisions in section 3, anything that needs credentials or accounts (MongoDB Atlas, Render), and deployment.

**Deployment.** Do not deploy by yourself. Prepare for it: confirm the production build of the client is served by the server as `index.js` already intends, confirm the `render.yaml` and `Dockerfile` still match the project, and list the environment variables the host needs (`MONGODB_URI` pointing at MongoDB Atlas, `JWT_SECRET`, `NODE_ENV`, `CLIENT_URL`, and any new ones you add). Confirm the Socket.IO client connects correctly when the client and server share an origin in production.

---

## 9. What to report back

When you stop, whether finished or out of time, give the human a report in this shape:

1. **Status by item.** For each of 5.1 to 5.15: done and verified, done but not verified, partly done, or not started, with one line on what "verified" consisted of.
2. **How each new feature works.** Three to six plain sentences per feature, written for a student who must explain it aloud to a judge: what triggers it, what the server does, what travels over Socket.IO and to which room, and what the client does with it. Name the files to read.
3. **Decisions you made** that this brief did not specify, and any place you departed from it, with the reason.
4. **Measured numbers,** with the exact commands that produced them and the machine they ran on.
5. **Known problems and limitations,** including anything you saw broken that you did not fix.
6. **Steps for the human:** environment variables to set, accounts to create, the commands to run the demo scenarios, and the order of clicks for the video.
7. **Questions a judge is likely to ask** about this code, with a short honest answer to each. Include at least these: why batch writes instead of writing each event; what happens when two copies of the same event arrive; what happens when events arrive out of order; how a client that reconnects avoids gaps and duplicates; why data is public but actions are protected; what stops one device flooding the system; and what would have to change to connect real cameras.

Thank you. The most useful thing you can give us is a corridor demo that works every time and a codebase the three of us can explain.
