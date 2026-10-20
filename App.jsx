import { useEffect, useMemo, useState } from "react";
import NetMetered from "./NetMetered.jsx";
import {
  CACHED_TARIFFS_V2026, TariffCacheManager, calculateExactKWhFromBill, sizeSystemProduction,
  calculateFinancials, auditQuote, pkr, clamp, lvlTag,
} from "./engine.js";

const lvlColor = { ok: "var(--ok)", warn: "var(--sun)", bad: "var(--bad)", info: "var(--mute)" };

function Field({ label, value, onChange, min, max, step, unit }) {
  return (
    <div className="mb-5">
      <div className="flex justify-between items-baseline mb-1">
        <label className="font-semibold">{label}</label>
        <span className="text-sm text-[var(--mute)]">{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={clamp(value, min, max)}
        onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <input type="number" min={min} max={max} step={step} value={value} className="mt-2"
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} aria-label={label + " value"} />
    </div>
  );
}

const Stat = ({ k, v, sub }) => (
  <div className="border-t border-[var(--line)] pt-3">
    <div className="text-sm text-[var(--mute)]">{k}</div>
    <div className="disp text-2xl font-bold">{v}</div>
    {sub && <div className="text-sm text-[var(--mute)]">{sub}</div>}
  </div>
);

export default function App() {
  const [bill, setBill] = useState(60000);
  const [roof, setRoof] = useState(1500);
  const [tariff, setTariff] = useState(CACHED_TARIFFS_V2026);
  const [src, setSrc] = useState("syncing");
  const [q, setQ] = useState({ inverterKW: 10, panelKW: 12, cost: 1800000, battery: false });
  const [busy, setBusy] = useState(false);
  const [nonFiler, setNonFiler] = useState(false);
  const [ctype, setCtype] = useState("unprotected");
  const [kw, setKw] = useState(5);
  const [peakPct, setPeakPct] = useState(35);
  const prot = ctype === "protected";
  const [nm, setNm] = useState(false);

  useEffect(() => {
    new TariffCacheManager(CACHED_TARIFFS_V2026).sync()
      .then((r) => { setTariff(r.tariff); setSrc(r.source); })
      .catch(() => setSrc("snapshot"));
  }, []);

  const b = clamp(bill, 3000, 500000);
  const r = clamp(roof, 200, 10000);
  const { k, sz, fin } = useMemo(() => {
    const o = { nonFiler, protected: prot, tou: ctype === "tou", kw: clamp(kw, 0.5, 100), peakShare: clamp(peakPct, 0, 100) / 100 };
    const k = calculateExactKWhFromBill(b, tariff, o);
    const sz = sizeSystemProduction(o.tou ? k.kwh * (1 - o.peakShare) : k.kwh, r, tariff); /* time-of-use: daytime solar offsets off-peak units */
    return { k, sz, fin: calculateFinancials(b, k, sz, tariff, { ...o, protected: k.cls === "protected" }) };
  }, [b, r, tariff, nonFiler, ctype, kw, peakPct]);
  const audit = useMemo(() => auditQuote(q, sz, fin), [q, sz, fin]);
  const srcLabel = { live: "Live data", cached: "Saved copy", snapshot: "Offline snapshot", syncing: "Syncing…" }[src];
  const payTxt = fin.paybackMonths == null ? "Over 25 years" : fin.paybackMonths + " months";
  const setQ1 = (key, val) => setQ((o) => ({ ...o, [key]: val }));

  const exportPdf = async () => {
    setBusy(true);
    try {
      const { exportAuditPdf } = await import("./pdf.js");
      await exportAuditPdf({ ctype: k.cls, b, r, k, sz, fin, tariff, audit, srcLabel, payTxt });
    } finally { setBusy(false); }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-4xl font-extrabold">WattWise</h1>
          <p className="text-[var(--mute)]">Independent solar and battery sizing for Karachi homes. No installer commissions.</p>
        </div>
        <div className="text-sm px-3 py-1 rounded-full border border-[var(--line)] bg-[var(--card)]" role="status">
          {tariff.label}
        </div>
      </header>

      <div className="mb-6 p-4 rounded-xl bg-[var(--card)] border border-[var(--line)] text-sm">
        <div className="font-semibold mb-2">Do you already have solar?</div>
        <label className="flex items-center gap-2 mb-1"><input type="radio" name="nm" checked={!nm} onChange={() => setNm(false)} style={{ width: "auto" }} />No, I am thinking about going solar</label>
        <label className="flex items-center gap-2"><input type="radio" name="nm" checked={nm} onChange={() => setNm(true)} style={{ width: "auto" }} />Yes, I have solar with net metering</label>
      </div>

      {nm ? <NetMetered tariff={tariff} /> : (<>

      <section className="rounded-2xl p-6 mb-6" style={{ background: "var(--hero)", color: "var(--heroink)" }}>
        <div className="text-sm opacity-80">Estimated payback on a {sz.pvKW.toFixed(2)} kW system</div>
        <div className="disp text-5xl md:text-6xl font-extrabold">{payTxt}</div>
        <div className="mt-2 opacity-90">
          Cuts your monthly bill by about {fin.reductionPct.toFixed(0)}%, from {pkr(b)} to {pkr(fin.billAfter)}.
        </div>
      </section>

      <div className="grid md:grid-cols-5 gap-6">
        <section className="md:col-span-2 rounded-xl p-5 bg-[var(--card)] border border-[var(--line)] self-start">
          <h2 className="text-xl font-bold mb-4">Your home</h2>
          <Field label="Monthly electricity bill" value={bill} onChange={setBill} min={3000} max={500000} step={1000} unit="PKR" />
          <Field label="Usable rooftop space" value={roof} onChange={setRoof} min={200} max={10000} step={50} unit="sq ft" />
          <div className="mb-4 text-sm">
            <div className="font-semibold mb-1">Customer type</div>
            {[["unprotected", "Unprotected: usage went above 200 units in any of the last 6 months"], ["protected", "Protected: 200 units or less every month for the last 6 months"], ["tou", "Time of use: peak and off-peak meter (required for 5 kW and above)"]].map(([val, text]) => (
              <label key={val} className="flex items-start gap-2 mb-1"><input type="radio" name="ctype" checked={ctype === val} onChange={() => setCtype(val)} style={{ width: "auto", marginTop: 4 }} /><span>{text}</span></label>
            ))}
            {prot && k.cls === "unprotected" && <p className="mt-2 text-[var(--mute)]">At this bill your usage is above 200 units, so protected rates no longer apply and you are billed as unprotected.</p>}
            {prot && k.cls === "protected" && <p className="mt-2 text-[var(--mute)]">Protected rates are low (about PKR 11 to 14 per unit before taxes), so solar saves little and payback is long.</p>}
            <label className="block mt-3">{ctype === "tou" ? "Load billed for fixed charges (kW)" : "Sanctioned load (kW), printed on your bill"}
              <input type="number" min="0.5" max="100" step="0.5" value={kw} onChange={(e) => setKw(e.target.value === "" ? "" : Number(e.target.value))} /></label>
            {ctype === "tou" && (<label className="block mt-3">Share of your units used at peak time (%)
              <input type="number" min="0" max="100" step="1" value={peakPct} onChange={(e) => setPeakPct(e.target.value === "" ? "" : Number(e.target.value))} /></label>)}
          </div>
          <label className="flex items-center gap-2 mb-4 text-sm">
            <input type="checkbox" checked={nonFiler} onChange={(e) => setNonFiler(e.target.checked)} style={{ width: "auto" }} />
            I am not on the FBR active taxpayer list (7.5% advance tax on bills of PKR 25,000+)
          </label>
          <p className="text-sm text-[var(--mute)]">
            That bill equals about <b>{Math.round(k.kwh)} kWh</b> a month, at about PKR {k.marginal.toFixed(1)} per extra kWh
            including taxes and charges ({k.overheadPct.toFixed(0)}% above the base slab rate). {ctype !== "tou" ? "All units are billed at one slab rate." : "Homes of 5 kW and above are billed on time of use."}
          </p>
          <div className="mt-4 text-sm">
            <div className="font-semibold mb-1">Slab breakdown</div>
            {k.slabs.map((s) => (
              <div key={s.label} className="flex justify-between border-b border-[var(--line)] py-1">
                <span>{s.label} kWh</span><span>{s.kwh.toFixed(0)} kWh at PKR {s.rate}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="md:col-span-3 rounded-xl p-5 bg-[var(--card)] border border-[var(--line)]">
          <h2 className="text-xl font-bold mb-4">Recommended system</h2>
          {sz.capped && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ border: "1px solid var(--sun)" }}>
              Your roof fits {sz.roofMaxKW.toFixed(1)} kW but {sz.neededKW.toFixed(1)} kW would cover your full usage. Panels are capped,
              so about {sz.gridDepPct.toFixed(0)}% ({Math.round(sz.residualKWh)} kWh) of your use still comes from the grid, and backup is sized for {sz.backupHrs} hours.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Stat k="Solar array" v={sz.pvKW.toFixed(2) + " kW"} sub={sz.panels + " × 550 W Tier-1 mono PERC"} />
            <Stat k="Hybrid inverter" v={sz.inverterKW + " kW"} sub="Off-grid capable" />
            <Stat k="LiFePO4 battery" v={sz.batteryKWh.toFixed(1) + " kWh"} sub={sz.backupHrs + " h backup for " + sz.essentialKW.toFixed(1) + " kW essential load"} />
            <Stat k="Monthly generation" v={Math.round(sz.monthlyGen) + " kWh"} sub={tariff.peakSunHours.toFixed(1) + " sun hours × 0.80 heat derating"} />
            <Stat k="Turnkey cost" v={pkr(fin.cost)} sub={"Solar " + pkr(fin.pvCost) + " + battery " + pkr(fin.battCost)} />
            <Stat k="Monthly saving" v={pkr(fin.monthlySave)} sub={Math.round(fin.selfKWh) + " kWh self-used, " + Math.round(fin.exportKWh) + " kWh exported at PKR " + tariff.exportRate} />
            <Stat k="5-year net savings" v={pkr(fin.net5)} sub="After recovering system cost" />
            <Stat k="25-year IRR" v={fin.irr == null ? "n/a" : (fin.irr * 100).toFixed(1) + "%"} sub="5% tariff rise, 0.5% yearly panel loss" />
          </div>
          <button onClick={exportPdf} disabled={busy} className="mt-5 px-4 py-2 rounded-lg font-semibold disabled:opacity-60"
            style={{ background: "var(--sun)", color: "#10302E" }}>
            {busy ? "Preparing PDF…" : "Download audit report (PDF)"}
          </button>
        </section>
      </div>

      <section className="rounded-xl p-5 mt-6 bg-[var(--card)] border border-[var(--line)]">
        <h2 className="text-xl font-bold mb-1">Check a contractor quote</h2>
        <p className="text-sm text-[var(--mute)] mb-4">Enter what the installer offered. WattWise compares it with your recommended system.</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <label className="text-sm">Inverter (kW)
            <input type="number" min="0" step="0.5" value={q.inverterKW} onChange={(e) => setQ1("inverterKW", Number(e.target.value))} /></label>
          <label className="text-sm">Panel capacity (kW)
            <input type="number" min="0" step="0.1" value={q.panelKW} onChange={(e) => setQ1("panelKW", Number(e.target.value))} /></label>
          <label className="text-sm">Total cost (PKR)
            <input type="number" min="0" step="10000" value={q.cost} onChange={(e) => setQ1("cost", Number(e.target.value))} /></label>
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm">
          <input type="checkbox" checked={q.battery} onChange={(e) => setQ1("battery", e.target.checked)} style={{ width: "auto" }} />
          Quote includes battery storage
        </label>
        <ul className="mt-4 space-y-2">
          {audit.map((a, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="font-semibold w-12 shrink-0" style={{ color: lvlColor[a.lvl] }}>{lvlTag[a.lvl]}</span>
              <span>{a.txt}</span>
            </li>
          ))}
        </ul>
      </section>

      </>)}

      <p className="text-xs text-[var(--mute)] mt-6">
        Based on K-Electric and NEPRA tariffs as of October 2026. Your K-Electric bill is always the final figure.
      </p>
    </main>
  );
}
