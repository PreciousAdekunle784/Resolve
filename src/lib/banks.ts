/**
 * Central directory of Nigerian banks and payment providers.
 *
 * Every place that shows a bank uses `findBank()` so names typed in different
 * ways ("GTB", "GTBank", "Guaranty Trust Bank") resolve to one entry, with its
 * official logo when we have one (see /public/banks and docs/ASSETS.md).
 */

export interface BankInfo {
  id: string;
  /** Name shown to users and saved on cases. */
  name: string;
  /** Path of the optimised logo in /public, or null when we don't have one. */
  logo: string | null;
  /** Lower-case words/phrases that identify this bank in free text. */
  aliases: string[];
}

const logo = (id: string) => `/banks/${id}.png`;

/**
 * Order matters for matching: more specific names come before names they
 * contain (e.g. "ALAT by Wema" before "Wema", "First City Monument" before "First Bank").
 */
export const BANKS: BankInfo[] = [
  { id: "alat", name: "ALAT by Wema", logo: logo("alat"), aliases: ["alat"] },
  { id: "fcmb", name: "First City Monument Bank (FCMB)", logo: logo("fcmb"), aliases: ["fcmb", "first city monument"] },
  { id: "uba", name: "United Bank for Africa (UBA)", logo: logo("uba"), aliases: ["uba", "united bank for africa"] },
  { id: "union", name: "Union Bank of Nigeria", logo: logo("union"), aliases: ["union bank"] },
  { id: "standard-chartered", name: "Standard Chartered Bank Nigeria", logo: logo("standard-chartered"), aliases: ["standard chartered", "stanchart"] },
  { id: "stanbic", name: "Stanbic IBTC Bank", logo: logo("stanbic"), aliases: ["stanbic", "ibtc"] },
  { id: "access", name: "Access Bank", logo: logo("access"), aliases: ["access", "diamond bank"] },
  { id: "citibank", name: "Citibank Nigeria", logo: logo("citibank"), aliases: ["citibank", "citi bank", "citi"] },
  { id: "ecobank", name: "Ecobank Nigeria", logo: logo("ecobank"), aliases: ["ecobank", "eco bank"] },
  { id: "fidelity", name: "Fidelity Bank", logo: logo("fidelity"), aliases: ["fidelity"] },
  { id: "firstbank", name: "First Bank of Nigeria", logo: logo("firstbank"), aliases: ["first bank", "firstbank", "fbn"] },
  { id: "globus", name: "Globus Bank", logo: logo("globus"), aliases: ["globus"] },
  { id: "gtbank", name: "Guaranty Trust Bank (GTBank)", logo: logo("gtbank"), aliases: ["gtbank", "gtb", "gtco", "guaranty trust", "gt bank"] },
  { id: "heritage", name: "Heritage Bank", logo: logo("heritage"), aliases: ["heritage"] },
  { id: "keystone", name: "Keystone Bank", logo: logo("keystone"), aliases: ["keystone"] },
  { id: "kuda", name: "Kuda Microfinance Bank", logo: logo("kuda"), aliases: ["kuda"] },
  { id: "lotus", name: "Lotus Bank", logo: logo("lotus"), aliases: ["lotus"] },
  { id: "moniepoint", name: "Moniepoint Microfinance Bank", logo: logo("moniepoint"), aliases: ["moniepoint", "monie point", "teamapt"] },
  { id: "opay", name: "OPay", logo: logo("opay"), aliases: ["opay", "o pay", "paycom"] },
  { id: "paga", name: "Paga", logo: logo("paga"), aliases: ["paga"] },
  { id: "palmpay", name: "PalmPay", logo: logo("palmpay"), aliases: ["palmpay", "palm pay"] },
  { id: "polaris", name: "Polaris Bank", logo: logo("polaris"), aliases: ["polaris", "skye bank"] },
  { id: "sterling", name: "Sterling Bank", logo: logo("sterling"), aliases: ["sterling"] },
  { id: "taj", name: "TAJBank", logo: logo("taj"), aliases: ["tajbank", "taj bank", "taj"] },
  { id: "wema", name: "Wema Bank", logo: logo("wema"), aliases: ["wema"] },
  { id: "zenith", name: "Zenith Bank", logo: logo("zenith"), aliases: ["zenith"] },
  { id: "sparkle", name: "Sparkle Microfinance Bank", logo: logo("sparkle"), aliases: ["sparkle"] },
  { id: "aso", name: "ASO Savings and Loans", logo: logo("aso"), aliases: ["aso savings", "asosavings"] },
  { id: "ekondo", name: "Ekondo Microfinance Bank", logo: logo("ekondo"), aliases: ["ekondo"] },
  // No logo available yet — shown with initials.
  { id: "jaiz", name: "Jaiz Bank", logo: null, aliases: ["jaiz"] },
  { id: "parallex", name: "Parallex Bank", logo: null, aliases: ["parallex"] },
  { id: "premium-trust", name: "Premium Trust Bank", logo: null, aliases: ["premium trust"] },
  { id: "providus", name: "Providus Bank", logo: null, aliases: ["providus"] },
  { id: "suntrust", name: "SunTrust Bank", logo: null, aliases: ["suntrust", "sun trust"] },
  { id: "titan-trust", name: "Titan Trust Bank", logo: null, aliases: ["titan trust", "titan"] },
  { id: "unity", name: "Unity Bank", logo: null, aliases: ["unity bank"] },
  { id: "optimus", name: "Optimus Bank", logo: null, aliases: ["optimus"] },
  { id: "signature", name: "Signature Bank", logo: null, aliases: ["signature bank"] },
  { id: "fairmoney", name: "FairMoney Microfinance Bank", logo: null, aliases: ["fairmoney", "fair money"] },
  { id: "carbon", name: "Carbon", logo: null, aliases: ["carbon"] },
  { id: "vfd", name: "VFD Microfinance Bank", logo: null, aliases: ["vfd", "vbank"] },
];

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** Finds the bank a free-text name refers to (null if unknown). */
export function findBank(name: string | null | undefined): BankInfo | null {
  if (!name) return null;
  const haystack = normalise(name);
  if (haystack.trim() === "") return null;
  for (const bank of BANKS) {
    if (bank.aliases.some((alias) => haystack.includes(normalise(alias)))) return bank;
  }
  return null;
}

/** Up to two initials for the fallback badge (skips words like "Bank", "of"). */
export function bankInitials(name: string | null | undefined): string {
  return (name ?? "")
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(of|and|the|bank|plc|ltd|limited|nigeria|microfinance|mfb)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

const FALLBACK_COLOURS = ["bg-ink-900", "bg-brand-700", "bg-emerald-700", "bg-rose-700", "bg-amber-700", "bg-violet-700", "bg-cyan-800"];

/** Deterministic background colour for the initials fallback. */
export function fallbackColour(name: string | null | undefined): string {
  let hash = 0;
  for (const ch of name ?? "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLOURS[hash % FALLBACK_COLOURS.length];
}

/** Bank names offered in the bank picker, alphabetically. */
export const BANK_CHOICES = [...BANKS].sort((a, b) => a.name.localeCompare(b.name));
