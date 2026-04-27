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
});
