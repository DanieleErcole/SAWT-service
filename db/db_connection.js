import mariadb from 'mariadb';
import { readFileSync } from 'fs';

// get configs from file
let config = JSON.parse(readFileSync('./db/config.json', 'utf8'));
export const conn = await mariadb.createConnection(config);

export async function query(query, params = []) {
    return await conn.execute(query, params);
}

export async function get_conn() {
    return conn;
}

