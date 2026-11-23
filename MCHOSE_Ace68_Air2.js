// SignalRGB / TunerRGB plugin - MCHOSE Ace 68 Air 2 (USB VID 0x3837 / PID 0x300A)
// Protocol reverse-engineered from the vendor WebHID web driver (mchose.com.cn) and verified
// on the Air 2 over USB interface 1.
//
// Two write channels exist on this keyboard (packet format is the same for both):
//   55 <cmd> 00 <checksum> 38 <off_lo> <off_hi> 00 <56 data bytes>
//   checksum = sum(bytes[4..63]) & 0xFF
//
//   cmd 0x0B ("config write", used by the original Carlin16r Ace 68 plugin): persistent and
//        verified, but the firmware takes ~250 ms per block -> 7 blocks/frame = ~0.5 FPS.
//        Only suitable for initial setup / shutdown.
//
//   cmd 0xDD ("music" channel, used by the vendor driver for real-time music/GIF lighting):
//        fire-and-forget with ~16 ms per-block processing and a deep queue. Measured 23+ FPS
//        sustained with frame-level ACK sync; raw write rate >800 FPS. This plugin uses 0xDD
//        for all live frames.
//
// Data = 128 LED slots x 3 bytes (R,G,B) = 384 bytes, sent as 7 blocks at offsets
//   0x00, 0x38, 0x70, 0xA8, 0xE0, 0x118, 0x148 (the last block overlaps the previous one).
//
// ACK policy: TunerRGB's compat layer does not surface input reports and punishes devices
// that stall Render() with reads, so by default this plugin never reads. Pacing comes from
// the frame-rate throttle; reliability comes from the periodic full refresh (every 2 s).
// The vendor's own music mode also fires 0xDD without per-block ACK waiting.
//
// LED slot map verified against a physical unit (probed LED by LED):
//   slots 0..70 = per-key LEDs; the Space bar has 5 LEDs: 20(L2) 17(L1) 70(C) 24(R1) 35(R2);
//   the "[" key LED is slot 40 (the vendor table claims 61, which has no LED on this unit);
//   76 = RT side key, 77..127 = Air light box (top bar);
//   slots 46, 58, 61, 71 have no LED populated (kept dark).

export function Name() { return "MCHOSE Ace 68 Air 2"; }
export function VendorId() { return 0x3837; }
export function ProductId() { return 0x300A; }
export function Publisher() { return "Carlin16r (protocol) / Air 2 adaptation"; }
export function DeviceType() { return "Keyboard"; }

// Grid of 0.25 key-unit per cell: 16 u wide -> 61 cells (indexes 0..60),
// 5 rows -> 17 cells (rows at 0, 4, 8, 12, 16). Keeps the proportions of the physical keyboard.
const GRID_W = 61;
const GRID_H = 17;
export function Size() { return [GRID_W, GRID_H]; }
export function DefaultPosition() { return [10, 100]; }
export function DefaultScale() { return 2.0; }

/*
global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
profileSlot:readonly
lightBoxColor:readonly
frameRate:readonly
*/

export function ControllableParameters() {
	return [
		{ "property": "frameRate", "label": "Frame Rate (FPS)", "type": "combobox", "values": ["10", "15", "20", "30", "45", "60"], "default": "30" },
		{ "property": "profileSlot", "label": "Onboard Profile", "type": "combobox", "values": ["1", "2", "3"], "default": "1" },
		{ "property": "shutdownColor", "label": "Shutdown Color", "min": "0", "max": "360", "type": "color", "default": "#000000" },
		{ "property": "LightingMode", "label": "Lighting Mode", "type": "combobox", "values": ["Canvas", "Forced"], "default": "Canvas" },
		{ "property": "forcedColor", "label": "Forced Color", "min": "0", "max": "360", "type": "color", "default": "#009bde" },
		{ "property": "lightBoxColor", "label": "Light Box Color (top bar)", "min": "0", "max": "360", "type": "color", "default": "#000000" },
	];
}

