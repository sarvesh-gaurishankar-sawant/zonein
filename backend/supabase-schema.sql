-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Sessions table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  date TEXT NOT NULL,
  start_hour INT NOT NULL,
  start_min INT NOT NULL,
  duration INT NOT NULL,
  task TEXT DEFAULT 'desk',
  tag TEXT,
  status TEXT NOT NULL DEFAULT 'booked',
  started_at BIGINT,
  notes TEXT,
  linked_id TEXT,  -- shared ID linking split sessions that overflow past midnight
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tags table
CREATE TABLE tags (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- Settings table
CREATE TABLE settings (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  duration INT DEFAULT 50,
  task TEXT DEFAULT 'desk',
  tag TEXT,
  autostart BOOLEAN DEFAULT false,
  initial TEXT,
  autostart_breaks BOOLEAN DEFAULT false,
  break_duration INT DEFAULT 5
);

-- Enable Row Level Security
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only access their own data
CREATE POLICY "Users can read own sessions" ON sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON sessions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can read own tags" ON tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tags" ON tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tags" ON tags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tags" ON tags FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can read own settings" ON settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON settings FOR UPDATE USING (auth.uid() = user_id);

-- Tasks table
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  done BOOLEAN DEFAULT false,
  tag_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own tasks" ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tasks" ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tasks" ON tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tasks" ON tasks FOR DELETE USING (auth.uid() = user_id);

-- Companion logs table (AI user model)
CREATE TABLE companion_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  goal TEXT,
  completed BOOLEAN,
  tag_id TEXT,
  duration INT,
  time_of_day TEXT,  -- 'morning' | 'afternoon' | 'evening' | 'night'
  day_of_week TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE companion_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own companion_logs" ON companion_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own companion_logs" ON companion_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own companion_logs" ON companion_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own companion_logs" ON companion_logs FOR DELETE USING (auth.uid() = user_id);
