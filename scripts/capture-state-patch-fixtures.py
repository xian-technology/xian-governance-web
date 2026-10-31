"""Run with the sibling xian-abci environment to refresh node loader fixtures."""
import json
import random
import struct
import math
import tempfile
from pathlib import Path

from xian.utils.state_patches import StatePatchManager

root = Path(__file__).absolute().parents[1]
values = [9007199254740993, 10**40, 1.0, -0.0, 1e-7, 1e-5, 1e-4, 1e16, 1e20, 1e21,
          1.2345678901234568, 5e-324, 1.7976931348623157e308]
rng = random.Random(20261031)
for _ in range(500):
    number = struct.unpack("!d", rng.randbytes(8))[0]
    if math.isfinite(number):
        values.append(number)
fixtures = []
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'bundle.json'
    payloads = [dict(version=1, patch_id='numeric-test', activation_height=12,
                     changes=[dict(key='con_x.value', value=value)]) for value in values]
    payloads.append(dict(version=1, patch_id='null-test', activation_height=9007199254740993,
                         summary=None, uri=None, changes=[dict(key='con_x.value', value=1, comment=None)]))
    for payload in payloads:
        source = json.dumps(payload, ensure_ascii=False)
        path.write_text(source)
        bundle = StatePatchManager(None)._load_bundle_file(path)
        fixtures.append(dict(source=source, hash=bundle.bundle_hash))
(root / 'tests/fixtures/state-patch-node.json').write_text(json.dumps(fixtures, indent=2)+'\n')