// [hardware LED slot (vendor config), key name, key center in key units, row]
// Real key widths: Backspace 2u, Tab 1.5u, \ 1.5u, Caps 1.75u, Enter 2.25u,
// Left Shift 2.25u, Right Shift 1.75u, left Ctrl/Win/Alt 1.25u, Space 6.25u.
const vKeyUnits = [
	[18, "Esc", 0.5, 0], [56, "1", 1.5, 0], [22, "2", 2.5, 0], [4, "3", 3.5, 0], [60, "4", 4.5, 0], [26, "5", 5.5, 0],
	[62, "6", 6.5, 0], [55, "7", 7.5, 0], [21, "8", 8.5, 0], [57, "9", 9.5, 0], [59, "0", 10.5, 0], [5, "-", 11.5, 0],
	[25, "=", 12.5, 0], [7, "Backspace", 14.0, 0], [53, "Insert", 15.5, 0],

	[54, "Tab", 0.75, 1], [2, "Q", 2.0, 1], [74, "W", 3.0, 1], [6, "E", 4.0, 1], [42, "R", 5.0, 1], [8, "T", 6.0, 1],
	[1, "Y", 7.0, 1], [39, "U", 8.0, 1], [3, "I", 9.0, 1], [23, "O", 10.0, 1], [41, "P", 11.0, 1], [40, "[", 12.0, 1],
	[43, "]", 13.0, 1], [27, "\\", 14.25, 1], [63, "Del", 15.5, 1],

	[36, "Caps Lock", 0.875, 2], [72, "A", 2.25, 2], [73, "S", 3.25, 2], [75, "D", 4.25, 2], [44, "F", 5.25, 2],
	[19, "G", 6.25, 2], [37, "H", 7.25, 2], [16, "J", 8.25, 2], [50, "K", 9.25, 2], [11, "L", 10.25, 2],
	[47, ";", 11.25, 2], [65, "'", 12.25, 2], [31, "Enter", 13.875, 2], [9, "Page Up", 15.5, 2],

	[0, "Left Shift", 1.125, 3], [38, "Z", 2.75, 3], [48, "X", 3.75, 3], [30, "C", 4.75, 3], [12, "V", 5.75, 3],
	[66, "B", 6.75, 3], [52, "N", 7.75, 3], [34, "M", 8.75, 3], [32, ",", 9.75, 3], [14, ".", 10.75, 3],
	[29, "/", 11.75, 3], [49, "Right Shift", 13.125, 3], [51, "Up Arrow", 14.5, 3], [45, "Page Down", 15.5, 3],

	[10, "Left Ctrl", 0.625, 4], [64, "Left Win", 1.875, 4], [28, "Left Alt", 3.125, 4], [70, "Space", 6.875, 4],
	[68, "Right Alt", 10.5, 4], [13, "Fn", 11.5, 4], [67, "Right Ctrl", 12.5, 4], [33, "Left Arrow", 13.5, 4],
	[69, "Down Arrow", 14.5, 4], [15, "Right Arrow", 15.5, 4],

	[76, "RT", 0.5, 2], // side Rapid-Trigger button, drawn at the left edge below Tab

	// Space bar satellite LEDs (physically verified on the Ace 68 Air 2).
	[20, "Space L2", 3.375, 4.6], [17, "Space L1", 5.125, 4.6], [24, "Space R1", 8.625, 4.6], [35, "Space R2", 10.375, 4.6],
];

// Convert the key center (key units) to a grid cell (0.25 u per cell), clamped to the grid.
const vKeys = vKeyUnits.map(k => [
	k[0],
	k[1],
	Math.max(0, Math.min(GRID_W - 1, Math.round(k[2] * 4 - 2))),
	Math.max(0, Math.min(GRID_H - 1, k[3] * 4)),
]);

const vLedNames = vKeys.map(k => k[1]);
const vLedPositions = vKeys.map(k => [k[2], k[3]]);

export function LedNames() { return vLedNames; }
export function LedPositions() { return vLedPositions; }

const LED_COUNT = 128;
const BLOCK_OFFSETS = [0x00, 0x38, 0x70, 0xA8, 0xE0, 0x118, 0x148];
const CMD_MUSIC = 0xDD;    // fast realtime channel (vendor: setMusicKeyColors)
const CMD_CONFIG = 0x0B;   // slow persistent channel (used only for shutdown color)

// The configuration interface is the one the vendor web driver opens (USB interface 1).
export function Validate(endpoint) {
	return endpoint.interface === 1;
}

export function Initialize() {
	device.setName("Mchose Ace 68 Air 2");
	device.setSize([GRID_W, GRID_H]);
	device.setControllableLeds(vLedNames, vLedPositions);

	// The plugin state survives a re-initialization, so reset what depends on the keyboard.
	lastBlocks = {};
	forceFull = true;
	profileBase = (Math.max(1, Math.min(3, parseInt(profileSlot, 10) || 1)) - 1) * PROFILE_STRIDE;
	activeProfile = -1;
	lastSendTime = 0;
	lastLogTime = 0;
	lastFullRefresh = 0;
	lastWriteAt = 0;
	sentFrames = 0;
	sentWindowStart = Date.now();
	device.log("Mchose Ace 68 Air 2 initialized (music channel 0xDD, profile " + profileSlot + ")");
}

