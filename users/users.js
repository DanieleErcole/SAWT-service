import { query, get_conn } from "../db/db_connection.js";

// NOTE: If something in the db fails, like the assigment of a new leader aftre the disconnection of the previous one, the user will be disconnected anyway,
//      but the room will be left in an inconsistent state, with no leader. Handle the error, like notifying the users or disconnecting them

export async function disconnect_user(user) {
    try {
        return await query(
            'UPDATE users SET video_token = NULL, room_id = NULL, is_leader = NULL WHERE id = ?',
            [user.id]
        );
    } catch(err) {
        console.log(err);
        return false;
    }
}

export async function get_user(token) {
    const res = await query(
        'SELECT id, firstname, lastname, room_id, is_leader, video_token FROM users WHERE video_token = ?',
        [token]
    );

    if(!res || res.length == 0 || res.length > 1)
        return false;
    
    return res[0];
}

export async function user_by_id(io, id) {
    return (await io.fetchSockets()).find(s => s.data.user.id == id);
}

export async function room_sockets(io, room_id) {
    return await io.in(room_id).fetchSockets();
}

export async function room_users(io, room_id) {
    return (await io.in(room_id).fetchSockets()).map(s => {
        return {
            id: s.data.user.id,
            firstname: s.data.user.firstname,
            lastname: s.data.user.lastname,
            is_leader: s.data.user.is_leader,
            is_mod: s.data.user.is_mod,
            is_owner: s.data.user.is_owner
        };
    });
}

export async function get_leader(io, room_id) {
    return (await io.in(room_id).fetchSockets()).find(s => s.data.user.is_leader);
}

async function get_leader_random(io, room_id) {
    let users = await room_users(io, room_id);
    let new_leader = users[Math.floor(Math.random() * users.length)];

    return new_leader;
}

export async function assign_new_leader(io, old_leader, new_leader_socket = false) {
    let room_id = old_leader.room_id;

    let new_leader = false;
    try {
        let conn = await get_conn();
        await conn.beginTransaction();
        await conn.execute(
            'UPDATE users SET is_leader = FALSE WHERE id = ?',
            [old_leader.id]
        );
        
        new_leader = new_leader_socket ? new_leader_socket.data.user : await get_leader_random(io, room_id);

        await conn.execute(
            'UPDATE users SET is_leader = TRUE WHERE id = ?',
            [new_leader.id]
        );
        await conn.commit();
    } catch(err) {
        console.log(err);
        await conn.rollback();
        return false;
    }

    old_leader.is_leader = false;
    let s = (await io.in(room_id).fetchSockets()).find(s => s.data.user.id == new_leader.id);
    s.data.user.is_leader = true;
    return true;
}