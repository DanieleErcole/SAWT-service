import mariadb from 'mariadb';

export const pool = mariadb.createPool({
    host: 'localhost',
    user: 'root', // s5218127
    password: '', // Aledanicamo02
    database: 'test' //s5218127
});

export async function query(query, params = []) {
    return await pool.execute(query, params);
}

export async function get_conn() {
    return await pool.getConnection();
}

