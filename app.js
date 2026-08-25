const SUPABASE_URL="https://mxiupiurvuoxeesacnes.supabase.co";
const SUPABASE_KEY="sb_publishable_lThI_nQBiQtNIpBZJWPWMg_dO7EqEZA";
const {createClient}=window.supabase;
const db=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

let session=null, user=null, movements=[], recurringRecords=[], transferRecords=[], accounts=[], entities=[], tipoCambioHistorial=[], config={buy:3.5,sell:3.55,goal:0}, tcMode=localStorage.getItem("mis_finanzas_tc_mode")||"auto";
const today=new Date();
const pad=n=>String(n).padStart(2,"0");
const monthKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fmt=(n,c)=>c==="USD"?`$ ${Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`:`S/ ${Number(n||0).toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const usd=(n,c)=>c==="USD"?Number(n):Number(n)/(Number(config.sell)||1);
const pen=(n,c)=>c==="PEN"?Number(n):Number(n)*(Number(config.sell)||1);

function setScreen(name){
  document.querySelectorAll(".screen").forEach(x=>x.classList.toggle("active",x.id===name));
  document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("active",x.dataset.screen===name));
  if(name==="dashboard"){populateMovementAccountSelectors();renderDashboard();}
  if(name==="movements")renderMovements();
  if(name==="reports")renderReports();
  if(name==="recurring")renderRecurring();
  if(name==="transfers"){populateTransferAccounts();renderTransfers();}
  window.scrollTo(0,0);
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-screen]");if(b)setScreen(b.dataset.screen)});

function setSync(text,ok){const el=document.getElementById("syncStatus");if(el){el.textContent=text+" · PEN + USD";el.className=ok?"sync-ok":"sync-bad";}}
function toast(text){let t=document.getElementById("toast");if(!t){t=document.createElement("div");t.id="toast";t.className="toast";document.body.appendChild(t);}t.textContent=text;t.hidden=false;clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.hidden=true,2600);}

async function loadData(){
  setSync("Sincronizando…",false);
  const [mres,rres,cres,tcres,tres,ares,eres]=await Promise.all([
    db.from("movimientos").select("*").order("fecha",{ascending:false}).order("created_at",{ascending:false}),
    db.from("gastos_recurrentes").select("*").eq("activo",true).order("concepto"),
    db.from("configuracion").select("*").eq("user_id",user.id).maybeSingle(),
    db.from("tipo_cambio_historial").select("*").order("fecha",{ascending:false}).order("created_at",{ascending:false}).limit(30),
    db.from("transferencias").select("*").eq("user_id",user.id).order("fecha",{ascending:false}).order("created_at",{ascending:false}).limit(50),
    db.from("cuentas").select("*").eq("user_id",user.id).eq("activa",true).order("nombre"),
    db.from("entidades").select("*").order("nombre")
  ]);
  if(mres.error)throw mres.error;
  if(rres.error)throw rres.error;
  if(cres.error)throw cres.error;
  if(tcres.error)throw tcres.error;
  if(tres.error)throw tres.error;
  if(ares.error)throw ares.error;
  if(eres.error)throw eres.error;

  movements=mres.data||[];
  recurringRecords=rres.data||[];
  tipoCambioHistorial=tcres.data||[];
  transferRecords=tres.data||[];
  accounts=ares.data||[];
  entities=eres.data||[];

  const c=cres.data;
  if(!c){
    const {data:newc,error:ie}=await db.from("configuracion").insert({
      user_id:user.id,tipo_cambio_compra:3.5,tipo_cambio_venta:3.55,objetivo_ahorro_usd:0
    }).select().single();
    if(ie)throw ie;
    config={buy:Number(newc.tipo_cambio_compra),sell:Number(newc.tipo_cambio_venta),goal:Number(newc.objetivo_ahorro_usd)};
  }else{
    config={buy:Number(c.tipo_cambio_compra),sell:Number(c.tipo_cambio_venta),goal:Number(c.objetivo_ahorro_usd)};
  }

  applyTipoCambio();
  fillConfig();
  renderDashboard();
  renderMovements();
  renderRecurring();
  renderTransfers();
  populateTransferAccounts();
  populateMovementAccountSelectors();
  setSync("● Sincronizado",true);
}

function latestTipoCambio(){
  return tipoCambioHistorial.find(x=>Number(x.compra)>0&&Number(x.venta)>0)||null;
}

function applyTipoCambio(){
  const latest=latestTipoCambio();
  if(tcMode==="auto" && latest){
    config.buy=Number(latest.compra);
    config.sell=Number(latest.venta);
  }

  const buyEl=document.getElementById("buy");
  const sellEl=document.getElementById("sell");
  if(buyEl)buyEl.textContent=Number(config.buy||0).toFixed(4);
  if(sellEl)sellEl.textContent=Number(config.sell||0).toFixed(4);

  const status=document.getElementById("tcStatus");
  if(status){
    status.textContent = tcMode==="auto"
      ? (latest ? `Automático · BCRP / SBS · ${latest.fecha}` : "Automático · sin dato disponible")
      : "Manual";
  }

  const info=document.getElementById("tcAutoInfo");
  if(info){
    info.innerHTML=latest
      ? `Compra: <b>S/ ${Number(latest.compra).toFixed(4)}</b> · Venta: <b>S/ ${Number(latest.venta).toFixed(4)}</b><br><small>Fuente: ${latest.fuente||"BCRP / SBS"} · Fecha: ${latest.fecha}</small>`
      : "No hay un registro automático disponible todavía.";
  }
}

function fillConfig(){
  const buyInputEl=document.getElementById("buyInput");
  const sellInputEl=document.getElementById("sellInput");
  const goalInputEl=document.getElementById("goalInput");
  const modeEl=document.getElementById("tcMode");
  const autoBox=document.getElementById("tcAutoBox");
  const manualBox=document.getElementById("tcManualBox");
  if(buyInputEl)buyInputEl.value=Number(config.buy||0).toFixed(4);
  if(sellInputEl)sellInputEl.value=Number(config.sell||0).toFixed(4);
  if(goalInputEl)goalInputEl.value=config.goal||"";
  if(modeEl)modeEl.value=tcMode;
  if(autoBox)autoBox.classList.toggle("hidden",tcMode!=="auto");
  if(manualBox)manualBox.classList.toggle("hidden",tcMode!=="manual");
  applyTipoCambio();
}

async function actualizarTipoCambio(){
  const btn=document.getElementById("refreshTcBtn");
  if(btn){btn.disabled=true;btn.textContent="Actualizando…";}
  try{
    const {data,error}=await db.functions.invoke("actualizar-tipo-de-cambio",{body:{}});
    if(error)throw error;
    if(data && data.success===false)throw new Error(data.error||"La función devolvió un error.");
    await loadData();
    toast(`Tipo de cambio actualizado: S/ ${Number(config.buy).toFixed(4)} / S/ ${Number(config.sell).toFixed(4)}`);
  }catch(err){
    console.error("actualizarTipoCambio",err);
    alert("No se pudo actualizar el tipo de cambio: "+(err.message||err));
  }finally{
    if(btn){btn.disabled=false;btn.textContent="↻ Actualizar ahora";}
  }
}

function monthRows(m){return movements.filter(x=>String(x.fecha).slice(0,7)===m)}
function monthly(m){
  let ip=0,iu=0,gp=0,gu=0;
  monthRows(m).forEach(x=>{
    const p=pen(x.monto_neto,x.moneda),u=usd(x.monto_neto,x.moneda);
    if(x.tipo==="Ingreso"){ip+=p;iu+=u}else{gp+=p;gu+=u}
  });
  return {ip,iu,gp,gu,bp:ip-gp,bu:iu-gu,pct:iu?((iu-gu)/iu)*100:0};
}
function cumulative(beforeMonth,currency){
  let total=0;
  [...new Set(movements.map(x=>String(x.fecha).slice(0,7)))].sort().forEach(m=>{
    if(m<=beforeMonth){
      const q=monthly(m);
      total+=currency==="USD"?q.bu:q.bp;
    }
  });
  return total;
}
function opening(m,currency){
  const d=new Date(`${m}-01T00:00:00`);
  d.setMonth(d.getMonth()-1);
  return cumulative(monthKey(d),currency);
}

function renderReports(){
  const m=document.getElementById("month").value||monthKey(today),q=monthly(m);
  document.getElementById("repIncomePen").textContent=fmt(q.ip,"PEN");
  document.getElementById("repIncomeUsd").textContent=fmt(q.iu,"USD");
  document.getElementById("repExpensePen").textContent=fmt(q.gp,"PEN");
  document.getElementById("repExpenseUsd").textContent=fmt(q.gu,"USD");
  const ex=monthRows(m).filter(x=>x.tipo==="Gasto").map(x=>({name:x.categoria,usd:usd(x.monto_neto,x.moneda),text:fmt(x.monto_neto,x.moneda)})).sort((a,b)=>b.usd-a.usd).slice(0,8);
  document.getElementById("topExpenses").innerHTML=ex.map((x,i)=>`<div class="item"><span>${i+1}. ${x.name}</span><b>${x.text}</b></div>`).join("")||'<span class="muted">Sin gastos este mes.</span>';
  const cat={};monthRows(m).filter(x=>x.tipo==="Gasto").forEach(x=>cat[x.categoria]=(cat[x.categoria]||0)+usd(x.monto_neto,x.moneda));
  document.getElementById("reportCategories").innerHTML=Object.entries(cat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="item"><span>${k}</span><b>${fmt(v,"USD")}</b></div>`).join("")||'<span class="muted">Sin gastos este mes.</span>';
  const ms=[...new Set(movements.map(x=>String(x.fecha).slice(0,7)))].sort().slice(-6).reverse();
  document.getElementById("monthlyComparison").innerHTML=ms.map(k=>{const z=monthly(k);return `<div class="item"><span>${k}<small class="muted">Saldo del mes</small></span><b>${fmt(z.bu,"USD")}</b></div>`}).join("")||'<span class="muted">Aún no hay historial.</span>';
}


