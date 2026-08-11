import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/api/utils/auth-guard'
import { parseSchemas, postgresSearchPathOption } from '@/lib/services/datasource'

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const body = await request.json()
    const { type, host, port, database, username, password, schemas } = body

    if (!host || !port || !database || !username) {
      return NextResponse.json({ error: 'Missing required fields', code: 'MISSING_FIELDS' }, { status: 400 })
    }

    if (type === 'mysql') {
      return await testMysqlConnection(host, port, database, username, password)
    }
    else if (type === 'postgresql') {
      return await testPostgresConnection(host, port, database, username, password, schemas)
    }
    else {
      return NextResponse.json({ error: 'Unsupported database type', code: 'UNSUPPORTED_DB_TYPE' }, { status: 400 })
    }
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

async function testMysqlConnection(host: string, port: number, database: string, username: string, password: string) {
  try {
    // Use mysql2 for testing connection
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
    await connection.query('SELECT 1')
    await connection.end()
    return NextResponse.json({ success: true, message: 'Connection successful' })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message, code: 'CONNECTION_FAILED' })
  }
}

async function testPostgresConnection(host: string, port: number, database: string, username: string, password: string, schemas?: string) {
  try {
    // Use pg for testing connection
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require('pg')
    const client = new Client({
      host,
      port,
      database,
      user: username,
      password,
      connectionTimeoutMillis: 5000,
      options: postgresSearchPathOption(parseSchemas(schemas)),
    })
    await client.connect()
    await client.query('SELECT 1')
    await client.end()
    return NextResponse.json({ success: true, message: 'Connection successful' })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message, code: 'CONNECTION_FAILED' })
  }
}
