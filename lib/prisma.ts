import { PrismaClient } from '@prisma/client';

// #region agent log
fetch('http://127.0.0.1:7242/ingest/07bd29ab-3687-4c3d-8b94-97adc84478a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/prisma.ts:3',message:'Prisma module loaded',data:{hasGlobalPrisma:!!(globalThis as any).prisma,nodeEnv:process.env.NODE_ENV,hasDatabaseUrl:!!process.env.DATABASE_URL,databaseUrlLength:process.env.DATABASE_URL?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
// #endregion

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// #region agent log
fetch('http://127.0.0.1:7242/ingest/07bd29ab-3687-4c3d-8b94-97adc84478a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/prisma.ts:10',message:'Before PrismaClient initialization',data:{hasGlobalPrisma:!!globalForPrisma.prisma,databaseUrl:process.env.DATABASE_URL?process.env.DATABASE_URL.substring(0,20)+'...':undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion

// #region agent log
const databaseUrl = process.env.DATABASE_URL;
fetch('http://127.0.0.1:7242/ingest/07bd29ab-3687-4c3d-8b94-97adc84478a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/prisma.ts:15',message:'Creating PrismaClient config',data:{hasDatabaseUrl:!!databaseUrl,willPassDatasources:!!databaseUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
// #endregion

const prismaConfig: any = {
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
};

if (databaseUrl) {
  prismaConfig.datasources = {
    db: {
      url: databaseUrl,
    },
  };
}

// #region agent log
fetch('http://127.0.0.1:7242/ingest/07bd29ab-3687-4c3d-8b94-97adc84478a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/prisma.ts:28',message:'PrismaClient config prepared',data:{hasDatasources:!!prismaConfig.datasources,configKeys:Object.keys(prismaConfig)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
// #endregion

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(prismaConfig);

// #region agent log
fetch('http://127.0.0.1:7242/ingest/07bd29ab-3687-4c3d-8b94-97adc84478a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/prisma.ts:18',message:'After PrismaClient initialization',data:{prismaCreated:!!prisma,isGlobal:prisma===globalForPrisma.prisma},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
