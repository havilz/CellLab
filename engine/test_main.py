import unittest

from engine.main import handle, simulate


ITEMS = [
    {"key": "glukosa", "conc": 5.0},
    {"key": "atp", "conc": 3.2},
    {"key": "aa", "conc": 0.1},
    {"key": "hk", "conc": 0.02},
    {"key": "cox", "conc": 0.01},
    {"key": "glut", "conc": 0.01},
]


class MathEngineTests(unittest.TestCase):
    def test_control_shape_and_initial_state(self) -> None:
        result = simulate([(item["key"], item["conc"]) for item in ITEMS], None)

        self.assertEqual(len(result["t"]), 601)
        self.assertEqual(result["t"][-1], 300.0)
        self.assertEqual(result["species"]["G"][0], 5.0)
        self.assertEqual(result["species"]["G6P"][0], 0.0)
        self.assertEqual(result["species"]["ATP"][0], 3.2)
        self.assertEqual(result["species"]["ADP"][0], 0.8)
        self.assertEqual(result["species"]["Pyr"][0], 0.0)
        self.assertEqual(result["species"]["AA"][0], 0.1)
        self.assertEqual(result["species"]["PGE2"][0], 0.0)

    def test_json_rpc_simulate_returns_contract(self) -> None:
        message = handle(
            {
                "jsonrpc": "2.0",
                "id": "test",
                "method": "simulate",
                "params": {"items": ITEMS, "drug": None},
            }
        )

        self.assertNotIn("error", message)
        self.assertEqual(message["result"]["t"][0], 0.0)
        self.assertEqual(
            set(message["result"]["species"]),
            {"G", "G6P", "ATP", "ADP", "Pyr", "AA", "PGE2"},
        )

    def test_simulation_is_deterministic(self) -> None:
        items = [(item["key"], item["conc"]) for item in ITEMS]
        drug = {"target": "cox", "ki": 0.1, "conc": 0.1, "t0": 60.0, "mode": "bolus"}

        self.assertEqual(simulate(items, drug), simulate(items, drug))

    def test_invalid_empty_items_returns_invalid_params(self) -> None:
        message = handle(
            {
                "jsonrpc": "2.0",
                "id": "invalid",
                "method": "simulate",
                "params": {"items": [], "drug": None},
            }
        )

        self.assertEqual(message["error"]["code"], -32602)


if __name__ == "__main__":
    unittest.main()
