import { pkr, lvlTag } from "./engine.js";

export async function exportAuditPdf({ ctype, b, r, k, sz, fin, tariff, audit, srcLabel, payTxt }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = 48, W = 499;
  let y = 56;
  const line = (t, size = 10.5, bold = false, gap = 16) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    for (const p of doc.splitTextToSize(String(t), W)) {
      if (y > 790) { doc.addPage(); y = 56; }
      doc.text(p, L, y);
      y += gap;
    }
  };
  line("WattWise engineering audit summary", 20, true, 28);
  line("Generated " + new Date().toLocaleDateString("en-GB") + " | " + tariff.label, 9, false, 22);

  line("Tariff basis: " + tariff.utility + ". " + tariff.asOf, 9, false, 12);
  y += 8;
  line("Household", 13, true, 20);
  line("Monthly bill: " + pkr(b) + " (about " + Math.round(k.kwh) + " kWh, marginal rate PKR " + k.marginal.toFixed(1) + "/kWh)");
  line("Customer type: " + ({ protected: "Protected", tou: "Time of use", unprotected: "Unprotected" }[ctype]));
  line("Usable roof: " + r + " sq ft (fits up to " + sz.roofMaxKW.toFixed(1) + " kW)", 10.5, false, 24);

  line("Recommended hardware", 13, true, 20);
  line("Solar array: " + sz.pvKW.toFixed(2) + " kW (" + sz.panels + " x 550 W Tier-1 mono PERC)");
  line("Hybrid inverter: " + sz.inverterKW + " kW");
  line("LiFePO4 battery: " + sz.batteryKWh.toFixed(1) + " kWh (" + sz.backupHrs + " h for " + sz.essentialKW.toFixed(1) + " kW essential load)");
  line("Monthly generation: " + Math.round(sz.monthlyGen) + " kWh at " + tariff.peakSunHours.toFixed(1) + " sun hours and 0.80 derating");
  if (sz.capped) line("Roof-limited: about " + sz.gridDepPct.toFixed(0) + "% of usage (" + Math.round(sz.residualKWh) + " kWh) remains grid-supplied.");
  y += 8;

  line("Financials (NEPRA net billing)", 13, true, 20);
  line("Turnkey cost: " + pkr(fin.cost) + " (solar " + pkr(fin.pvCost) + ", battery " + pkr(fin.battCost) + ")");
  line("Monthly saving: " + pkr(fin.monthlySave) + " (" + fin.reductionPct.toFixed(0) + "% of bill), new bill about " + pkr(fin.billAfter));
  line("Self-used " + Math.round(fin.selfKWh) + " kWh, exported " + Math.round(fin.exportKWh) + " kWh at PKR " + tariff.exportRate + "/kWh");
  line("Payback: " + payTxt);
  line("5-year net savings: " + pkr(fin.net5));
  line("25-year IRR: " + (fin.irr == null ? "n/a" : (fin.irr * 100).toFixed(1) + "%"), 10.5, false, 24);

  line("Vendor quote audit", 13, true, 20);
  for (const a of audit) line("[" + lvlTag[a.lvl] + "] " + a.txt);
  y += 10;
  line("Based on K-Electric and NEPRA tariffs as of October 2026. Your K-Electric bill is always the final figure.", 8.5, false, 12);
  doc.save("WattWise-audit-report.pdf");
}
