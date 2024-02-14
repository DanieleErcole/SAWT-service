import mariadb from 'mariadb';
import { readFileSync } from 'fs';

// get configs from file
let config = JSON.parse(readFileSync('./db/config.json', 'utf8'));
export const pool = mariadb.createPool(config);

export async function query(query, params = []) {
    return await pool.execute(query, params);
}

export async function get_conn() {
    return await pool.getConnection();
}

