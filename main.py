import argparse, asyncio, ipaddress, json, pathlib, re, socket, subprocess
import websockets

ROOT = pathlib.Path(__file__).resolve().parent
SYS_NET = pathlib.Path("/sys/class/net")
BROADCAST_IP = "255.255.255.255"

DEFAULT_CONFIG = {
    "listen_host": "0.0.0.0",
    "ws_port": 8765,
    "interface": "",
    "central_host": "",
    "layout": "circle",
    "exclude": [],
}
TCPDUMP_RE = re.compile(
    r"(\d{1,3}(?:\.\d{1,3}){3})\.?([0-9]+)?\s+>\s+(\d{1,3}(?:\.\d{1,3}){3})\.?([0-9]+)?:\s+(\w+)",
    re.IGNORECASE,
)

CLIENTS = {}
_hostname_cache = {}
_hostname_pending = set()


def default_gateway() -> tuple[str, str]:
    try:
        out = subprocess.check_output(["ip", "route", "show", "default"], text=True, timeout=2)
    except Exception:
        return "", ""
    gw = re.search(r"\bvia\s+(\d{1,3}(?:\.\d{1,3}){3})", out)
    dev = re.search(r"\bdev\s+([A-Za-z0-9._:-]+)", out)
    return (gw.group(1) if gw else "", dev.group(1) if dev else "")


def list_interfaces() -> list[str]:
    try:
        names = sorted(p.name for p in SYS_NET.iterdir() if p.is_dir())
    except OSError:
        names = []
    if not names:
        try:
            out = subprocess.check_output(["ip", "-o", "link", "show"], text=True, timeout=2)
            names = sorted({line.split(":", 2)[1].strip() for line in out.splitlines() if ":" in line})
        except Exception:
            names = []
    if "lo" in names:
        names.remove("lo")
        names.append("lo")
    return names


def pick_interface(preferred: str) -> str:
    names = list_interfaces()
    if preferred in names:
        return preferred
    for name in names:
        if name != "lo":
            return name
    return names[0] if names else ""


def load_config(path: pathlib.Path) -> dict:
    data = {}
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise SystemExit("config.json must contain a JSON object")
    cfg = DEFAULT_CONFIG | data
    gw, dev = default_gateway()
    cfg["interface"] = pick_interface(cfg["interface"] or dev)
    cfg["central_host"] = cfg["central_host"] or gw
    cfg["exclude"] = list(cfg.get("exclude") or [])
    return cfg


def runtime_config(cfg: dict) -> dict:
    interfaces = list_interfaces()
    if cfg["interface"] and cfg["interface"] not in interfaces:
        interfaces.insert(0, cfg["interface"])
    return {
        "type": "config",
        "interface": cfg["interface"],
        "interfaces": interfaces,
        "central_host": cfg["central_host"],
        "exclude": cfg["exclude"],
        "layout": cfg["layout"],
        "ws_port": cfg["ws_port"],
    }


def compile_excludes(values: list[str]) -> list[ipaddress._BaseNetwork]:
    nets = []
    for value in values:
        try:
            nets.append(ipaddress.ip_network(value, strict=False))
        except ValueError:
            print(f"skip invalid exclude: {value}")
    return nets


def is_excluded(ip: str, nets: list[ipaddress._BaseNetwork]) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in nets)


async def _resolve(ip: str):
    loop = asyncio.get_running_loop()
    try:
        result = await asyncio.wait_for(loop.run_in_executor(None, socket.gethostbyaddr, ip), timeout=3.0)
        _hostname_cache[ip] = result[0]
    except Exception:
        _hostname_cache[ip] = ip
    finally:
        _hostname_pending.discard(ip)


def hostname(ip: str) -> str:
    if ip in _hostname_cache:
        return _hostname_cache[ip]
    if ip not in _hostname_pending:
        _hostname_pending.add(ip)
        asyncio.create_task(_resolve(ip))
    return ip


async def safe_send(ws, payload: dict) -> bool:
    lock = CLIENTS.get(ws)
    if not lock:
        return False
    try:
        async with lock:
            await ws.send(json.dumps(payload, ensure_ascii=False))
        return True
    except Exception:
        CLIENTS.pop(ws, None)
        return False


