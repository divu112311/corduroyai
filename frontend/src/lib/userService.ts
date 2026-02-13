import { supabase } from './supabase';

export interface UserMetadata {
  user_id: string;
  email: string | null;
  company_name: string | null;
  profile_info: Record<string, any>;
  confidence_threshold: number;
  created_at: string;
  last_login_at: string | null;
}

/**
 * Fetch user metadata from user_metadata table
 */
export async function getUserMetadata(userId: string): Promise<UserMetadata | null> {
  try {
    const { data, error } = await supabase
      .from('user_metadata')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle no rows gracefully

    if (error) {
      console.error('Error fetching user metadata:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      throw error; // Re-throw to let caller handle it
    }

    if (!data) {
      console.log('No user_metadata found for user:', userId);
      return null;
    }

    console.log('Successfully fetched user metadata:', data);
    return data;
  } catch (error: any) {
    console.error('Error fetching user metadata:', error);
    throw error; // Re-throw to let caller handle it
  }
}

/**
 * Update user metadata (e.g., company name, profile info)
 */
export async function updateUserMetadata(
  userId: string,
  updates: {
    company_name?: string;
    profile_info?: Record<string, any>;
    confidence_threshold?: number;
  }
): Promise<UserMetadata | null> {
  try {
    const { data, error } = await supabase
      .from('user_metadata')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating user metadata:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error updating user metadata:', error);
    return null;
  }
}

/**
 * Update last login timestamp
 */
export async function updateLastLogin(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_metadata')
      .update({ last_login_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating last login:', error);
      // If record doesn't exist, create it
      if (error.code === 'PGRST116' || error.message?.includes('no rows')) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await createOrUpdateUserMetadata(userId, user.email || '', undefined);
          // Retry the update
          await supabase
            .from('user_metadata')
            .update({ last_login_at: new Date().toISOString() })
            .eq('user_id', userId);
        }
      }
    } else {
      console.log('Successfully updated last_login_at for user:', userId);
    }
  } catch (error) {
    console.error('Error updating last login:', error);
  }
}

/**
 * Create or update user metadata during signup
 */
export async function createOrUpdateUserMetadata(
  userId: string,
  email: string,
  companyName?: string
): Promise<UserMetadata | null> {
  try {
    // Check if user_metadata already exists (should exist due to trigger, but just in case)
    const existing = await getUserMetadata(userId);
    
    if (existing) {
      // Update existing record
      return await updateUserMetadata(userId, {
        company_name: companyName || existing.company_name,
      });
    } else {
      // Create new record (fallback if trigger didn't fire)
      const { data, error } = await supabase
        .from('user_metadata')
        .insert({
          user_id: userId,
          email: email,
          company_name: companyName || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating user metadata:', error);
        return null;
      }

      return data;
    }
  } catch (error) {
    console.error('Error creating/updating user metadata:', error);
    return null;
  }
}

