export interface Part {
  id: number;
  partNumber: string;
  description: string;
  section: string;
  note?: string;
  compatibleModels: string[];
  avgRating: number;
  reviewCount: number;
  price?: number;
  priceSource?: string;
  price_source?: string;
  priceUrl?: string;
  price_url?: string;
  diagramUrl?: string;
  diagram_url?: string;
  diagramRef?: string;
  diagram_ref?: string;
  sourceUrl?: string;
  source_url?: string;
  sourceProvider?: string;
}



// Helper to generate some standard compatible models for VMW (Vertical Modular Washer) parts
const standardVMW = ["WTW5000DW0", "WTW5000DW1", "WTW5000DW2", "WTW4915EW", "WTW4816FW", "MVWX655DW"];

export const partsData: Part[] = [
  // 01. Cover Sheet & Documentation
  { id: 1, partNumber: "W10783951", description: "Owner's Manual", section: "Cover Sheet & Documentation", compatibleModels: ["WTW5000DW1"], avgRating: 4.8, reviewCount: 12 },
  { id: 2, partNumber: "W10682737", description: "Installation Instructions", section: "Cover Sheet & Documentation", compatibleModels: ["WTW5000DW1"], avgRating: 4.5, reviewCount: 8 },
  { id: 3, partNumber: "W10740624", description: "Tech Sheet (Wiring Diagrams & Error Codes)", section: "Cover Sheet & Documentation", compatibleModels: ["WTW5000DW1"], avgRating: 4.9, reviewCount: 24 },
  { id: 4, partNumber: "W10063044", description: "Energy Guide Label", section: "Cover Sheet & Documentation", compatibleModels: ["WTW5000DW1"], avgRating: 4.2, reviewCount: 3 },
  { id: 5, partNumber: "W10783949", description: "Quick Start Guide", section: "Cover Sheet & Documentation", compatibleModels: ["WTW5000DW1"], avgRating: 4.6, reviewCount: 15 },

  // 02. Top and Cabinet Parts
  { id: 6, partNumber: "W11211509", description: "Cabinet Top Panel (White)", section: "Top and Cabinet Parts", compatibleModels: ["WTW5000DW0", "WTW5000DW1", "WTW5000DW2"], avgRating: 4.7, reviewCount: 31 },
  { id: 7, partNumber: "W10860912", description: "Washer Lid (White)", section: "Top and Cabinet Parts", compatibleModels: ["WTW5000DW1", "WTW4816FW"], avgRating: 4.4, reviewCount: 56 },
  { id: 8, partNumber: "W10838613", description: "Lid Lock / Latch Assembly (also lists as W11307244)", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.2, reviewCount: 89 },
  { id: 9, partNumber: "W10838562", description: "Lid Strike (the hook on the lid)", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 112 },
  { id: 10, partNumber: "WP91770", description: "Lid Hinge (Left)", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.5, reviewCount: 42 },
  { id: 11, partNumber: "WP54583", description: "Lid Hinge (Right)", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.5, reviewCount: 45 },
  { id: 12, partNumber: "WPW10249633", description: "Hinge Mounting Screw", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.9, reviewCount: 201 },
  { id: 13, partNumber: "WP8312709", description: "Cabinet Endcap Clip", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 67 },
  { id: 14, partNumber: "W10641340", description: "Rear Cabinet Panel", section: "Top and Cabinet Parts", compatibleModels: ["WTW5000DW1"], avgRating: 4.3, reviewCount: 12 },
  { id: 15, partNumber: "W10645000", description: "Main Cabinet Housing / Wrapper (White)", section: "Top and Cabinet Parts", compatibleModels: ["WTW5000DW1"], avgRating: 4.1, reviewCount: 5 },
  { id: 16, partNumber: "WPW10273048", description: "Leveling Leg / Foot (Machine requires 4)", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.6, reviewCount: 134 },
  { id: 17, partNumber: "WP3390631", description: "Cabinet Panel Screw", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 88 },
  { id: 18, partNumber: "W10336144", description: "Cabinet Retainer Clip", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.5, reviewCount: 34 },
  { id: 19, partNumber: "W10225136", description: "Lid Bumper (Rubber pad)", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 156 },
  { id: 20, partNumber: "WP90767", description: "General Machine Screw (8-18 x 3/8)", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.9, reviewCount: 423 },
  { id: 21, partNumber: "WP9740848", description: "Cabinet Grounding Screw", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 56 },
  { id: 22, partNumber: "WP62780", description: "Fastener Clip", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.6, reviewCount: 23 },
  { id: 23, partNumber: "W10714516", description: "Cabinet Corner Bracket", section: "Top and Cabinet Parts", compatibleModels: ["WTW5000DW1"], avgRating: 4.4, reviewCount: 9 },
  { id: 24, partNumber: "W10714517", description: "Cabinet Corner Plate", section: "Top and Cabinet Parts", compatibleModels: ["WTW5000DW1"], avgRating: 4.4, reviewCount: 7 },
  { id: 25, partNumber: "W10714518", description: "Bracket Mounting Screw", section: "Top and Cabinet Parts", compatibleModels: ["WTW5000DW1"], avgRating: 4.8, reviewCount: 18 },
  { id: 26, partNumber: "WPW10327122", description: "Main Power Cord", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 45 },
  { id: 27, partNumber: "WPW10269436", description: "Power Cord Strain Relief", section: "Top and Cabinet Parts", compatibleModels: standardVMW, avgRating: 4.6, reviewCount: 22 },

  // 03. Console and Water Inlet Parts
  { id: 28, partNumber: "W10920641", description: "Electronic Main Control Board", section: "Console and Water Inlet Parts", compatibleModels: ["WTW5000DW1"], avgRating: 4.3, reviewCount: 156 },
  { id: 29, partNumber: "WPW10520782", description: "Console Panel / User Interface Fascia", section: "Console and Water Inlet Parts", compatibleModels: ["WTW5000DW1"], avgRating: 4.5, reviewCount: 34 },
  { id: 30, partNumber: "W11210459", description: "Dual Water Inlet Valve (Hot/Cold)", section: "Console and Water Inlet Parts", compatibleModels: standardVMW, avgRating: 4.6, reviewCount: 312 },
  { id: 31, partNumber: "WP353244", description: "Water Level Pressure Switch Hose", section: "Console and Water Inlet Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 189 },
  { id: 32, partNumber: "WP8536939", description: "Control Knob Spring Clip", section: "Console and Water Inlet Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 124 },
  { id: 33, partNumber: "W11041131", description: "Knob, Wash Temperature", section: "Console and Water Inlet Parts", compatibleModels: ["WTW5000DW1", "WTW5000DW2"], avgRating: 4.5, reviewCount: 45 },
  { id: 34, partNumber: "W11041132", description: "Knob, Water Level / Load Size", section: "Console and Water Inlet Parts", compatibleModels: ["WTW5000DW1", "WTW5000DW2"], avgRating: 4.5, reviewCount: 42 },
  { id: 35, partNumber: "W11041133", description: "Knob, Soil Level", section: "Console and Water Inlet Parts", compatibleModels: ["WTW5000DW1", "WTW5000DW2"], avgRating: 4.5, reviewCount: 38 },
  { id: 36, partNumber: "W11041134", description: "Knob, Cycle Selection (Main Dial)", section: "Console and Water Inlet Parts", compatibleModels: ["WTW5000DW1", "WTW5000DW2"], avgRating: 4.4, reviewCount: 67 },
  { id: 37, partNumber: "W11041135", description: "Knob, Options / Rinse", section: "Console and Water Inlet Parts", compatibleModels: ["WTW5000DW1", "WTW5000DW2"], avgRating: 4.5, reviewCount: 31 },
  { id: 38, partNumber: "WPW10119828", description: "Console Mounting Screw", section: "Console and Water Inlet Parts", compatibleModels: standardVMW, avgRating: 4.9, reviewCount: 145 },
  { id: 39, partNumber: "W10724237", description: "Main Wire Harness", section: "Console and Water Inlet Parts", compatibleModels: ["WTW5000DW1"], avgRating: 4.2, reviewCount: 18 },
  { id: 40, partNumber: "W10780053", description: "Wire Harness (UI to Main Board)", section: "Console and Water Inlet Parts", compatibleModels: ["WTW5000DW1"], avgRating: 4.4, reviewCount: 23 },
  { id: 41, partNumber: "W10309247", description: "Thermistor (Temperature Sensor)", section: "Console and Water Inlet Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 89 },
  { id: 42, partNumber: "W10842795", description: "User Interface Sub-Board", section: "Console and Water Inlet Parts", compatibleModels: ["WTW5000DW1"], avgRating: 4.5, reviewCount: 25 },
  { id: 43, partNumber: "WP8541656", description: "Pressure Hose Clamp", section: "Console and Water Inlet Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 156 },
  { id: 44, partNumber: "W10860505", description: "Console Mounting Bracket", section: "Console and Water Inlet Parts", compatibleModels: ["WTW5000DW1"], avgRating: 4.6, reviewCount: 12 },

  // 04. Basket and Tub Parts
  { id: 45, partNumber: "W10752719", description: "Spin Basket Assembly", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.4, reviewCount: 34 },
  { id: 46, partNumber: "W11219115", description: "Outer Tub (Water containment)", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.3, reviewCount: 22 },
  { id: 47, partNumber: "W10752283", description: "Washplate (Impeller / Agitator)", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.5, reviewCount: 245 },
  { id: 48, partNumber: "W11050804", description: "Washplate Center Cap", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 112 },
  { id: 49, partNumber: "W10752187", description: "Washplate Mounting Screw", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 432 },
  { id: 50, partNumber: "W10528947", description: "Drive Hub Kit (Connects basket to transmission)", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.4, reviewCount: 765 },
  { id: 51, partNumber: "W10849477", description: "Tub Ring (Splash Guard)", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.6, reviewCount: 189 },
  { id: 52, partNumber: "W11130362", description: "Suspension Rod Kit (Set of 4)", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 1120 },
  { id: 53, partNumber: "W10400845", description: "Suspension Ball / Upper Joint", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 456 },
  { id: 54, partNumber: "W10730962", description: "Suspension Bushing", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 321 },
  { id: 55, partNumber: "W11385424", description: "Hub Retainer / Drive Block", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.5, reviewCount: 98 },
  { id: 56, partNumber: "W10005430", description: "Tub-Mounted Cable Tie", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.9, reviewCount: 145 },
  { id: 57, partNumber: "WPW10004910", description: "Hub Fastening Screw", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 223 },
  { id: 58, partNumber: "WP8533953", description: "Tub Ring Retainer Clip", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 67 },
  { id: 59, partNumber: "W10715692", description: "Recirculation / Outer Tub Hose", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.6, reviewCount: 34 },
  { id: 60, partNumber: "W10324647", description: "Balance Ring (Pre-assembled fluid ring)", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.4, reviewCount: 18 },
  { id: 61, partNumber: "WPW10400845", description: "Suspension Tension Spring", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 89 },
  { id: 62, partNumber: "W10840428", description: "Tub Bearing", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.1, reviewCount: 45 },
  { id: 63, partNumber: "W10564687", description: "Outer Tub Water Seal", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.2, reviewCount: 56 },
  { id: 64, partNumber: "W10734521", description: "Support Strap", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 22 },
  { id: 65, partNumber: "WPW10430225", description: "Balance Ring Fluid Plug", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.9, reviewCount: 11 },
  { id: 66, partNumber: "WP8546676", description: "Recirculation Hose Clamp", section: "Basket and Tub Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 134 },

  // 05. Gearcase, Motor, and Pump Parts
  { id: 67, partNumber: "W11454741", description: "Gearcase / Transmission Assembly", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.3, reviewCount: 345 },
  { id: 68, partNumber: "W10876600", description: "Drain Pump Assembly", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.5, reviewCount: 890 },
  { id: 69, partNumber: "WPW10006384", description: "Main Drive Belt", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 1560 },
  { id: 70, partNumber: "W10721967", description: "Washer Pulley & Clutch Kit (Splutch Assembly)", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.4, reviewCount: 678 },
  { id: 71, partNumber: "WPW10006355", description: "Shift Actuator (Optical Brake/Shifter)", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.1, reviewCount: 2341 },
  { id: 72, partNumber: "W10804664", description: "Motor Run Capacitor", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 432 },
  { id: 73, partNumber: "WPW10006424", description: "Drive Motor", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.6, reviewCount: 124 },
  { id: 74, partNumber: "WPW10568241", description: "Motor Pulley", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 89 },
  { id: 75, partNumber: "W10802689", description: "Tub-to-Pump Drain Hose", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 156 },
  { id: 76, partNumber: "WP9724509", description: "Pump Bumper / Vibration Grommet", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.9, reviewCount: 231 },
  { id: 77, partNumber: "W10777598", description: "Motor Wire Harness", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.5, reviewCount: 45 },
  { id: 78, partNumber: "W10527267", description: "Motor Splash Shield", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 34 },
  { id: 79, partNumber: "W10772611", description: "Gearcase Splash Shield", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 22 },
  { id: 80, partNumber: "WPW10004910", description: "Gearcase Mounting Screw", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.9, reviewCount: 567 },
  { id: 81, partNumber: "W10280145", description: "Motor Mounting Bolt", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 234 },
  { id: 82, partNumber: "W10006371", description: "Splutch / Drive Pulley Bolt", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 123 },
  { id: 83, partNumber: "WPW10313045", description: "Motor Retaining Washer", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.9, reviewCount: 89 },
  { id: 84, partNumber: "W10421689", description: "Motor Grommet (Upper)", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 56 },
  { id: 85, partNumber: "W10311516", description: "Motor Grommet (Lower)", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 45 },
  { id: 86, partNumber: "WPW10416922", description: "Wire Harness Retainer Clip", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 78 },
  { id: 87, partNumber: "W10668045", description: "Capacitor Mounting Bracket", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.6, reviewCount: 34 },
  { id: 88, partNumber: "WPW10568239", description: "Splutch Fastening Nut", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.6, reviewCount: 123 },
  { id: 89, partNumber: "WPW10568240", description: "Splutch Washer", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.6, reviewCount: 89 },
  { id: 90, partNumber: "WPW10111246", description: "Pump Mounting Screw", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.9, reviewCount: 456 },
  { id: 91, partNumber: "W10754201", description: "Gearcase Wire Tie", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 67 },
  { id: 92, partNumber: "WP3390632", description: "Actuator Mounting Screw", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.9, reviewCount: 312 },
  { id: 93, partNumber: "W10649520", description: "Shield Fastener", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.6, reviewCount: 45 },
  { id: 94, partNumber: "WPW10508823", description: "Transmission Bolt", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 89 },
  { id: 95, partNumber: "WPW10196233", description: "Ground Wire", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 156 },
  { id: 96, partNumber: "W10860506", description: "Wire Routing Clip", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 34 },
  { id: 97, partNumber: "WP8546676", description: "Pump Hose Clamp", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.8, reviewCount: 112 },
  { id: 98, partNumber: "WPW10512836", description: "Drive Shaft Spacer", section: "Gearcase, Motor, and Pump Parts", compatibleModels: standardVMW, avgRating: 4.7, reviewCount: 22 },

  // 06. Optional / Installation Parts
  { id: 99, partNumber: "72017", description: "Touch-Up Paint (White, 0.6-oz)", section: "Optional / Installation Parts", compatibleModels: ["Universal"], avgRating: 4.2, reviewCount: 89 },
  { id: 100, partNumber: "350930", description: "Spray Paint (White)", section: "Optional / Installation Parts", compatibleModels: ["Universal"], avgRating: 4.5, reviewCount: 34 },
  { id: 101, partNumber: "350938", description: "Spray Paint (Primer)", section: "Optional / Installation Parts", compatibleModels: ["Universal"], avgRating: 4.6, reviewCount: 12 },
  { id: 102, partNumber: "8212487RP", description: "Hot/Cold Fill Hose Kit (Standard 2-pack)", section: "Optional / Installation Parts", compatibleModels: ["Universal"], avgRating: 4.7, reviewCount: 567 },
  { id: 103, partNumber: "285863", description: "Inlet Hose Filter/Washer Kit (Screen filters)", section: "Optional / Installation Parts", compatibleModels: ["Universal"], avgRating: 4.8, reviewCount: 231 },
  { id: 104, partNumber: "8212638RP", description: "Hot/Cold Fill Hose Kit (6-foot, Braided)", section: "Optional / Installation Parts", compatibleModels: ["Universal"], avgRating: 4.9, reviewCount: 445 },
  { id: 105, partNumber: "8212545RP", description: "Hot/Cold Fill Hose Kit (5-foot)", section: "Optional / Installation Parts", compatibleModels: ["Universal"], avgRating: 4.7, reviewCount: 123 },
  { id: 106, partNumber: "10363290", description: "Appliance Sealant / Adhesive", section: "Optional / Installation Parts", compatibleModels: ["Universal"], avgRating: 4.4, reviewCount: 45 },
  { id: 107, partNumber: "W10501250", description: "Affresh Washing Machine Cleaner (3-pack)", section: "Optional / Installation Parts", compatibleModels: ["Universal"], avgRating: 4.9, reviewCount: 12500 },
];