async def broadcast(payload: dict):
    stale = []
    for ws in tuple(CLIENTS):
        if not await safe_send(ws, payload):
            stale.append(ws)
    for ws in stale:
        CLIENTS.pop(ws, None)


async def tcpdump_reader(cfg: dict):
    interface = cfg["interface"]
    proc = await asyncio.create_subprocess_exec(
        "tcpdump", "-l", "-n", "-q", "-i", interface,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            match = TCPDUMP_RE.search(line.decode(errors="ignore"))
            if not match:
                continue
            src, sport, dst, dport, proto = match.groups()
            if src == BROADCAST_IP or dst == BROADCAST_IP:
                continue
            if is_excluded(src, cfg["exclude_nets"]) or is_excluded(dst, cfg["exclude_nets"]):
                continue
            await broadcast({
                "src": src,
                "sport": sport or "0",
                "dst": dst,
                "dport": dport or "0",
                "proto": proto.upper(),
                "host_src": hostname(src),
                "host_dst": hostname(dst),
            })
        rc = await proc.wait()
        if rc:
            err = (await proc.stderr.read()).decode(errors="ignore").strip()
            raise RuntimeError(err or f"tcpdump exited for interface {interface}")
    except asyncio.CancelledError:
        if proc.returncode is None:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=1)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
        raise


class CaptureController:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.task = None
        self.lock = asyncio.Lock()

    async def start(self):
        await self.set_interface(self.cfg["interface"], announce=False)

    async def stop(self):
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass

    async def set_interface(self, interface: str, announce: bool = True):
        async with self.lock:
            interfaces = list_interfaces()
            if interface not in interfaces:
                raise ValueError(f"Unknown interface: {interface}")
            if interface == self.cfg["interface"] and self.task and not self.task.done():
                pass
            else:
                old_task = self.task
                self.cfg["interface"] = interface
                if old_task:
                    old_task.cancel()
                    try:
                        await old_task
                    except asyncio.CancelledError:
                        pass
                    except Exception as exc:
                        print(f"capture restart: {exc}")
                self.task = asyncio.create_task(tcpdump_reader(self.cfg))
                self.task.add_done_callback(self._task_done)
        if announce:
            await broadcast(runtime_config(self.cfg))

    async def set_center(self, host: str):
        host = host.strip()
        if not host:
            raise ValueError("Center host cannot be empty")
        self.cfg["central_host"] = host
        await broadcast(runtime_config(self.cfg))

    def _task_done(self, task: asyncio.Task):
        if task.cancelled() or task is not self.task:
            return
        exc = task.exception()
        if exc:
            print(f"capture error: {exc}")
            asyncio.create_task(broadcast({"type": "error", "error": str(exc), "interface": self.cfg["interface"]}))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Traffic visualizer server")
    parser.add_argument("--config", default=str(ROOT / "config.json"))
    return parser.parse_args()


async def main():
    args = parse_args()
    cfg = load_config(pathlib.Path(args.config))
    if not cfg["interface"]:
        raise SystemExit("No network interfaces found")
    cfg["exclude_nets"] = compile_excludes(cfg["exclude"])
    print(f"ws://{cfg['listen_host']}:{cfg['ws_port']}  if={cfg['interface']}  center={cfg['central_host'] or '-'}")
    controller = CaptureController(cfg)
    await controller.start()

    async def handler(ws):
        CLIENTS[ws] = asyncio.Lock()
        try:
            await safe_send(ws, runtime_config(cfg))
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if msg.get("type") == "get_config":
                    await safe_send(ws, runtime_config(cfg))
                if msg.get("type") == "set_interface":
                    try:
                        await controller.set_interface(str(msg.get("interface", "")).strip())
                    except ValueError as exc:
                        await safe_send(ws, {"type": "error", "error": str(exc)})
                if msg.get("type") == "set_center":
                    try:
                        await controller.set_center(str(msg.get("host", "")))
                    except ValueError as exc:
                        await safe_send(ws, {"type": "error", "error": str(exc)})
        finally:
            CLIENTS.pop(ws, None)

    ws_server = await websockets.serve(handler, cfg["listen_host"], cfg["ws_port"])
    try:
        await ws_server.wait_closed()
    finally:
        await controller.stop()


asyncio.run(main())