import { useMemo, useState } from "react";
import { calculateNetMeteredBill, netMeteredBatteryAddOn, pkr } from "./engine.js";

const Num = ({ label, value, onChange, step = 1 }) => (
  <label className="block text-sm mb-3">{label}
    <input type="number" min="0" step={step} value={value} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
  </label>
);
const Row = ({ k, v, strong }) => (
  <div className={"flex justify-between py-1 border-b border-[var(--line)] " + (strong ? "font-bold" : "")}><span>{k}</span><span>{v}</span></div>
);
const Stat = ({ k, v, sub }) => (
  <div className="border-t border-[var(--line)] pt-3">
    <div className="text-sm text-[var(--mute)]">{k}</div>
    <div className="disp text-2xl font-bold">{v}</div>
    {sub && <div className="text-sm text-[var(--mute)]">{sub}</div>}
  </div>
);

export default function NetMetered({ tariff }) {
  const [v, setV] = useState({ sanctionedKW: 18, offPeakUnits: 906, peakUnits: 523, exportUnits: 1460, billed: "", contract: "legacy", rate: tariff.exportCredit.legacy });
  const set = (k) => (x) => setV((o) => ({ ...o, [k]: x }));
  const n = (x) => Math.max(0, Number(x) || 0);
  const i = { sanctionedKW: n(v.sanctionedKW), offPeakUnits: n(v.offPeakUnits), peakUnits: n(v.peakUnits), exportUnits: n(v.exportUnits), creditRate: n(v.rate) };
  const { b, add } = useMemo(() => ({ b: calculateNetMeteredBill(i, tariff), add: netMeteredBatteryAddOn(i, tariff) }), [v, tariff]);
  const billed = n(v.billed), diff = Math.abs(b.net - billed);
  const rate = i.creditRate;

  return (
    <div>
      <section className="rounded-2xl p-6 mb-6" style={{ background: "var(--hero)", color: "var(--heroink)" }}>
        <div className="text-sm opacity-80">Your net-metered bill, worked out line by line</div>
        <div className="disp text-5xl md:text-6xl font-extrabold">{pkr(b.net)}</div>
        <div className="mt-2 opacity-90">
          {pkr(b.gross)} for {Math.round(b.imp)} grid units, less {pkr(b.credit)} credit for {Math.round(i.exportUnits)} exported units.
        </div>
        {billed > 0 && <div className="mt-1 opacity-90">{diff <= 15 ? "Matches the amount on your bill" : "Differs from your bill by " + pkr(diff)}{diff <= 15 ? " (difference " + pkr(diff) + ")." : "."}</div>}
      </section>

      <div className="grid md:grid-cols-5 gap-6">
        <section className="md:col-span-2 rounded-xl p-5 bg-[var(--card)] border border-[var(--line)] self-start">
          <h2 className="text-xl font-bold mb-4">From your bill</h2>
          <Num label="Load billed for fixed charges (kW): the higher of your peak demand and half your sanctioned load" value={v.sanctionedKW} onChange={set("sanctionedKW")} />
          <Num label="Off-peak units imported" value={v.offPeakUnits} onChange={set("offPeakUnits")} />
          <Num label="Peak units imported" value={v.peakUnits} onChange={set("peakUnits")} />
          <Num label="Units exported to the grid" value={v.exportUnits} onChange={set("exportUnits")} />
          <div className="mb-3 text-sm"><div className="mb-1">Solar contract</div>
            <label className="flex items-center gap-2"><input type="radio" name="contract" checked={v.contract === "legacy"} onChange={() => setV((o) => ({ ...o, contract: "legacy", rate: tariff.exportCredit.legacy }))} style={{ width: "auto" }} />Legacy net metering</label>
            <label className="flex items-center gap-2"><input type="radio" name="contract" checked={v.contract === "new"} onChange={() => setV((o) => ({ ...o, contract: "new", rate: tariff.exportCredit.newRegime }))} style={{ width: "auto" }} />New regime (net billing)</label>
          </div>
          <Num label="Credit per exported unit (PKR)" value={v.rate} onChange={set("rate")} step={0.01} />
          <Num label="Amount on your bill, PKR (optional)" value={v.billed} onChange={set("billed")} />
          <p className="text-sm text-[var(--mute)]">Exported units are credited at PKR {rate} each.</p>
        </section>

        <section className="md:col-span-3 rounded-xl p-5 bg-[var(--card)] border border-[var(--line)]">
          <h2 className="text-xl font-bold mb-3">Bill breakdown</h2>
          <div className="text-sm mb-6">
            <Row k={"Off-peak energy (PKR " + tariff.netMetered.offPeak + ")"} v={pkr(b.offE)} />
            <Row k={"Peak energy (PKR " + tariff.netMetered.peak + ")"} v={pkr(b.peakE)} />
            <Row k={"Fixed charges (PKR " + tariff.netMetered.fixedPerKW + " per kW)"} v={pkr(b.fixed)} />
            <Row k="Quarterly adjustment (QTA)" v={pkr(b.qta)} />
            <Row k="Fuel adjustment (FCA)" v={pkr(b.fca)} />
            <Row k="Additional surcharge (PHL)" v={pkr(b.phl)} />
            <Row k="Electricity duty" v={pkr(b.duty)} />
            <Row k="Sales tax (GST)" v={pkr(b.gst)} />
            <Row k="Municipal charge" v={pkr(b.muct)} />
            <Row k="Total before solar credit" v={pkr(b.gross)} strong />
            <Row k="Net-metering credit" v={"- " + pkr(b.credit)} />
            <Row k="Amount payable" v={pkr(b.net)} strong />
          </div>
          <h2 className="text-xl font-bold mb-1">Add a battery</h2>
          <p className="text-sm text-[var(--mute)] mb-3">Store your midday exports and use them at peak time instead of buying peak units at PKR {tariff.netMetered.peak}.</p>
          {add.battery > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              <Stat k="Battery size" v={add.battery.toFixed(1) + " kWh"} sub="LiFePO4" />
              <Stat k="Peak units moved" v={Math.round(add.shift) + " a month"} />
              <Stat k="Battery cost" v={pkr(add.cost)} />
              <Stat k="Monthly saving" v={pkr(add.save)} sub={add.paybackMonths ? "Pays back in about " + add.paybackMonths + " months" : ""} />
            </div>
          ) : <p className="text-sm">No peak units or exports entered.</p>}
        </section>
      </div>
    </div>
  );
}
