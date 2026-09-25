/*
  CONFIGURACIÓN - VISOR DE TRÁMITES DE RIOBAMBA
  Los tres GeoJSON incluidos fueron generados a partir de los SHP entregados el 22-09-2026.
  Para producción, estos archivos pueden sustituirse por servicios WFS de GeoServer/PostGIS.
*/
window.APP_CONFIG = {
  DEMO_MODE: false,
  title: "Visor Territorial de Trámites - Riobamba",
  subtitle: "Distribución espacial, frecuencia y evolución temporal de trámites municipales",
  initialView: [-1.6735, -78.6483],
  initialZoom: 12,
  basemap: {
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors"
  },
  fields: {
    id: "id_tramite",
    type: "tipo_tramite",
    date: "fecha_ingreso",
    platform: "plataforma",
    parish: "parroquia",
    status: "estado",
    cadastralKey: "clave_catastral",
    transactionNumber: "numero_tramite"
  },
  typeColors: {
    "IPRUS": "#1167b1",
    "EXCEDENTES": "#7a5195",
    "TRANSFERENCIA DE DOMINIO": "#e07a1f",
    "CERTIFICADO DE JURISDICCION": "#6a4c93",
    "INGRESO AL CATASTRO": "#2a9d65",
    "OTRO": "#77838c"
  },
  layers: [
    {id:"parroquias", name:"Parroquias", role:"parishes", type:"geojson", url:"data/parroquias_reales.geojson", visible:true, style:{color:"#395d73",weight:2,fillColor:"#8fb7c6",fillOpacity:0.06}},
    {id:"plataformas", name:"Plataformas territoriales", role:"platforms", type:"geojson", url:"data/plataformas_reales.geojson", visible:true, style:{color:"#177a8b",weight:2,fillColor:"#37a0b0",fillOpacity:0.08}},
    {id:"tramites", name:"Trámites", role:"procedures", type:"geojson", url:"data/tramites_reales.geojson", visible:true}

    /* PRODUCCIÓN CON GEOSERVER / POSTGIS:
    Reemplace la definición de "tramites" por un WFS, por ejemplo:
    ,{id:"tramites_prod", name:"Trámites", role:"procedures", type:"geojson",
      url:"http://SERVIDOR:8080/geoserver/WORKSPACE/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=WORKSPACE:vw_tramites_dashboard&outputFormat=application/json&srsName=EPSG:4326",
      visible:true}
    */
  ]
};
