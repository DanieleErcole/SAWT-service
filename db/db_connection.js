import mariadb from 'mariadb';

export const pool = mariadb.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'test'
});

export async function query(query, params = []) {
    return await pool.execute(query, params);
}

export async function get_conn() {
    return await pool.getConnection();
}

