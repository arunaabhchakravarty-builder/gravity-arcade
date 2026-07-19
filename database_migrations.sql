-- Add index for fast retrieval of save states by IP and Game
CREATE INDEX IF NOT EXISTS idx_arcade_save_states_ip_game 
ON arcade_save_states(ip_hash, game_name);

-- Add index for analytics/visit logs by Game and IP
CREATE INDEX IF NOT EXISTS idx_arcade_visits_game 
ON arcade_visits(game);

CREATE INDEX IF NOT EXISTS idx_arcade_visits_ip 
ON arcade_visits(ip);
