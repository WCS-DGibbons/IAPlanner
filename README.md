# IASim — Industrial Automation Cabinet Designer & PLC Simulator

A zero-install, browser-based tool for laying out a control cabinet on DIN rails,
wiring it up, and running a soft-PLC against simulated field devices — in **Ladder
Logic** or **Structured Text**.

No Node, no Python, no build step. Pure HTML/CSS/JS.

## Running it

**Option A — double-click (recommended):**
1. Double-click **`Start IASim.cmd`**. It starts a tiny PowerShell web server and
   opens `http://localhost:8765/` in your browser.

**Option B — open directly:**
1. Double-click **`index.html`**. The app runs straight from `file://`
   (everything is loaded with classic `<script>` tags, so no server is required).

**Option C — manual server:**
```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8765
```

## Starter cabinet — greenhouse controller (loads by default)

A new project opens with a complete, working greenhouse climate cabinet built around
an **M-Duino PLC** (Industrial Shields style: digital **and analog** inputs, transistor
+ relay outputs):

**240V Mains → Circuit Breaker → 24V PSU** powers the M-Duino and the field devices.
**Temperature**, **Humidity** and **Leaf-Moisture** sensors feed the M-Duino's analog
inputs `AI0`–`AI2`. The Structured Text program opens a **Vent Winder** (via a relay)
when it gets too warm or on a manual button, and lights a **warning lamp** on high
humidity / wet leaves.

Try it: press **▶ Run**, then in **Properties**:
- Select the **Temperature Sensor** and drag its slider above **26 °C** → the **vent
  winder opens** (its frame turns green) as `AI0 > 26` drives `Q0.0` → relay → winder.
- Hold the **Push Button** → manual vent override (`I0.0`).
- Push **Humidity** above **80 %RH** → the warning lamp lights.

Every device has a **status LED** so you can watch power, analog readings, and
triggering flow through the cabinet live. Press **✦ New** to return to this layout.

### Greenhouse / analog components

- **M-Duino PLC** — the main controller: 3 digital inputs (`I0.0`–`I0.2`), 4 analog
  inputs (`AI0`–`AI3`), 3 transistor outputs (`Q0.0`–`Q0.2`), 2 relay outputs
  (`R0.0`–`R0.1`), one analog output (`AQ0`).
- **Temperature / Humidity / Leaf-Moisture sensors** — analog field devices. Power
  them from 24V, wire the `AO` terminal to an analog input, and set the reading with
  the slider in **Properties**. Analog tags read as real numbers — use them in ST
  with comparisons (`IF AI0 > 26.0 THEN …`).
- **Linear Actuator** / **Vent Winder** — extend / open when their `+` terminal is
  energized (e.g. switched by a relay or PLC output). The rod extends / the vent flap
  opens on screen, with a status LED.

### Full sensor & switch library

Every device below appears in the **Component Library** on the left. Drag one onto
the canvas, then select it to drive its reading from **Properties** while the
simulation runs.

**Analog sensors** (`Field · Analog` and `Field · Process`) all wire the same way:
`+` to 24V, `−` to 0V, and `AO` to one of the M-Duino's analog inputs `AI0`–`AI3`.
The tag then reads as a real number you can compare against in Structured Text
(`IF AI0 > 800.0 THEN …`).

| Sensor | Reads | Range | Group |
|---|---|---|---|
| Temperature Sensor | Air temperature | −10 to 50 °C | Analog |
| Humidity Sensor | Relative humidity | 0–100 %RH | Analog |
| Leaf Moisture Sensor | Leaf wetness | 0–100 % | Analog |
| CO₂ Sensor | Carbon-dioxide concentration | 300–2000 ppm | Analog |
| Light / PAR Sensor | Photosynthetically active light | 0–2000 µmol/m²/s | Analog |
| Soil Moisture Sensor | Volumetric water content | 0–60 %VWC | Analog |
| Soil Temperature Sensor | Root-zone temperature | 0–45 °C | Analog |
| pH Sensor | Nutrient acidity | 0–14 pH | Analog |
| EC Sensor | Nutrient strength (electrical conductivity) | 0–5 mS/cm | Analog |
| Wind Speed Sensor | Anemometer | 0–40 m/s | Analog |
| Pressure Transmitter | Line pressure | 0–16 bar | Process |
| Flow Meter | Flow rate | 0–200 L/min | Process |
| Tank Level Sensor | Continuous level | 0–100 % | Process |
| Current Transducer | Motor current | 0–50 A | Process |
| Load Cell | Weight | 0–500 kg | Process |
| 0–10V Transmitter | Any generic analog signal | 0–10 V | Process |