function normalizeText(v){
  return String(v||"").trim().toLowerCase().replace(/\s+/g," ");
}

function accountMatchesMovement(account, movement){
  // Preferred: direct foreign-key relationship.
  if(movement.cuenta_id) return movement.cuenta_id===account.id;

  // Backward-compatible fallback for any very old movement that has not yet
  // been linked to cuenta_id.
  const value=normalizeText(movement.cuenta);
  if(!value) return false;
  const name=normalizeText(account.nombre);
  const label=normalizeText(accountLabel(account));
  return value===name || value===label || value.includes(name) || name.includes(value);
}

function calculateAccountBalance(account){
  let balance=Number(account.saldo_inicial||0);

  movements.forEach(m=>{
    if(!accountMatchesMovement(account,m)) return;
    if(String(m.moneda).toUpperCase()!==String(account.moneda).toUpperCase()) return;
    const amount=Number(m.monto_neto||0);
    balance += m.tipo==="Ingreso" ? amount : -amount;
  });

  transferRecords.forEach(t=>{
    if(t.cuenta_origen_id===account.id &&
       String(t.moneda_origen).toUpperCase()===String(account.moneda).toUpperCase()){
      balance -= Number(t.monto_origen||0);
    }
    if(t.cuenta_destino_id===account.id &&
       String(t.moneda_destino).toUpperCase()===String(account.moneda).toUpperCase()){
      balance += Number(t.monto_destino||0);
    }
  });

  return balance;
}

