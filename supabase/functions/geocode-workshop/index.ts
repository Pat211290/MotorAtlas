import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);

  const authHeader=req.headers.get("Authorization");
  if(!authHeader)return json({error:"not_authenticated"},401);

  const url=Deno.env.get("SUPABASE_URL");
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!anonKey||!serviceRoleKey)return json({error:"server_not_configured"},500);

  const userClient=createClient(url,anonKey,{
    global:{headers:{Authorization:authHeader}},
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const admin=createClient(url,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const {data:authData,error:authError}=await userClient.auth.getUser();
  if(authError||!authData.user)return json({error:"not_authenticated"},401);

  let payload:{workshopId?:string};
  try{payload=await req.json()}catch{return json({error:"invalid_json"},400)}
  if(!payload.workshopId)return json({error:"workshop_id_required"},400);

  const {data:workshop,error:workshopError}=await admin.from("workshops")
    .select("id,owner_user_id,street,postal_code,city,country_code")
    .eq("id",payload.workshopId).maybeSingle();
  if(workshopError||!workshop)return json({error:"workshop_not_found"},404);
  if(workshop.owner_user_id!==authData.user.id)return json({error:"not_authorized"},403);

  const address=[workshop.street,workshop.postal_code,workshop.city,workshop.country_code||"DE"].filter(Boolean).join(", ");
  const endpoint=new URL("https://nominatim.openstreetmap.org/search");
  endpoint.searchParams.set("format","jsonv2");
  endpoint.searchParams.set("limit","1");
  endpoint.searchParams.set("countrycodes","de");
  endpoint.searchParams.set("q",address);

  const response=await fetch(endpoint,{
    headers:{
      "Accept":"application/json",
      "Accept-Language":"de",
      "User-Agent":"MotorAtlas/1.0 (https://motoratlas.de)"
    }
  });
  if(!response.ok)return json({error:"geocoder_unavailable"},502);
  const results=await response.json() as Array<{lat?:string;lon?:string;display_name?:string}>;
  const hit=results[0];
  const latitude=Number(hit?.lat),longitude=Number(hit?.lon);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)){
    return json({error:"address_not_found",address},422);
  }

  const {error:updateError}=await admin.from("workshops").update({
    latitude,longitude,updated_at:new Date().toISOString()
  }).eq("id",workshop.id);
  if(updateError)return json({error:updateError.message},500);

  return json({ok:true,latitude,longitude,address,displayName:hit?.display_name??null});
});