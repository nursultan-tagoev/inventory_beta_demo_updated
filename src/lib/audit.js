import { supabase } from '../supabaseClient'

export async function logAction({ profile, action, entity, entityId, entityRef, details }) {
  try {
    await supabase.from('audit_log').insert({
      actor_id: profile?.id || null,
      actor_name: profile?.full_name || profile?.email || null,
      action, entity, entity_id: entityId || null, entity_ref: entityRef || null, details: details || null,
    })
  } catch (e) {}
}
