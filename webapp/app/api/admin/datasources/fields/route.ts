import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/api/utils/auth-guard'

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const body = await request.json()
    const { type, host, port, database, username, password, table } = body

    if (!host || !port || !database || !username || !table) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 })
    }

    if (type === 'mysql') {
      return await getMysqlFields(host, port, database, username, password, table)
    }
    else if (type === 'postgresql') {
      return await getPostgresFields(host, port, database, username, password, table)
    }
    else {
      return NextResponse.json({ success: false, message: 'Unsupported database type' }, { status: 400 })
    }
  }
  catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}

async function getMysqlFields(host: string, port: number, database: string, username: string, password: string, table: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mysql = require('mysql2/promise')
    const connection = await mysql.createConnection({
      host,
      port,
      database,
      user: username,
      password,
      connectTimeout: 5000,
    })

    // Get columns with type and comment
    const [columns] = await connection.query(`
      SELECT
        COLUMN_NAME as name,
        COLUMN_TYPE as type,
        COLUMN_COMMENT as comment,
        COLUMN_KEY as column_key
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [database, table])

    // Get foreign keys
    const [foreignKeys] = await connection.query(`
      SELECT
        COLUMN_NAME as column_name,
        REFERENCED_TABLE_NAME as ref_table,
        REFERENCED_COLUMN_NAME as ref_column
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `, [database, table])

    await connection.end()

    // Build foreign key map
    const fkMap: Record<string, { table: string, column: string }> = {}
    for (const fk of foreignKeys as any[]) {
      fkMap[fk.column_name] = { table: fk.ref_table, column: fk.ref_column }
    }

    return NextResponse.json({
      success: true,
      fields: (columns as any[]).map(row => ({
        name: row.name,
        type: row.type,
        comment: row.comment || '',
        is_primary_key: row.column_key === 'PRI',
        foreign_key: fkMap[row.name] || null,
      })),
    })
  }
  catch (error: any) {
    return NextResponse.json({ success: false, message: error.message })
  }
}

async function getPostgresFields(host: string, port: number, database: string, username: string, password: string, table: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require('pg')
    const client = new Client({
      host,
      port,
      database,
      user: username,
      password,
      connectionTimeoutMillis: 5000,
    })
    await client.connect()

    // Get columns with type and comment
    const columnsResult = await client.query(`
      SELECT
        c.column_name as name,
        c.data_type as type,
        COALESCE(col_description((c.table_schema || '.' || c.table_name)::regclass, c.ordinal_position), '') as comment,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
        WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_schema = 'public' AND c.table_name = $1
      ORDER BY c.ordinal_position
    `, [table])

    // Get foreign keys
    const fkResult = await client.query(`
      SELECT
        ku.column_name as column_name,
        ccu.table_name as ref_table,
        ccu.column_name as ref_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'
    `, [table])

    await client.end()

    // Build foreign key map
    const fkMap: Record<string, { table: string, column: string }> = {}
    for (const fk of fkResult.rows) {
      fkMap[fk.column_name] = { table: fk.ref_table, column: fk.ref_column }
    }

    return NextResponse.json({
      success: true,
      fields: columnsResult.rows.map((row: any) => ({
        name: row.name,
        type: row.type,
        comment: row.comment || '',
        is_primary_key: row.is_primary_key === true,
        foreign_key: fkMap[row.name] || null,
      })),
    })
  }
  catch (error: any) {
    return NextResponse.json({ success: false, message: error.message })
  }
}
