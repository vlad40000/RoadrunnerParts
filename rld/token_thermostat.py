"""
Token Thermostat — RLD Orchestration Model
==========================================
Runtime instability sensor implementing the Reference-Lock-Delta framework.

Monitors Token Velocity vs. Useful Yield, fires Triage Pings at decay thresholds,
issues Ambient Injections, executes Relock Protocol, and promotes Golden Path rules
to promoted-rules.md.

Usage:
    from token_thermostat import TokenThermostat
    thermostat = TokenThermostat(baseline_path="rld/baseline-vitals.json")
    thermostat.record_event(tokens=450, artifacts=1)
    thermostat.tick()
"""

import json
import csv
import time
import re
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional
from enum import IntEnum


# ---------------------------------------------------------------------------
# Constants — map to RLD spec multipliers
# ---------------------------------------------------------------------------
FRICTION_VELOCITY_MULTIPLIER  = 1.20   # >120% baseline velocity
FRICTION_YIELD_MULTIPLIER     = 0.50   # <50%  baseline yield
FRICTION_WINDOW_SECONDS       = 90
DRIFT_WINDOW_SECONDS          = 120
DRIFT_REPEATED_TOOL_THRESHOLD = 3
TERMINAL_LOOP_THRESHOLD       = 5      # same output hash N times = loop
GOLDEN_PATH_MAX_TOKENS        = 200    # RLD spec: < 200 tokens to qualify
SHARD_REPO                    = Path(__file__).parent.parent / "promoted-rules.md"


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

class DecayLevel(IntEnum):
    OK       = 0
    FRICTION = 1   # Level 1 — hesitation, overexplanation
    DRIFT    = 2   # Level 2 — wrong path, lock violation
    TERMINAL = 3   # Level 3 — loop / false completion / invented data


@dataclass
class RunVitals:
    """32-field baseline-vitals.json schema (RLD spec §Baseline Snapshot)."""
    run_id:                     str  = ""
    condition:                  str  = "active_rld"
    task_type:                  str  = ""
    model:                      str  = ""
    reference_id:               str  = ""
    lock_manifest_id:           str  = ""
    delta_brief_id:             str  = ""
    start_time:                 str  = ""
    end_time:                   str  = ""
    runtime_seconds:            float = 0.0
    total_tokens:               int  = 0
    input_tokens:               int  = 0
    output_tokens:              int  = 0
    estimated_reasoning_tokens: int  = 0
    tool_call_count:            int  = 0
    retry_count:                int  = 0
    loop_count:                 int  = 0
    error_count:                int  = 0
    terminal_decay_count:       int  = 0
    valid_artifact_count:       int  = 0
    invalid_artifact_count:     int  = 0
    partial_artifact_count:     int  = 0
    schema_pass_count:          int  = 0
    schema_fail_count:          int  = 0
    lock_violation_count:       int  = 0
    scope_drift_count:          int  = 0
    unsupported_claim_count:    int  = 0
    false_completion_count:     int  = 0
    level_1_friction_count:     int  = 0
    level_2_drift_count:        int  = 0
    level_3_terminal_decay_count: int = 0
    human_intervention_count:   int  = 0
    human_monitoring_minutes:   float = 0.0
    human_repair_minutes:       float = 0.0
    accepted:                   bool = False
    notes:                      str  = ""


@dataclass
class TriagePing:
    ping_id:            str
    run_id:             str
    decay_level:        int
    leak_pattern:       str
    evidence:           dict
    suggested_action:   str
    suggested_injection: str
    timestamp:          str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class AmbientInjection:
    type:            str = "ambient_injection"
    target:          str = "lock"
    decay_level:     int = 0
    leak_pattern:    str = ""
    instruction:     str = ""
    expected_effect: str = ""
    timestamp:       str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class MessageBusEvent:
    run_id:           str
    phase:            str
    reference_id:     str
    lock_id:          str
    delta_type:       str
    event:            str
    decay_level:      int
    token_velocity:   str
    yield_rate:       str
    leak_pattern:     str
    ambient_injection: str
    relock_applied:   bool
    result:           str
    promote_candidate: bool
    timestamp:        str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ---------------------------------------------------------------------------
