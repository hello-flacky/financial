// js/auth.js

class Auth {
    static async getSession() {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("Error getting session:", error);
        return data.session;
    }

    static async requireAuth() {
        const session = await this.getSession();
        if (!session) {
            window.location.href = 'login.html';
        }
        return session;
    }

    static async redirectIfLoggedIn() {
        const session = await this.getSession();
        if (session) {
            window.location.href = 'index.html';
        }
    }

    static async login(email, password) {
        this.showLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        this.showLoading(false);
        
        if (error) {
            this.showError(error.message);
            return null;
        }
        window.location.href = 'index.html';
        return data;
    }

    static async signup(email, password, fullName) {
        this.showLoading(true);
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName
                }
            }
        });
        this.showLoading(false);
        
        if (error) {
            this.showError(error.message);
            return null;
        }
        
        // Show success, maybe auto-redirect
        alert('Signup successful! Please check your email to confirm, or login if email confirmation is disabled.');
        window.location.href = 'login.html';
        return data;
    }

    static async logout() {
        const confirmLogout = confirm("Are you sure you want to log out?");
        if (!confirmLogout) return;

        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error("Error logging out:", error);
        } else {
            window.location.href = 'login.html';
        }
    }

    static showError(msg) {
        const errEl = document.getElementById('auth-error');
        if (errEl) {
            errEl.innerText = msg;
            errEl.classList.remove('hidden');
        } else {
            alert(msg);
        }
    }

    static showLoading(isLoading) {
        const btn = document.getElementById('auth-submit-btn');
        if (btn) {
            if (isLoading) {
                btn.disabled = true;
                btn.innerText = 'Processing...';
            } else {
                btn.disabled = false;
                btn.innerText = btn.getAttribute('data-original-text') || 'Submit';
            }
        }
    }
}