function renderAccountBalances(){
  const box=document.getElementById("accountBalances");
  if(!box) return;

  if(!accounts.length){
    box.innerHTML='<span class="muted">No hay cuentas activas.</span>';
    return;
  }

  const groups={PEN:[],USD:[]};
  accounts.forEach(a=>{
    const c=String(a.moneda||"PEN").toUpperCase();
    (groups[c]||(groups[c]=[])).push(a);
  });

  const renderGroup=(currency,title)=>{
    const list=groups[currency]||[];
    if(!list.length) return "";
    return `<div class="account-group"><h4>${title}</h4>${
      list.map(a=>{
        const bal=calculateAccountBalance(a);
        return `<div class="account-balance-row">
          <div><b>${accountLabel(a)}</b><small>${a.tipo||""}${a.uso?` · ${a.uso}`:""}</small></div>
          <strong>${fmt(bal,currency)}</strong>
        </div>`;
      }).join("")
    }</div>`;
  };

  box.innerHTML=renderGroup("PEN","Soles") + renderGroup("USD","Dólares");
}

function populateMovementAccountSelectors(){
  ["incomeAccount","expenseAccount"].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    const current=el.value;
    el.innerHTML='<option value="">Selecciona una cuenta</option>'+
      accounts.map(a=>`<option value="${a.id}">${accountLabel(a)}</option>`).join("");
    if(accounts.some(a=>a.id===current)) el.value=current;
  });
}