# Token Thermostat
# ---------------------------------------------------------------------------

class TokenThermostat:
    """
    Runtime instability sensor for the RLD Orchestration Model.

    Args:
        baseline_path: Path to a baseline-vitals.json produced by a Baseline Run.
                       If None, conservative hardcoded defaults are used until
                       a real baseline is established.
        run_id:        Unique identifier for this execution run.
        output_dir:    Directory to write messagebus.jsonl and run-log.csv.
    """

    def __init__(
        self,
        baseline_path: Optional[str] = None,
        run_id: Optional[str] = None,
        output_dir: Optional[str] = None,
        reference_id: str = "reference-v1",
        lock_id: str = "lock-v1",
        delta_type: str = "structured_extraction",
        phase: str = "active_rld",
    ):
        self.run_id       = run_id or f"RLD-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
        self.reference_id = reference_id
        self.lock_id      = lock_id
        self.delta_type   = delta_type
        self.phase        = phase
        self.output_dir   = Path(output_dir) if output_dir else Path(__file__).parent / "rld"
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # --- Load baseline ---
        self._baseline = self._load_baseline(baseline_path)
        self._baseline_velocity = self._baseline.get("tokens_per_minute", 9000)
        self._baseline_yield    = self._baseline.get("valid_artifacts_per_minute", 3)

        # --- Live vitals ---
        self.vitals = RunVitals(
            run_id=self.run_id,
            reference_id=reference_id,
            lock_manifest_id=lock_id,
            start_time=datetime.now(timezone.utc).isoformat(),
        )

        # --- Internal state ---
        self._window_tokens:    list[tuple[float, int]] = []   # (timestamp, token_count)
        self._window_artifacts: list[tuple[float, int]] = []   # (timestamp, artifact_count)
        self._tool_call_hashes: list[str] = []
        self._output_hashes:    list[str] = []
        self._current_decay:    DecayLevel = DecayLevel.OK
        self._ping_counter:     int = 0
        self._active_leakage_start: Optional[float] = None
        self._messagebus_path = self.output_dir / "messagebus.jsonl"
        self._runlog_path     = self.output_dir / "run-log.csv"

        self._ensure_runlog_header()

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def record_event(
        self,
        tokens: int = 0,
        input_tokens: int = 0,
        output_tokens: int = 0,
        reasoning_tokens: int = 0,
        artifacts_valid: int = 0,
        artifacts_invalid: int = 0,
        artifacts_partial: int = 0,
        schema_passed: bool = False,
        schema_failed: bool = False,
        tool_call_hash: Optional[str] = None,
        output_hash: Optional[str] = None,
        lock_violated: bool = False,
        scope_drifted: bool = False,
        unsupported_claim: bool = False,
        false_completion: bool = False,
        invented_field: bool = False,
        retry: bool = False,
        error: bool = False,
    ) -> None:
        """Record a single execution event and update live vitals."""
        now = time.monotonic()
        ts  = datetime.now(timezone.utc).isoformat()

        # Token tracking
        self.vitals.total_tokens               += tokens
        self.vitals.input_tokens               += input_tokens
        self.vitals.output_tokens              += output_tokens
        self.vitals.estimated_reasoning_tokens += reasoning_tokens
        self._window_tokens.append((now, tokens))

        # Artifact tracking
        self.vitals.valid_artifact_count   += artifacts_valid
        self.vitals.invalid_artifact_count += artifacts_invalid
        self.vitals.partial_artifact_count += artifacts_partial
        self._window_artifacts.append((now, artifacts_valid))

        # Schema
        if schema_passed: self.vitals.schema_pass_count += 1
        if schema_failed: self.vitals.schema_fail_count += 1

        # Lock integrity
        if lock_violated:
            self.vitals.lock_violation_count += 1
        if scope_drifted:
            self.vitals.scope_drift_count += 1
        if unsupported_claim:
            self.vitals.unsupported_claim_count += 1
        if false_completion:
            self.vitals.false_completion_count += 1

        # Tool call repeat detection
        if tool_call_hash:
            self.vitals.tool_call_count += 1
            self._tool_call_hashes.append(tool_call_hash)

        # Output loop detection
        if output_hash:
            self._output_hashes.append(output_hash)

        # Misc
        if retry: self.vitals.retry_count += 1
        if error: self.vitals.error_count += 1

    def record_human_intervention(
        self,
        monitoring_minutes: float = 0.0,
        repair_minutes: float = 0.0,
    ) -> None:
        self.vitals.human_intervention_count += 1
        self.vitals.human_monitoring_minutes += monitoring_minutes
        self.vitals.human_repair_minutes     += repair_minutes

    def tick(self) -> Optional[TriagePing]:
        """
        Evaluate current vitals against thresholds.
        Call once per second or after each agent action.

        Returns a TriagePing if a decay level is detected, else None.
        """
        now     = time.monotonic()
        velocity = self._token_velocity(now)
        yield_r  = self._useful_yield_rate(now)
        decay    = self._evaluate_decay(now, velocity, yield_r)

        if decay == DecayLevel.OK:
            self._active_leakage_start = None
            self._current_decay = DecayLevel.OK
            return None

        # Escalate
        if decay > self._current_decay:
            self._current_decay = decay

        ping = self._fire_ping(decay, velocity, yield_r)
        self._log_to_messagebus(ping, velocity, yield_r)

        if decay == DecayLevel.TERMINAL:
            self.vitals.level_3_terminal_decay_count += 1
            self.vitals.terminal_decay_count         += 1
        elif decay == DecayLevel.DRIFT:
            self.vitals.level_2_drift_count += 1
        elif decay == DecayLevel.FRICTION:
            self.vitals.level_1_friction_count += 1

        return ping

    def apply_relock(self, ping: TriagePing) -> AmbientInjection:
        """
        Execute the 8-step Relock Protocol and return the Ambient Injection applied.
        """
        injection = self._select_injection(ping)

        event = MessageBusEvent(
            run_id=self.run_id,
            phase=self.phase,
            reference_id=self.reference_id,
            lock_id=self.lock_id,
            delta_type=self.delta_type,
            event="relock_applied",
            decay_level=ping.decay_level,
            token_velocity=f"above_baseline_{int((self._current_velocity_ratio()-1)*100)}_percent",
            yield_rate=ping.evidence.get("valid_yield", "unknown"),
            leak_pattern=ping.leak_pattern,
            ambient_injection=injection.instruction,
            relock_applied=True,
            result="relock_executed_awaiting_yield",
            promote_candidate=False,
        )
        self._append_messagebus(asdict(event))

        # Reset leakage window after relock
        self._active_leakage_start = None
        self._current_decay = DecayLevel.OK
        self._window_tokens.clear()
        self._window_artifacts.clear()

        return injection

    def validate_schema(self, data: dict, schema: dict) -> bool:
        """
        Deterministic schema gate. Returns True (yield +1) if all required
        fields are present and match declared types.
        """
        errors = []
        for field_name, field_type in schema.items():
            if field_name not in data:
                errors.append(f"missing_field:{field_name}")
                continue
            if not isinstance(data[field_name], field_type):
                errors.append(f"wrong_type:{field_name}")

        passed = len(errors) == 0
        self.record_event(
            artifacts_valid=1 if passed else 0,
            artifacts_invalid=0 if passed else 1,
            schema_passed=passed,
            schema_failed=not passed,
        )
        return passed

    def validate_regex(self, value: str, pattern: str, field_name: str = "") -> bool:
        """Regex pipeline gate. Counts as yield if passes."""
        passed = bool(re.match(pattern, value))
        self.record_event(
            artifacts_valid=1 if passed else 0,
            artifacts_invalid=0 if passed else 1,
        )
        return passed

    def promote_to_golden_path(
        self,
        category: str,
        rule: str,
        evidence_tokens: int,
        run_id: Optional[str] = None,
    ) -> bool:
        """
        Attempt Golden Path Promotion.
        Rule must be < 200 tokens (RLD spec). Appends to promoted-rules.md.
        Returns True if promoted, False if rejected.
        """
        if evidence_tokens > GOLDEN_PATH_MAX_TOKENS:
            return False

        shard_line = f"[SHARD: {category}] {rule}"
        log_row    = f"| {datetime.now(timezone.utc).strftime('%Y-%m-%d')} | {category} | {rule[:60]}... | Token Thermostat — {run_id or self.run_id} |"

        if not SHARD_REPO.exists():
            return False

        content = SHARD_REPO.read_text(encoding="utf-8")

        # Idempotency check — don't duplicate
        if rule in content:
            return False

        # Insert into Active Shards section
        marker = "## Active Shards"
        if marker in content:
            insert_pos = content.index(marker) + len(marker)
            content = content[:insert_pos] + f"\n\n{shard_line}" + content[insert_pos:]
        else:
            content += f"\n\n{shard_line}\n"

        # Append to promotion log
        log_marker = "## Shard Promotion Log"
        if log_marker in content:
            table_end = content.rindex("|", content.index(log_marker))
            content = content[:table_end+1] + f"\n{log_row}" + content[table_end+1:]

        SHARD_REPO.write_text(content, encoding="utf-8")
        return True

    def close_run(self) -> RunVitals:
        """Finalize vitals, write run-log.csv entry, return completed vitals."""
        self.vitals.end_time = datetime.now(timezone.utc).isoformat()
        start = datetime.fromisoformat(self.vitals.start_time)
        end   = datetime.fromisoformat(self.vitals.end_time)
        self.vitals.runtime_seconds = (end - start).total_seconds()

        self._append_runlog()
        vitals_path = self.output_dir / f"{self.run_id}-vitals.json"
        vitals_path.write_text(
            json.dumps(asdict(self.vitals), indent=2),
            encoding="utf-8",
        )
        return self.vitals

    # -----------------------------------------------------------------------
    # Derived metrics (public read-only)
    # -----------------------------------------------------------------------

    @property
    def token_velocity(self) -> float:
        """Tokens/minute over last 60s."""
        return self._token_velocity(time.monotonic())

    @property
    def useful_yield_efficiency(self) -> float:
        """valid_artifacts / total_tokens (zero-safe)."""
        if self.vitals.total_tokens == 0:
            return 0.0
        return self.vitals.valid_artifact_count / self.vitals.total_tokens

    @property
    def lock_integrity_score(self) -> float:
        """1 - (lock_violations / total_delta_events)."""
        total = (
            self.vitals.valid_artifact_count
            + self.vitals.invalid_artifact_count
            + self.vitals.lock_violation_count
        )
        if total == 0:
            return 1.0
        return 1.0 - (self.vitals.lock_violation_count / total)

    @property
    def stochastic_leakage_ratio(self) -> float:
        """Tokens burned during leakage / total_tokens."""
        if self.vitals.total_tokens == 0:
            return 0.0
        leakage_tokens = (
            self.vitals.level_1_friction_count
            + self.vitals.level_2_drift_count
            + self.vitals.level_3_terminal_decay_count
        ) * (self._baseline_velocity / 60)  # est. tokens per decay event
        return min(leakage_tokens / self.vitals.total_tokens, 1.0)

    def print_dashboard(self) -> None:
        """Print a concise status dashboard to stdout."""
        v = self.vitals
        print(f"\n{'='*55}")
        print(f"  Token Thermostat — Run: {self.run_id}")
        print(f"{'='*55}")
        print(f"  Decay Level       : {self._current_decay.name}")
        print(f"  Token Velocity    : {self.token_velocity:,.0f} tok/min")
        print(f"  Lock Integrity    : {self.lock_integrity_score:.2%}")
        print(f"  Leakage Ratio     : {self.stochastic_leakage_ratio:.2%}")
        print(f"  Valid Artifacts   : {v.valid_artifact_count}")
        print(f"  Lock Violations   : {v.lock_violation_count}")
        print(f"  L1 Friction       : {v.level_1_friction_count}")
        print(f"  L2 Drift          : {v.level_2_drift_count}")
        print(f"  L3 Terminal Decay : {v.level_3_terminal_decay_count}")
        print(f"  Human Interventions: {v.human_intervention_count}")
        print(f"{'='*55}\n")

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    def _load_baseline(self, path: Optional[str]) -> dict:
        if path and Path(path).exists():
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        # Conservative defaults until a real baseline run is completed.
        # Based on external benchmarks (Gemini Flash): ~150 tokens/sec -> 9000 tokens/min.
        return {
            "tokens_per_minute": 9000,
            "valid_artifacts_per_minute": 3,
        }

    def _token_velocity(self, now: float) -> float:
        """Tokens/minute over trailing 60s window."""
        cutoff = now - 60
        recent = [t for ts, t in self._window_tokens if ts >= cutoff]
        return sum(recent)  # already per-minute

    def _useful_yield_rate(self, now: float) -> float:
        """Valid artifacts/minute over trailing 60s window."""
        cutoff = now - 60
        recent = [a for ts, a in self._window_artifacts if ts >= cutoff]
        return sum(recent)

    def _current_velocity_ratio(self) -> float:
        now = time.monotonic()
        v = self._token_velocity(now)
        if self._baseline_velocity == 0:
            return 1.0
        return v / self._baseline_velocity

    def _evaluate_decay(self, now: float, velocity: float, yield_r: float) -> DecayLevel:
        friction_velocity = self._baseline_velocity * FRICTION_VELOCITY_MULTIPLIER
        friction_yield    = self._baseline_yield    * FRICTION_YIELD_MULTIPLIER

        # Level 3: loop detected
        if self._detect_loop():
            return DecayLevel.TERMINAL

        # Level 3: repeated tool calls
        if len(self._tool_call_hashes) >= DRIFT_REPEATED_TOOL_THRESHOLD:
            recent = self._tool_call_hashes[-DRIFT_REPEATED_TOOL_THRESHOLD:]
            if len(set(recent)) == 1:
                return DecayLevel.TERMINAL

        # Level 2: lock violated
        if self.vitals.lock_violation_count > 0 or self.vitals.false_completion_count > 0:
            if (velocity > friction_velocity and yield_r < friction_yield):
                return DecayLevel.DRIFT

        # Check leakage window duration
        if velocity > friction_velocity and yield_r < friction_yield:
            if self._active_leakage_start is None:
                self._active_leakage_start = now
            elapsed = now - self._active_leakage_start

            if elapsed >= DRIFT_WINDOW_SECONDS:
                return DecayLevel.DRIFT
            if elapsed >= FRICTION_WINDOW_SECONDS:
                return DecayLevel.FRICTION
        else:
            self._active_leakage_start = None

        return DecayLevel.OK

    def _detect_loop(self) -> bool:
        if len(self._output_hashes) < TERMINAL_LOOP_THRESHOLD:
            return False
        recent = self._output_hashes[-TERMINAL_LOOP_THRESHOLD:]
        return len(set(recent)) == 1

    def _fire_ping(self, decay: DecayLevel, velocity: float, yield_r: float) -> TriagePing:
        self._ping_counter += 1
        pattern = self._classify_leak_pattern()

        ping = TriagePing(
            ping_id=f"PING-{self._ping_counter:04d}",
            run_id=self.run_id,
            decay_level=int(decay),
            leak_pattern=pattern,
            evidence={
                "token_velocity": f"above_baseline_{int((velocity / max(self._baseline_velocity, 1) - 1) * 100)}_percent",
                "valid_yield": f"zero_for_{int(time.monotonic() - (self._active_leakage_start or time.monotonic()))}_seconds",
                "retry_count": self.vitals.retry_count,
                "lock_violations": self.vitals.lock_violation_count,
            },
            suggested_action="ambient_injection",
            suggested_injection=self._select_injection_text(decay, pattern),
        )
        return ping

    def _classify_leak_pattern(self) -> str:
        if self.vitals.false_completion_count > 0:
            return "false_completion"
        if self.vitals.unsupported_claim_count > 0:
            return "unsupported_inference"
        if self.vitals.retry_count > 2:
            return "low_yield_retries"
        if self.vitals.lock_violation_count > 0:
            return "lock_violation"
        if self._detect_loop():
            return "output_loop"
        return "high_velocity_low_yield"

    def _select_injection_text(self, decay: DecayLevel, pattern: str) -> str:
        injections = {
            "false_completion":      "Do not emit a completion state. Mark as partial.",
            "unsupported_inference": "Visible data only. Emit null for missing fields.",
            "low_yield_retries":     "Relock to visible data only. Stop retry loop.",
            "lock_violation":        "Restate Lock. Do not modify locked fields.",
            "output_loop":           "Break loop. Emit partial result and halt.",
            "high_velocity_low_yield": "Narrow scope. Return only required fields.",
        }
        return injections.get(pattern, "Relock to visible data only.")

    def _select_injection(self, ping: TriagePing) -> AmbientInjection:
        return AmbientInjection(
            decay_level=ping.decay_level,
            leak_pattern=ping.leak_pattern,
            instruction=ping.suggested_injection,
            expected_effect="stop_inference_and_relock" if ping.decay_level >= 2 else "reduce_velocity",
        )

    def _log_to_messagebus(self, ping: TriagePing, velocity: float, yield_r: float) -> None:
        event = MessageBusEvent(
            run_id=self.run_id,
            phase=self.phase,
            reference_id=self.reference_id,
            lock_id=self.lock_id,
            delta_type=self.delta_type,
            event="triage_ping",
            decay_level=ping.decay_level,
            token_velocity=ping.evidence.get("token_velocity", ""),
            yield_rate=ping.evidence.get("valid_yield", ""),
            leak_pattern=ping.leak_pattern,
            ambient_injection=ping.suggested_injection,
            relock_applied=False,
            result="pending_relock",
            promote_candidate=False,
        )
        self._append_messagebus(asdict(event))

    def _append_messagebus(self, event: dict) -> None:
        with open(self._messagebus_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")

    def _ensure_runlog_header(self) -> None:
        if not self._runlog_path.exists():
            with open(self._runlog_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=[
                    "run_id", "condition", "model", "reference_id", "lock_id",
                    "total_tokens", "runtime_seconds", "tokens_per_minute",
                    "valid_artifact_count", "lock_violation_count",
                    "level_1_friction_count", "level_2_drift_count",
                    "level_3_terminal_decay_count", "human_intervention_count",
                    "lock_integrity_score", "stochastic_leakage_ratio",
                ])
                writer.writeheader()

    def _append_runlog(self) -> None:
        v = self.vitals
        row = {
            "run_id": v.run_id,
            "condition": v.condition,
            "model": v.model,
            "reference_id": v.reference_id,
            "lock_id": v.lock_manifest_id,
            "total_tokens": v.total_tokens,
            "runtime_seconds": v.runtime_seconds,
            "tokens_per_minute": round(v.total_tokens / max(v.runtime_seconds / 60, 0.001), 1),
            "valid_artifact_count": v.valid_artifact_count,
            "lock_violation_count": v.lock_violation_count,
            "level_1_friction_count": v.level_1_friction_count,
            "level_2_drift_count": v.level_2_drift_count,
            "level_3_terminal_decay_count": v.level_3_terminal_decay_count,
            "human_intervention_count": v.human_intervention_count,
            "lock_integrity_score": round(self.lock_integrity_score, 4),
            "stochastic_leakage_ratio": round(self.stochastic_leakage_ratio, 4),
        }
        with open(self._runlog_path, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(row.keys()))
            writer.writerow(row)
