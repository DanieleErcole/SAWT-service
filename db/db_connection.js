import mariadb from 'mariadb';

export const pool = mariadb.createPool({
    host: '0.0.0.0',
    user: 'root',
    password: 'admin',
    database: 'test'
});

export async function query(query, params = []) {
    try {
        let conn = await pool.getConnection();
        return await conn.execute(query, params);
    } finally {
        await conn.release();
    }
}

export async function get_conn() {
    return await pool.getConnection();
}

