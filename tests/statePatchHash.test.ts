import { describe, expect, it } from "vitest";

import {
  computeStatePatchBundleHash,
  parseStatePatchBundle
} from "../src/shared/statePatchHash";

describe("state patch bundle hashing", () => {
  it("canonicalizes change ordering before hashing", () => {
    const left = parseStatePatchBundle({
      version: 1,
      patch_id: "patch-a",
      activation_height: 12,
      governance_contract: "governance",
      summary: "test",
      uri: "",
      changes: [
        { key: "b.value", value: 2, comment: "second" },
        { key: "a.value", value: 1, comment: "first" }
      ]
    });
    const right = parseStatePatchBundle({
      version: 1,
      patch_id: "patch-a",
      activation_height: 12,
      governance_contract: "governance",
      summary: "test",
      uri: "",
      changes: [
        { key: "a.value", value: 1, comment: "first" },
        { key: "b.value", value: 2, comment: "second" }
      ]
    });

    expect(computeStatePatchBundleHash(left)).toEqual(
      computeStatePatchBundleHash(right),
    );
  });

  it("rejects malformed bundles", () => {
    expect(() => parseStatePatchBundle({ version: 1, changes: [] })).toThrow(
      "patch_id is required",
    );
  });

  // These expected digests are produced by the chain-side canonical hasher
  // (`xian.utils.state_patches._hash_from_bundle_payload`, which uses
  // `json.dumps(..., sort_keys=True, separators=(",", ":"))` + sha256).
  // They pin cross-language compatibility so the browser verifier never
  // disagrees with a node about whether a bundle matches its proposal hash.
  const EXAMPLE_BUNDLE = {
    version: 1,
    patch_id: "example-patch",
    activation_height: 100000000,
    summary: "Example governed state patch bundle",
    uri: "ipfs://example-patch-bundle",
    changes: [
      {
        key: "con_token.balances:some_address",
        value: 1000000,
        comment: "Fix incorrect account balance"
      },
      {
        key: "con_dao.proposals:5",
        value: { status: "completed", votes: 120 },
        comment: "Repair proposal state after governance review"
      }
    ]
  };

  it("matches the chain hash when chain_id is present", () => {
    const bundle = parseStatePatchBundle({
      ...EXAMPLE_BUNDLE,
      chain_id: "xian-local"
    });
    expect(computeStatePatchBundleHash(bundle)).toEqual(
      "7e2b1a57c6bb526e9e7e953e0a1a6153c04f4a29c99dbbf31096efe9576d5c1b",
    );
  });

  it("matches the chain hash when chain_id is omitted (emitted as null)", () => {
    const bundle = parseStatePatchBundle(EXAMPLE_BUNDLE);
    expect(computeStatePatchBundleHash(bundle)).toEqual(
      "4cfa92047907dd8de1882409d1b912dc0f6c62750b11d0a38fde692527d64f41",
    );
  });
});

it.each([
  [[{ key: "con_x.A", value: 1 }, { key: "con_x.a", value: 2 }], "3ada35bf935299853b9215421fbb70e90c532b8dd2f51a8d99de7df249c48a2d"],
  [[{ key: "con_x.x", value: "é" }], "6bd58fd560689a04155bb3c59bd483aaf6b70a12ca16f7a69ecc006fbbf5e69f"],
  [[{ key: "con_x.x", value: { "2": 2, "10": 10 } }], "77d9f9601896b0075bac6fc0a6e69aca06e2558d522a5b3d18df151df730b9f3"],
])("matches the node canonical hash for edge-case change values: %j", (changes, expected) => {
  // Digests from xian.utils.state_patches._hash_from_bundle_payload.
  const bundle = parseStatePatchBundle({version: 1, patch_id: "audit-patch", activation_height: 12, changes});
  expect(computeStatePatchBundleHash(bundle)).toBe(expected);
});

it("treats an omitted change value as null, matching the node loader", () => {
  const bundle = {version: 1, patch_id: "audit-null", activation_height: 12};
  const missing = parseStatePatchBundle({...bundle, changes: [{key: "con_x.value"}]});
  const explicit = parseStatePatchBundle({...bundle, changes: [{key: "con_x.value", value: null}]});
  expect(computeStatePatchBundleHash(missing)).toBe(computeStatePatchBundleHash(explicit));
});

it("matches the node for prefix keys, non-BMP ordering and escaped strings", () => {
  const bundle = parseStatePatchBundle({
    version: 1,
    patch_id: "audit-unicode",
    activation_height: 12,
    changes: [
      {key: "con_x.\u{10000}", value: ["é", "\u007f", "😀"]},
      {key: "con_x.\ue000", value: null},
      {key: "con_x.ab", value: true},
      {key: "con_x.a", value: false},
    ],
  });
  expect(computeStatePatchBundleHash(bundle)).toBe(
    "e9624585837c09200170f46daae31a58e063f256d43f5ff86de253efc27389cc",
  );
});
