const SUPABASE_URL = "https://tilmvucucwvsviqmxany.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_EAuWiF8sBkS_Y5bjYcHj_A_EZoPaH9Q";

let storageOption = window.localStorage;
if (window.sessionStorage.getItem('ephemeral_session') === 'true') {
  storageOption = window.sessionStorage;
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: storageOption,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