**PAR** is *photosynthetically active radiation* — the light plants actually use for
photosynthesis. **EC** is *electrical conductivity*, the standard way to measure how
much fertiliser is dissolved in irrigation water.

**Digital switches** (`Field · Input`) are **dry contacts**: a bare pair of terminals
with no supply of its own, exactly like a real float or limit switch. Feed one side
from 24V and take the other side to a digital input `I0.0`–`I0.2`. The tag reads
true when the contact is closed.

| Switch | Closes when | Wiring |
|---|---|---|
| Float Switch | Tank level rises (float up) | 2-wire dry contact |
| Limit Switch | Something reaches end of travel | 2-wire dry contact |
| Flow Switch | Flow is present in the pipe | 2-wire dry contact |
| Pressure Switch | Pressure rises above setpoint | 2-wire dry contact |
| Rain Detector | The sensing plate gets wet | 2-wire dry contact |
| Door / Gate Switch | Door is **shut** — normally closed, opens when the door opens | 2-wire dry contact |
| Photoelectric Sensor | A target breaks the beam | 3-wire PNP: `+`, `-`, `out` |

**Safety & alarm devices** (`Field · Safety`) are aimed at interlock logic — the
rungs that stop a machine rather than run it.

| Device | Output | Wiring |
|---|---|---|
| Smoke / Heat Detector | `ALM` goes 24V on alarm | 3-wire, needs 24V |
| Gas Detector | `ALM` goes 24V on alarm | 3-wire, needs 24V |
| Safety Light Curtain | `OSSD` is 24V **while the field is clear**, and drops out when the beam is broken | 3-wire, needs 24V |
| Thermostat Contact | Contact closes when calling | 2-wire dry contact |

The light curtain follows the real **fail-safe** convention: the signal is *on* during
normal operation and *off* during the dangerous condition, so a broken wire stops the
machine instead of hiding the fault. Wire it into a permissive, not a trip —
`R0.0 := I0.1;` rather than `R0.0 := NOT I0.1;`.

> The M-Duino has **4 analog inputs** (`AI0`–`AI3`) and **3 digital inputs**
> (`I0.0`–`I0.2`), so that is how many sensors one PLC can read at a time. Delete a
> sensor you are not using to free its input, or add a second controller.

## What you can do

### 1. Design the cabinet
- Drag parts from the **Component Library** onto a **DIN rail**. Rail-mount devices
  snap to the nearest rail; field devices (buttons, lamps, sensors) place freely.
- **Scroll** to zoom, **drag the background** to pan, drag parts to reposition.
- Add more rails with **+ DIN Rail**; select a rail to resize or move it (its
  mounted devices move with it).

### 2. Wire it up (cable layout)
- Click **Wire** (or press `W`), then click a terminal and a second terminal to lay
  a cable. You can also click-drag between terminals.
- **Cancel an in-progress cable** with `Esc`, a **right-click**, or by clicking empty
  space.
- Cable colour follows the source terminal (red = +24V, grey = 0V, blue = signal),
  and editable per cable.
- During simulation, **24V cables glow orange** and **live 240V cables glow red** so
  you can see power flow and spot where mains voltage reaches.

### 240V mains

Every new cabinet starts with a **240V Mains Incomer** in the top-left (L · N · PE).
It is the only true source of power: a **Power Supply** only outputs 24V once its
`L` (and ideally `N`) are wired back to the mains incomer — exactly like the real
thing. Wire `mains L → PSU L` and `mains N → PSU N` to bring the cabinet to life.

### 3. Program the PLC
Select the **PLC Program** tab. Toggle between:

- **Ladder (LD):** build rungs of contacts (`-[ ]-` NO, `-[/]-` NC) and coils
  (`-( )-`, set `-(S)-`, reset `-(R)-`). Contacts in a branch are AND; parallel
  branches are OR. Click any element to edit its tag/type. Rungs light up live
  while running.
