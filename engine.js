import { TARIFF } from "./tariffs.js";
export const CACHED_TARIFFS_V2026 = TARIFF;

/* Cache manager: keeps the embedded tariff file as the source of truth; only sun-hours (and an optional own tariff API) are refreshed live. */
export class TariffCacheManager {
  constructor(snapshot){ this.snapshot = snapshot; this.tariffUrl = import.meta.env?.VITE_TARIFF_API_URL || "";
    this.nasaUrl = "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=67.01&latitude=24.86&format=JSON"; }
  async _json(url, ms=4000){ const c=new AbortController(), t=setTimeout(()=>c.abort(),ms);
    try{ const r=await fetch(url,{signal:c.signal}); if(!r.ok) throw new Error("HTTP "+r.status); return await r.json(); } finally{ clearTimeout(t); } }
  async sync(){
    let tariff = JSON.parse(JSON.stringify(this.snapshot)), live=false;
    if(this.tariffUrl){ try{ const t=await this._json(this.tariffUrl); if(t && Array.isArray(t.slabs)){ tariff={...tariff,...t}; live=true; } }catch(e){} }
    try{ const g=await this._json(this.nasaUrl); const v=g?.properties?.parameter?.ALLSKY_SFC_SW_DWN?.ANN; if(v>3 && v<8){ tariff.peakSunHours=v; live=true; } }catch(e){}
    return {tariff, source: live?"live":"snapshot"};
  }
}

/* Billing model: whole consumption at one slab's rate + fixed + adjustments + taxes (K-Electric unprotected residential). */
const slabsFor = (k,t,o={}) => (o.protected && k<=200) ? t.protectedSlabs : t.slabs;
const slabFor = (k,t,o={}) => slabsFor(k,t,o).find(s => s.upto==null || k<=s.upto);
export function billFromKWh(k, t, o={}){
  if(k<=0) return 0;
  const s=slabFor(k,t,o);
  const phl = (o.protected && k<=200) ? t.phlProtected : t.phl, kw = o.kw ?? 5;
  const dutyBase = k*(s.rate + t.fca + t.qta + phl);   /* duty is not charged on the fixed charge */
  const duty = dutyBase*t.dutyPct;
  const pre = dutyBase + s.fixed*kw + duty;                  /* GST applies to everything incl. fixed charge and duty */
  const sub = pre*(1+t.gstPct);
  const it = (o.nonFiler && sub>=t.nonFilerTaxFrom) ? sub*t.nonFilerTaxPct : 0;
  return sub + it + s.muct + t.tvFee;
}
export function calculateExactKWhFromBill(bill, t, o={}){
  if(bill<=0) return {kwh:0,cls:"unprotected",marginal:0,slabs:[],overheadPct:0};
  const kw=o.kw ?? 5, share=o.peakShare ?? 0.35;
  const touBill = k => calculateNetMeteredBill({sanctionedKW:kw,peakUnits:k*share,offPeakUnits:k*(1-share),exportUnits:0},t).net;
  if(!o.tou && o.protected && bill>billFromKWh(200,t,o)) o={...o,protected:false}; /* bill too high to be a protected bill */
  const bf = k => o.tou ? touBill(k) : billFromKWh(k,t,o);
  let lo=0, hi=20000;
  for(let i=0;i<80;i++){ const m=(lo+hi)/2; if(bf(m)<bill) lo=m; else hi=m; }
  const kwh=hi, marginal=bf(kwh)-bf(kwh-1);
  if(o.tou){
    const n=t.netMetered, energy=kwh*(share*n.peak+(1-share)*n.offPeak);
    return {kwh, cls:"tou", marginal, fixed:kw*n.fixedPerKW, overheadPct: energy>0?(bill-energy)/energy*100:0,
      slabs:[{label:"Off-peak",kwh:kwh*(1-share),rate:n.offPeak},{label:"Peak",kwh:kwh*share,rate:n.peak}]};
  }
  const arr=slabsFor(kwh,t,o), s=slabFor(kwh,t,o), idx=arr.indexOf(s), from=idx? arr[idx-1].upto+1 : 1, energy=kwh*s.rate;
  return {kwh, cls:(o.protected && kwh<=200)?"protected":"unprotected", marginal, fixed:s.fixed*kw, overheadPct: energy>0?(bill-energy)/energy*100:0,
    slabs:[{label: s.upto==null? from+"+" : from+"–"+s.upto, kwh, rate:s.rate}]};
}

