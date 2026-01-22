import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// #region agent log
fetch('http://127.0.0.1:7243/ingest/167dfa8d-f908-443f-9592-ef5a733db0c8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/prisma.ts:4',message:'Prisma module loaded',data:{hasGlobalPrisma:!!(globalThis as any).prisma,nodeEnv:process.env.NODE_ENV,hasDatabaseUrl:!!process.env.DATABASE_URL,databaseUrlLength:process.env.DATABASE_URL?.length||0,typeofWindow:typeof window,typeofProcess:typeof process,isServer:typeof window==='undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
// #endregion

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// #region agent log
const databaseUrl = process.env.DATABASE_URL;
fetch('http://127.0.0.1:7243/ingest/167dfa8d-f908-443f-9592-ef5a733db0c8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/prisma.ts:14',message:'Before PrismaClient initialization',data:{hasGlobalPrisma:!!globalForPrisma.prisma,hasDatabaseUrl:!!databaseUrl,databaseUrlPrefix:databaseUrl?.substring(0,30)||'undefined',allEnvKeys:Object.keys(process.env).filter(k=>k.includes('DATABASE')||k.includes('PRISMA')).join(','),isServer:typeof window==='undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
// #endregion

// #region agent log
let prismaInstance: PrismaClient;
try {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  
  const config: {
    log?: ('query' | 'error' | 'warn')[];
    adapter: PrismaPg;
  } = {
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    adapter,
  };
  fetch('http://127.0.0.1:7243/ingest/167dfa8d-f908-443f-9592-ef5a733db0c8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/prisma.ts:28',message:'Creating PrismaClient with adapter',data:{configKeys:Object.keys(config),hasDatabaseUrl:!!databaseUrl,hasAdapter:!!adapter},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
  prismaInstance = new PrismaClient(config);
  fetch('http://127.0.0.1:7243/ingest/167dfa8d-f908-443f-9592-ef5a733db0c8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/prisma.ts:31',message:'PrismaClient created successfully',data:{prismaCreated:!!prismaInstance},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
} catch (error: any) {
  fetch('http://127.0.0.1:7243/ingest/167dfa8d-f908-443f-9592-ef5a733db0c8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/prisma.ts:34',message:'PrismaClient creation error',data:{errorMessage:error?.message,errorName:error?.name,errorStack:error?.stack?.substring(0,200),hasDatabaseUrl:!!databaseUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
  throw error;
}
// #endregion

export const prisma =
  globalForPrisma.prisma ?? prismaInstance;

// #region agent log
fetch('http://127.0.0.1:7243/ingest/167dfa8d-f908-443f-9592-ef5a733db0c8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/prisma.ts:35',message:'After PrismaClient export',data:{prismaCreated:!!prisma,isGlobal:prisma===globalForPrisma.prisma},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;