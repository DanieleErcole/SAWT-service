import { query } from "../db/db_connection.js";

export async function is_mod(room_id, user_id) {
    const res = await query(
        'SELECT * FROM user_moderates_room WHERE user_id = ? AND room_id = ?',
        [user_id, room_id]
    );
    return res && res.length == 1;
}

export async function assign_mod(room_id, user) {
    try {
        await query(
            'INSERT INTO user_moderates_room (user_id, room_id) VALUES (?, ?)',
            [user.id, room_id]
        );
        user.is_mod = true;
        return true;
    } catch(err) {
        console.log(err);
        return false;
    }
}

export async function remove_mod(room_id, user) {
    try {
        await query(
            'DELETE FROM user_moderates_room WHERE user_id = ? AND room_id = ?',
            [user.id, room_id]
        );
        user.is_mod = false;
        return true;
    } catch(err) {
        console.log(err);
        return false;
    }
}

export async function is_room_owner(room_id, user_id) {
    const res = await query(
        'SELECT * FROM room WHERE id = ? AND user_id = ?',
        [room_id, user_id]
    );
    return res && res.length == 1;
}