- **Structured Text (ST):** an IEC 61131-3 subset —
  `IF/ELSIF/ELSE/END_IF`, `WHILE/DO/END_WHILE`, `AND OR XOR NOT`, comparisons,
  arithmetic (`+ - * / MOD`), and function blocks:
  `TON / TOF / TP(name, IN, PT_ms)`, `R_TRIG / F_TRIG(name, CLK)`,
  `ABS MIN MAX LIMIT SQRT`. Compiles as you type with line-numbered errors.

### 4. Simulate
- Press **▶ Run** (or `Space`). Each scan: read inputs from energized nets → run
  your program → drive outputs → re-solve the circuit → update visuals.
- Drive inputs by selecting a **field device** (push button, selector, E-stop,
  proximity sensor, breaker) — each gets a live control in **Properties**.
- Watch every tag update live in the **I/O & Tags** tab.

### 5. Check your wiring

The **Checks** tab continuously validates the cabinet as you wire (a badge shows the
error/warning count). Click any issue to jump to the offending part, which is also
outlined on the canvas (red = error, amber = warning). Rules include:

- **⛔ Short circuit** — +24V tied straight to 0V, or 240V L straight to N, with no load.
- **⛔ Mixed voltage** — 240V mains sharing a net with a 24V/DC circuit.
- **⚠️ PSU not powered / missing neutral** — supply input not fed from the mains incomer.
- **⚠️ Sensor not powered** — 3-wire sensor whose `+` pin has no 24V.
- **⚠️ Floating load** — a lamp/motor with a terminal left unconnected (no return path).
- **⚠️ Output conflict** — two PLC outputs tied together, or an output shorted to +24V.
- **ℹ️ PLC not powered** — `L+` has no 24V (informational).

## How the simulation works

- **Electrical nets** are solved with union-find over cables plus any *closed*
  switch/relay/breaker bridges. A net is "hot" (24V) if it touches a source: a PSU
  `+V`, a sourcing PLC output that's ON, or a powered, detecting sensor.
- **PLC inputs** read the voltage on their net; **outputs** drive their net to 24V
  when the tag is true; **relay/contactor** coils close their contacts when
  energized — so relay-switched power, seal-in circuits, etc. all behave.
- Switch/relay state and energization are iterated to a fixpoint every scan, so
  feedback (e.g. seal-in latches) resolves correctly.

## Saving

- **💾 Save** downloads the project as `cabinet.iasim.json`; **📂 Load** restores it.
- Work also autosaves to the browser's local storage and reloads automatically.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `V` | Select mode |
| `W` | Wire mode |
| `Space` | Run / Stop simulation |
| `Del` / `Backspace` | Delete selection |
| `Esc` | Cancel wiring / deselect |

## Project structure

```
index.html            App shell (loads modules in order)
css/styles.css        Industrial dark UI theme
js/util.js            DOM/SVG helpers + event bus
js/catalog.js         Component library (geometry, terminals, behavior)
js/state.js           Project model + persistence
js/sim/nets.js        Union-find electrical net solver
js/sim/engine.js      Scan cycle, I/O mapping, energization fixpoint
js/plc/ladder.js      Ladder logic model + evaluator
js/plc/st.js          Structured Text lexer / parser / interpreter
js/designer.js        SVG canvas: render, place, move, pan/zoom, live visuals
js/wiring.js          Cable drawing tool
js/ui.js              Palette, properties, program editors, tag watch, toolbar
js/app.js             Bootstrap + keyboard shortcuts
serve.ps1             Tiny dependency-free static server
Start IASim.cmd       One-click launcher
```

## Extending it

Add a new part by appending one entry to the `CATALOG` array in
[`js/catalog.js`](js/catalog.js): declare its size, terminals (with a `kind` such as
`source24`, `gnd`, `in`, `out`, `sigout`, `pwr`, `pass`) and a `behavior`. The
designer, wiring, and simulator pick it up automatically.

A few optional keys tune how the part presents itself — all safe to leave out:

| Key | Does what | Default |
|---|---|---|
| `props.step` | Slider increment for an analog sensor | `10^-decimals` |
| `props.shortUnit` | Compact unit for the on-canvas reading (e.g. `µmol` for `µmol/m²/s`) | `props.unit` |
| `sensorLabels` | `{ on, off }` wording on a 3-wire sensor's toggle button | `TARGET DETECTED` / `NO TARGET` |
| `switchLabels` | `{ closed, open }` wording on a dry-contact switch's toggle button | `ON` / `OFF` |

A reading that is too wide for its box is shrunk to fit automatically, so a long
unit will not spill over the part.