/* ============ 4. SYSTEM SIZING ============ */
const DERATE = 0.80, SQFT_PER_KW = 100, PANEL_W = 550;
const INVERTERS = [3,5,6,8,10,12,15,20,25,30,40,50,60,80,100];
export function sizeSystemProduction(kwh, roofSqFt, t){
  const dailyKWh = kwh/30;
  const neededKW = dailyKWh/(t.peakSunHours*DERATE);
  const roofMaxPanels = Math.floor(roofSqFt/SQFT_PER_KW*1000/PANEL_W);
  const wantPanels = Math.max(1, Math.ceil(neededKW*1000/PANEL_W));
  const panels = Math.min(wantPanels, Math.max(1,roofMaxPanels));
  const pvKW = panels*PANEL_W/1000;
  const capped = wantPanels>roofMaxPanels;
  const monthlyGen = pvKW*t.peakSunHours*DERATE*30;
  const residualKWh = Math.max(0, kwh-monthlyGen);
  const inverterKW = INVERTERS.find(x=>x>=pvKW) || Math.ceil(pvKW);
  const avgKW = kwh/720, essentialKW = Math.max(0.8, avgKW*2.5*0.35);
  const backupHrs = capped ? 6 : 4; /* more grid dependency → longer ride-through */
  const batteryKWh = Math.ceil(essentialKW*backupHrs/0.9*2)/2; /* LiFePO4, 90% usable DoD */
  return {dailyKWh, neededKW, pvKW, panels, capped, roofMaxKW: roofSqFt/SQFT_PER_KW, monthlyGen, residualKWh, gridDepPct: kwh>0?residualKWh/kwh*100:0, inverterKW, essentialKW, backupHrs, batteryKWh};
}

/* ============ 5. NET-BILLING FINANCIALS ============ */
const COST_PER_KW = 110000, BATT_PER_KWH = 55000, SELF_FRAC = 0.65, ESCALATION = 0.05, DEGRADE = 0.005;
function irr(flows){
  const npv = r => flows.reduce((a,f,i)=>a+f/Math.pow(1+r,i),0);
  let lo=-0.9, hi=5; if(npv(lo)*npv(hi)>0) return null;
  for(let i=0;i<100;i++){ const m=(lo+hi)/2; if(npv(lo)*npv(m)<=0) hi=m; else lo=m; }
  return (lo+hi)/2;
}
export function calculateFinancials(bill, kwhRes, sz, t, o={}){
  const pvCost = sz.pvKW*(COST_PER_KW + t.concurrenceFeePerKW), battCost = sz.batteryKWh*BATT_PER_KWH, cost = pvCost+battCost;
  const gen=sz.monthlyGen, share=o.peakShare ?? 0.35, offU=kwhRes.kwh*(1-share), peakU=kwhRes.kwh*share;
  const touNet=(off,peak)=>calculateNetMeteredBill({sanctionedKW:o.kw ?? 5,peakUnits:peak,offPeakUnits:off,exportUnits:0},t).net;
  const self=Math.min(gen*SELF_FRAC, (o.tou?offU:kwhRes.kwh)*0.9), exp=gen-self; /* on time-of-use, daytime solar only offsets off-peak units */
  const bill0 = o.tou ? touNet(offU,peakU) : billFromKWh(kwhRes.kwh,t,o);
  const selfSave = Math.max(0, bill0 - (o.tou ? touNet(Math.max(0,offU-self),peakU) : billFromKWh(Math.max(0,kwhRes.kwh-self),t,o)));
  const expCredit = exp*t.exportRate;
  const monthlySave = Math.max(0, Math.min(bill - t.tvFee, selfSave+expCredit));
  const flows=[-cost];
  for(let y=1;y<=25;y++){ const d=Math.pow(1-DEGRADE,y-1), e=Math.pow(1+ESCALATION,y-1); flows.push(12*(selfSave*d*e + expCredit*d)); }
  let cum=-cost, months=null;
  for(let y=1;y<=25 && months==null;y++){ if(cum+flows[y]>=0) months=(y-1)*12+Math.ceil(-cum/(flows[y]/12)); cum+=flows[y]; }
  return {cost, pvCost, battCost, selfKWh:self, exportKWh:exp, selfSave, expCredit, monthlySave, reductionPct: bill>0?monthlySave/bill*100:0, billAfter: bill-monthlySave, paybackMonths:months, net5: flows.slice(1,6).reduce((a,b)=>a+b,0)-cost, irr: irr(flows)};
}

