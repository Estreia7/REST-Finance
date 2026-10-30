import { describe, it, expect } from 'vitest';
import {
  parseMoney, parseDateKey, parseStatementText, parseStatementRows, lineHashes, StatementFormatError,
} from '@/lib/bank-statement';

describe('parseMoney', () => {
  it('reads the Portuguese and the English conventions', () => {
    expect(parseMoney('1.284,53')).toBe(1284.53);
    expect(parseMoney('-1 284,53')).toBe(-1284.53);
    expect(parseMoney('1,284.53')).toBe(1284.53);
    expect(parseMoney('12,5')).toBe(12.5);
    expect(parseMoney('1.200')).toBe(1200);
    expect(parseMoney('(25,24)')).toBe(-25.24);
    expect(parseMoney('25,24-')).toBe(-25.24);
    expect(parseMoney(-7.1)).toBe(-7.1);
  });

  it('gives null for what is not money', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('Saldo')).toBeNull();
  });
});

describe('parseDateKey', () => {
  it('reads the usual shapes', () => {
    expect(parseDateKey('24-09-2026')).toBe('2026-09-24');
    expect(parseDateKey('24/09/2026')).toBe('2026-09-24');
    expect(parseDateKey('2026-09-24')).toBe('2026-09-24');
    expect(parseDateKey('20260924120000[0:GMT]')).toBe('2026-09-24');
    expect(parseDateKey(new Date(Date.UTC(2026, 8, 24)))).toBe('2026-09-24');
  });

  it('refuses impossible dates', () => {
    expect(parseDateKey('31-02-2026')).toBeNull();
    expect(parseDateKey('Data Mov.')).toBeNull();
  });
});

describe('CSV statements', () => {
  it('finds the header under the title lines, with one signed amount', () => {
    const csv = [
      'Consultar saldos e movimentos à ordem',
      'Conta;0001234567890',
      '',
      'Data Mov.;Data Valor;Descrição;Montante;Saldo',
      '24-09-2026;24-09-2026;TRF P/ GONDOCER BEBIDAS LDA;-1.284,53;8.120,10',
      '19-09-2026;19-09-2026;COMPRA 1234 MAKRO GAIA;-1.447,02;9.404,63',
      '15-09-2026;15-09-2026;TPA SIBS 5521;2.310,00;10.851,65',
      ';;Saldo final;;8.120,10',
    ].join('\r\n');
    const { lines, skipped } = parseStatementText(csv);
    expect(lines).toEqual([
      { dateKey: '2026-09-24', amount: -1284.53, description: 'TRF P/ GONDOCER BEBIDAS LDA', balance: 8120.1 },
      { dateKey: '2026-09-19', amount: -1447.02, description: 'COMPRA 1234 MAKRO GAIA', balance: 9404.63 },
      { dateKey: '2026-09-15', amount: 2310, description: 'TPA SIBS 5521', balance: 10851.65 },
    ]);
    expect(skipped).toBe(1);
  });

  it('reads separate debit and credit columns', () => {
    const rows = [
      ['Data', 'Descritivo', 'Débito', 'Crédito'],
      ['10/09/2026', 'COMISSAO MANUTENCAO CONTA', '5,20', ''],
      ['11/09/2026', 'TRF DE CLIENTE', '', '300,00'],
    ];
    expect(parseStatementRows(rows).lines.map((l) => l.amount)).toEqual([-5.2, 300]);
  });

  it('says plainly when there is no header it recognises', () => {
    expect(() => parseStatementText('a;b;c\n1;2;3')).toThrow(StatementFormatError);
  });
});

describe('OFX statements', () => {
  it('reads OFX 1 with unclosed tags', () => {
    const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260924<TRNAMT>-1284.53<FITID>1<NAME>TRF GONDOCER<MEMO>FT 2026/4471</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260925<TRNAMT>50.00<FITID>2<NAME>TRF RECEBIDA</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const { lines } = parseStatementText(ofx);
    expect(lines).toEqual([
      { dateKey: '2026-09-24', amount: -1284.53, description: 'TRF GONDOCER · FT 2026/4471', balance: null },
      { dateKey: '2026-09-25', amount: 50, description: 'TRF RECEBIDA', balance: null },
    ]);
  });
});

describe('lineHashes', () => {
  it('tells identical movements on one day apart, and is stable across imports', () => {
    const coffee = { dateKey: '2026-09-10', amount: -1.2, description: 'COMPRA CAFE', balance: null };
    const a = lineHashes([coffee, coffee]);
    expect(a[0]).not.toBe(a[1]);
    expect(lineHashes([coffee, coffee])).toEqual(a);
  });
});
