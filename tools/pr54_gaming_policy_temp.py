from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, got {count}: {old!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


# 1. Canonical config: preserve the proven Warframe source-port exception and
# encode Steam/Deadlock game traffic as a human-readable destination range.
gaming = ROOT / "internal/config/openclash-guard/gaming.yaml"
gaming.write_text(
    """# Gaming direct exceptions are endpoint-direction aware. Protected UDP ports\n"
    "# apply to the remote/destination endpoint and are never bypass candidates.\n"
    "# Range fields are canonical-authoring sugar and compile to runtime port lists.\n"
    "gaming:\n"
    "  udpSourcePorts: [4950, 4955]\n"
    "  udpSourcePortRanges: []\n"
    "  udpDestinationPorts: []\n"
    "  udpDestinationPortRanges:\n"
    "    - [27000, 27250]\n"
    "  tcpPorts: []\n"
    "  protectedUdpPorts: [443]\n"
    "  destinationCidrs: []\n"
    """,
    encoding="utf-8",
)

# 2. Generator: accept source-only range syntax and expand it deterministically
# into the existing schema-v1 integer port lists. Runtime schema remains stable.
gen = ROOT / "internal/python/generate_openclash_guard_runtime.py"
replace_once(
    gen,
    """    return sorted(ports)\n\n\ndef _cidrs(values: object, field: str) -> list[str]:\n""",
    """    return sorted(ports)\n\n\ndef _port_ranges(values: object, field: str) -> list[int]:\n    if values is None:\n        values = []\n    if not isinstance(values, list):\n        raise RuntimeError(f\"{field} must be a list\")\n    ports: set[int] = set()\n    for index, value in enumerate(values):\n        item_field = f\"{field}[{index}]\"\n        if not isinstance(value, list) or len(value) != 2:\n            raise RuntimeError(f\"{item_field} must be [start, end]\")\n        start = _as_int(value[0], f\"{item_field}[0]\")\n        end = _as_int(value[1], f\"{item_field}[1]\")\n        if start < 1 or start > 65535 or end < 1 or end > 65535:\n            raise RuntimeError(f\"{item_field} port out of range: {start}-{end}\")\n        if start > end:\n            raise RuntimeError(f\"{item_field} start must be <= end: {start}-{end}\")\n        ports.update(range(start, end + 1))\n    return sorted(ports)\n\n\ndef _cidrs(values: object, field: str) -> list[str]:\n""",
)
replace_once(
    gen,
    """    udp_source_ports = _ports(spec.get(\"udpSourcePorts\"), \"gaming.udpSourcePorts\")\n    udp_destination_ports = [\n        port\n        for port in _ports(spec.get(\"udpDestinationPorts\"), \"gaming.udpDestinationPorts\")\n        if port not in protected_set\n    ]\n""",
    """    udp_source_ports = sorted(\n        set(_ports(spec.get(\"udpSourcePorts\"), \"gaming.udpSourcePorts\"))\n        | set(_port_ranges(spec.get(\"udpSourcePortRanges\"), \"gaming.udpSourcePortRanges\"))\n    )\n    udp_destination_ports = [\n        port\n        for port in sorted(\n            set(_ports(spec.get(\"udpDestinationPorts\"), \"gaming.udpDestinationPorts\"))\n            | set(\n                _port_ranges(\n                    spec.get(\"udpDestinationPortRanges\"),\n                    \"gaming.udpDestinationPortRanges\",\n                )\n            )\n        )\n        if port not in protected_set\n    ]\n""",
)

# 3. Runtime generator tests: prove range expansion, compatibility projection,
# validation, protected-port filtering, and the production gaming policy.
test = ROOT / "tests/test_openclash_guard_runtime.py"
replace_once(
    test,
    """  udpSourcePorts: [443, 3074]\n  udpDestinationPorts: [443, 27015]\n""",
    """  udpSourcePorts: [443, 3074]\n  udpSourcePortRanges: [[4000, 4002]]\n  udpDestinationPorts: [443, 27015]\n  udpDestinationPortRanges: [[27016, 27018]]\n""",
)
replace_once(
    test,
    """        self.assertEqual(document[\"gaming\"][\"udpSourcePorts\"], [443, 3074])\n        self.assertNotIn(443, document[\"gaming\"][\"udpDestinationPorts\"])\n        self.assertEqual(document[\"gaming\"][\"udpDestinationPorts\"], [27015])\n        self.assertEqual(document[\"gaming\"][\"udpPorts\"], [27015])\n""",
    """        self.assertEqual(document[\"gaming\"][\"udpSourcePorts\"], [443, 3074, 4000, 4001, 4002])\n        self.assertNotIn(443, document[\"gaming\"][\"udpDestinationPorts\"])\n        self.assertEqual(document[\"gaming\"][\"udpDestinationPorts\"], [27015, 27016, 27017, 27018])\n        self.assertEqual(document[\"gaming\"][\"udpPorts\"], [27015, 27016, 27017, 27018])\n""",
)
replace_once(
    test,
    """    def test_firewall_kill_switch_defaults_fail_mode_to_reject(self) -> None:\n""",
    """    def test_invalid_gaming_port_range_is_rejected(self) -> None:\n        guard = GUARD_YAML.replace(\n            \"  udpDestinationPortRanges: [[27016, 27018]]\\n\",\n            \"  udpDestinationPortRanges: [[27250, 27000]]\\n\",\n        )\n        with tempfile.TemporaryDirectory() as raw:\n            with self.assertRaisesRegex(RuntimeError, \"start must be <= end\"):\n                _compile(Path(raw), guard=guard)\n\n    def test_firewall_kill_switch_defaults_fail_mode_to_reject(self) -> None:\n""",
)
replace_once(
    test,
    """    def test_revision_is_deterministic_hex(self) -> None:\n""",
    """    def test_production_gaming_policy_contains_proven_direct_ports(self) -> None:\n        source = self.checked_in[\"gaming\"][\"udpSourcePorts\"]\n        destination = self.checked_in[\"gaming\"][\"udpDestinationPorts\"]\n        self.assertEqual(source, [4950, 4955])\n        self.assertEqual(len(destination), 251)\n        self.assertEqual(destination[0], 27000)\n        self.assertEqual(destination[-1], 27250)\n        self.assertNotIn(443, destination)\n        self.assertEqual(self.checked_in[\"gaming\"][\"udpPorts\"], destination)\n\n    def test_revision_is_deterministic_hex(self) -> None:\n""",
)

# 4. Document why ranges live only in canonical authoring and are expanded for
# schema-v1/runtime consumers.
doc = ROOT / "docs/openclash-guard-gaming-dataplane.md"
text = doc.read_text(encoding="utf-8")
section = """

## Canonical gaming port ranges

Canonical `internal/config/openclash-guard/gaming.yaml` may use
`udpSourcePortRanges` and `udpDestinationPortRanges` as inclusive `[start, end]`
pairs. The generator validates and expands those ranges into the existing
schema-v1 `udpSourcePorts` / `udpDestinationPorts` integer arrays; the runtime
contract and older `udpPorts` destination-only compatibility projection remain
unchanged.

The checked-in policy records the live-RCA gaming cases without teaching the
OpenClash adapter any game-specific ports: Warframe uses UDP source ports 4950
and 4955, while Steam/Deadlock game traffic uses remote UDP 27000-27250.
Trusted source clients are still supplied separately by UCI and protected
remote UDP ports remain excluded from DIRECT policy.
"""
if "## Canonical gaming port ranges" not in text:
    doc.write_text(text.rstrip() + section + "\n", encoding="utf-8")
