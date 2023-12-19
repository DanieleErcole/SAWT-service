import { pool } from "./db_connection";

// Non utilizzata, forse da rimuovere

class UserManager {

    constructor() {
        this.users = {}; // { token: { id, firstname, lastname, room_id, is_leader } }
    }
    
    async check_user_token(token) {
        const res = await pool.execute(
            'SELECT id, firstname, lastname, room_id FROM users WHERE video_token = ?',
            [token]
        );
        
        if(res.length == 0 || res[0].length > 1)
            return false;

        this.users[token] = res[0];
        return res[0];
    }

    async room_users(room_id) {
        const res = await pool.execute(
            'SELECT id, firstname, lastname, room_id, is_leader FROM users WHERE room_id = ?',
            [room_id]
        );
        
        if(res.length == 0)
            return false;
        return res[0];
    }

    async get_leader(room_id) {
        const res = await pool.execute(
            'SELECT id, firstname, lastname, room_id FROM users WHERE room_id = ? AND is_leader = TRUE',
            [room_id]
        );
        
        if(res.length == 0 || res[0].length > 1)
            return false;
        return res[0];
    }

    async remove_user(token) {
        const user = this.users[token];
        await pool.execute(
            'UPDATE users SET video_token = NULL, room_id = NULL, is_leader = NULL WHERE id = ?',
            [user.id]
        );

        this.users[token] = null;
        return user;
    }

    async assign_leader_random(token, room_id) {
        const users = await this.room_users(room_id);
        const new_leader = users[Math.floor(Math.random() * users.length)];

        return await this.assign_leader(token, new_leader.id);
    }

    async assign_leader(token, new_leader) {
        return await pool.execute(
            'UPDATE users SET is_leader = TRUE WHERE id = ?',
            [new_leader_id]
        );
    }

}
