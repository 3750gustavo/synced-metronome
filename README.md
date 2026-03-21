# Synced Metronome (Fork)

Real-time room-based metronome where one host controls tempo and playback for everyone else, now extended in this fork with synchronized local video playback.

## What is unique in this fork

- Host-selected video playback synced to all clients in a room.
- Server-side video discovery from configurable local folders.
- Video selection modal on host page with directory/video browsing UI.
- Latency-aware playback updates (`play`, `pause`, `seek`) and periodic drift correction on clients.
- Local helper tool to manage video source folders:
	- `tools/use_me_to_select_video_paths.py`
- Privacy-oriented defaults:
	- `config/video_paths.json` is gitignored.
	- `tmp/` is gitignored.
	- `.dist` is gitignored.

## Current feature set

- Room creation/join flow via Socket.IO.
- Host controls BPM and start/stop metronome.
- Timesync-based clock alignment between host and clients.
- Video streaming endpoint with range requests for smooth playback.
- Video control events relayed through server with timestamps for sync correction.

## Tech stack

- Node.js + Express
- Socket.IO
- Timesync
- Tone.js / Sound-based metronome logic in frontend
- Plain HTML/CSS/JS frontend pages

## Project structure

- `server.js`: Express + Socket.IO server, room/events logic, video streaming route.
- `pages/server_met.html`: Host UI (metronome + video selection + playback control).
- `pages/user_met.html`: Client UI (join room + synced metronome/video playback).
- `js/server_met.js`: Host-side metronome and video control emitters.
- `js/user_met.js`: Client-side metronome updates and video sync adjustments.
- `tools/use_me_to_select_video_paths.py`: GUI utility to define video directories.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure video directories

Create `config/video_paths.json` with this shape:

```json
{
	"paths": [
		"D:/Videos",
		"E:/PracticeClips"
	]
}
```

Notes:
- Paths are read by the server and scanned recursively.
- Supported video extensions: `.mp4`, `.webm`, `.mkv`.
- This file is intentionally ignored by git.

Optional helper:

```bash
python tools/use_me_to_select_video_paths.py
```

### 3. Run the app

```bash
node server.js
```

Default port is `3000` unless `PORT` is set.

## How to use

1. Open `/` and click **Start Lobby** on one device (host).
2. Share the generated room code.
3. Other devices open `/` and click **Join Lobby**, then enter code.
4. Host sets BPM and starts/stops metronome for the room.
5. Host clicks **Select Video**, picks a file, and controls playback.
6. Clients follow host playback and receive periodic sync correction.

## Notes and caveats

- Video files are streamed from paths configured on the server machine.
- For remote users, server machine must have access to those files.
- Current sync model is practical and latency-aware, but not frame-perfect.
- Node engine in `package.json` is set to `16.14.2`.

## Original project

Based on the Synced Metronome concept (`metruhnome.com`) and extended in this fork with synchronized video workflow and local media library tooling.
