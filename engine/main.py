"""CellLab scientific math engine.

The process accepts one JSON-RPC request per stdin line and writes one response
per stdout line. Keep stdout reserved for protocol messages.
"""

from __future__ import annotations

import json
import math
import platform
import sys
from typing import Any

DT = 0.1
T_MAX = 300.0
SAMPLE_EVERY = 5
K_ELIM = 0.01
ADP_START = 0.8
AA_SUPPLY = 0.025
SPECIES = ("G", "G6P", "ATP", "ADP", "Pyr", "AA", "PGE2")
TARGETS = {"hk", "cox"}
MODES = {"konstan", "bolus"}


def rpc_response(request_id: Any, result: Any = None, error: dict[str, Any] | None = None) -> dict[str, Any]:
    message: dict[str, Any] = {"jsonrpc": "2.0", "id": request_id}
    if error is None:
        message["result"] = result
    else:
        message["error"] = error
    return message


def rpc_error(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return rpc_response(request_id, error={"code": code, "message": message})


def _number(value: Any, field: str, *, minimum: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{field} must be a finite number")
    number = float(value)
    if minimum is not None and number < minimum:
        raise ValueError(f"{field} must be >= {minimum:g}")
    return number


def _items(params: dict[str, Any]) -> list[tuple[str, float]]:
    raw_items = params.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise ValueError("params.items array must not be empty")

    items: list[tuple[str, float]] = []
    for index, raw_item in enumerate(raw_items):
        if not isinstance(raw_item, dict):
            raise ValueError(f"params.items[{index}] must be an object")
        key = raw_item.get("key")
        if not isinstance(key, str) or not key:
            raise ValueError(f"params.items[{index}].key must be a non-empty string")
        items.append((key, _number(raw_item.get("conc"), f"params.items[{index}].conc", minimum=0.0)))
    return items


def _drug(params: dict[str, Any]) -> dict[str, Any] | None:
    raw_drug = params.get("drug")
    if raw_drug is None:
        return None
    if not isinstance(raw_drug, dict):
        raise ValueError("params.drug must be null or an object")

    target = raw_drug.get("target")
    if target not in TARGETS:
        raise ValueError("params.drug.target must be 'hk' or 'cox'")
    mode = raw_drug.get("mode")
    if mode not in MODES:
        raise ValueError("params.drug.mode must be 'konstan' or 'bolus'")
    ki = _number(raw_drug.get("ki"), "params.drug.ki", minimum=0.0)
    if ki == 0.0:
        raise ValueError("params.drug.ki must be > 0")
    return {
        "target": target,
        "ki": ki,
        "conc": _number(raw_drug.get("conc"), "params.drug.conc", minimum=0.0),
        "t0": _number(raw_drug.get("t0"), "params.drug.t0", minimum=0.0),
        "mode": mode,
    }


def _get(items: list[tuple[str, float]], key: str) -> float | None:
    # Match the prototype's first matching item behavior.
    for item_key, concentration in items:
        if item_key == key:
            return concentration
    return None


def _inhibition(time: float, drug: dict[str, Any] | None, target: str) -> float:
    if drug is None or drug["target"] != target or time < drug["t0"]:
        return 1.0
    concentration = drug["conc"]
    if drug["mode"] == "bolus":
        concentration *= math.exp(-K_ELIM * (time - drug["t0"]))
    return 1.0 / (1.0 + concentration / drug["ki"])


def _derivatives(
    time: float,
    state: list[float],
    glucose_external: float,
    hexokinase: float,
    cox2: float,
    glut1: float,
    aa_supply: float,
    drug: dict[str, Any] | None,
) -> list[float]:
    glucose, g6p, atp, adp, _pyr, aa, pge2 = state
    vin = 0.05 * (glut1 / 0.01) * (glucose_external - glucose)
    vhk = (
        5.0
        * hexokinase
        * (glucose / (0.1 + glucose))
        * (atp / (0.5 + atp))
        * _inhibition(time, drug, "hk")
    )
    vgl = 0.5 * g6p * (adp / (0.2 + adp))
    vatp = 0.03 * atp
    vcox = 3.0 * cox2 * (aa / (0.05 + aa)) * _inhibition(time, drug, "cox")
    vpge = 0.05 * pge2
    return [
        vin - vhk,
        vhk - vgl,
        -vhk + 2.0 * vgl - vatp,
        vhk - 2.0 * vgl + vatp,
        vgl,
        aa_supply - vcox,
        vcox - vpge,
    ]


def _rk4_step(
    time: float,
    state: list[float],
    drug: dict[str, Any] | None,
    glucose_external: float,
    hexokinase: float,
    cox2: float,
    glut1: float,
    aa_supply: float,
) -> list[float]:
    def f(at: float, current: list[float]) -> list[float]:
        return _derivatives(at, current, glucose_external, hexokinase, cox2, glut1, aa_supply, drug)

    k1 = f(time, state)
    half_state = [value + (DT / 2.0) * slope for value, slope in zip(state, k1)]
    k2 = f(time + DT / 2.0, half_state)
    half_state = [value + (DT / 2.0) * slope for value, slope in zip(state, k2)]
    k3 = f(time + DT / 2.0, half_state)
    end_state = [value + DT * slope for value, slope in zip(state, k3)]
    k4 = f(time + DT, end_state)
    return [
        max(0.0, value + (DT / 6.0) * (a + 2.0 * b + 2.0 * c + d))
        for value, a, b, c, d in zip(state, k1, k2, k3, k4)
    ]


def simulate(items: list[tuple[str, float]], drug: dict[str, Any] | None) -> dict[str, Any]:
    glucose_conc = _get(items, "glukosa")
    atp_conc = _get(items, "atp")
    aa_conc = _get(items, "aa")
    glucose_external = 0.0 if glucose_conc is None else glucose_conc
    hexokinase = _get(items, "hk") or 0.0
    cox2 = _get(items, "cox") or 0.0
    glut1 = _get(items, "glut") or 0.0
    atp_initial = 0.0 if atp_conc is None else atp_conc
    adp_initial = 0.0 if atp_conc is None else ADP_START
    aa_supply = 0.0 if aa_conc is None else AA_SUPPLY
    state = [glucose_external, 0.0, atp_initial, adp_initial, 0.0, aa_conc or 0.0, 0.0]

    result = {"t": [], "species": {key: [] for key in SPECIES}}

    def record(time: float) -> None:
        result["t"].append(round(time, 2))
        for key, value in zip(SPECIES, state):
            result["species"][key].append(value)

    record(0.0)
    for step in range(1, round(T_MAX / DT) + 1):
        state = _rk4_step(
            (step - 1) * DT,
            state,
            drug,
            glucose_external,
            hexokinase,
            cox2,
            glut1,
            aa_supply,
        )
        if step % SAMPLE_EVERY == 0:
            record(step * DT)
    return result


def handle(request: dict[str, Any]) -> dict[str, Any]:
    request_id = request.get("id")
    if request.get("jsonrpc") != "2.0":
        return rpc_error(request_id, -32600, "Invalid JSON-RPC request")

    method = request.get("method")
    if method == "health":
        return rpc_response(
            request_id,
            result={
                "status": "ok",
                "engine": "celllab-python",
                "python_version": platform.python_version(),
            },
        )
    if method != "simulate":
        return rpc_error(request_id, -32601, "Method not found")

    params = request.get("params")
    if not isinstance(params, dict):
        return rpc_error(request_id, -32602, "Invalid params: params must be an object")
    try:
        items = _items(params)
        drug = _drug(params)
        return rpc_response(request_id, result=simulate(items, drug))
    except ValueError as error:
        return rpc_error(request_id, -32602, f"Invalid params: {error}")


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("Request must be a JSON object")
            message = handle(request)
        except (json.JSONDecodeError, ValueError) as error:
            message = rpc_error(None, -32700, str(error))

        sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
