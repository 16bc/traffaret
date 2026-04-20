# Tʀᴀғғᴀʀᴇᴛ

Traffaret is a minimalist real-time network traffic visualizer for OpenWrt and Linux routers.

https://github.com/user-attachments/assets/dd4da7ae-1b25-4f74-8c98-2f1d6a4b1429

- **Server** — Python (`asyncio` + `websockets`), captures packets via `tcpdump`
- **Client** — plain HTML + Canvas + vanilla JS, no build step required

---

## Files

| File               | Purpose |
|--------------------|---------|
| `main.py`          | WebSocket server and packet capture |
| `config.json`      | Server configuration |
| `index.html`       | Client page |
| `client_config.js` | Client-side connection settings |
| `app.js`           | Visualization logic and UI |

---

## Requirements

| Component | Where |
|-----------|-------|
| `python3` | router / server host |
| `tcpdump` | router / server host |
| `websockets` Python package | router / server host |
| Any modern browser | client device |

Install the Python package if missing:

```bash
pip3 install websockets
```

---

## Server config (`config.json`)

```json
{
  "listen_host": "0.0.0.0",
  "ws_port": 8765,
  "interface": "br-lan",
  "central_host": "192.168.1.1",
  "layout": "circle",
  "exclude": ["127.0.0.0/8", "224.0.0.0/4"]
}
```

| Key | Description |
|-----|-------------|
| `listen_host` | Address the WebSocket server binds to |
| `ws_port` | WebSocket port |
| `interface` | Default capture interface on startup; if empty, auto-detected from the default route |
| `central_host` | Initial central node in the visualization; if empty, auto-detected from the default gateway |
| `layout` | Initial layout: `circle` or `horizontal` |
| `exclude` | List of IPs or CIDR prefixes filtered on the server before sending to browsers |

`255.255.255.255` is always ignored regardless of the `exclude` list.

If `interface` or `central_host` are left empty, the server detects them automatically from `ip route show default`.

---

## Client config (`client_config.js`)

Edit this file to point the browser at the correct WebSocket endpoint.

```js
window.APP_CONFIG = {
  WS_HOST: '192.168.0.1',   // router IP; leave empty to use location.hostname
  WS_PORT: 8765,
  WS_SCHEME: 'ws',          // use 'wss' if the page is served over HTTPS
  WS_URL: '',               // full override URL, e.g. 'wss://router/ws'; takes priority
};
```

> **LuCI / HTTPS note:** If the page is served over HTTPS, browsers block plain `ws://`.
> Either use `wss://` with a TLS-capable WebSocket endpoint, or set `WS_URL` to a path
> handled by a reverse proxy (uHTTPd / nginx).

All connection settings can also be changed at runtime in the **Settings** panel without
editing the file.

---

## Running the server

```bash
python3 main.py
```

The server reads `config.json`, starts the WebSocket listener, and launches `tcpdump` on
the configured interface. A custom config path can be supplied with `--config`:

```bash
python3 main.py --config /etc/trafaret/config.json
```

---

## Deploying to a router

1. Copy `main.py` and `config.json` to the router.
2. Copy `index.html`, `client_config.js`, and `app.js` to a directory served by LuCI / uHTTPd.
3. Edit `client_config.js` so `WS_HOST` points to the router's IP.
4. Run `python3 main.py` on the router (add to `/etc/rc.local` or an init script for autostart).

---

## UI overview

### Top bar

| Control | Function |
|---------|---------|
| `IFACE` | Select the capture interface; the server hot-restarts `tcpdump` without a Python restart |
| `CENTER` | Select the central node from hosts already seen in the visualization |
| `layout` | Toggle between `circle` and `horizontal` layouts |
| `fullscreen` | Enter / exit fullscreen mode (works on tablet Chrome) |
| `settings` | Open the runtime settings panel |

### Packet log

The **PACKET LOG** panel on the right shows recent flows.

- Click **`pause`** to freeze the log display — capture and visualization keep running.
- Click **`resume`** to unfreeze and show the current log.

### Canvas interaction

- **Click a node** to toggle hiding / showing its traffic flows.

---

## Settings panel

The **Settings** panel (top-bar button) exposes all visualization parameters at runtime.
Changes take effect immediately on **Apply** and are persisted to `localStorage`, so they
survive page reloads.

**Reset to defaults** restores the compiled-in defaults merged with `client_config.js`.

### Parameter groups

| Group | What you can tune |
|-------|------------------|
| **Connection** | `WS_HOST`, `WS_PORT`, `WS_SCHEME`, `WS_URL`, central host, default layout |
| **Lifetime** | How long flows and idle nodes are kept before removal |
| **Particles** | Count, speed, size, trail length, spawn rate |
| **Nodes** | Pulse animation, activity decay speed |
| **Node labels** | Font size for regular and center nodes, base brightness, flash boost on activity |
| **Layout** | Ring radii, jitter, Bézier curve strength |
| **Lines** | Flow track thickness and base opacity |
| **Protocol colors** | Per-protocol color pickers for TCP, UDP, DNS, TLS, HTTP, ICMP, ARP, SSH, IP |

Every parameter has a `?` tooltip with a short description.

Changing `WS_*` connection parameters triggers an automatic WebSocket reconnect.
Changing the central host sends a `set_center` command to the server in the same way as
the `CENTER` dropdown.

---

## Visualization details

### Node coloring

- Each node (except the central one) is colored according to the **last active protocol**
  observed for that host.
- Before any traffic is seen the node uses a fallback color (green for local, blue for external).
- Pulse rings and fill alpha match the node's current protocol color.

### Flow layout — `circle`

- Local hosts are placed on an inner ring.
- External hosts are placed on an outer ring.
- Nodes are evenly distributed by angle, sorted by IP.

### Flow layout — `horizontal`

- Local hosts are placed in a left column.
- External hosts are placed in a right column.
- Nodes are evenly spaced vertically, sorted by IP.
- Labels are placed on the outer side of each column.

### Particles

- The **first packet** of a new flow spawns a particle immediately so the connection is
  visible at once.
- Subsequent particles are generated proportionally to the smoothed packet rate.
- Particle size scales logarithmically with the flow's byte rate.

### Server-side filtering

- Packets matching any entry in `exclude` (IP or CIDR) are dropped before being sent to clients.
- `255.255.255.255` broadcast is always discarded.
- DNS hostnames are resolved asynchronously and sent alongside the IP address.
