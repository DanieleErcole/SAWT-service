import mariadb from 'mariadb';

export const pool = mariadb.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'test'
});

export async function query(query, params = []) {
    let conn = await pool.getConnection();
    let res = false;
    try {
        res = await conn.execute(query, params);
    } finally {
        await conn.release();
    }
    return res;
}

export async function get_conn() {
    return await pool.getConnection();
}

