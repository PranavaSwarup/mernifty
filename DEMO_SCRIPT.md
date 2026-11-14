# MetroPulse BLR: Demo Video Script (about 4 minutes 45 seconds)

The problem statement says the video must show three things: data being ingested continuously with a live dashboard, several clients receiving the updates relevant to each of them, and historical data combined with live data. Scenes 2, 3 and 6 cover those. Scene 4 shows the login roles, which the problem statement lists as a requirement, and scene 5 is the ambulance corridor, our main feature.

| # | Time | Scene | What it proves |
| :--- | :--- | :--- | :--- |
| 1 | 0:00 – 0:30 | The problem and the app | Context |
| 2 | 0:30 – 1:10 | Live city map | Continuous ingestion, live dashboard |
| 3 | 1:10 – 1:50 | Two desks, two zones | Selective rooms: different clients get different updates |
| 4 | 1:50 – 2:25 | Roles: who can do what | Authentication and access control |
| 5 | 2:25 – 3:25 | Ambulance green corridor | Real-time coordination across zones |
| 6 | 3:25 – 4:00 | One junction: history plus live, reconnect | History and live merged with no gaps or duplicates |
| 7 | 4:00 – 4:35 | Engineering workbench | Throughput, latency, measured results |
| 8 | 4:35 – 4:45 | Close | Live link |
---

## Before you record

- Open **https://metropulse-blr.onrender.com** a few minutes early so the free server is awake.
- Use a 1920 x 1080 browser window, dark theme, browser zoom 100%.
- Close other tabs and turn off notifications.
- Open the site in a **second window** too, for scene 5.
- In the header persona switcher, start as **Admin**.
- Do one full practice run. The ambulance trip takes about a minute, so start it on cue.
- Record the screen and voice together, or record the voice afterwards over the screen recording.

---

## Scene 1 (0:00 – 0:30): The problem

**On screen:** the Network tab, whole city visible.

**Say:**
> "This is MetroPulse BLR, a live traffic monitoring platform for Bengaluru. Twelve major junctions, from Silk Board to Hebbal, send traffic readings every half second: queue length, speed and signal state for every road coming in. That's 24 events a second, all day. The system takes them in, stores them in MongoDB, spots jams, and pushes live updates to the people who need them, using Socket.IO."

---

## Scene 2 (0:30 – 1:10): Live city map

**On screen:** stay on **Network**. Hover over Silk Board to show its tooltip, then click the **South** zone filter and back to **All Zones**.

**Say:**
> "Each junction's marker shows its state: flowing, heavy, or gridlock. The roads between them are coloured by measured speed: green is flowing, yellow is moderate, red is congested. None of this is random. Our simulator models vehicles queueing at each signal and moving on to the next junction, so congestion builds and spreads the way it does on real roads.
>
> Behind this map, events arrive over HTTP or from the simulator, get validated, and are written to MongoDB in batches instead of one by one. That's how the server keeps up with a constant stream."

**Point at:** the events-per-second figure in the Network KPIs panel at the bottom.

---

## Scene 3 (1:10 – 1:50): Two desks, two zones

**On screen:** click the **Desks** tab.

**Say:**
> "In a real city, an officer in South Bengaluru doesn't need East Bengaluru's data. This screen opens two separate connections, a South desk and an East desk, each logged in as that zone's operator.
>
> Each one subscribes only to its own zone's Socket.IO room. Watch the counters: each desk receives only its own zone's frames, not the whole city. That's what keeps the network light, and the server enforces it: an operator who tries to subscribe to another zone is refused."

**On screen:** on the South desk, click **Attempt forbidden 'central-bangalore'**.

> "And if the South operator tries to join Central's room, the server refuses it."

**Point at:** each desk's own frames-per-second and bytes-per-second counters, the different junctions on each, and the refusal message.

---

## Scene 4 (1:50 – 2:25): Roles, who can do what

**On screen:** back to **Network**. Open the **persona switcher** in the header.

**Say:**
> "Who can do what depends on your role. Traffic data is public, so anyone can watch the map, even without logging in. What we protect is actions, because those change things."

**On screen:** pick **Anonymous**. Point at the **Dispatch Corridor** button and the scenario dropdown, now greyed out.

> "An anonymous visitor can watch, but can't dispatch an ambulance or trigger anything."

