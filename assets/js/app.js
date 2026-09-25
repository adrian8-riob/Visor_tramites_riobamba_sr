(() => {
  'use strict';
  const C = window.APP_CONFIG;
  const F = C.fields;
  const state = { map:null, layerDefs:new Map(), mapLayers:new Map(), data:new Map(), filteredTramites:[], heat:null, charts:{}, uploadedCounter:0 };
  const $ = id => document.getElementById(id);
  const norm = v => (v ?? '').toString().trim();
  const upper = v => norm(v).toLocaleUpperCase('es');
  const safe = v => norm(v).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));

  function initMap(){
    state.map = L.map('map', {zoomControl:true}).setView(C.initialView, C.initialZoom);
    L.tileLayer(C.basemap.url, {attribution:C.basemap.attribution, maxZoom:20}).addTo(state.map);
  }

  async function loadAll(){
    clearOperationalLayers();
    state.data.clear(); state.layerDefs.clear();
    for (const def of C.layers) {
      state.layerDefs.set(def.id, def);
      try { await loadLayer(def); }
      catch(e){ console.error(def.name,e); showMessage(`No se pudo cargar: ${def.name}`); }
    }
    rebuildLayerList(); rebuildFilters(); applyFilters();
  }

  function clearOperationalLayers(){
    for (const layer of state.mapLayers.values()) if (state.map.hasLayer(layer)) state.map.removeLayer(layer);
    state.mapLayers.clear();
    if(state.heat && state.map.hasLayer(state.heat)) state.map.removeLayer(state.heat);
    state.heat=null;
  }

  async function loadLayer(def){
    if(def.type === 'wms'){
      const layer=L.tileLayer.wms(def.url,{layers:def.layers,format:def.format||'image/png',transparent:def.transparent!==false,version:def.version||'1.3.0'});
      state.mapLayers.set(def.id,layer); state.data.set(def.id,null); if(def.visible) layer.addTo(state.map); return;
    }
    const res=await fetch(def.url,{cache:'no-store'}); if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const gj=await res.json(); state.data.set(def.id,gj);
    const layer=createGeoJsonLayer(def,gj); state.mapLayers.set(def.id,layer); if(def.visible) layer.addTo(state.map);
  }

  function createGeoJsonLayer(def, gj){
    const isProcedures=def.role==='procedures';
    const opts={
      style: feature => ({...(def.style||{}), ...(typeof def.styleFunction==='function'?def.styleFunction(feature):{})}),
      pointToLayer: isProcedures ? (feature,latlng)=>L.circleMarker(latlng, procedurePointStyle(feature)) : undefined,
      onEachFeature:(feature,layer)=>{
        layer.bindPopup(makePopup(def,feature));
      }
    };
    return L.geoJSON(gj,opts);
  }

  function procedurePointStyle(feature){
    const t=upper(feature?.properties?.[F.type]);
    return {radius:6,color:'#fff',weight:1.3,fillColor:C.typeColors[t]||C.typeColors.OTRO,fillOpacity:.9};
  }

  function makePopup(def,feature){
    const p=feature.properties||{};
    if(def.role==='procedures') return `<div class="popup-title">${safe(p[F.type]||'Trámite')}</div>
      <b>ID:</b> ${safe(p[F.id])}<br><b>Fecha:</b> ${safe(formatDate(p[F.date]))}<br>
      <b>Plataforma:</b> ${safe(p[F.platform]||'SIN DATO')}<br><b>Parroquia:</b> ${safe(p[F.parish]||'SIN DATO')}<br>
      <b>Estado:</b> ${safe(p[F.status]||'SIN DATO')}<br><b>N.º trámite:</b> ${safe(p[F.transactionNumber]||'SIN DATO')}<br><b>Clave catastral:</b> ${safe(p[F.cadastralKey]||'SIN DATO')}`;
    const title=p.nombre||p.NOMBRE||p.name||def.name;
    const rows=Object.entries(p).slice(0,8).map(([k,v])=>`<b>${safe(k)}:</b> ${safe(v)}`).join('<br>');
    return `<div class="popup-title">${safe(title)}</div>${rows}`;
  }

  function rebuildLayerList(){
    const box=$('layerList'); box.innerHTML='';
    for(const [id,def] of state.layerDefs){
      const row=document.createElement('label'); row.className='layer-item';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=state.map.hasLayer(state.mapLayers.get(id));
      cb.addEventListener('change',()=>toggleLayer(id,cb.checked));
      const sw=document.createElement('span'); sw.className='swatch';
      sw.style.background=def.role==='procedures'?'#0b6574':(def.style?.fillColor||def.style?.color||'#888');
      row.append(cb,sw,document.createTextNode(def.name)); box.appendChild(row);
    }
    renderLegend();
  }

  function toggleLayer(id,on){
    const layer=state.mapLayers.get(id); if(!layer)return;
    if(on) layer.addTo(state.map); else state.map.removeLayer(layer); renderLegend();
  }

  function getTramitesFeatureCollection(){
    const found=[...state.layerDefs.values()].find(d=>d.role==='procedures');
    return found ? state.data.get(found.id) : null;
  }

  function rebuildFilters(){
    const fc=getTramitesFeatureCollection(); const feats=fc?.features||[];
    fillSelect($('filterTipo'), unique(feats.map(f=>f.properties?.[F.type])), 'Todos');
    rebuildTerritorySelect();
  }

  function rebuildTerritorySelect(){
    const fc=getTramitesFeatureCollection(); const feats=fc?.features||[];
    const mode=$('territoryMode').value; const field=mode==='parroquia'?F.parish:F.platform;
    fillSelect($('filterTerritorio'), unique(feats.map(f=>f.properties?.[field])), 'Todos');
    $('territoryChartTitle').textContent=`Trámites por ${mode}`;
  }

  function fillSelect(sel,values,first){
    const current=sel.value; sel.innerHTML=`<option value="">${first}</option>`;
    values.filter(Boolean).sort((a,b)=>a.localeCompare(b,'es')).forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;sel.appendChild(o);});
    if([...sel.options].some(o=>o.value===current)) sel.value=current;
  }
  function unique(a){ return [...new Set(a.map(norm).filter(Boolean))]; }

  function applyFilters(){
    const fc=getTramitesFeatureCollection(); const feats=fc?.features||[];
    const tipo=$('filterTipo').value, mode=$('territoryMode').value, territorio=$('filterTerritorio').value;
    const tf=mode==='parroquia'?F.parish:F.platform; const desde=$('filterDesde').value, hasta=$('filterHasta').value;
    state.filteredTramites=feats.filter(ft=>{
      const p=ft.properties||{}; const d=parseDate(p[F.date]);
      if(tipo && norm(p[F.type])!==tipo)return false; if(territorio && norm(p[tf])!==territorio)return false;
      if(desde && (!d || d < new Date(`${desde}T00:00:00`))) return false;
      if(hasta && (!d || d > new Date(`${hasta}T23:59:59`))) return false;
      return true;
    });
    redrawProcedures(); updateHeat(); updateKPIs(); updateCharts(); updateTable(); updateFilterStatus();
  }

  function redrawProcedures(){
    const def=[...state.layerDefs.values()].find(d=>d.role==='procedures'); if(!def)return;
    const old=state.mapLayers.get(def.id); const visible=old && state.map.hasLayer(old); if(old) state.map.removeLayer(old);
    const fc={type:'FeatureCollection',features:state.filteredTramites}; const layer=createGeoJsonLayer(def,fc); state.mapLayers.set(def.id,layer); if(visible) layer.addTo(state.map);
  }

  function updateHeat(){
    if(state.heat && state.map.hasLayer(state.heat)) state.map.removeLayer(state.heat);
    state.heat=null; if(!$('toggleHeat').checked || typeof L.heatLayer!=='function') return;
    const pts=state.filteredTramites.flatMap(f=>{
      if(f.geometry?.type==='Point') return [[f.geometry.coordinates[1],f.geometry.coordinates[0],1]];
      return [];
    });
    state.heat=L.heatLayer(pts,{radius:28,blur:20,maxZoom:17}); state.heat.addTo(state.map);
  }

  function updateKPIs(){
    const n=state.filteredTramites.length; $('kpiTotal').textContent=n.toLocaleString('es-EC');
    const topT=topCount(state.filteredTramites.map(f=>norm(f.properties?.[F.type])||'SIN DATO'));
    $('kpiTopTipo').textContent=topT.key||'—'; $('kpiTopTipoN').textContent=`${topT.count||0} registros`;
    const mode=$('territoryMode').value, tf=mode==='parroquia'?F.parish:F.platform;
    const topS=topCount(state.filteredTramites.map(f=>norm(f.properties?.[tf])||'SIN DATO'));
    $('kpiTopTerritorio').textContent=topS.key||'—'; $('kpiTopTerritorioN').textContent=`${topS.count||0} registros`;
    const dates=state.filteredTramites.map(f=>parseDate(f.properties?.[F.date])).filter(Boolean);
    let days=1; if(dates.length){ const min=new Date(Math.min(...dates)),max=new Date(Math.max(...dates)); days=Math.max(1,Math.floor((max-min)/86400000)+1); }
    $('kpiFreq').textContent=(n/days).toLocaleString('es-EC',{maximumFractionDigits:1});
  }

  function updateCharts(){
    const typeCounts=countBy(state.filteredTramites.map(f=>norm(f.properties?.[F.type])||'SIN DATO'));
    makeChart('chartTipo','bar',Object.keys(typeCounts),Object.values(typeCounts),'Trámites');
    const mode=$('territoryMode').value, tf=mode==='parroquia'?F.parish:F.platform;
    const terrCounts=countBy(state.filteredTramites.map(f=>norm(f.properties?.[tf])||'SIN DATO'));
    makeChart('chartTerritorio','doughnut',Object.keys(terrCounts),Object.values(terrCounts),'Trámites');
    const timeCounts={}; state.filteredTramites.forEach(f=>{const d=parseDate(f.properties?.[F.date]);if(!d)return;const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;timeCounts[k]=(timeCounts[k]||0)+1;});
    const keys=Object.keys(timeCounts).sort(); makeChart('chartTiempo','line',keys,keys.map(k=>timeCounts[k]),'Trámites');
  }

  function makeChart(id,type,labels,data,label){
    if(typeof Chart==='undefined')return; if(state.charts[id]) state.charts[id].destroy();
    const cfg={type,data:{labels,datasets:[{label,data,borderWidth:1.5,tension:.25}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:type==='doughnut',position:'bottom'}},scales:type==='doughnut'?{}:{y:{beginAtZero:true,ticks:{precision:0}},x:{ticks:{autoSkip:true,maxRotation:35,minRotation:0}}}}};
    state.charts[id]=new Chart($(id),cfg);
  }

  function updateTable(){
    const rows=[...state.filteredTramites].sort((a,b)=>(parseDate(b.properties?.[F.date])||0)-(parseDate(a.properties?.[F.date])||0)).slice(0,100);
    $('tableCount').textContent=state.filteredTramites.length.toLocaleString('es-EC'); $('tableBody').innerHTML=rows.map(f=>{const p=f.properties||{};return `<tr><td>${safe(formatDate(p[F.date]))}</td><td>${safe(p[F.type])}</td><td>${safe(p[F.platform])}</td><td>${safe(p[F.parish])}</td><td>${safe(p[F.status])}</td><td>${safe(p[F.id])}</td></tr>`}).join('');
  }

  function updateFilterStatus(){
    const active=[$('filterTipo').value,$('filterTerritorio').value,$('filterDesde').value,$('filterHasta').value].filter(Boolean).length;
    $('filterStatus').textContent=active?`${active} filtro${active>1?'s':''}`:'Sin filtros';
  }

  function renderLegend(){
    const box=$('legend'); box.innerHTML='';
    const procDef=[...state.layerDefs.values()].find(d=>d.role==='procedures');
    if(procDef && state.map.hasLayer(state.mapLayers.get(procDef.id))){
      const title=document.createElement('div'); title.className='small'; title.textContent='Tipos de trámite'; box.appendChild(title);
      Object.entries(C.typeColors).forEach(([k,color])=>{box.insertAdjacentHTML('beforeend',`<div class="legend-row"><span class="legend-circle" style="background:${color}"></span>${safe(k)}</div>`)});
    }
    for(const [id,def] of state.layerDefs){ if(def.role==='procedures'||!state.map.hasLayer(state.mapLayers.get(id)))continue; const color=def.style?.color||'#777'; box.insertAdjacentHTML('beforeend',`<div class="legend-row"><span class="legend-line" style="color:${color}"></span>${safe(def.name)}</div>`); }
  }

  async function readGeoJSON(file){ return JSON.parse(await file.text()); }
  function validateGeoJSON(gj){ return gj && gj.type==='FeatureCollection' && Array.isArray(gj.features); }

  async function loadProcedureFile(file){
    const gj=await readGeoJSON(file); if(!validateGeoJSON(gj)) throw new Error('GeoJSON inválido');
    let def=[...state.layerDefs.values()].find(d=>d.role==='procedures');
    if(!def){def={id:'tramites_upload',name:'Trámites cargados',role:'procedures',type:'geojson',visible:true};state.layerDefs.set(def.id,def);}
    const old=state.mapLayers.get(def.id); if(old)state.map.removeLayer(old); state.data.set(def.id,gj);
    const layer=createGeoJsonLayer(def,gj); state.mapLayers.set(def.id,layer); layer.addTo(state.map); rebuildLayerList();rebuildFilters();applyFilters();fitGeoJson(gj);
  }

  async function loadGenericFile(file){
    const gj=await readGeoJSON(file); if(!validateGeoJSON(gj)) throw new Error('GeoJSON inválido');
    const id=`upload_${++state.uploadedCounter}`; const def={id,name:file.name.replace(/\.geojson|\.json/ig,''),role:'uploaded',type:'geojson',visible:true,style:{color:'#a23b72',weight:2,fillColor:'#c77da6',fillOpacity:.08}};
    state.layerDefs.set(id,def); state.data.set(id,gj); const layer=createGeoJsonLayer(def,gj); state.mapLayers.set(id,layer);layer.addTo(state.map); rebuildLayerList();fitGeoJson(gj);
  }

  function fitGeoJson(gj){ try{const l=L.geoJSON(gj);const b=l.getBounds();if(b.isValid())state.map.fitBounds(b.pad(.08));}catch{} }
  function clearFilters(){ $('filterTipo').value='';$('filterTerritorio').value='';$('filterDesde').value='';$('filterHasta').value='';applyFilters(); }
  function showMessage(msg){const e=$('mapMessage');e.textContent=msg;e.classList.remove('hidden');setTimeout(()=>e.classList.add('hidden'),4000);}
  function parseDate(v){ if(!v)return null; const text=String(v).trim(); const m=text.match(/^(\d{4})-(\d{2})-(\d{2})$/); const d=m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])):new Date(text); return Number.isNaN(d.getTime())?null:d; }
  function formatDate(v){const d=parseDate(v);return d?new Intl.DateTimeFormat('es-EC').format(d):norm(v);}
  function countBy(arr){return arr.reduce((o,k)=>{o[k]=(o[k]||0)+1;return o;},{});}
  function topCount(arr){ const [key,count]=Object.entries(countBy(arr)).sort((a,b)=>b[1]-a[1])[0]||['',0]; return {key,count}; }

  function wireEvents(){
    $('btnApply').onclick=applyFilters; $('btnClear').onclick=clearFilters; $('btnReload').onclick=loadAll;
    $('btnHome').onclick=()=>state.map.setView(C.initialView,C.initialZoom); $('territoryMode').onchange=()=>{rebuildTerritorySelect();applyFilters();};
    $('toggleHeat').onchange=updateHeat;
    $('fileTramites').onchange=async e=>{try{if(e.target.files[0])await loadProcedureFile(e.target.files[0]);}catch(err){alert(err.message);}e.target.value='';};
    $('fileGeneric').onchange=async e=>{try{if(e.target.files[0])await loadGenericFile(e.target.files[0]);}catch(err){alert(err.message);}e.target.value='';};
  }

  async function boot(){
    $('appTitle').textContent=C.title; $('appSubtitle').textContent=C.subtitle; initMap(); wireEvents();
    if(C.DEMO_MODE) showMessage('Modo demostración: los datos incluidos son ficticios.');
    await loadAll();
  }
  document.addEventListener('DOMContentLoaded',boot);
})();
