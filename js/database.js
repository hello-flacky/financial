// js/database.js

class Database {
    static async getProfile() {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .single();
            
        if (error) {
            console.error("Error fetching profile:", error);
            return null;
        }
        return data;
    }

    static async updateProfile(updates) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) return null;

        const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', sessionData.session.user.id);
            
        if (error) {
            console.error("Error updating profile:", error);
            return null;
        }
        return data;
    }

    static async getTransactions() {
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .order('transaction_date', { ascending: false })
            .order('created_at', { ascending: false });
            
        if (error) {
            console.error("Error fetching transactions:", error);
            return [];
        }
        return data;
    }

    static async addTransaction(tx) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) return null;

        const { data, error } = await supabase
            .from('transactions')
            .insert([{
                user_id: sessionData.session.user.id,
                ...tx
            }])
            .select()
            .single();
            
        if (error) {
            console.error("Error adding transaction:", error);
            return null;
        }
        return data;
    }

    static async updateTransaction(id, updates) {
        const { data, error } = await supabase
            .from('transactions')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
            
        if (error) {
            console.error("Error updating transaction:", error);
            return null;
        }
        return data;
    }

    static async deleteTransaction(id) {
        const { error } = await supabase
            .from('transactions')
            .delete()
            .eq('id', id);
            
        if (error) {
            console.error("Error deleting transaction:", error);
            return false;
        }
        return true;
    }

    static async getSavingsGoals() {
        const { data, error } = await supabase
            .from('savings_goals')
            .select('*')
            .order('created_at', { ascending: true });
            
        if (error) {
            console.error("Error fetching savings goals:", error);
            return [];
        }
        return data;
    }

    static async addSavingsGoal(goal) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) return null;

        const { data, error } = await supabase
            .from('savings_goals')
            .insert([{
                user_id: sessionData.session.user.id,
                ...goal
            }])
            .select()
            .single();
            
        if (error) {
            console.error("Error adding savings goal:", error);
            return null;
        }
        return data;
    }

    static async deleteSavingsGoal(id) {
        const { error } = await supabase
            .from('savings_goals')
            .delete()
            .eq('id', id);
            
        if (error) {
            console.error("Error deleting savings goal:", error);
            return false;
        }
        return true;
    }
}
