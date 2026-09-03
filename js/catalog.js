/* IASim — component catalog.
 * Each definition declares geometry, terminals, and electrical/sim behavior.
 *
 * terminal.kind:
 *   source24 : always-on 24V source (e.g. PSU L+)
 *   gnd      : 0V reference (PSU M / -)
 *   in       : PLC digital input  (reads net voltage -> tag)
 *   out      : PLC digital output (tag true -> drives net 24V)
 *   sigout   : sensor signal output (drives 24V when active AND powered)
 *   pwr      : sensor/device + supply pin (needs 24V to function)
 *   pass     : passive node (switches, loads, terminal blocks)
 *   aio      : configurable input read BOTH ways - t.tag gets the digital
 *              state, t.atag gets the analog value (Arduino Opta I1-I8)
 *   bus      : RS-485 data line (A/B). Carries no power; devices on the same
 *              A and B nets as a controller's busPort answer its Modbus polls.
 *
 * behavior drives the simulation in sim/engine.js.
 *
 * Optional keys read by the UI (all safe to omit):
 *   props.step      : slider step for an analog sensor (default: 10^-decimals)
 *   props.shortUnit : compact unit for the on-canvas readout (default: props.unit)
 *   sensorLabels    : { on, off }     wording for a 3-wire sensor's toggle button
 *   switchLabels    : { closed, open } wording for a dry-contact switch's toggle
 */
