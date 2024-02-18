import { query, get_conn } from "../db/db_connection.js";

const regex = {
    youtube: /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube(-nocookie)?\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)(?!(user))([\w\-]+)(\S+)?$/,
    vimeo: /(?:http|https)?:\/\/(?:www\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|)(?:\d+)/,
    dailymotion: /(?:https?:\/\/)?(?:www\.)?dai\.?ly(?:motion)?(?:\.com)?\/?.*(?:video|embed)?(?:.*v=|v\/|\/)[\w\-]+/,
    video: /https:\/\/(.*)/,
};

export function is_valid(url){
    return regex.youtube.test(url) || regex.vimeo.test(url) || regex.dailymotion.test(url) || regex.video.test(url);
}

export async function get_playing_video(room_id) {
    try {
        let res = await query(
            'SELECT * FROM video WHERE room_id = ? AND is_playing = TRUE',
            [room_id]    
        );
        return res[0];
    } catch(err) {
        console.log(err);
        return false;
    }
}

export async function get_room_videos(room_id) {
    try {
        return await query(
            'SELECT id, url, is_playing FROM video WHERE room_id = ?',
            [room_id]
        );
    } catch(err) {
        console.log(err);
        return false;
    }
}

export async function add_video(room_id, url, is_first) {
    try {
        let res = await query(
            'INSERT INTO video (room_id, url, is_playing) VALUES (?, ?, ?)',
            [room_id, url, is_first]
        );
        return res.affectedRows == 1;
    } catch(err) {
        console.log(err);
        return false;
    }
}

export async function remove_video(room_id, id) {
    try {
        let res = await query(
            'DELETE FROM video WHERE room_id = ? AND id = ?',
            [room_id, id]
        );
        return res.affectedRows == 1;
    } catch(err) {
        console.log(err);
        return false;
    }
}

export async function video_finished(room_id) {
    let res = true;
    let conn = await get_conn();
    
    try {
        await conn.beginTransaction();

        let room_videos = await conn.execute(
            'SELECT id, is_playing, added_date FROM video WHERE room_id = ? ORDER BY added_date ASC',
            [room_id]
        );

        let current_video = room_videos.find(v => v.is_playing);
        await conn.execute(
            'UPDATE video SET is_playing = FALSE WHERE room_id = ? AND id = ?',
            [room_id, current_video.id]
        );
        
        // The video is not the last one
        let next_video = 
            room_videos.indexOf(current_video) != room_videos.length - 1 ? 
                room_videos[room_videos.indexOf(current_video) + 1] : room_videos[0];
        await conn.execute(
            'UPDATE video SET is_playing = TRUE WHERE room_id = ? AND id = ?',
            [room_id, next_video.id]
        );
        await conn.commit();
    } catch(err) {
        console.log(err);
        await conn.rollback();
        res = false;
    } finally {
        if(conn) conn.release();
    }
    return res;
}