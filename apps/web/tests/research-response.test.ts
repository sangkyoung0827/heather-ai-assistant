import assert from "node:assert/strict";
import test from "node:test";
import { externalDiscoveryUnavailableMessage, formatResearchResponse, verifiedResearchSources } from "../lib/research/response";

test("keeps only actual discovery sources with both a title and URL", () => {
  const sources = verifiedResearchSources([
    { title: "Verified paper", url: "https://doi.org/10.1000/example" },
    { title: "Missing URL" },
    { url: "https://example.com/missing-title" },
    { title: "Duplicate", url: "https://doi.org/10.1000/example" }
  ]);

  assert.deepEqual(sources, [{ title: "Verified paper", url: "https://doi.org/10.1000/example" }]);
  assert.match(formatResearchResponse("Source-based answer", sources), /Verified paper/);
});

test("does not replace missing academic sources with generated citation claims", () => {
  const message = externalDiscoveryUnavailableMessage("ko", true);
  assert.match(message, /논문 제목, 저자, DOI는 생성하지 않습니다/);
});
