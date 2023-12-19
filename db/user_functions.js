import { pool } from "./db_connection";

export async function user(token) {
    const res = await pool.execute(
        'SELECT id, firstname, lastname, room_id, is_leader, video_token FROM users WHERE video_token = ?',
        [token]
    );
    
    if(!res || res.length == 0 || res[0].length > 1)
        return false;
    
    return res[0];
}

export async function user_by_id(io, id) {
    let sockets = await io.fetchSockets();
    for(s in sockets)
        if(s.data.user.id == id)
            return s.data.user;
    return false;
}

export function check_token(socket, token) {
    return socket.data.user.video_token === token;
}

export async function room_users(io, room_id) {
    let sockets = await io.in(room_id).fetchSockets();
    return sockets.map((s) => s.data.user);
}

export async function get_leader(io, room_id) {
    let sockets = await io.in(room_id).fetchSockets();
    for(s in sockets)
        if(s.data.user.is_leader)
            return s.data.user;
    return false;
}

export async function disconnect_user(user) {
    return await pool.execute(
        'UPDATE users SET video_token = NULL, room_id = NULL, is_leader = NULL WHERE id = ?',
        [user.id]
    );
}

export async function assign_leader_random(io, room_id) {
    let users = await room_users(io, room_id);
    let new_leader = users[Math.floor(Math.random() * users.length)];

    return await assign_leader(new_leader);
}

export async function remove_leader(old_leader) {
    old_leader.is_leader = false;
    await pool.execute(
        'UPDATE users SET is_leader = FALSE WHERE id = ?',
        [old_leader.id]
    );
}

export async function assign_leader(new_leader) {
    new_leader.is_leader = true;
    await pool.execute(
        'UPDATE users SET is_leader = TRUE WHERE id = ?',
        [new_leader.id]
    );
}