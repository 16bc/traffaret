#!/usr/bin/env python3

import argparse, asyncio, collections, ipaddress, json, pathlib, re, signal, socket, subprocess, time
import websockets

ROOT = pathlib.Path(__file__).resolve().parent
SYS_NET = pathlib.Path("/sys/class/net")
BROADCAST_IP = "255.255.255.255"
FLUSH_INTERVAL = 0.03  # интервал накопления пакетов перед отправкой (сек)
CAPTURE_RESTART_DELAY = 2.0  # пауза перед перезапуском упавшего tcpdump (сек)

DEFAULT_CONFIG = {
    "listen_host": "0.0.0.0",
    "ws_port": 8765,
    "interface": "",
    "central_host": "",
    "layout": "circle",
    "exclude": [],
}
TCPDUMP_RE = re.compile(
    r"(\d{1,3}(?:\.\d{1,3}){3})\.?([0-9]+)?\s+>\s+(\d{1,3}(?:\.\d{1,3}){3})\.?([0-9]+)?:\s+(\w+)"
    r"(?:\s+(\d+)|.*?\blength\s+(\d+))?",
    re.IGNORECASE,
)

CLIENTS = {}
_HOSTNAME_CACHE_MAX = 1000
_hostname_cache = collections.OrderedDict()
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
    result = {
        "type": "config",
        "interface": cfg["interface"],
        "interfaces": interfaces,
        "exclude": cfg["exclude"],
        "layout": cfg["layout"],
        "ws_port": cfg["ws_port"],
    }
    if cfg["central_host"]:
        result["central_host"] = cfg["central_host"]
    return result


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


HOST_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,252}[A-Za-z0-9])?$")


def validate_center_host(host: str) -> str:
    """Проверка центрального хоста: валидный IP или hostname без HTML-спецсимволов"""
    host = host.strip()
    if not host:
        raise ValueError("Center host cannot be empty")
    if len(host) > 253:
        raise ValueError("Center host is too long")
    if any(ch in host for ch in "<>&\"'"):
        raise ValueError("Center host contains invalid characters")
    try:
        ipaddress.ip_address(host)
        return host
    except ValueError:
        pass
    if not HOST_RE.match(host):
        raise ValueError("Center host must be a valid IP or hostname")
    return host


async def _resolve(ip: str):
    loop = asyncio.get_running_loop()
    value = ip
    try:
        result = await asyncio.wait_for(loop.run_in_executor(None, socket.gethostbyaddr, ip), timeout=3.0)
        value = result[0]
    except Exception:
        value = ip
    finally:
        _hostname_pending.discard(ip)
    _cache_set(ip, value)


def _cache_set(ip: str, value: str):
    _hostname_cache.pop(ip, None)
    _hostname_cache[ip] = value
    while len(_hostname_cache) > _HOSTNAME_CACHE_MAX:
        _hostname_cache.popitem(last=False)


def hostname(ip: str) -> str:
    if ip in _hostname_cache:
        _hostname_cache.move_to_end(ip)
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
    # safe_send сам удаляет мёртвый сокет из CLIENTS при ошибке отправки
    for ws in tuple(CLIENTS):
        await safe_send(ws, payload)


async def tcpdump_reader(cfg: dict):
    interface = cfg["interface"]
    proc = await asyncio.create_subprocess_exec(
        "tcpdump", "-l", "-n", "-q", "-i", interface,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    batch = []
    last_flush = time.monotonic()

    async def flush():
        nonlocal last_flush
        if batch:
            # Отправляем накопленные пакеты одним сообщением-массивом
            await broadcast({"packets": batch})
            batch.clear()
        last_flush = time.monotonic()

    try:
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            match = TCPDUMP_RE.search(line.decode(errors="ignore"))
            if not match:
                continue
            src, sport, dst, dport, proto, tcp_len, pkt_len = match.groups()
            if src == BROADCAST_IP or dst == BROADCAST_IP:
                continue
            if is_excluded(src, cfg["exclude_nets"]) or is_excluded(dst, cfg["exclude_nets"]):
                continue
            batch.append({
                "src": src,
                "sport": sport or "0",
                "dst": dst,
                "dport": dport or "0",
                "proto": proto.upper(),
                "len": int(pkt_len or tcp_len or 0),
                "host_src": hostname(src),
                "host_dst": hostname(dst),
            })
            if time.monotonic() - last_flush >= FLUSH_INTERVAL:
                await flush()
        await flush()
        rc = await proc.wait()
        if rc:
            raise RuntimeError(f"tcpdump exited with code {rc} for interface {interface}")
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
        self.wanted = False  # должен ли сейчас идти захват (есть хотя бы один клиент)

    async def start(self):
        # При старте сервера захват не запускается: он включается при подключении клиента
        await self.set_interface(self.cfg["interface"], announce=False)

    async def stop(self):
        await self.set_wanted(False)

    async def set_wanted(self, wanted: bool):
        """Включает или выключает захват пакетов в зависимости от наличия клиентов"""
        async with self.lock:
            if wanted == self.wanted:
                return
            self.wanted = wanted
            if wanted:
                self._spawn()
            else:
                await self._cancel()

    def _spawn(self):
        if self.task and not self.task.done():
            return
        self.task = asyncio.create_task(tcpdump_reader(self.cfg))
        self.task.add_done_callback(self._task_done)

    async def _cancel(self):
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                print(f"capture restart: {exc}")
        self.task = None

    async def set_interface(self, interface: str, announce: bool = True):
        async with self.lock:
            interfaces = list_interfaces()
            if interface not in interfaces:
                raise ValueError(f"Unknown interface: {interface}")
            if interface == self.cfg["interface"]:
                # Интерфейс не менялся: перезапускаем только если задача неожиданно завершилась
                if self.wanted and (not self.task or self.task.done()):
                    self._spawn()
            else:
                self.cfg["interface"] = interface
                if self.wanted:
                    await self._cancel()
                    self._spawn()
        if announce:
            await broadcast(runtime_config(self.cfg))

    async def set_center(self, host: str):
        host = validate_center_host(host)
        self.cfg["central_host"] = host
        await broadcast(runtime_config(self.cfg))

    async def _restart_after(self, delay: float):
        await asyncio.sleep(delay)
        async with self.lock:
            if self.wanted:
                self._spawn()

    def _task_done(self, task: asyncio.Task):
        if task.cancelled() or task is not self.task:
            return
        exc = task.exception()
        if exc:
            print(f"capture error: {exc}")
            asyncio.create_task(broadcast({"type": "error", "error": str(exc), "interface": self.cfg["interface"]}))
            if self.wanted:
                # Захват всё ещё нужен клиентам — перезапускаем tcpdump после паузы
                asyncio.create_task(self._restart_after(CAPTURE_RESTART_DELAY))


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
            # Захват пакетов нужен только при наличии хотя бы одного клиента
            await controller.set_wanted(True)
            await safe_send(ws, runtime_config(cfg))
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if not isinstance(msg, dict):
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
            if not CLIENTS:
                # Последний клиент отключился — останавливаем захват, чтобы не грузить CPU вхолостую
                await controller.set_wanted(False)

    ws_server = await websockets.serve(
        handler, cfg["listen_host"], cfg["ws_port"],
        ping_interval=20,
        ping_timeout=20,
    )

    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def _request_stop():
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_stop)
        except NotImplementedError:
            # Платформа не поддерживает add_signal_handler (например, Windows)
            pass

    try:
        await stop_event.wait()
    finally:
        ws_server.close()
        await ws_server.wait_closed()
        await controller.stop()


asyncio.run(main())