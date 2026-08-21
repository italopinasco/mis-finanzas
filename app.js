const SUPABASE_URL="https://mxiupiurvuoxeesacnes.supabase.co";
const SUPABASE_KEY="sb_publishable_lThI_nQBiQtNIpBZJWPWMg_dO7EqEZA";
const {createClient}=window.supabase;
const db=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

let session=null, user=null, movements=[], config={buy:3.5,sell:3.55,goal:0};
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
  window.scrollTo(0,0);
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-screen]");if(b)setScreen(b.dataset.screen)});

async function loadData(){
  const {data:m,error:me}=await db.from("movimientos").select("*").order("fecha",{ascending:false}).order("created_at",{ascending:false});
  if(me)throw me;
  movements=m||[];
  const {data:c,error:ce}=await db.from("configuracion").select("*").eq("user_id",user.id).maybeSingle();
  if(ce)throw ce;
  if(!c){
    const {data:newc,error:ie}=await db.from("configuracion").insert({
      user_id:user.id,tipo_cambio_compra:3.5,tipo_cambio_venta:3.55,objetivo_ahorro_usd:0
    }).select().single();
    if(ie)throw ie;
    config={buy:Number(newc.tipo_cambio_compra),sell:Number(newc.tipo_cambio_venta),goal:Number(newc.objetivo_ahorro_usd)};
  }else{
    config={buy:Number(c.tipo_cambio_compra),sell:Number(c.tipo_cambio_venta),goal:Number(c.objetivo_ahorro_usd)};
  }
  fillConfig();
  renderDashboard();
  renderMovements();
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
movementMonth.addEventListener("change",renderMovements);
movementType.addEventListener("change",renderMovements);
document.getElementById("month").value=monthKey(today);
document.getElementById("movementMonth").value=monthKey(today);
prevMonth.onclick=()=>changeMonth(-1);
nextMonth.onclick=()=>changeMonth(1);
month.addEventListener("change",renderDashboard);
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
    e.target.reset();setDefaults();await loadData();setScreen("dashboard");
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
    e.target.reset();setDefaults();await loadData();setScreen("dashboard");
  }catch(err){alert("No se pudo guardar el gasto: "+(err.message||err))}
});

movementList.addEventListener("click",async e=>{
  const b=e.target.closest(".delete-movement");if(!b)return;
  if(!confirm("¿Eliminar este movimiento?"))return;
  const {error}=await db.from("movimientos").delete().eq("id",b.dataset.id);
  if(error){alert(error.message);return}
  await loadData();
});

settingsForm.addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const {error}=await db.from("configuracion").update({
      tipo_cambio_compra:Number(buyInput.value),tipo_cambio_venta:Number(sellInput.value),
      objetivo_ahorro_usd:Number(goalInput.value)||0
    }).eq("user_id",user.id);
    if(error)throw error;
    await loadData();alert("Configuración guardada");
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