export function Render() {
	// Frame-rate throttle: the host may call Render() at 60+ FPS; only send to the keyboard
	// at the configured rate (default 30 FPS) to save USB bandwidth.
	const minFrameMs = 1000 / Math.max(1, parseInt(frameRate, 10) || 30);
	const now = Date.now();
	if (lastSendTime !== 0 && now - lastSendTime < minFrameMs - 2) { return; }
	lastSendTime = now;

	frameCount++;
	if (frameCount === 1 || now - lastLogTime >= 30000) {
		const fps = sentFrames * 1000 / Math.max(1, now - sentWindowStart);
		device.log("frame " + frameCount + " | sent " + sentFrames + " (" + fps.toFixed(1) + " FPS)" +
			" | mode=" + LightingMode);
		lastLogTime = now;
		sentFrames = 0;
		sentWindowStart = now;
	}

	const colors = new Array(LED_COUNT).fill(null);
	const forced = hexToRgb(forcedColor);

	for (const k of vKeys) {
		if (LightingMode === "Forced") {
			colors[k[0]] = forced;
		} else {
			colors[k[0]] = device.color(k[2], k[3]);
		}
	}

	sendFrame(colors);
	sentFrames++;
}

export function Shutdown(SystemSuspending) {
	const color = SystemSuspending ? [0, 0, 0] : hexToRgb(shutdownColor);
	const colors = new Array(LED_COUNT).fill(null);
	for (const k of vKeys) { colors[k[0]] = color; }

	forceFull = true;
	sendFrame(colors, CMD_CONFIG); // persistent channel so the shutdown color survives
}

// Accepts "#RRGGBB" or "RRGGBB".
function hexToRgb(hex) {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex));
	if (!m) { return [255, 255, 255]; }
	return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

let lastBlocks = {};
let forceFull = true;
let frameCount = 0;
let lastSendTime = 0;     // ms timestamp of the last frame actually sent (frame-rate throttle)
let lastLogTime = 0;      // ms timestamp of the last status log
let lastFullRefresh = 0;  // ms timestamp of the last forced full refresh
let lastWriteAt = 0;      // ms timestamp of the last block actually written (keep-alive source)
let sentFrames = 0;       // frames sent since the last status log
let sentWindowStart = 0;  // ms timestamp for the effective-FPS calculation

// Each onboard profile has its own lighting area in the keyboard memory. Observed with the web
// driver: profile 1 starts at 0x0000 and profile 3 at 0x0400 (profile 2 is inferred: 0x0200).
const PROFILE_STRIDE = 0x200;
let profileBase = 0;
let activeProfile = -1;

// colors: LED_COUNT entries of [r, g, b] (or null), indexed by the hardware LED slot.
function sendFrame(colors, cmd) {
	cmd = cmd || CMD_MUSIC;
	const buf = new Array(0x180 + 0x38).fill(0);
	for (let i = 0; i < LED_COUNT; i++) {
		const c = colors[i];
		if (!c) { continue; }
		buf[i * 3] = c[0];
		buf[i * 3 + 1] = c[1];
		buf[i * 3 + 2] = c[2];
	}

	// Air light box (slots 77..127): painted with the dedicated color, default black = off.
	const boxColor = hexToRgb(lightBoxColor);
	for (let i = 77; i < LED_COUNT; i++) {
		buf[i * 3] = boxColor[0];
		buf[i * 3 + 1] = boxColor[1];
		buf[i * 3 + 2] = boxColor[2];
	}

	// The keyboard reverts to its onboard lighting when the realtime (0xDD) channel goes idle:
	// a paused video or a black screen produces no changed blocks, the bus falls silent and the
	// stock effect (with its blue keys) bleeds through. So keep the channel alive by resending
	// the full frame whenever no block was written for 400 ms.
	const now2 = Date.now();
	const keepAlive = (now2 - lastWriteAt) > 400;
	const refresh = forceFull || keepAlive || (now2 - lastFullRefresh >= 2000);
	let wroteAny = false;

	for (const off of BLOCK_OFFSETS) {
		const addr = profileBase + off; // address inside the active profile's lighting area
		const pkt = new Array(64).fill(0);
		pkt[0] = 0x55;
		pkt[1] = cmd;
		pkt[2] = 0x00;
		pkt[4] = 0x38;
		pkt[5] = addr & 0xFF;
		pkt[6] = (addr >> 8) & 0xFF;
		pkt[7] = 0x00;
		for (let i = 0; i < 56; i++) { pkt[8 + i] = buf[off + i]; }

		let sum = 0;
		for (let i = 4; i < 64; i++) { sum += pkt[i]; }
		pkt[3] = sum & 0xFF;

		// Only resend blocks that changed (less traffic = fewer dropped blocks); full refreshes
		// repair any block the keyboard may have missed and keep the realtime channel alive.
		const sig = pkt.slice(8).join(",");
		if (!refresh && lastBlocks[addr] === sig) { continue; }

		// Leading 0x00 = report ID 0, total length 65 (the endpoint has no report ID).
		device.write([0x00].concat(pkt), 65);
		lastBlocks[addr] = sig;
		wroteAny = true;
	}
	if (wroteAny) { lastWriteAt = now2; }
	if (refresh) { lastFullRefresh = now2; }
	forceFull = false;
}

export function ImageUrl() {
	return "";
}
