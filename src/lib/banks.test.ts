import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BANKS, bankInitials, fallbackColour, findBank } from "./banks";

describe("bank directory", () => {
  it("recognises common ways of writing a bank's name", () => {
    expect(findBank("GTB")?.id).toBe("gtbank");
    expect(findBank("Guaranty Trust Bank")?.id).toBe("gtbank");
    expect(findBank("zenith bank plc")?.id).toBe("zenith");
    expect(findBank("ALAT by Wema")?.id).toBe("alat");
    expect(findBank("Wema Bank")?.id).toBe("wema");
    expect(findBank("First City Monument Bank")?.id).toBe("fcmb");
    expect(findBank("First Bank")?.id).toBe("firstbank");
    expect(findBank("OPay")?.id).toBe("opay");
  });

  it("returns nothing for unknown or empty names", () => {
    expect(findBank("Acme Savings Co-operative")).toBeNull();
    expect(findBank("")).toBeNull();
    expect(findBank(null)).toBeNull();
  });

  it("builds initials and a stable colour for the fallback badge", () => {
    expect(bankInitials("Acme Savings Co-operative")).toBe("AS");
    expect(bankInitials("Bank of Lagos")).toBe("L");
    expect(fallbackColour("Acme")).toBe(fallbackColour("Acme"));
  });

  it("has a logo file for every bank that points to one", () => {
    for (const bank of BANKS) {
      if (bank.logo) expect(existsSync(path.join(process.cwd(), "public", bank.logo)), bank.logo).toBe(true);
    }
  });
});