**On screen:** pick **South Desk**. Open a junction in the East zone, such as **Marathahalli Bridge**, and point at its controls being locked with the message to switch persona.

> "A zone operator can act only inside their own zone. The South operator can manage South junctions, but not East ones."

**On screen:** click **Switch to Admin**.

> "The admin, or supervisor, controls the whole city: scenarios, the simulator and the ambulance corridor. And these checks happen on the server, not just in the buttons. A request without the right role is rejected with an error, and signing up always creates a read-only viewer, so nobody can make themselves an admin. Passwords for these demo accounts are generated on the server and never sent to the browser."

| Role | Can see | Can do |
| :--- | :--- | :--- |
| Anonymous | Everything (public view) | Nothing |
| Viewer | Everything, plus city alerts | Nothing (read-only account) |
| South / East Desk (operator) | Everything | Act on junctions in their own zone only |
| Admin / Supervisor | Everything | Everything, in every zone |

---

## Scene 5 (2:25 – 3:25): Ambulance green corridor

**On screen:** still on **Network** as **Admin**, **All Zones**. Click **Dispatch Corridor** (Hebbal to Jayadeva).

**Say as it starts:**
> "Now our main feature. An ambulance leaves Hebbal for Jayadeva, the cardiac hospital. The system finds its route through the junction network: Mekhri Circle, Town Hall, Richmond Circle, Dairy Circle."

**On screen:** the green Priority Corridor banner, the moving **AMB-BLR-01** marker, junctions ahead turning to the blue cross.

**Say:**
> "The ambulance streams its GPS position twice a second through the same pipeline as the cameras. Just before it reaches each junction, the system turns the signal on its road green, so the queue ahead drains before it arrives. That's the realistic part: we don't rely on drivers seeing an alert and moving aside, we clear the road with the signal. Officers at each junction on the route get a notice; officers elsewhere get nothing.
>
> Bengaluru's own adaptive signal system already gives emergency vehicles priority. What we've built is the live monitoring layer, where you can watch it happen."

**On screen:** let it reach Jayadeva. The banner disappears and the junctions return to normal.

> "Once it passes, each junction goes back to normal, and the trip is saved to the database."

---

## Scene 6 (3:25 – 4:00): History plus live, and a reconnect

**On screen:** open the **Junction** tab for **Silk Board**.

**Say:**
> "Here's one junction in detail. When this view opens, it loads recent history from MongoDB and then continues with live updates on the same chart. Every event carries a sequence number, so the browser knows exactly where history ends and live begins: nothing is shown twice and nothing is missed."

**On screen:** in the second window, turn the network off for about 10 seconds (browser DevTools, Network tab, set to Offline), then back on.

> "If the connection drops, the browser tells the server the last sequence number it saw. The server replays everything missed, from memory or from MongoDB, then resumes the live stream. No gap, no duplicates."

---

## Scene 7 (4:00 – 4:35): Engineering workbench

**On screen:** click the **Engineering** tab. Scroll through the panels.

**Say:**
> "For the technical side: the stream tap shows the compact wire format, where frames are sent as small arrays instead of full JSON, roughly ninety percent smaller. OpenTelemetry traces show where time goes for each event, from arrival through validation, the database write and the broadcast. Sequence integrity tracks gaps and late events.
>
> We benchmarked it: about 1,900 events a second accepted over HTTP, and 500 connected clients receiving live frames with a 95th-percentile delay of a few milliseconds. The numbers and how to reproduce them are in the repo."

---

## Scene 8 (4:35 – 4:45): Close

**On screen:** the Network map.

**Say:**
> "MetroPulse BLR: MongoDB, Express, React, Node and Socket.IO, handling a constant stream of city traffic data live. It's running now at metropulse-blr.onrender.com, and the code is on GitHub. Thanks for watching."

---

## If something goes wrong while recording

- **The page shows "Application loading":** the server was asleep. Wait a minute, reload, and start again.
- **A button is greyed out:** you're on a read-only persona. Use **Switch to Admin** in the header.
- **The ambulance doesn't appear:** check you're on **All Zones**, then click **Dispatch Corridor** again.
- **A mistake mid-scene:** keep recording, pause a second, and repeat the sentence. Cut it in editing.