(function () {
  "use strict";
  const IASim = window.IASim;

  // Standard module sizing (px). A DIN "module" is ~18px wide here.
  const H = 104;          // tall device height
  const M = 18;           // one DIN module width

  function T(id, label, kind, side, pos, tag, atag) {
    return { id, label, kind, side, pos, tag: tag || null, atag: atag || null };
  }

  const CATALOG = [
    // ---------------- POWER ----------------
    {
      id: "mains", name: "240V Mains Incomer", category: "Power", desc: "230/240VAC supply (L · N · PE)",
      w: M * 3, h: 64, color: "#2b2118", railMount: false, behavior: "mains",
      terminals: [
        T("L", "L", "mainsL", "bottom", 0.25),
        T("N", "N", "mainsN", "bottom", 0.5),
        T("PE", "PE", "mainsPE", "bottom", 0.75),
      ],
      indicator: { color: "#e06c75", source: "L" },
    },
    {
      id: "psu", name: "Power Supply 24V", category: "Power", desc: "100–240VAC → 24VDC",
      w: M * 4, h: H, color: "#3b4252", railMount: true, behavior: "power",
      // mainsInput/mainsNeutral name the terminals fed from the mains incomer.
      mainsInput: "L", mainsNeutral: "N",
      terminals: [
        T("L", "L", "pass", "top", 0.25),
        T("N", "N", "pass", "top", 0.5),
        T("PE", "PE", "mainsPE", "top", 0.75),
        T("V+", "+V", "source24", "bottom", 0.3),
        T("V+2", "+V", "source24", "bottom", 0.5),
        T("M", "-V", "gnd", "bottom", 0.7),
      ],
      indicator: { color: "#3fb950", source: "V+" },
    },
    {
      id: "mcb", name: "Circuit Breaker", category: "Power", desc: "1P miniature breaker",
      w: M * 1.6, h: H, color: "#4c566a", railMount: true, behavior: "breaker",
      terminals: [ T("1", "1", "pass", "top", 0.5), T("2", "2", "pass", "bottom", 0.5) ],
      bridge: [["1", "2"]], defaultState: { closed: true, tripped: false },
      indicator: { color: "#3fb950", source: "2" }, // lit when energized (closed + supplied)
    },
    {
      id: "tb", name: "Terminal Block", category: "Power", desc: "Feed-through terminal",
      w: M * 0.6, h: H, color: "#5e81ac", railMount: true, behavior: "terminal",
      terminals: [ T("1", "", "pass", "top", 0.5), T("2", "", "pass", "bottom", 0.5) ],
      bridge: [["1", "2"]],
    },

    // ---------------- PLC ----------------
    {
      id: "mduino", name: "M-Duino PLC", category: "Controller",
      desc: "Industrial Shields · 3 DI · 4 AI · 3 Q · 2 Relay",
      w: M * 11, h: H, color: "#23272e", railMount: true, behavior: "plc", isController: true,
      terminals: [
        // power supply (12–24V DC)
        T("Vp", "+", "pwr", "top", 0.04),
        T("Vm", "−", "gnd", "top", 0.10),
        // digital inputs
        T("I0", "I0.0", "in", "top", 0.19, "I0.0"),
        T("I1", "I0.1", "in", "top", 0.26, "I0.1"),
        T("I2", "I0.2", "in", "top", 0.33, "I0.2"),
        // analog inputs (0–10V / 4–20mA)
        T("AI0", "AI0", "ain", "top", 0.47, "AI0"),
        T("AI1", "AI1", "ain", "top", 0.55, "AI1"),
        T("AI2", "AI2", "ain", "top", 0.63, "AI2"),
        T("AI3", "AI3", "ain", "top", 0.71, "AI3"),
        // transistor (PNP) outputs
        T("Q0", "Q0.0", "out", "bottom", 0.18, "Q0.0"),
        T("Q1", "Q0.1", "out", "bottom", 0.26, "Q0.1"),
        T("Q2", "Q0.2", "out", "bottom", 0.34, "Q0.2"),
        // relay outputs (modelled as sourcing for the sim)
        T("R0", "R0.0", "out", "bottom", 0.50, "R0.0"),
        T("R1", "R0.1", "out", "bottom", 0.58, "R0.1"),
        // analog output + output common
        T("A0", "AQ0", "aout", "bottom", 0.72, "AQ0"),
        T("1L", "1L", "source24", "bottom", 0.88),
      ],
      indicator: { color: "#3fb950", source: "Vp" },
    },
    {
      id: "plc", name: "PLC CPU", category: "Controller", desc: "8 DI · 6 DO · Ladder + ST",
      w: M * 8, h: H, color: "#bf616a", railMount: true, behavior: "plc",
      terminals: [
        // power
        T("L+", "L+", "pwr", "top", 0.06),
        T("Mp", "M", "gnd", "top", 0.16),
        // inputs across the top
        T("I0", "I0.0", "in", "top", 0.30, "I0.0"),
        T("I1", "I0.1", "in", "top", 0.40, "I0.1"),
        T("I2", "I0.2", "in", "top", 0.50, "I0.2"),
        T("I3", "I0.3", "in", "top", 0.60, "I0.3"),
        T("I4", "I0.4", "in", "top", 0.70, "I0.4"),
        T("I5", "I0.5", "in", "top", 0.80, "I0.5"),
        T("I6", "I0.6", "in", "top", 0.90, "I0.6"),
        T("I7", "I0.7", "in", "top", 0.97, "I0.7"),
        // outputs across the bottom
        T("Q0", "Q0.0", "out", "bottom", 0.30, "Q0.0"),
        T("Q1", "Q0.1", "out", "bottom", 0.40, "Q0.1"),
        T("Q2", "Q0.2", "out", "bottom", 0.50, "Q0.2"),
        T("Q3", "Q0.3", "out", "bottom", 0.60, "Q0.3"),
        T("Q4", "Q0.4", "out", "bottom", 0.70, "Q0.4"),
        T("Q5", "Q0.5", "out", "bottom", 0.80, "Q0.5"),
        T("QC", "1L", "source24", "bottom", 0.92), // output common = 24V source for sourcing outputs
      ],
      indicator: { color: "#ebcb8b", source: "L+" },
      isController: true,
    },

    {
      id: "opta", name: "Arduino Opta RS485", category: "Controller",
      desc: "8 configurable I/O · 4 relays · RS485 Modbus",
      w: M * 13, h: H, color: "#008184", railMount: true, behavior: "plc", isController: true,
      // The RS-485 port this controller polls as a Modbus RTU master.
      busPort: { a: "A", b: "B" },
      terminals: [
        // supply: 12-24V DC
        T("Vp", "+", "pwr", "top", 0.03),
        T("Vm", "−", "gnd", "top", 0.09),
        // I1-I8 are configurable: 12-24V digital OR 0-10V analog. Each publishes
        // both a digital tag (I1..I8) and an analog tag (AI1..AI8) - same pin,
        // read whichever way your program needs.
        T("I1", "I1", "aio", "top", 0.20, "I1", "AI1"),
        T("I2", "I2", "aio", "top", 0.29, "I2", "AI2"),
        T("I3", "I3", "aio", "top", 0.38, "I3", "AI3"),
        T("I4", "I4", "aio", "top", 0.47, "I4", "AI4"),
        T("I5", "I5", "aio", "top", 0.56, "I5", "AI5"),
        T("I6", "I6", "aio", "top", 0.65, "I6", "AI6"),
        T("I7", "I7", "aio", "top", 0.74, "I7", "AI7"),
        T("I8", "I8", "aio", "top", 0.83, "I8", "AI8"),
        // 4 volt-free relay contacts (SPST-NO, 10A 250VAC). Unlike the M-Duino's
        // sourcing outputs these carry no voltage of their own - they just close.
        T("O1c", "1C", "pass", "bottom", 0.05),
        T("O1no", "1NO", "pass", "bottom", 0.12),
        T("O2c", "2C", "pass", "bottom", 0.22),
        T("O2no", "2NO", "pass", "bottom", 0.29),
        T("O3c", "3C", "pass", "bottom", 0.39),
        T("O3no", "3NO", "pass", "bottom", 0.46),
        T("O4c", "4C", "pass", "bottom", 0.56),
        T("O4no", "4NO", "pass", "bottom", 0.63),
        // RS-485 half-duplex bus
        T("A", "A", "bus", "bottom", 0.80),
        T("B", "B", "bus", "bottom", 0.88),
      ],
      // tag true -> that relay's contact closes
      relayContacts: [
        { tag: "O1", a: "O1c", b: "O1no" },
        { tag: "O2", a: "O2c", b: "O2no" },
        { tag: "O3", a: "O3c", b: "O3no" },
        { tag: "O4", a: "O4c", b: "O4no" },
      ],
      indicator: { color: "#3fb950", source: "Vp" },
    },

    // ---------------- RELAYS ----------------
    {
      id: "relay", name: "Relay (SPDT)", category: "Relay", desc: "Coil + 1 changeover contact",
      w: M * 1.4, h: H, color: "#88c0d0", railMount: true, behavior: "relay",
      terminals: [
        T("A1", "A1", "pass", "top", 0.3),
        T("A2", "A2", "gnd", "top", 0.7),    // coil return to 0V
        T("11", "11", "pass", "bottom", 0.2), // common
        T("14", "14", "pass", "bottom", 0.5), // NO
        T("12", "12", "pass", "bottom", 0.8), // NC
      ],
      // coil between A1/A2; when energized: 11-14 close (NO), 11-12 open (NC)
      coil: ["A1", "A2"],
      contactNO: ["11", "14"],
      contactNC: ["11", "12"],
      indicator: { color: "#88c0d0", source: "A1" },
    },
    {
      id: "contactor", name: "Contactor", category: "Relay", desc: "3-pole motor contactor",
      w: M * 3, h: H, color: "#81a1c1", railMount: true, behavior: "relay",
      terminals: [
        T("A1", "A1", "pass", "top", 0.15),
        T("A2", "A2", "gnd", "top", 0.85),
        T("1", "1/L1", "pass", "top", 0.4),
        T("2", "2/T1", "pass", "bottom", 0.4),
      ],
      coil: ["A1", "A2"], contactNO: ["1", "2"],
      indicator: { color: "#81a1c1", source: "A1" },
    },

    // ---------------- SENSORS (field devices) ----------------
    {
      id: "pushbutton", name: "Push Button (NO)", category: "Field · Input", desc: "Momentary — hold to close",
      w: M * 2, h: 70, color: "#2e3440", railMount: false, behavior: "button",
      terminals: [ T("1", "1", "pass", "left", 0.5), T("2", "2", "pass", "right", 0.5) ],
      bridge: [["1", "2"]], defaultState: { pressed: false }, momentary: true,
      indicator: { color: "#5e81ac", source: "2" },
    },
    {
      id: "estop", name: "E-Stop (NC)", category: "Field · Input", desc: "Latching — closed until pushed",
      w: M * 2.5, h: 80, color: "#bf616a", railMount: false, behavior: "selector",
      terminals: [ T("1", "1", "pass", "left", 0.5), T("2", "2", "pass", "right", 0.5) ],
      bridge: [["1", "2"]], defaultState: { closed: true }, normallyClosed: true,
      indicator: { color: "#bf616a", source: "2" },
    },
    {
      id: "selector", name: "Selector Switch", category: "Field · Input", desc: "2-position maintained",
      w: M * 2, h: 70, color: "#434c5e", railMount: false, behavior: "selector",
      terminals: [ T("1", "1", "pass", "left", 0.5), T("2", "2", "pass", "right", 0.5) ],
      bridge: [["1", "2"]], defaultState: { closed: false },
      indicator: { color: "#a3be8c", source: "2" },
    },
    {
      id: "prox", name: "Proximity Sensor", category: "Field · Input", desc: "3-wire PNP (needs 24V)",
      w: M * 2.4, h: 72, color: "#5e81ac", railMount: false, behavior: "sensor",
      terminals: [
        T("BN", "+ (BN)", "pwr", "left", 0.25),
        T("BU", "- (BU)", "gnd", "left", 0.75),
        T("BK", "out (BK)", "sigout", "right", 0.5),
      ],
      defaultState: { detected: false },
      indicator: { color: "#ebcb8b", source: "BK" },
    },

    // ---------------- ANALOG SENSORS (greenhouse) ----------------
    {
      id: "temp", name: "Temperature Sensor", category: "Field · Analog", desc: "Analog °C · needs 24V",
      w: M * 3.4, h: 80, color: "#bf616a", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "°C", min: -10, max: 50, decimals: 1 }, defaultState: { value: 24 },
      indicator: { color: "#ebcb8b", source: "P" },
    },
    {
      id: "humidity", name: "Humidity Sensor", category: "Field · Analog", desc: "Analog %RH · needs 24V",
      w: M * 3.4, h: 80, color: "#5e81ac", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "%RH", min: 0, max: 100, decimals: 0 }, defaultState: { value: 65 },
      indicator: { color: "#ebcb8b", source: "P" },
    },
    {
      id: "leaf", name: "Leaf Moisture Sensor", category: "Field · Analog", desc: "Leaf wetness % · needs 24V",
      w: M * 3.4, h: 80, color: "#a3be8c", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "%", min: 0, max: 100, decimals: 0 }, defaultState: { value: 35 },
      indicator: { color: "#ebcb8b", source: "P" },
    },

    // ---------------- ANALOG SENSORS (greenhouse / horticulture) ----------------
    {
      id: "co2", name: "CO₂ Sensor", category: "Field · Analog", desc: "Analog ppm · needs 24V",
      w: M * 3.6, h: 80, color: "#d08770", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "ppm", min: 300, max: 2000, decimals: 0 }, defaultState: { value: 420 },
      indicator: { color: "#ebcb8b", source: "P" },
    },
    {
      id: "par", name: "Light / PAR Sensor", category: "Field · Analog", desc: "Photosynthetic light · needs 24V",
      w: M * 3.6, h: 80, color: "#ebcb8b", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "µmol/m²/s", shortUnit: "µmol", min: 0, max: 2000, decimals: 0 },
      defaultState: { value: 350 },
      indicator: { color: "#ebcb8b", source: "P" },
    },
    {
      id: "soilmoist", name: "Soil Moisture Sensor", category: "Field · Analog", desc: "Volumetric water content · needs 24V",
      w: M * 3.6, h: 80, color: "#a3be8c", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "%VWC", min: 0, max: 60, decimals: 1 }, defaultState: { value: 28 },
      indicator: { color: "#ebcb8b", source: "P" },
    },
    {
      id: "soiltemp", name: "Soil Temperature Sensor", category: "Field · Analog", desc: "Root-zone °C · needs 24V",
      w: M * 3.6, h: 80, color: "#bf616a", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "°C", min: 0, max: 45, decimals: 1 }, defaultState: { value: 18.5 },
      indicator: { color: "#ebcb8b", source: "P" },
    },
    {
      id: "ph", name: "pH Sensor", category: "Field · Analog", desc: "Nutrient acidity · needs 24V",
      w: M * 3.6, h: 80, color: "#b48ead", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "pH", min: 0, max: 14, decimals: 2 }, defaultState: { value: 6.2 },
      indicator: { color: "#ebcb8b", source: "P" },
    },
    {
      id: "ec", name: "EC Sensor", category: "Field · Analog", desc: "Nutrient strength mS/cm · needs 24V",
      w: M * 3.6, h: 80, color: "#88c0d0", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "mS/cm", min: 0, max: 5, decimals: 2 }, defaultState: { value: 1.8 },
      indicator: { color: "#ebcb8b", source: "P" },
    },
    {
      id: "wind", name: "Wind Speed Sensor", category: "Field · Analog", desc: "Anemometer m/s · needs 24V",
      w: M * 3.6, h: 80, color: "#81a1c1", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "m/s", min: 0, max: 40, decimals: 1 }, defaultState: { value: 3.5 },
      indicator: { color: "#ebcb8b", source: "P" },
    },

    // ---------------- ANALOG SENSORS (general process) ----------------
    {
      id: "pressure", name: "Pressure Transmitter", category: "Field · Process", desc: "Line pressure bar · needs 24V",
      w: M * 3.6, h: 80, color: "#5e81ac", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "bar", min: 0, max: 16, decimals: 2 }, defaultState: { value: 4 },
      indicator: { color: "#ebcb8b", source: "P" },
    },
    {
      id: "flow", name: "Flow Meter", category: "Field · Process", desc: "Litres per minute · needs 24V",
      w: M * 3.6, h: 80, color: "#88c0d0", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "L/min", min: 0, max: 200, decimals: 1 }, defaultState: { value: 45 },
      indicator: { color: "#ebcb8b", source: "P" },
    },
    {
      id: "tanklevel", name: "Tank Level Sensor", category: "Field · Process", desc: "Continuous level % · needs 24V",
      w: M * 3.6, h: 80, color: "#81a1c1", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "%", min: 0, max: 100, decimals: 0 }, defaultState: { value: 60 },
      indicator: { color: "#ebcb8b", source: "P" },
    },
    {
      id: "current", name: "Current Transducer", category: "Field · Process", desc: "Motor current amps · needs 24V",
      w: M * 3.6, h: 80, color: "#ebcb8b", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "A", min: 0, max: 50, decimals: 1 }, defaultState: { value: 6 },
      indicator: { color: "#ebcb8b", source: "P" },
    },
    {
      id: "loadcell", name: "Load Cell", category: "Field · Process", desc: "Weight kg · needs 24V",
      w: M * 3.6, h: 80, color: "#d08770", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "kg", min: 0, max: 500, decimals: 1 }, defaultState: { value: 120 },
      indicator: { color: "#ebcb8b", source: "P" },
    },
    {
      id: "xmitter", name: "0–10V Transmitter", category: "Field · Process", desc: "Generic analog signal · needs 24V",
      w: M * 3.6, h: 80, color: "#4c566a", railMount: false, behavior: "asensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("S", "AO", "aout", "right", 0.5),
      ],
      props: { unit: "V", min: 0, max: 10, decimals: 2 }, defaultState: { value: 5 },
      indicator: { color: "#ebcb8b", source: "P" },
    },

    // ---------------- DIGITAL SWITCHES (dry contacts — no supply needed) ----------------
    {
      id: "floatsw", name: "Float Switch", category: "Field · Input", desc: "Tank level dry contact",
      w: M * 2.4, h: 72, color: "#5e81ac", railMount: false, behavior: "selector",
      terminals: [ T("1", "1", "pass", "left", 0.5), T("2", "2", "pass", "right", 0.5) ],
      bridge: [["1", "2"]], defaultState: { closed: false },
      switchLabels: { closed: "FLOAT UP (full)", open: "FLOAT DOWN (empty)" },
      indicator: { color: "#5e81ac", source: "2" },
    },
    {
      id: "limitsw", name: "Limit Switch", category: "Field · Input", desc: "End-of-travel dry contact",
      w: M * 2.4, h: 72, color: "#4c566a", railMount: false, behavior: "selector",
      terminals: [ T("1", "1", "pass", "left", 0.5), T("2", "2", "pass", "right", 0.5) ],
      bridge: [["1", "2"]], defaultState: { closed: false },
      switchLabels: { closed: "ACTUATED (closed)", open: "FREE (open)" },
      indicator: { color: "#a3be8c", source: "2" },
    },
    {
      id: "flowsw", name: "Flow Switch", category: "Field · Input", desc: "Flow present dry contact",
      w: M * 2.4, h: 72, color: "#88c0d0", railMount: false, behavior: "selector",
      terminals: [ T("1", "1", "pass", "left", 0.5), T("2", "2", "pass", "right", 0.5) ],
      bridge: [["1", "2"]], defaultState: { closed: false },
      switchLabels: { closed: "FLOW OK (closed)", open: "NO FLOW (open)" },
      indicator: { color: "#88c0d0", source: "2" },
    },
    {
      id: "pressuresw", name: "Pressure Switch", category: "Field · Input", desc: "Setpoint dry contact",
      w: M * 2.4, h: 72, color: "#81a1c1", railMount: false, behavior: "selector",
      terminals: [ T("1", "1", "pass", "left", 0.5), T("2", "2", "pass", "right", 0.5) ],
      bridge: [["1", "2"]], defaultState: { closed: false },
      switchLabels: { closed: "ABOVE SETPOINT (closed)", open: "BELOW SETPOINT (open)" },
      indicator: { color: "#81a1c1", source: "2" },
    },
    {
      id: "doorsw", name: "Door / Gate Switch", category: "Field · Input", desc: "NC — opens when door opens",
      w: M * 2.4, h: 72, color: "#a3be8c", railMount: false, behavior: "selector",
      terminals: [ T("1", "1", "pass", "left", 0.5), T("2", "2", "pass", "right", 0.5) ],
      bridge: [["1", "2"]], defaultState: { closed: true }, normallyClosed: true,
      switchLabels: { closed: "DOOR SHUT (closed)", open: "DOOR OPEN (circuit broken)" },
      indicator: { color: "#a3be8c", source: "2" },
    },
    {
      id: "rain", name: "Rain Detector", category: "Field · Input", desc: "Wet/dry dry contact",
      w: M * 2.4, h: 72, color: "#5e81ac", railMount: false, behavior: "selector",
      terminals: [ T("1", "1", "pass", "left", 0.5), T("2", "2", "pass", "right", 0.5) ],
      bridge: [["1", "2"]], defaultState: { closed: false },
      switchLabels: { closed: "RAIN DETECTED (closed)", open: "DRY (open)" },
      indicator: { color: "#88c0d0", source: "2" },
    },
    {
      id: "photoeye", name: "Photoelectric Sensor", category: "Field · Input", desc: "3-wire beam sensor (needs 24V)",
      w: M * 2.8, h: 72, color: "#ebcb8b", railMount: false, behavior: "sensor",
      terminals: [
        T("BN", "+ (BN)", "pwr", "left", 0.25),
        T("BU", "- (BU)", "gnd", "left", 0.75),
        T("BK", "out (BK)", "sigout", "right", 0.5),
      ],
      defaultState: { detected: false },
      sensorLabels: { on: "TARGET DETECTED (beam broken)", off: "BEAM CLEAR" },
      indicator: { color: "#ebcb8b", source: "BK" },
    },

    // ---------------- SAFETY & ALARM DEVICES ----------------
    {
      id: "smoke", name: "Smoke / Heat Detector", category: "Field · Safety", desc: "Alarm output (needs 24V)",
      w: M * 3, h: 76, color: "#bf616a", railMount: false, behavior: "sensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("AL", "ALM", "sigout", "right", 0.5),
      ],
      defaultState: { detected: false },
      sensorLabels: { on: "ALARM — SMOKE / HEAT", off: "NORMAL" },
      indicator: { color: "#bf616a", source: "AL" },
    },
    {
      id: "gas", name: "Gas Detector", category: "Field · Safety", desc: "Gas alarm output (needs 24V)",
      w: M * 3, h: 76, color: "#d08770", railMount: false, behavior: "sensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("AL", "ALM", "sigout", "right", 0.5),
      ],
      defaultState: { detected: false },
      sensorLabels: { on: "GAS ALARM", off: "ATMOSPHERE CLEAR" },
      indicator: { color: "#d08770", source: "AL" },
    },
    {
      id: "curtain", name: "Safety Light Curtain", category: "Field · Safety", desc: "Fail-safe — output ON while clear",
      w: M * 4, h: 84, color: "#ebcb8b", railMount: false, behavior: "sensor",
      terminals: [
        T("P", "+", "pwr", "left", 0.25),
        T("N", "−", "gnd", "left", 0.75),
        T("OSSD", "OSSD", "sigout", "right", 0.5),
      ],
      // Fail-safe convention: the output is ON while the field is CLEAR, and drops
      // out when the beam is broken — so a broken wire also stops the machine.
      defaultState: { detected: true },
      sensorLabels: { on: "CLEAR — OSSD ON", off: "BEAM BROKEN — OSSD OFF" },
      indicator: { color: "#ebcb8b", source: "OSSD" },
    },
    {
      id: "thermostat", name: "Thermostat Contact", category: "Field · Safety", desc: "Over-temperature dry contact",
      w: M * 2.4, h: 72, color: "#bf616a", railMount: false, behavior: "selector",
      terminals: [ T("1", "1", "pass", "left", 0.5), T("2", "2", "pass", "right", 0.5) ],
      bridge: [["1", "2"]], defaultState: { closed: false },
      switchLabels: { closed: "CALLING (closed)", open: "SATISFIED (open)" },
      indicator: { color: "#bf616a", source: "2" },
    },

    // ---------------- ACTUATORS / OUTPUT ----------------
    {
      id: "lamp", name: "Pilot Light", category: "Field · Output", desc: "Indicator lamp",
      w: M * 2, h: 70, color: "#3b4252", railMount: false, behavior: "lamp",
      terminals: [ T("X1", "X1", "pass", "left", 0.5), T("X2", "X2", "gnd", "right", 0.5) ],
      props: { color: "#ffb000" }, indicator: { color: "#ffb000", source: "X1", big: true },
    },
    {
      id: "motor", name: "Motor", category: "Field · Output", desc: "3-phase load",
      w: M * 3, h: 90, color: "#4c566a", railMount: false, behavior: "motor",
      terminals: [ T("U", "U", "pass", "left", 0.5), T("V", "V", "gnd", "right", 0.5) ],
      indicator: { color: "#3fb950", source: "U", big: true },
    },
    {
      id: "valve", name: "Solenoid Valve", category: "Field · Output", desc: "24V solenoid",
      w: M * 2.4, h: 72, color: "#434c5e", railMount: false, behavior: "lamp",
      terminals: [ T("A", "A", "pass", "left", 0.5), T("B", "B", "gnd", "right", 0.5) ],
      indicator: { color: "#88c0d0", source: "A", big: true },
    },
    {
      id: "actuator", name: "Linear Actuator", category: "Field · Output", desc: "24V actuator — extends when powered",
      w: M * 4.5, h: 56, color: "#4c566a", railMount: false, behavior: "actuator",
      terminals: [ T("A", "+", "pass", "left", 0.5), T("B", "−", "gnd", "right", 0.5) ],
      indicator: { color: "#3fb950", source: "A" }, actuator: "rod",
    },
    {
      id: "winder", name: "Vent Winder", category: "Field · Output", desc: "Greenhouse wall/roof vent — opens when driven",
      w: M * 5, h: 84, color: "#3b4252", railMount: false, behavior: "actuator",
      terminals: [ T("A", "+", "pass", "left", 0.5), T("B", "−", "gnd", "right", 0.5) ],
      indicator: { color: "#88c0d0", source: "A" }, actuator: "vent",
    },
  ];

  // ---------------- RS-485 / MODBUS RTU DEVICES ----------------
  // On a bus device the reading does not travel on its own wire: every device
  // shares one A/B pair back to the controller's RS-485 port, and is identified
  // by its slave address. Readings surface as tags MB<addr>.R<n> (and MB<addr>
  // for a single-reading device).

  // Bus terminals are identical on every device, so build them once.
  function busTerminals() {
    return [
      T("P", "+", "pwr", "left", 0.2),
      T("N", "−", "gnd", "left", 0.8),
      T("A", "A", "bus", "right", 0.3),
      T("B", "B", "bus", "right", 0.7),
    ];
  }

  function mbDevice(o) {
    return {
      id: o.id, name: o.name, category: o.category || "Field · RS485", desc: o.desc,
      w: M * (o.registers.length > 1 ? 5.6 : 5), h: 84, color: o.color,
      railMount: false, behavior: "mbsensor",
      terminals: busTerminals(),
      registers: o.registers,
      defaultState: { addr: 1, values: o.registers.map((r) => r.value) },
      indicator: { color: "#ebcb8b", source: "P" },
    };
  }

  // --- one bus twin per analog sensor, so you can swap like for like ---
  CATALOG.filter((d) => d.behavior === "asensor").forEach((d) => {
    const p = d.props || {};
    CATALOG.push(mbDevice({
      id: "mb_" + d.id,
      name: d.name.replace(/\s*\(.*\)/, "") + " (RS485)",
      desc: (p.unit || "") + " over Modbus RTU · needs 24V",
      color: d.color,
      registers: [{
        label: d.name.replace(/\s+(Sensor|Transmitter|Meter|Transducer)$/, ""),
        unit: p.unit, shortUnit: p.shortUnit, min: p.min, max: p.max,
        decimals: p.decimals, step: p.step, value: (d.defaultState || {}).value,
      }],
    }));
  });

  // --- multi-parameter probes: several readings from one address, as sold ---
  CATALOG.push(mbDevice({
    id: "mb_soilprobe", name: "Soil Probe 4-in-1 (RS485)",
    desc: "Moisture · temp · EC · pH over Modbus", color: "#a3be8c",
    registers: [
      { label: "Moisture", unit: "%VWC", min: 0, max: 60, decimals: 1, value: 28 },
      { label: "Temperature", unit: "°C", min: 0, max: 45, decimals: 1, value: 18.5 },
      { label: "EC", unit: "mS/cm", min: 0, max: 5, decimals: 2, value: 1.8 },
      { label: "pH", unit: "pH", min: 0, max: 14, decimals: 2, value: 6.2 },
    ],
  }));
  CATALOG.push(mbDevice({
    id: "mb_climate", name: "Climate Sensor 4-in-1 (RS485)",
    desc: "Temp · humidity · CO₂ · light over Modbus", color: "#5e81ac",
    registers: [
      { label: "Temperature", unit: "°C", min: -10, max: 50, decimals: 1, value: 24 },
      { label: "Humidity", unit: "%RH", min: 0, max: 100, decimals: 0, value: 65 },
      { label: "CO₂", unit: "ppm", min: 300, max: 2000, decimals: 0, value: 420 },
      { label: "Light", unit: "µmol/m²/s", shortUnit: "µmol", min: 0, max: 2000, decimals: 0, value: 350 },
    ],
  }));
  CATALOG.push(mbDevice({
    id: "mb_weather", name: "Weather Station (RS485)",
    desc: "Wind · direction · rain · temp over Modbus", color: "#81a1c1",
    registers: [
      { label: "Wind speed", unit: "m/s", min: 0, max: 40, decimals: 1, value: 3.5 },
      { label: "Wind direction", unit: "°", min: 0, max: 359, decimals: 0, value: 180 },
      { label: "Rainfall", unit: "mm", min: 0, max: 100, decimals: 1, value: 0 },
      { label: "Temperature", unit: "°C", min: -10, max: 50, decimals: 1, value: 22 },
    ],
  }));
  CATALOG.push(mbDevice({
    id: "mb_energy", name: "Energy Meter (RS485)",
    desc: "Volts · amps · kW · kWh over Modbus", color: "#ebcb8b",
    registers: [
      { label: "Voltage", unit: "V", min: 0, max: 500, decimals: 1, value: 240 },
      { label: "Current", unit: "A", min: 0, max: 100, decimals: 1, value: 6 },
      { label: "Power", unit: "kW", min: 0, max: 50, decimals: 2, value: 1.44 },
      { label: "Energy", unit: "kWh", min: 0, max: 99999, decimals: 0, value: 1250 },
    ],
  }));

  // End-of-line terminator. A real RS-485 bus needs 120Ω across A/B at each
  // end; the Opta has none built in, so it is a part you place.
  CATALOG.push({
    id: "rs485term", name: "RS485 Terminator 120Ω", category: "Field · RS485",
    desc: "End-of-line resistor across A/B",
    w: M * 2.6, h: 56, color: "#4c566a", railMount: false, behavior: "mbterm",
    terminals: [ T("A", "A", "bus", "left", 0.3), T("B", "B", "bus", "left", 0.7) ],
    indicator: { color: "#4c566a", source: "A" },
  });

  const byId = {};
  CATALOG.forEach((c) => (byId[c.id] = c));

  // Compute absolute terminal offset (px) within a component box.
  function terminalOffset(def, term) {
    const w = def.w, h = def.h;
    switch (term.side) {
      case "top": return { x: w * term.pos, y: 0 };
      case "bottom": return { x: w * term.pos, y: h };
      case "left": return { x: 0, y: h * term.pos };
      case "right": return { x: w, y: h * term.pos };
    }
    return { x: 0, y: 0 };
  }

  IASim.catalog = { list: CATALOG, byId, terminalOffset, M, H };
})();
