const SUPABASE_URL="https://mxiupiurvuoxeesacnes.supabase.co";
const SUPABASE_KEY="sb_publishable_lThI_nQBiQtNIpBZJWPWMg_dO7EqEZA";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
let user=null,movements=[],recurring=[],cfg={buy:3.5,sell:3.55,goal:0};
const now=new Date();
const pad=n=>String(n).padStart(2,"0");
const monthKey=d=>d.getFullYear()+"-"+pad(d.getMonth()+1);
const dateKey=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const money=(n,c)=>c==="USD"?`$ ${Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`:`S/ ${Number(n||0).toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const toUsd=(n,c)=>c==="USD"?Number(n):Number(n)/(cfg.sell||1);
const toPen=(n,c)=>c==="PEN"?Number(n):Number(n)*(cfg.sell||1);

function setError(t){loginMsg.textContent=t||""}
function show(id){
 document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));
 document.getElementById(id).classList.add("active");
 document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("active",x.dataset.go===id));
 if(id==="dashboard")renderDashboard(); if(id==="reports")renderMoves(); if(id==="recurring")renderRecurring();
 window.scrollTo(0,0);
}
function monthRows(m){return movements.filter(x=>x.fecha.slice(0,7)===m)}
function monthSum(m){
 let r={ip:0,iu:0,gp:0,gu:0};
 monthRows(m).forEach(x=>{let p=toPen(x.monto_neto,x.moneda),u=toUsd(x.monto_neto,x.moneda);if(x.tipo==="Ingreso"){r.ip+=p;r.iu+=u}else{r.gp+=p;r.gu+=u}});
 return {...r,bp:r.ip-r.gp,bu:r.iu-r.gu,pct:r.iu?((r.iu-r.gu)/r.iu)*100:0};
}
function cumulative(beforeMonth,currency){
 let total=0;
 [...new Set(movements.map(x=>x.fecha.slice(0,7)))].sort().forEach(m=>{
  if(m<=beforeMonth){let q=monthSum(m);total+=currency==="USD"?q.bu:q.bp}
 });
 return total;
}
function opening(m,c){
 let d=new Date(m+"-01T00:00:00");d.setMonth(d.getMonth()-1);return cumulative(monthKey(d),c);
}
function renderDashboard(){
 let m=month.value||monthKey(now),q=monthSum(m);
 ip.textContent=money(q.ip,"PEN");iu.textContent=money(q.iu,"USD");
 gp.textContent=money(q.gp,"PEN");gu.textContent=money(q.gu,"USD");
 bp.textContent=money(q.bp,"PEN");bu.textContent=money(q.bu,"USD");
 sp.textContent=q.pct.toFixed(1)+"%";su.textContent=money(q.bu,"USD");
 op.textContent=money(opening(m,"PEN"),"PEN");cp.textContent=money(opening(m,"PEN")+q.bp,"PEN");
 ou.textContent=money(opening(m,"USD"),"USD");cu.textContent=money(opening(m,"USD")+q.bu,"USD");
 buy.textContent=cfg.buy.toFixed(4);sell.textContent=cfg.sell.toFixed(4);
 let cat={};monthRows(m).filter(x=>x.tipo==="Gasto").forEach(x=>cat[x.categoria]=(cat[x.categoria]||0)+toUsd(x.monto_neto,x.moneda));
 cats.innerHTML=Object.entries(cat).sort((a,b)=>b[1]-a[1]).map(x=>`<div class=item><span>${x[0]}</span><b>${money(x[1],"USD")}</b></div>`).join("")||'<span class=muted>Sin gastos este mes.</span>';
 recs.innerHTML=recurring.slice().sort((a,b)=>toUsd(b.monto,b.moneda)-toUsd(a.monto,a.moneda)).map(x=>`<div class=item><span>${x.concepto}<small class=muted>${x.categoria||""} · día ${x.dia_pago}</small></span><b>${money(x.monto,x.moneda)}</b></div>`).join("")||'<span class=muted>Sin recurrentes.</span>';
}
async function loadData(){
 let {data:m,error:me}=await sb.from("movimientos").select("*").order("fecha",{ascending:false}).order("created_at",{ascending:false});
 if(me)throw me;movements=m||[];
 let {data:r,error:re}=await sb.from("gastos_recurrentes").select("*").eq("activo",true).order("concepto");
 if(re)throw re;recurring=r||[];
 let {data:c,error:ce}=await sb.from("configuracion").select("*").eq("user_id",user.id).maybeSingle();
 if(ce)throw ce;
 if(!c){
   let {data:newc,error:ie}=await sb.from("configuracion").insert({user_id:user.id,tipo_cambio_compra:3.5,tipo_cambio_venta:3.55,objetivo_ahorro_usd:0}).select().single();
   if(ie)throw ie;c=newc;
 }
 cfg={buy:Number(c.tipo_cambio_compra),sell:Number(c.tipo_cambio_venta),goal:Number(c.objetivo_ahorro_usd||0)};
 settingBuy.value=cfg.buy;settingSell.value=cfg.sell;settingGoal.value=cfg.goal||"";
 renderDashboard();renderMoves();renderRecurring();
}
async function start(){
 let {data:{session}}=await sb.auth.getSession();
 if(!session){loginScreen.hidden=false;app.hidden=true;return}
 user=session.user;loginScreen.hidden=true;app.hidden=false;
 try{await loadData()}catch(e){alert("No se pudo cargar tus datos: "+(e.message||e))}
}
loginForm.addEventListener("submit",async e=>{
 e.preventDefault();setError("");
 try{
  let {data,error}=await sb.auth.signInWithPassword({email:email.value.trim(),password:password.value});
  if(error)throw error;user=data.user;loginScreen.hidden=true;app.hidden=false;await loadData();
 }catch(err){setError(err.message==="Invalid login credentials"?"Correo o contraseña incorrectos.":err.message)}
});
logout.addEventListener("click",async()=>{await sb.auth.signOut();location.reload()});
[month,reportMonth].forEach(x=>x.value=monthKey(now));
[incomeDate,expenseDate].forEach(x=>x.value=dateKey(now));
prev.addEventListener("click",()=>{let d=new Date(month.value+"-01T00:00:00");d.setMonth(d.getMonth()-1);month.value=monthKey(d);renderDashboard()});
next.addEventListener("click",()=>{let d=new Date(month.value+"-01T00:00:00");d.setMonth(d.getMonth()+1);month.value=monthKey(d);renderDashboard()});
month.addEventListener("change",renderDashboard);
document.addEventListener("click",e=>{let b=e.target.closest("[data-go]");if(b)show(b.dataset.go)});
function incomePreview(){let a=Number(incomeAmount.value||0),tax=(incomeCat.value==="Sueldo"&&incomeTax.checked)?a*.08:0;incomePreview.textContent=`Neto: ${money(a-tax,incomeCur.value)} · Impuesto: ${money(tax,incomeCur.value)}`}
[incomeAmount,incomeCat,incomeCur,incomeTax].forEach(x=>x.addEventListener("input",incomePreview));
incomeForm.addEventListener("submit",async e=>{
 e.preventDefault();
 try{
  let amount=Number(incomeAmount.value),tax=(incomeCat.value==="Sueldo"&&incomeTax.checked)?amount*.08:0;
  let {error}=await sb.from("movimientos").insert({user_id:user.id,fecha:incomeDate.value,tipo:"Ingreso",categoria:incomeCat.value,moneda:incomeCur.value,monto:amount,monto_neto:amount-tax,impuesto:tax,cuenta:incomeAccount.value||null,medio_pago:null,descripcion:incomeDesc.value||null,recurrente:false});
  if(error)throw error;await loadData();e.target.reset();incomeDate.value=dateKey(now);incomePreview();show("dashboard");
 }catch(err){alert("No se pudo guardar el ingreso: "+err.message)}
});
expenseForm.addEventListener("submit",async e=>{
 e.preventDefault();
 try{
  let amount=Number(expenseAmount.value);
  let {error}=await sb.from("movimientos").insert({user_id:user.id,fecha:expenseDate.value,tipo:"Gasto",categoria:expenseCat.value,moneda:expenseCur.value,monto:amount,monto_neto:amount,impuesto:0,cuenta:expenseAccount.value||null,medio_pago:expenseMethod.value,descripcion:expenseDesc.value||null,recurrente:expenseRecurring.checked});
  if(error)throw error;await loadData();e.target.reset();expenseDate.value=dateKey(now);show("dashboard");
 }catch(err){alert("No se pudo guardar el gasto: "+err.message)}
});
recurringForm.addEventListener("submit",async e=>{
 e.preventDefault();
 try{let {error}=await sb.from("gastos_recurrentes").insert({user_id:user.id,concepto:recName.value,categoria:recCat.value,moneda:recCur.value,monto:Number(recAmount.value),dia_pago:Number(recDay.value),activo:true});if(error)throw error;await loadData();e.target.reset();show("recurring")}catch(err){alert("No se pudo guardar: "+err.message)}
});
async function deleteMovement(id){if(!confirm("¿Eliminar este movimiento?"))return;let {error}=await sb.from("movimientos").delete().eq("id",id);if(error)alert(error.message);else{await loadData();renderMoves()}}
window.deleteMovement=deleteMovement;
async function deleteRecurring(id){if(!confirm("¿Eliminar este gasto recurrente?"))return;let {error}=await sb.from("gastos_recurrentes").delete().eq("id",id);if(error)alert(error.message);else{await loadData();renderRecurring()}}
window.deleteRecurring=deleteRecurring;
function renderMoves(){let m=reportMonth.value,t=reportType.value,a=monthRows(m).filter(x=>!t||x.tipo===t);moves.innerHTML=a.map(x=>`<div class=movement><b>${x.categoria}</b> <strong>${x.tipo==="Ingreso"?"+":"−"}${money(x.monto_neto,x.moneda)}</strong><div class=muted>${x.fecha} · ${x.cuenta||"sin cuenta"} · ${x.descripcion||""}${x.impuesto?` · impuesto: ${money(x.impuesto,x.moneda)}`:""}</div><button class=secondary onclick="deleteMovement('${x.id}')">Eliminar</button></div>`).join("")||'<div class=panel>Sin movimientos.</div>'}
reportMonth.addEventListener("change",renderMoves);reportType.addEventListener("change",renderMoves);
recurringForm.addEventListener("submit",()=>{});
settingsForm.addEventListener("submit",async e=>{
 e.preventDefault();
 try{
  let {data:c,error}=await sb.from("configuracion").select("id").eq("user_id",user.id).single();if(error)throw error;
  let {error:u}=await sb.from("configuracion").update({tipo_cambio_compra:Number(settingBuy.value),tipo_cambio_venta:Number(settingSell.value),objetivo_ahorro_usd:Number(settingGoal.value||0)}).eq("id",c.id);if(u)throw u;
  await loadData();alert("Configuración guardada");
 }catch(err){alert("No se pudo guardar: "+err.message)}
});
function renderRecurring(){recList.innerHTML=recurring.map(x=>`<div class=movement><b>${x.concepto}</b> · ${money(x.monto,x.moneda)}<div class=muted>${x.categoria||""} · día ${x.dia_pago}</div><button class=secondary onclick="deleteRecurring('${x.id}')">Eliminar</button></div>`).join("")||'<div class=panel>Sin gastos recurrentes.</div>'}
sb.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"){location.reload()}});
incomePreview();
start();
