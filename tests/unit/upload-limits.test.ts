import { describe, expect, it } from "vitest";

import {
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_SIZE,
  validateUploadFiles,
} from "@/lib/uploadLimits";

const file = (name: string, size = 10) =>
  new File([new Uint8Array(size)], name);

describe("validateUploadFiles", () => {
  it("accepts a normal batch and an empty one", () => {
    expect(validateUploadFiles([file("a.pdf"), file("b.png")])).toBeNull();
    expect(validateUploadFiles([])).toBeNull();
  });

  it("rejects too many files", () => {
    const many = Array.from({ length: MAX_UPLOAD_FILES + 1 }, (_, i) => file(`${i}.txt`));
    expect(validateUploadFiles(many)).toContain(String(MAX_UPLOAD_FILES));
  });

  it("names the file that is too big, and allows exactly the limit", () => {
    expect(validateUploadFiles([file("limite.bin", MAX_UPLOAD_SIZE)])).toBeNull();
    expect(validateUploadFiles([file("ok.txt"), file("grande.bin", MAX_UPLOAD_SIZE + 1)])).toContain("grande.bin");
  });
});