function renderDashboard(){
  const m=document.getElementById("month").value||monthKey(today),q=monthly(m);
  ip.textContent=fmt(q.ip,"PEN");iu.textContent=fmt(q.iu,"USD");
  gp.textContent=fmt(q.gp,"PEN");gu.textContent=fmt(q.gu,"USD");
  bp.textContent=fmt(q.bp,"PEN");bu.textContent=fmt(q.bu,"USD");
  savePct.textContent=q.pct.toFixed(1)+"%";saveUsd.textContent=fmt(q.bu,"USD");
  openPen.textContent=fmt(opening(m,"PEN"),"PEN");closePen.textContent=fmt(opening(m,"PEN")+q.bp,"PEN");
  openUsd.textContent=fmt(opening(m,"USD"),"USD");closeUsd.textContent=fmt(opening(m,"USD")+q.bu,"USD");
  buy.textContent=Number(config.buy||0).toFixed(4);sell.textContent=Number(config.sell||0).toFixed(4);applyTipoCambio();
  renderAccountBalances();
  const cat={};
  monthRows(m).filter(x=>x.tipo==="Gasto").forEach(x=>cat[x.categoria]=(cat[x.categoria]||0)+usd(x.monto_neto,x.moneda));
  categories.innerHTML=Object.entries(cat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="item"><span>${k}</span><b>${fmt(v,"USD")}</b></div>`).join("")||'<span class="muted">Sin gastos este mes.</span>';
}

function renderMovements(){
  const m=movementMonth.value||monthKey(today),t=movementType.value;
  const list=movements.filter(x=>String(x.fecha).slice(0,7)===m&&(!t||x.tipo===t));
  movementList.innerHTML=list.map(x=>{
    const a=x.cuenta_id?accountById(x.cuenta_id):null;
    const accountText=a?accountLabel(a):(x.cuenta||"sin cuenta");
    return `<div class="movement"><b>${x.categoria}</b> <strong>${x.tipo==="Ingreso"?"+":"−"}${fmt(x.monto_neto,x.moneda)}</strong><div class="muted">${x.fecha} · ${accountText} · ${x.descripcion||""}${Number(x.impuesto||0)>0?` · impuesto: ${fmt(x.impuesto,x.moneda)}`:""}</div><button class="secondary delete-movement" data-id="${x.id}" type="button">Eliminar</button></div>`;
  }).join("")||'<div class="panel">Sin movimientos.</div>';
}
function renderRecurring(){const box=document.getElementById("recurringList");if(!box)return;box.innerHTML=recurringRecords.map(x=>`<div class="movement"><b>${x.concepto}</b> · ${fmt(x.monto,x.moneda)}<div class="muted">${x.categoria||""} · día ${x.dia_pago}</div><button class="secondary delete-recurring" data-id="${x.id}" type="button">Eliminar</button></div>`).join("")||'<div class="panel">Sin gastos recurrentes.</div>';}

function entityName(id){const e=entities.find(x=>x.id===id);return e?(e.nombre||e.name||e.razon_social||""):"";}
function accountLabel(a){const ent=entityName(a.entidad_id);return `${ent?ent+" · ":""}${a.nombre} · ${a.moneda}`;}
function accountById(id){return accounts.find(a=>a.id===id)||null;}
function populateTransferAccounts(){
 const origin=document.getElementById("transferOrigin"),dest=document.getElementById("transferDestination");if(!origin||!dest)return;
 const ov=origin.value,dv=dest.value;
 origin.innerHTML='<option value="">Selecciona cuenta origen</option>'+accounts.map(a=>`<option value="${a.id}">${accountLabel(a)}</option>`).join("");
 if(accounts.some(a=>a.id===ov))origin.value=ov;
 populateDestinationAccounts(origin.value,dv);updateTransferOriginInfo();updateTransferCalculation();
}
function populateDestinationAccounts(originId,currentDest=""){
 const dest=document.getElementById("transferDestination");if(!dest)return;
 const opts=accounts.filter(a=>a.id!==originId);
 dest.innerHTML='<option value="">Selecciona cuenta destino</option>'+opts.map(a=>`<option value="${a.id}">${accountLabel(a)}</option>`).join("");
 if(opts.some(a=>a.id===currentDest))dest.value=currentDest;
}
function defaultTransferRate(o,d){if(!o||!d||o.moneda===d.moneda)return 1;return o.moneda==="PEN"?Number(config.sell||0):Number(config.buy||0);}
function updateTransferOriginInfo(){
 const o=accountById(document.getElementById("transferOrigin")?.value),info=document.getElementById("originInfo");if(!info)return;
 info.innerHTML=o?`Moneda: <b>${o.moneda}</b> · Tipo: ${o.tipo||"Cuenta"} · Uso: ${o.uso||"—"}`:"Selecciona una cuenta de origen.";
}
function updateTransferCalculation(){
 const o=accountById(document.getElementById("transferOrigin")?.value),d=accountById(document.getElementById("transferDestination")?.value);
 const amount=Number(document.getElementById("transferOriginAmount")?.value)||0,box=document.getElementById("transferRateBox"),ri=document.getElementById("transferRate"),hint=document.getElementById("transferRateHint"),out=document.getElementById("transferDestinationAmount"),manual=document.getElementById("transferRateManual");
 if(!o||!d){box?.classList.add("hidden");if(out)out.textContent="—";return;}
 const cross=o.moneda!==d.moneda;box?.classList.toggle("hidden",!cross);let rate=defaultTransferRate(o,d);
 if(cross){
  if(ri.dataset.pair!==`${o.moneda}-${d.moneda}`){ri.value=Number(rate||0).toFixed(4);ri.dataset.pair=`${o.moneda}-${d.moneda}`;if(manual)manual.checked=false;ri.readOnly=true;}
  rate=Number(ri.value)||rate;
  if(hint)hint.textContent=o.moneda==="PEN"?`PEN → USD usa por defecto la venta SBS: 1 USD = S/ ${Number(rate).toFixed(4)}.`:`USD → PEN usa por defecto la compra SBS: 1 USD = S/ ${Number(rate).toFixed(4)}.`;
 } else rate=1;
 const destAmount=cross?(o.moneda==="PEN"?amount/rate:amount*rate):amount;
 if(out)out.textContent=destAmount>0?fmt(destAmount,d.moneda):"—";
}
function renderTransfers(){
 const box=document.getElementById("transferList");if(!box)return;
 if(!transferRecords.length){box.innerHTML='<span class="muted">Sin transferencias.</span>';return;}
 box.innerHTML=transferRecords.map(x=>{const o=accountById(x.cuenta_origen_id),d=accountById(x.cuenta_destino_id);return `<div class="movement"><b>${o?accountLabel(o):"Cuenta origen"} → ${d?accountLabel(d):"Cuenta destino"}</b><strong>${fmt(x.monto_origen,x.moneda_origen)} → ${fmt(x.monto_destino,x.moneda_destino)}</strong><div class="muted">${x.fecha}${x.tipo_cambio?` · TC ${Number(x.tipo_cambio).toFixed(4)}`:""}${x.descripcion?` · ${x.descripcion}`:""}</div></div>`;}).join("");
}
document.getElementById("transferOrigin").addEventListener("change",()=>{const o=document.getElementById("transferOrigin"),d=document.getElementById("transferDestination");populateDestinationAccounts(o.value,d.value);document.getElementById("transferRate").dataset.pair="";updateTransferOriginInfo();updateTransferCalculation();});
document.getElementById("transferDestination").addEventListener("change",()=>{document.getElementById("transferRate").dataset.pair="";updateTransferCalculation();});
document.getElementById("transferOriginAmount").addEventListener("input",updateTransferCalculation);
document.getElementById("transferRate").addEventListener("input",updateTransferCalculation);
document.getElementById("transferRateManual").addEventListener("change",e=>{const ri=document.getElementById("transferRate");ri.readOnly=!e.target.checked;if(e.target.checked)ri.focus();else{const o=accountById(document.getElementById("transferOrigin").value),d=accountById(document.getElementById("transferDestination").value);ri.value=Number(defaultTransferRate(o,d)||0).toFixed(4);}updateTransferCalculation();});
document.getElementById("transferForm").addEventListener("submit",async e=>{
 e.preventDefault();const o=accountById(document.getElementById("transferOrigin").value),d=accountById(document.getElementById("transferDestination").value),amount=Number(document.getElementById("transferOriginAmount").value);
 if(!o||!d){alert("Selecciona cuenta origen y destino.");return;}if(o.id===d.id){alert("La cuenta origen y destino deben ser diferentes.");return;}if(!(amount>0)){alert("Ingresa un monto válido.");return;}
 const cross=o.moneda!==d.moneda;const rate=cross?Number(document.getElementById("transferRate").value):1;if(cross&&!(rate>0)){alert("Ingresa un tipo de cambio válido.");return;}
 const destAmount=cross?(o.moneda==="PEN"?amount/rate:amount*rate):amount;
 try{setSync("Guardando transferencia…",false);const {error}=await db.from("transferencias").insert({user_id:user.id,fecha:document.getElementById("transferDate").value,cuenta_origen_id:o.id,cuenta_destino_id:d.id,moneda_origen:o.moneda,monto_origen:amount,moneda_destino:d.moneda,monto_destino:destAmount,tipo_cambio:rate,descripcion:document.getElementById("transferDescription").value||null});if(error)throw error;e.target.reset();document.getElementById("transferDate").value=dateKey(today);document.getElementById("transferDestination").innerHTML='<option value="">Selecciona primero la cuenta origen</option>';document.getElementById("transferRateBox").classList.add("hidden");document.getElementById("transferDestinationAmount").textContent="—";await loadData();setScreen("transfers");toast("Transferencia guardada correctamente");}catch(err){setSync("Error de sincronización",false);alert("No se pudo guardar la transferencia: "+(err.message||err));}
});
movementMonth.addEventListener("change",renderMovements);
movementType.addEventListener("change",renderMovements);
document.getElementById("month").value=monthKey(today);
document.getElementById("movementMonth").value=monthKey(today);
prevMonth.onclick=()=>changeMonth(-1);
nextMonth.onclick=()=>changeMonth(1);
month.addEventListener("change",()=>{renderDashboard();if(document.getElementById("reports").classList.contains("active"))renderReports();});
function changeMonth(n){const d=new Date(`${month.value}-01T00:00:00`);d.setMonth(d.getMonth()+n);month.value=monthKey(d);renderDashboard()}

function updateTaxPreview(){
  const a=Number(incomeAmount.value)||0;
  const tax=(incomeCategory.value==="Sueldo"&&salaryTax.checked)?a*.08:0;
  taxPreview.textContent=`Neto: ${fmt(a-tax,incomeCurrency.value)} · Impuesto: ${fmt(tax,incomeCurrency.value)}`;
}
[incomeAmount,incomeCategory,incomeCurrency,salaryTax].forEach(x=>x.addEventListener("input",updateTaxPreview));

incomeForm.addEventListener("submit",async e=>{
  e.preventDefault();
  const a=Number(incomeAmount.value),tax=(incomeCategory.value==="Sueldo"&&salaryTax.checked)?a*.08:0;
  const account=accountById(incomeAccount.value);
  if(!account){alert("Selecciona una cuenta.");return;}
  if(account.moneda!==incomeCurrency.value){
    alert(`La cuenta seleccionada está en ${account.moneda} y el ingreso está en ${incomeCurrency.value}. Selecciona una cuenta con la misma moneda.`);
    return;
  }
  try{
    const {error}=await db.from("movimientos").insert({
      user_id:user.id,fecha:incomeDate.value,tipo:"Ingreso",categoria:incomeCategory.value,
      moneda:incomeCurrency.value,monto:a,monto_neto:a-tax,impuesto:tax,
      cuenta_id:account.id,cuenta:account.nombre,medio_pago:null,descripcion:incomeDescription.value||null,recurrente:false
    });
    if(error)throw error;
    e.target.reset();setDefaults();await loadData();setScreen("dashboard");toast("Ingreso guardado correctamente");
  }catch(err){alert("No se pudo guardar el ingreso: "+(err.message||err))}
});

expenseForm.addEventListener("submit",async e=>{
  e.preventDefault();
  const a=Number(expenseAmount.value);
  const account=accountById(expenseAccount.value);
  if(!account){alert("Selecciona una cuenta.");return;}
  if(account.moneda!==expenseCurrency.value){
    alert(`La cuenta seleccionada está en ${account.moneda} y el gasto está en ${expenseCurrency.value}. Selecciona una cuenta con la misma moneda.`);
    return;
  }
  try{
    const {error}=await db.from("movimientos").insert({
      user_id:user.id,fecha:expenseDate.value,tipo:"Gasto",categoria:expenseCategory.value,
      moneda:expenseCurrency.value,monto:a,monto_neto:a,impuesto:0,
      cuenta_id:account.id,cuenta:account.nombre,medio_pago:paymentMethod.value,
      descripcion:expenseDescription.value||null,recurrente:recurring.checked
    });
    if(error)throw error;
    e.target.reset();setDefaults();await loadData();setScreen("dashboard");toast("Gasto guardado correctamente");
  }catch(err){alert("No se pudo guardar el gasto: "+(err.message||err))}
});

movementList.addEventListener("click",async e=>{
  const b=e.target.closest(".delete-movement");if(!b)return;
  if(!confirm("¿Eliminar este movimiento?"))return;
  const {error}=await db.from("movimientos").delete().eq("id",b.dataset.id);
  if(error){alert(error.message);return}
  await loadData();
});

recurringForm.addEventListener("submit",async e=>{e.preventDefault();try{setSync("Guardando…",false);const {error}=await db.from("gastos_recurrentes").insert({user_id:user.id,concepto:recurringName.value,categoria:recurringCategory.value,moneda:recurringCurrency.value,monto:Number(recurringAmount.value),dia_pago:Number(recurringDay.value),activo:true});if(error)throw error;e.target.reset();await loadData();setScreen("recurring");toast("Gasto recurrente guardado");}catch(err){setSync("Error de sincronización",false);alert("No se pudo guardar: "+(err.message||err));}});
recurringList.addEventListener("click",async e=>{const b=e.target.closest(".delete-recurring");if(!b)return;if(!confirm("¿Eliminar este gasto recurrente?"))return;try{setSync("Guardando…",false);const {error}=await db.from("gastos_recurrentes").delete().eq("id",b.dataset.id);if(error)throw error;await loadData();toast("Gasto recurrente eliminado");}catch(err){setSync("Error de sincronización",false);alert(err.message||err);}});

document.getElementById("tcMode").addEventListener("change",()=>{
  tcMode=document.getElementById("tcMode").value;
  localStorage.setItem("mis_finanzas_tc_mode",tcMode);
  fillConfig();
  renderDashboard();
});

document.getElementById("refreshTcBtn").addEventListener("click",actualizarTipoCambio);

settingsForm.addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const mode=document.getElementById("tcMode").value;
    const buyValue=Number(document.getElementById("buyInput").value);
    const sellValue=Number(document.getElementById("sellInput").value);
    if(mode==="manual" && (!(buyValue>0)||!(sellValue>0))){
      throw new Error("Ingresa compra y venta válidas.");
    }
    const {error}=await db.from("configuracion").update({
      tipo_cambio_compra:buyValue,
      tipo_cambio_venta:sellValue,
      objetivo_ahorro_usd:Number(goalInput.value)||0
    }).eq("user_id",user.id);
    if(error)throw error;
    tcMode=mode;
    localStorage.setItem("mis_finanzas_tc_mode",tcMode);
    await loadData();
    toast("Configuración guardada correctamente");
  }catch(err){alert("No se pudo guardar: "+(err.message||err))}
});

function setDefaults(){incomeDate.value=dateKey(today);expenseDate.value=dateKey(today);const td=document.getElementById("transferDate");if(td)td.value=dateKey(today);updateTaxPreview()}

loginForm.addEventListener("submit",async e=>{
  e.preventDefault();
  loginMessage.textContent="";
  loginBtn.disabled=true;
  loginBtn.textContent="Ingresando...";
  try{
    const {data,error}=await db.auth.signInWithPassword({email:email.value.trim(),password:password.value});
    if(error)throw error;
    session=data.session;user=data.user;
    loginScreen.classList.add("hidden");
    appShell.classList.remove("hidden");
    setDefaults();
    await loadData();
    setScreen("dashboard");
  }catch(err){
    loginMessage.textContent=err.message||"No se pudo iniciar sesión.";
  }finally{
    loginBtn.disabled=false;
    loginBtn.textContent="Ingresar";
  }
});

logoutBtn.addEventListener("click",async()=>{
  await db.auth.signOut();
  location.reload();
});

db.auth.onAuthStateChange(async(_event,s)=>{
  if(!s)return;
  session=s;user=s.user;
  if(loginScreen.classList.contains("hidden"))return;
  loginScreen.classList.add("hidden");appShell.classList.remove("hidden");
  try{setDefaults();await loadData();setScreen("dashboard")}catch(err){alert("Error cargando tus datos: "+(err.message||err))}
});

(async()=>{
  setDefaults();
  const {data}=await db.auth.getSession();
  if(data.session){
    session=data.session;user=data.session.user;
    loginScreen.classList.add("hidden");appShell.classList.remove("hidden");
    try{await loadData();setScreen("dashboard")}catch(err){alert("Error cargando tus datos: "+(err.message||err))}
  }else{
    loginScreen.classList.remove("hidden");appShell.classList.add("hidden");
  }
})();
