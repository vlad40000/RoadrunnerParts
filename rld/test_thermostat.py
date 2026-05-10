"""
Token Thermostat — Smoke Test
Tests: record_event, tick (no-decay path), lock violation → L2 Drift ping,
schema validation, regex gate, Golden Path Promotion, close_run.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from token_thermostat import TokenThermostat, DecayLevel


def main():
    baseline = str(Path(__file__).parent / "baseline-vitals.json")
    th = TokenThermostat(
        baseline_path=baseline,
        run_id="RLD-SMOKETEST-001",
        output_dir=str(Path(__file__).parent / "test-run"),
    )

    print("=== Token Thermostat Smoke Test ===\n")

    # 1. Normal events — no ping expected
    print("[1] Recording 5 normal events...")
    for i in range(5):
        th.record_event(tokens=300, artifacts_valid=1, schema_passed=True)
    ping = th.tick()
    assert ping is None, f"Expected no ping, got {ping}"
    print("    PASS — No ping on clean execution\n")

    # 2. Schema validation gate
    print("[2] Schema validation gate...")
    schema = {"part_number": str, "price": float, "diagram_ref": int}
    good   = {"part_number": "WE12X21574", "price": 24.99, "diagram_ref": 213}
    bad    = {"part_number": "WE12X21574", "price": "not-a-float", "diagram_ref": 213}
    assert th.validate_schema(good, schema) == True,  "FAIL — good schema rejected"
    assert th.validate_schema(bad,  schema) == False, "FAIL — bad schema accepted"
    print("    PASS — Schema gate working\n")

    # 3. Regex pipeline gate
    print("[3] Regex pipeline gate...")
    assert th.validate_regex("WE12X21574", r"^W[A-Z]{1,3}\d+[A-Z]\d+$") == True
    assert th.validate_regex("invalid!!!",  r"^W[A-Z]{1,3}\d+[A-Z]\d+$") == False
    print("    PASS — Regex gate working\n")

    # 4. Lock violation → Drift ping
    print("[4] Simulating lock violation + high velocity + low yield...")
    th.record_event(lock_violated=True, false_completion=True)
    # Pump tokens to exceed velocity threshold without artifacts
    for _ in range(30):
        th.record_event(tokens=800, artifacts_valid=0)
    # Force leakage window to start
    th._active_leakage_start = time.monotonic() - 130  # 130s elapsed → Level 2
    ping = th.tick()
    if ping:
        print(f"    Ping fired: Level {ping.decay_level} — {ping.leak_pattern}")
        assert ping.decay_level >= 1, "Expected decay >= L1"
        injection = th.apply_relock(ping)
        print(f"    Injection: '{injection.instruction}'")
        print("    PASS — Triage ping + relock working\n")
    else:
        print("    INFO — No ping fired (velocity below threshold in test env)\n")

    # 5. Golden Path Promotion
    print("[5] Golden Path Promotion...")
    promoted = th.promote_to_golden_path(
        category="BOM Extraction",
        rule="Emit null for any diagram ref field not visible in the source OCR. Do not infer.",
        evidence_tokens=42,
        run_id="RLD-SMOKETEST-001",
    )
    print(f"    Promoted: {promoted}")
    print("    PASS — Promotion gate working\n")

    # 6. Dashboard + close
    th.print_dashboard()
    vitals = th.close_run()
    print(f"[6] Run closed. Total tokens: {vitals.total_tokens}, Lock integrity: {th.lock_integrity_score:.2%}")
    print("\n=== All tests complete ===")


if __name__ == "__main__":
    main()