/* ============ 6. VENDOR QUOTE AUDITOR ============ */
export function auditQuote(q, sz, fin){
  const out=[]; if(!(q.panelKW>0)||!(q.cost>0)) return [{lvl:"info",txt:"Enter panel capacity and total cost to audit a quote."}];
  const pr=q.panelKW/sz.pvKW;
  if(q.panelKW>sz.roofMaxKW*1.001) out.push({lvl:"bad",txt:"Quoted panel capacity ("+q.panelKW+" kW) exceeds what your roof can hold ("+sz.roofMaxKW.toFixed(1)+" kW)."});
  else if(pr>1.15) out.push({lvl:"bad",txt:"Panels are "+Math.round((pr-1)*100)+"% above the "+sz.pvKW.toFixed(2)+" kW WattWise recommends. Extra capacity is exported at the low buyback rate, so it pays back slowly."});
  else if(pr<0.85) out.push({lvl:"warn",txt:"Panels are "+Math.round((1-pr)*100)+"% below the recommended size. You will keep paying for grid power."});
  else out.push({lvl:"ok",txt:"Panel capacity is within 15% of the recommendation."});
  if(q.inverterKW>0){
    const ir=q.inverterKW/q.panelKW;
    if(ir>1.3) out.push({lvl:"bad",txt:"Inverter is "+ir.toFixed(2)+"× the panel capacity. A ratio near 1.0 is enough."});
    else if(ir<0.8) out.push({lvl:"warn",txt:"Inverter is smaller than the panels (ratio "+ir.toFixed(2)+"), so peak output will clip."});
    else out.push({lvl:"ok",txt:"Inverter-to-panel ratio ("+ir.toFixed(2)+") is reasonable."});
  }
  const perKW=q.cost/q.panelKW, bench=q.battery?fin.cost*(q.panelKW/sz.pvKW):q.panelKW*COST_PER_KW;
  const diff=(q.cost-bench)/bench*100;
  if(diff>15) out.push({lvl:"bad",txt:"Price is "+Math.round(diff)+"% above the benchmark of PKR "+Math.round(bench).toLocaleString("en-PK")+" (quote works out to PKR "+Math.round(perKW).toLocaleString("en-PK")+"/kW)."});
  else if(diff<-25) out.push({lvl:"warn",txt:"Price is "+Math.round(-diff)+"% below benchmark. Check panel tier, warranty and what is excluded."});
  else out.push({lvl:"ok",txt:"Price is within the normal range of the benchmark."});
  return out;
}


export const COST_PER_KW_REF = COST_PER_KW;
export const pkr = n => "PKR "+Math.round(n).toLocaleString("en-PK");
export const clamp = (v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(v)?v:a));
export const lvlTag = {ok:"OK",warn:"Check",bad:"Flag",info:"Note"};

/* ---- Net-metered customers (existing solar, peak/off-peak meter) ---- */
export function calculateNetMeteredBill(i, t){
  const n=t.netMetered, imp=i.peakUnits+i.offPeakUnits;
  const offE=i.offPeakUnits*n.offPeak, peakE=i.peakUnits*n.peak, fixed=i.sanctionedKW*n.fixedPerKW;
  const qta=imp*t.qta, fca=(imp+i.exportUnits)*t.fca, phl=imp*t.phl;
  const duty=(offE+peakE+fca+qta+phl)*t.dutyPct;
  const gst=(offE+peakE+fixed+qta+fca+phl+duty)*t.gstPct;
  const muct = imp>0 ? slabFor(imp,t).muct : 0;
  const gross=offE+peakE+fixed+qta+fca+phl+duty+gst+muct, credit=i.exportUnits*(i.creditRate ?? n.creditRate);
  return {imp,offE,peakE,fixed,qta,fca,phl,duty,gst,muct,gross,credit,net:gross-credit};
}
export function netMeteredBatteryAddOn(i, t){
  const eta=0.9, shift=Math.min(i.peakUnits, i.exportUnits*eta);
  const battery=Math.ceil(shift/30/0.9*2)/2, cost=battery*BATT_PER_KWH;
  const before=calculateNetMeteredBill(i,t);
  const after=calculateNetMeteredBill({...i, peakUnits:i.peakUnits-shift, exportUnits:i.exportUnits-shift/eta},t);
  const save=before.net-after.net;
  return {shift,battery,cost,save,paybackMonths: save>0 ? Math.ceil(cost/save) : null};
}
