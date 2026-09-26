-- Supabase Schema for MoneyFlow

-- 1. Create Profiles Table
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    monthly_salary NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'Rs.',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Transactions Table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'saving')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    category TEXT,
    description TEXT,
    transaction_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Savings Goals Table
CREATE TABLE savings_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_amount NUMERIC NOT NULL CHECK (target_amount > 0),
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies

-- Profiles Policies
CREATE POLICY "Users can view own profile" 
    ON profiles FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" 
    ON profiles FOR INSERT 
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
    ON profiles FOR UPDATE 
    USING (auth.uid() = id) 
    WITH CHECK (auth.uid() = id);

-- Transactions Policies
CREATE POLICY "Users can view own transactions" 
    ON transactions FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions" 
    ON transactions FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions" 
    ON transactions FOR UPDATE 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions" 
    ON transactions FOR DELETE 
    USING (auth.uid() = user_id);

-- Savings Goals Policies
CREATE POLICY "Users can view own savings goals" 
    ON savings_goals FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own savings goals" 
    ON savings_goals FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own savings goals" 
    ON savings_goals FOR UPDATE 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own savings goals" 
    ON savings_goals FOR DELETE 
    USING (auth.uid() = user_id);

-- 6. Indexes for Performance
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_savings_goals_user_id ON savings_goals(user_id);

-- 7. Trigger to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, currency)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'Rs.');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
