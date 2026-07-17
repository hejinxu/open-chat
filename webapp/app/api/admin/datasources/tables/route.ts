import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/api/utils/auth-guard'

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const body = await request.json()
    const { type, host, port, database, username, password } = body

    if (!host || !port || !database || !username) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 })
    }

    if (type === 'mysql') {
      return await getMysqlTables(host, port, database, username, password)
    }
    else if (type === 'postgresql') {
      return await getPostgresTables(host, port, database, username, password)
    }
    else {
      return NextResponse.json({ success: false, message: 'Unsupported database type' }, { status: 400 })
    }
  }
  catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}

async function getMysqlTables(host: string, port: number, database: string, username: string, password: string) {
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

    const [rows] = await connection.query(`
      SELECT
        TABLE_NAME as name,
        TABLE_COMMENT as comment
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `, [database])

    await connection.end()

    return NextResponse.json({
      success: true,
      tables: rows.map((row: any) => ({
        name: row.name,
        comment: row.comment || '',
      })),
    })
  }
  catch (error: any) {
    return NextResponse.json({ success: false, message: error.message })
  }
}

async function getPostgresTables(host: string, port: number, database: string, username: string, password: string) {
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

    const result = await client.query(`
      SELECT
        t.table_name as name,
        COALESCE(obj_description((t.table_schema || '.' || t.table_name)::regclass), '') as comment
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
      ORDER BY t.table_name
    `)

    await client.end()

    return NextResponse.json({
      success: true,
      tables: result.rows.map((row: any) => ({
        name: row.name,
        comment: row.comment || '',
      })),
    })
  }
  catch (error: any) {
    return NextResponse.json({ success: false, message: error.message })
  }
}
