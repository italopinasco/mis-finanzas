const SUPABASE_URL="https://mxiupiurvuoxeesacnes.supabase.co";
const SUPABASE_KEY="sb_publishable_lThI_nQBiQtNIpBZJWPWMg_dO7EqEZA";
const {createClient}=window.supabase;
const db=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

let session=null, user=null, movements=[], recurringRecords=[], entities=[], accounts=[], categories=[], subcategories=[], config={buy:3.5,sell:3.55,goal:0};
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
  if(name==="dashboard")renderDashboard();
  if(name==="movements")renderMovements();
  if(name==="reports")renderReports();
  if(name==="recurring")renderRecurring();
  window.scrollTo(0,0);
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-screen]");if(b)setScreen(b.dataset.screen)});

function setSync(text,ok){const el=document.getElementById("syncStatus");if(el){el.textContent=text+" · PEN + USD";el.className=ok?"sync-ok":"sync-bad";}}
function toast(text){let t=document.getElementById("toast");if(!t){t=document.createElement("div");t.id="toast";t.className="toast";document.body.appendChild(t);}t.textContent=text;t.hidden=false;clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.hidden=true,2600);}

async function loadData(){
 setSync("Sincronizando…",false);
 const [m,r,e,a,c,s,cfg]=await Promise.all([
  db.from("movimientos").select("*").order("fecha",{ascending:false}).order("created_at",{ascending:false}),
  db.from("gastos_recurrentes").select("*").eq("activo",true).order("concepto"),
  db.from("entidades").select("*").eq("activa",true).order("nombre"),
  db.from("cuentas").select("*").eq("activa",true).order("nombre"),
  db.from("categorias").select("*").eq("activa",true).order("nombre"),
  db.from("subcategorias").select("*").eq("activa",true).order("nombre"),
  db.from("configuracion").select("*").eq("user_id",user.id).maybeSingle()
 ]);
 for(const x of [m,r,e,a,c,s,cfg]) if(x.error) throw x.error;
 movements=m.data||[]; recurringRecords=r.data||[]; entities=e.data||[]; accounts=a.data||[]; categories=c.data||[]; subcategories=s.data||[];
 const cc=cfg.data;
 if(!cc){
  const {data:nc,error}=await db.from("configuracion").insert({user_id:user.id,tipo_cambio_compra:3.5,tipo_cambio_venta:3.55,objetivo_ahorro_usd:0}).select().single();
  if(error) throw error;
  config={buy:Number(nc.tipo_cambio_compra),sell:Number(nc.tipo_cambio_venta),goal:Number(nc.objetivo_ahorro_usd)};
 }else config={buy:Number(cc.tipo_cambio_compra),sell:Number(cc.tipo_cambio_venta),goal:Number(cc.objetivo_ahorro_usd)};
 fillConfig(); renderAccountSelectors(); renderCategorySelectors(); renderEntityList(); renderAccountList(); renderCategoryList();
 renderDashboard(); renderMovements(); renderRecurring(); renderReports(); setSync("● Sincronizado",true);
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

function renderAccountSelectors(){
 const opts=accounts.map(a=>`<option value="${a.id}">${a.nombre} · ${a.moneda}</option>`).join("");
 const ie=document.getElementById("incomeAccount"); if(ie && ie.tagName==="INPUT") ie.outerHTML=`<select id="incomeAccount">${opts}</select>`;
 const ee=document.getElementById("expenseAccount"); if(ee && ee.tagName==="INPUT") ee.outerHTML=`<select id="expenseAccount">${opts}</select>`;
 const ae=document.getElementById("accountEntity"); if(ae) ae.innerHTML=entities.map(x=>`<option value="${x.id}">${x.nombre}</option>`).join("");
}
function renderCategorySelectors(){
 const ec=document.getElementById("expenseCategory");
 if(ec) ec.innerHTML=categories.map(c=>`<option value="${c.nombre}">${c.nombre}</option>`).join("");
}
function renderEntityList(){
 const b=document.getElementById("entityList"); if(!b)return;
 b.innerHTML=entities.map(x=>`<div class="settings-row"><span><b>${x.nombre}</b><small class="muted"> · ${x.tipo}</small></span></div>`).join("")||'<span class="muted">Sin entidades.</span>';
}
function renderAccountList(){
 const b=document.getElementById("accountList"); if(!b)return;
 b.innerHTML=accounts.map(x=>`<div class="settings-row"><span><b>${x.nombre}</b><small class="muted"> · ${x.moneda} · ${x.uso}</small></span></div>`).join("")||'<span class="muted">Sin cuentas.</span>';
}
function renderCategoryList(){
 const b=document.getElementById("categoryList"); if(!b)return;
 b.innerHTML=categories.map(x=>`<div class="settings-row"><b>${x.nombre}</b></div>`).join("")||'<span class="muted">Sin categorías.</span>';
}

function renderDashboard(){
  const m=document.getElementById("month").value||monthKey(today),q=monthly(m);
  ip.textContent=fmt(q.ip,"PEN");iu.textContent=fmt(q.iu,"USD");
  gp.textContent=fmt(q.gp,"PEN");gu.textContent=fmt(q.gu,"USD");
  bp.textContent=fmt(q.bp,"PEN");bu.textContent=fmt(q.bu,"USD");
  savePct.textContent=q.pct.toFixed(1)+"%";saveUsd.textContent=fmt(q.bu,"USD");
  openPen.textContent=fmt(opening(m,"PEN"),"PEN");closePen.textContent=fmt(opening(m,"PEN")+q.bp,"PEN");
  openUsd.textContent=fmt(opening(m,"USD"),"USD");closeUsd.textContent=fmt(opening(m,"USD")+q.bu,"USD");
  buy.textContent=config.buy.toFixed(4);sell.textContent=config.sell.toFixed(4);
  const cat={};
  monthRows(m).filter(x=>x.tipo==="Gasto").forEach(x=>cat[x.categoria]=(cat[x.categoria]||0)+usd(x.monto_neto,x.moneda));
  categories.innerHTML=Object.entries(cat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="item"><span>${k}</span><b>${fmt(v,"USD")}</b></div>`).join("")||'<span class="muted">Sin gastos este mes.</span>';
}

function renderMovements(){
  const m=movementMonth.value||monthKey(today),t=movementType.value;
  const list=movements.filter(x=>String(x.fecha).slice(0,7)===m&&(!t||x.tipo===t));
  movementList.innerHTML=list.map(x=>`<div class="movement"><b>${x.categoria}</b> <strong>${x.tipo==="Ingreso"?"+":"−"}${fmt(x.monto_neto,x.moneda)}</strong><div class="muted">${x.fecha} · ${x.cuenta||"sin cuenta"} · ${x.descripcion||""}${Number(x.impuesto||0)>0?` · impuesto: ${fmt(x.impuesto,x.moneda)}`:""}</div><button class="secondary delete-movement" data-id="${x.id}" type="button">Eliminar</button></div>`).join("")||'<div class="panel">Sin movimientos.</div>';
}
function renderRecurring(){const box=document.getElementById("recurringList");if(!box)return;box.innerHTML=recurringRecords.map(x=>`<div class="movement"><b>${x.concepto}</b> · ${fmt(x.monto,x.moneda)}<div class="muted">${x.categoria||""} · día ${x.dia_pago}</div><button class="secondary delete-recurring" data-id="${x.id}" type="button">Eliminar</button></div>`).join("")||'<div class="panel">Sin gastos recurrentes.</div>';}
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
  try{
    const {error}=await db.from("movimientos").insert({
      user_id:user.id,fecha:incomeDate.value,tipo:"Ingreso",categoria:incomeCategory.value,
      moneda:incomeCurrency.value,monto:a,monto_neto:a-tax,impuesto:tax,
      cuenta:incomeAccount.value||null,medio_pago:null,descripcion:incomeDescription.value||null,recurrente:false
    });
    if(error)throw error;
    e.target.reset();setDefaults();await loadData();setScreen("dashboard");toast("Movimiento guardado correctamente");
  }catch(err){alert("No se pudo guardar el ingreso: "+(err.message||err))}
});

expenseForm.addEventListener("submit",async e=>{
  e.preventDefault();
  const a=Number(expenseAmount.value);
  try{
    const {error}=await db.from("movimientos").insert({
      user_id:user.id,fecha:expenseDate.value,tipo:"Gasto",categoria:expenseCategory.value,
      moneda:expenseCurrency.value,monto:a,monto_neto:a,impuesto:0,
      cuenta:expenseAccount.value||null,medio_pago:paymentMethod.value,
      descripcion:expenseDescription.value||null,recurrente:recurring.checked
    });
    if(error)throw error;
    e.target.reset();setDefaults();await loadData();setScreen("dashboard");toast("Movimiento guardado correctamente");
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

entityForm.addEventListener("submit",async e=>{e.preventDefault();try{const {error}=await db.from("entidades").insert({user_id:user.id,nombre:entityName.value.trim(),tipo:entityType.value,activa:true});if(error)throw error;e.target.reset();await loadData();toast("Entidad creada");}catch(err){alert(err.message||err)}});
accountForm.addEventListener("submit",async e=>{e.preventDefault();try{const {error}=await db.from("cuentas").insert({user_id:user.id,entidad_id:accountEntity.value,nombre:accountName.value.trim(),moneda:accountCurrency.value,tipo:accountType.value,uso:accountUse.value,saldo_inicial:Number(accountOpening.value)||0,activa:true});if(error)throw error;e.target.reset();accountOpening.value="0";await loadData();toast("Cuenta creada");}catch(err){alert(err.message||err)}});
categoryForm.addEventListener("submit",async e=>{e.preventDefault();try{const {error}=await db.from("categorias").insert({user_id:user.id,nombre:categoryName.value.trim(),activa:true});if(error)throw error;e.target.reset();await loadData();toast("Categoría creada");}catch(err){alert(err.message||err)}});
settingsForm.addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const {error}=await db.from("configuracion").update({
      tipo_cambio_compra:Number(buyInput.value),tipo_cambio_venta:Number(sellInput.value),
      objetivo_ahorro_usd:Number(goalInput.value)||0
    }).eq("user_id",user.id);
    if(error)throw error;
    await loadData();toast("Configuración guardada correctamente");
  }catch(err){alert("No se pudo guardar: "+(err.message||err))}
});

function fillConfig(){buyInput.value=config.buy;sellInput.value=config.sell;goalInput.value=config.goal||""}
function setDefaults(){incomeDate.value=dateKey(today);expenseDate.value=dateKey(today);updateTaxPreview()}

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
