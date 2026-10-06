/**
 * Derrama municipal for the 2025 tax period, as published by the Tax
 * Authority in Ofício Circulado 20288 of 2026-02-02 (DSIRC). Generated from
 * the circular's table and checked against it page by page; do not edit by
 * hand — regenerate when a correction is published, and add the next
 * period's table as its own file.
 *
 * Rates are percentages of taxable profit. A null general rate means the
 * council charges no derrama for the period. Scope texts are the circular's
 * own words, kept in Portuguese because they are the legal condition.
 */

import type { DerramaTable } from './derrama';

export const DERRAMA_2025: DerramaTable = {
  taxYear: 2025,
  source: 'Ofício Circulado 20288/2026 (AT), 2026-02-02',
  byCode: {
    '0101': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0102': { generalRate: 1.2, rules: [
      { kind: 'reduced', rate: 0.2, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0103': { generalRate: 0.75, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0104': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0105': { generalRate: 1.5, rules: [] },
    '0106': { generalRate: null, rules: [] },
    '0107': { generalRate: 1.3, rules: [] },
    '0108': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0109': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0110': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0111': { generalRate: 0.75, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00 e que tenham, relativamente ao ultimo ano económico, mantido e criado postos de trabalho.' },
    ] },
    '0112': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0113': { generalRate: 1.2, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0114': { generalRate: 0.8, rules: [
      { kind: 'reduced', rate: 0.1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0115': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0116': { generalRate: 1.45, rules: [
      { kind: 'reduced', rate: 0.85, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0117': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0118': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'NIF: 500442029;510641580; 514870524; 501717226; 506454029; 515204722' },
    ] },
    '0119': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos que se tenham instalado no concelho no período de 2025 e aí tenham fixado a sua sede social, desde que tenham criado 5 ou mais postos de trabalho.' },
    ] },
    '0201': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0202': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0203': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0204': { generalRate: null, rules: [] },
    '0205': { generalRate: 1.25, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0206': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0207': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0208': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0209': { generalRate: null, rules: [] },
    '0210': { generalRate: 1.3, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0211': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0212': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0213': { generalRate: 1.25, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0214': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0301': { generalRate: null, rules: [] },
    '0302': { generalRate: 1.1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0303': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'sector', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 600.000,00 e com os CAE principal 471; 472; 474; 475; 476; 477; 478; 479; 561 e 563.' },
    ] },
    '0304': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0305': { generalRate: null, rules: [] },
    '0306': { generalRate: null, rules: [] },
    '0307': { generalRate: 1.2, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0308': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0309': { generalRate: 1.2, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0310': { generalRate: 1.4, rules: [
      { kind: 'reduced', rate: 0.1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0311': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 250000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 250.000,00.' },
    ] },
    '0312': { generalRate: 1.2, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 250000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 250.000,00.' },
    ] },
    '0313': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos que em 2025 se tenham instalado no Concelho e criado pelo menos 3 postos de trabalho sem termo ou se já instalados tenham criado, no mínimo 5 postos de trabalho, mediante requerimento apresentado no Município' },
      { kind: 'exempt', rate: 0, criterion: 'sector', turnoverMax: null, scope: 'Sujeitos passivos que enquadrados nos seguintes códigos CAE: Classes: 0111; 0113; 0119; 0121; 0122; 0123; 0124; 0125, exceto CAE 01251; 0126, exceto CAE 01261; 0127; 0128; 0129; 0130; 0141; 0142; 0143; 0145; 0146; 0147; 0148; 0161; 0162; 0163; 0164; 0170, exceto 01702; 0210; 0220; 0240.' },
    ] },
    '0314': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0401': { generalRate: 1.5, rules: [] },
    '0402': { generalRate: null, rules: [] },
    '0403': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'sector', turnoverMax: null, scope: 'Sempre que o volume de negócios provenha em mais de 90 % de qualquer setor de atividade, exceto CAE - Divisão: 05; 06; 07; 08; 09; 12; 13; 14; 15; 17; 19; 20; 21; 22; 23; 24; 26; 27; 28; 29; 30; 32; 35; 58; 59; 61; 63; 64; 84.' },
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0404': { generalRate: 1.5, rules: [] },
    '0405': { generalRate: null, rules: [] },
    '0406': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: null, scope: 'Sujeito passivos cujo volume de negócios, no período anterior, não ultrapasse € 10.000.000,00 e que tenham mantido ou criado postos de trabalho, exceto os sujeitos passivos enquadrados nas divisões CAE - Divisão: 35 e 64' },
    ] },
    '0407': { generalRate: 0.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0408': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'sector', turnoverMax: null, scope: 'Todos os sujeitos passivos, exceto sujeitos passivos enquadrados nas divisões CAE 35 e 64.' },
    ] },
    '0409': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'sector', turnoverMax: null, scope: 'Todos os sujeitos passivos, exceto CAE - Grupo: 071; 072; 351 e 641' },
    ] },
    '0410': { generalRate: null, rules: [] },
    '0411': { generalRate: null, rules: [] },
    '0412': { generalRate: null, rules: [] },
    '0501': { generalRate: null, rules: [] },
    '0502': { generalRate: null, rules: [] },
    '0503': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'Sujeitos passivos com sede social no concelho.' },
    ] },
    '0504': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'Sujeitos passivos com sede social no concelho.' },
    ] },
    '0505': { generalRate: 0.01, rules: [] },
    '0506': { generalRate: null, rules: [] },
    '0507': { generalRate: null, rules: [] },
    '0508': { generalRate: null, rules: [] },
    '0509': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0510': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'Sujeitos passivos com sede social no concelho.' },
    ] },
    '0511': { generalRate: 1.2, rules: [
      { kind: 'reduced', rate: 0.6, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0601': { generalRate: null, rules: [] },
    '0602': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0603': { generalRate: 1.45, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 300.000,00 e que nos últimos dois anos económicos tenham criado e mantido os seguintes postos de trabalho: - Microempresas - 1; - Pequenas empresas - 3; - Médias empresas - 6' },
    ] },
    '0604': { generalRate: 1.2, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0605': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0606': { generalRate: null, rules: [] },
    '0607': { generalRate: 1.3, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'NIF: 500647631; 515581259; 510307302; 516485385; 516543369; 516855107; 514703814; 515794376; 516184563; 503706124.' },
    ] },
    '0608': { generalRate: 1, rules: [] },
    '0609': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 300.000,00 e que tenham criado e mantido pelo menos 3 postos de trabalho.' },
    ] },
    '0610': { generalRate: 1.4, rules: [] },
    '0611': { generalRate: null, rules: [] },
    '0612': { generalRate: null, rules: [] },
    '0613': { generalRate: null, rules: [] },
    '0614': { generalRate: null, rules: [] },
    '0615': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos que no período anterior não ultrapasse € 300.000,00 de volume de negócios e que nos ultimos dois anos economicos tenham criado e mantido os seguintes postos de trabalho: - Microempresas - 1; - Pequenas empresas - 3; - Médias empresas - 6' },
    ] },
    '0616': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0617': { generalRate: 1.5, rules: [] },
    '0701': { generalRate: 1.5, rules: [] },
    '0702': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0703': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0704': { generalRate: 1.25, rules: [
      { kind: 'reduced', rate: 0.63, criterion: 'sector', turnoverMax: null, scope: 'CAE: 08111, 59110, 59120, 59130, 59140, 59200, 62010, 62020, 62030, 62090, 63110, 63120, 63910, 63990, 72110, 72190, 72200, 85420, 85510, 85520, 85591, 85593, 86100, 87100, 87301, 87302.' },
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos que, no ano anterior, tenham criado 5 ou mais novos postos de trabalho admitidos por contrato de trabalho por tempo indeterminado.' },
    ] },
    '0705': { generalRate: 1.25, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0706': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0707': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0708': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0709': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.75, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0710': { generalRate: null, rules: [] },
    '0711': { generalRate: 1.25, rules: [
      { kind: 'reduced', rate: 0.1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0712': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.75, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0713': { generalRate: null, rules: [] },
    '0714': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos que tenham criado e mantido três 3 ou mais novos postos de trabalho.' },
    ] },
    '0801': { generalRate: null, rules: [] },
    '0802': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 1500000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 1.500.000,00.' },
    ] },
    '0803': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0804': { generalRate: 0.1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 300.000,00 e que tenham criado e mantido os seguintes postos de trabalho: - Microempresas - 1; - Pequenas empresas - 3; - Médias empresas - 6' },
    ] },
    '0805': { generalRate: 1.2, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0806': { generalRate: 0.1, rules: [] },
    '0807': { generalRate: null, rules: [] },
    '0808': { generalRate: null, rules: [] },
    '0809': { generalRate: null, rules: [] },
    '0810': { generalRate: null, rules: [] },
    '0811': { generalRate: 0.9, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0812': { generalRate: null, rules: [] },
    '0813': { generalRate: null, rules: [] },
    '0814': { generalRate: 0.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0815': { generalRate: null, rules: [] },
    '0816': { generalRate: 1.5, rules: [] },
    '0901': { generalRate: null, rules: [] },
    '0902': { generalRate: null, rules: [] },
    '0903': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0904': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0905': { generalRate: 1.5, rules: [] },
    '0906': { generalRate: 0.9, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0907': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0908': { generalRate: null, rules: [] },
    '0909': { generalRate: null, rules: [] },
    '0910': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: null, turnoverMax: null, scope: 'Sujeitos passivos com sede social no concelho' },
    ] },
    '0911': { generalRate: null, rules: [] },
    '0912': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '0913': { generalRate: null, rules: [] },
    '0914': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 10.000.000,00, e que tenham mantido ou criado postos de trabalho, exceto os sujeitos passivos enquadrados no CAE - Divisão: 35 e 64.' },
    ] },
    '1001': { generalRate: 1.3, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1002': { generalRate: null, rules: [] },
    '1003': { generalRate: null, rules: [] },
    '1004': { generalRate: 1.2, rules: [
      { kind: 'reduced', rate: 0.95, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1005': { generalRate: null, rules: [] },
    '1006': { generalRate: 0.33, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: '- Sujeitos passivos que se tenham instalado no concelho e que criem e mantenham no mínimo 3 postos de trabalho; - Sujeitos passivos que tenham efetuado um investimento superior ou igual a € 1 000.000,00, durante dois anos subsequentes ao investimento, que criem e mantenham no mínimo 3 postos de trabalho' },
    ] },
    '1007': { generalRate: 1.5, rules: [] },
    '1008': { generalRate: null, rules: [] },
    '1009': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos que tenham sede no concelho, cujo volume de negócios, no período anterior, ultrapasse € 150.000,00 e que tenham procedido à criação líquida de pelo menos 3 postos de trabalho .' },
    ] },
    '1010': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1011': { generalRate: 1.5, rules: [] },
    '1012': { generalRate: null, rules: [] },
    '1013': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1014': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'Sujeitos passivos que se tenham constituído, instalado ou alterado a sede social para o concelho, nos períodos de 2023, 2024 ou 2025.' },
    ] },
    '1015': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos que tenham fixado a sua sede social no concelho de Pombal nos anos de 2024 e 2025 e que tenham criado no mínimo três novos postos de trabalho.' },
    ] },
    '1016': { generalRate: 1.3, rules: [
      { kind: 'reduced', rate: 0.45, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1101': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1102': { generalRate: 1.4, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Isenção do pagamento de derrama pelo período de 3 anos, para sujeitos passivos que tenham instalado a sua sede social no concelho em 2024 e tenham criado e mantido, no mínimo, 3 postos de trabalho.' },
    ] },
    '1103': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1104': { generalRate: null, rules: [] },
    '1105': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1106': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'sector', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 1.200.000,00, relativamente aos seguintes CAE: Grupos 471; 472; 474; 475; 476; 477; 478; 479; 561 e 563.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Para as empresas que tenham criado ou criem e mantenham durante o período de 3 anos, no mínimo, 5 novos postos de trabalho.' },
    ] },
    '1107': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1108': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1109': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'sector', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, seja superior a € 150 000,00 para os seguintes códigos de atividade: - CAE - Divisão 01; 02; 03 - CAE - Grupos 471 (exceto 47111); 472; 474; 475; 476; 477; 479.' },
      { kind: 'exempt', rate: 0, criterion: 'sector', turnoverMax: null, scope: 'CAE - Divisão 72 e 74, que se instalem no Concelho de Mafra durante o ano, e que criem e mantenham, durante o período da isenção, no mínimo, 5 postos de trabalho.' },
      { kind: 'exempt', rate: 0, criterion: 'sector', turnoverMax: null, scope: 'CAE - Grupo 551, que se instalem no Concelho de Mafra durante o ano, que criem e mantenham no período da isenção, no mínimo, 20 postos de trabalho.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Todas as empresas que fixem a sua sede social no Concelho de Mafra, no presente ano, e criem no mínimo, 3 novos postos de trabalho.' },
    ] },
    '1110': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1111': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1112': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.55, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'reduced', rate: 0.35, criterion: 'turnover', turnoverMax: 75000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 75.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'Sujeitos passivos CAE - grupo 551 que fixem atividade Concelho.' },
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'Todas empresas fixem sede e criem no mínimo 3 postos de trabalho.' },
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'Sujeitos passivos CAE - Divisão 72 e 74, que se instalem em 2025 e criem e mantenham 1 posto trabalho.' },
    ] },
    '1113': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1114': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 300.000,00, se já instalados ou que se instalem no concelho e criem ou mantenham postos de trabalho nos períodos de 2024 e 2025: - microempresas - 1 posto de trabalho; - pequenas empresas - 3 postos de trabalho; - médias empresas - 6 postos.' },
    ] },
    '1115': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1116': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1201': { generalRate: 0.75, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1202': { generalRate: null, rules: [] },
    '1203': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1204': { generalRate: 1.5, rules: [] },
    '1205': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1206': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1207': { generalRate: 0.4, rules: [] },
    '1208': { generalRate: null, rules: [] },
    '1209': { generalRate: null, rules: [] },
    '1210': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 300000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 300.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, ultrapasse € 150.000,00, e que criem ou mantenham pelo menos 1 posto de trabalho em 2 anos.' },
    ] },
    '1211': { generalRate: null, rules: [] },
    '1212': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1213': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1214': { generalRate: null, rules: [] },
    '1215': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1301': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1302': { generalRate: null, rules: [] },
    '1303': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1304': { generalRate: 1.25, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1305': { generalRate: null, rules: [] },
    '1306': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1307': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.75, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos promovam projetos de investimento IGM (Iniciativa Geradora Marcoense), em conformidade com o Regulamento, e que criem mais que 5 postos de trabalho liquídos em regime de contrato por tempo indeterminado.' },
      { kind: 'reduced', rate: 0.5, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos promovam projetos de investimento IGM (Iniciativa Geradora Marcoense), em conformidade com o Regulamento, e que criem mais que 20 postos de trabalho liquídos em regime de contrato por tempo indeterminado.' },
      { kind: 'reduced', rate: 0.3, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos promovam projetos de investimento IGM (Iniciativa Geradora Marcoense), em conformidade com o Regulamento, e que criem mais que 50 postos de trabalho liquídos em regime de contrato por tempo indeterminado.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos promovam projetos de investimento IGM (Iniciativa Geradora Marcoense), em conformidade com o Regulamento, e que criem mais que 100 postos de trabalho liquídos em regime de contrato por tempo indeterminado.' },
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1308': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1309': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.05, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1310': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'NIF 502545909 até € 19 743,42 de coleta; NIF 503037869 até € 20 000,00 de coleta.' },
    ] },
    '1311': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1312': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: null, scope: 'NIF 980757070' },
    ] },
    '1313': { generalRate: null, rules: [] },
    '1314': { generalRate: 1.2, rules: [
      { kind: 'reduced', rate: 0.1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'NIF: 501170952 até € 116.634,52 de coleta; NIF: 505345412 até € 15.321,79 de coleta.' },
    ] },
    '1315': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1316': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1317': { generalRate: 1.25, rules: [
      { kind: 'reduced', rate: 0.9, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos que se tenham fixado no concelho e que tenham criado e mantido cinco ou mais postos de trabalho.' },
    ] },
    '1318': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.75, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1401': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1402': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.75, criterion: 'turnover', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, seja superior a 50.000,00 e não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 50000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 50.000,00.' },
    ] },
    '1403': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1404': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos que se tenham fixado no concelho nos períodos de 2024 e 2025 e que tenham criado e mantido três ou mais postos de trabalho.' },
    ] },
    '1405': { generalRate: 1.4, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1406': { generalRate: 1.5, rules: [] },
    '1407': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 149999.99, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 149.999,99.' },
    ] },
    '1408': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1409': { generalRate: 0.9, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1410': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1, criterion: 'jobs', turnoverMax: null, scope: 'Acréscimo até 35% do número de trabalhadores existente em 31 de dezembro do ano anterior.' },
      { kind: 'reduced', rate: 0.5, criterion: 'jobs', turnoverMax: null, scope: 'Acréscimo entre 36% e 75% do número de trabalhadores existente em 31 de dezembro do ano anterior.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Acréscimo de mais de 75% do número de trabalhadores existente em 31 de dezembro do ano anterior.' },
    ] },
    '1411': { generalRate: 0.5, rules: [
      { kind: 'reduced', rate: 0.25, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 250.000,00 desde que criem e mantenham os seguintes postos de trabalho: Pequenas empresas - 2 postos de trabalho Médias empresas - 5 postos de trabalho' },
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1412': { generalRate: 1.2, rules: [
      { kind: 'reduced', rate: 0.75, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1413': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'Sujeitos passivos com sede social no concelho.' },
    ] },
    '1414': { generalRate: 1.3, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00 e tenham criado 2 postos de trabalho.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos que se tenham instalado no município e tenham criado 3 postos de trabalho' },
    ] },
    '1415': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1416': { generalRate: 0.91, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1417': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1418': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1419': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1420': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'NIF: 500843031; 516080903; 515922722; 515802441; 510805094; 515999415; 501297650; 513721320; 514964812; 516392778; 507781627.' },
    ] },
    '1421': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1, criterion: 'other', turnoverMax: null, scope: 'Sujeitos passivos com sede social no concelho.' },
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: null, scope: 'Sujeitos passivos com sede social no concelho, cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1501': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1502': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1503': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1504': { generalRate: 1.4, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1505': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1506': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1507': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1508': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 200000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 200.000,00.' },
    ] },
    '1509': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1510': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1, criterion: 'sector', turnoverMax: null, scope: 'Sujeitos passivos, grandes empresas, cujo volume de negócios não ultapasse € 10.000.000,00 € que se tenham instalado no concelho e que criem no mínimo 5 postos de trabalho nos primeiros dois anos e que se enquadrem nos CAE: 62010; 62020; 62030; 62090; 63110; 63120.' },
      { kind: 'reduced', rate: 0.5, criterion: 'sector', turnoverMax: null, scope: 'Sujeitos passivos, classificadas como PME, cujo volume de negócios não ultapasse € 1.000.000,00 que se tenham instalado no concelho e que criem no mínimo 5 postos de trabalho nos primeiros dois anos e que se enquadrem nos CAE: 62100; 62201; 62202; 62900; 63100; 63910.' },
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos que se fixaram no concelho em 2024 e que tenham criado e mantido durante esse período, 3 ou mais postos de trabalho.' },
    ] },
    '1511': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos com sede social no concelho, que criem e mantenham postos de trabalho efetivos no período, nos seguintes termos: Micro empresa - 1 posto de trabalho; Pequenas empresas - 3 postos de trabalho; Médias empresas - 6 postos de trabalho.' },
    ] },
    '1512': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1513': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 250.000,00 e que nos períodos de 2023 e 2024 tenham criados e mantido postos de trabalho efetivos no período, nos seguintes termos: Micro empresas - 1 posto de trabalho; Pequenas empresas - 3 postos de trabalho; Médias empresas - 6 postos de trabalho.' },
    ] },
    '1601': { generalRate: null, rules: [] },
    '1602': { generalRate: 1.4, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1603': { generalRate: null, rules: [] },
    '1604': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'Sujeitos passivos com sede social no concelho.' },
    ] },
    '1605': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1606': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 1000000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 1.000.000,00.' },
    ] },
    '1607': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1608': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1609': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1610': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.8, criterion: 'turnover', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, seja superior a € 75.000,00 e não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 75000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 75.000,00.' },
    ] },
    '1701': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1702': { generalRate: null, rules: [] },
    '1703': { generalRate: 1.4, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'sector', turnoverMax: null, scope: 'CAE: 72110, 74900.' },
      { kind: 'exempt', rate: 0, criterion: 'jobs', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 300.000,00, e que tenham criado e mantenham os seguintes postos de trabalho: - micro empresas - 1 posto de trabalho; - pequenas empresas - 3 postos de trabalho; - médias empresas - 6 postos.' },
    ] },
    '1704': { generalRate: null, rules: [] },
    '1705': { generalRate: null, rules: [] },
    '1706': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1707': { generalRate: null, rules: [] },
    '1708': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1709': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1710': { generalRate: null, rules: [] },
    '1711': { generalRate: null, rules: [] },
    '1712': { generalRate: null, rules: [] },
    '1713': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1714': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.75, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'NIF: 506230457; 515664618; 514412178.' },
    ] },
    '1801': { generalRate: 1.35, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1802': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1803': { generalRate: null, rules: [] },
    '1804': { generalRate: null, rules: [] },
    '1805': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1806': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1807': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1808': { generalRate: 1, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1809': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1810': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1811': { generalRate: null, rules: [] },
    '1812': { generalRate: null, rules: [] },
    '1813': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1814': { generalRate: null, rules: [] },
    '1815': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'sector', turnoverMax: null, scope: '01111, 01112, 01120, 01130, 01150, 01160, 01191, 01192, 01210, 01220, 01230, 01240, 01251, 01261, 01262, 01270, 01280, 01290, 01300, 01410, 01420, 01430, 01440, 01450, 01460, 01470, 01481, 01482, 01483, 01484, 01500, 01610, 01620, 01631, 01632, 01702, 02100, 02200, 02300, 02400, 10310, 10320, 10392, 10393, 10394, 10395, 10411, 10412, 10413, 10414, 10420, 10520, 10711, 10712, 10720, 10730, 11011, 11012, 11013, 11021, 11022, 15202, 16110, 16120, 16211, 16212, 16213, 16220, 16230, 16240, 16260, 16270, 16281, 16283, 16284, 16285, 47111, 47112, 47113, 47114, 47115, 47121, 47122, 47125, 47126, 47210, 47220, 47230, 47240, 47250, 47260, 47271, 47272, 47273, 47291, 47292, 47293, 47300, 47401, 47402, 47403, 47510, 47521, 47522, 47523, 47530, 47540, 47551, 47552, 47553, 47610, 47621, 47622, 47630, 47640,47690, 47711, 47712, 47721, 47722, 47730, 47741, 47750, 47761, 47762, 47770, 47781, 47782, 47783, 47790, 47910, 47920, 55101, 55102, 55103, 55104, 55105, 55106, 55107, 55201, 55202, 55203, 55204, 55205, 55206, 55300, 55900, 56101, 56112, 56113, 56114, 56115, 56116, 56117, 56120, 56210, 56220, 56301, 56302, 56303, 56304,' },
    ] },
    '1816': { generalRate: 1.5, rules: [] },
    '1817': { generalRate: null, rules: [] },
    '1818': { generalRate: null, rules: [] },
    '1819': { generalRate: 1.2, rules: [
      { kind: 'reduced', rate: 0.25, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1820': { generalRate: null, rules: [] },
    '1821': { generalRate: 1.5, rules: [] },
    '1822': { generalRate: null, rules: [] },
    '1823': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1824': { generalRate: 1.5, rules: [
      { kind: 'reduced', rate: 1.25, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '1901': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'Sujeitos passivos com sede social no concelho.' },
    ] },
    '1902': { generalRate: null, rules: [] },
    '1903': { generalRate: null, rules: [] },
    '1904': { generalRate: null, rules: [] },
    '1905': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00 - Pequenas Empresas.' },
      { kind: 'exempt', rate: 0, criterion: 'other', turnoverMax: null, scope: 'Sujeitos passivos que tenham sede social no concelho.' },
    ] },
    '2001': { generalRate: null, rules: [] },
    '2002': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '2003': { generalRate: null, rules: [] },
    '2004': { generalRate: null, rules: [] },
    '2005': { generalRate: null, rules: [] },
    '2006': { generalRate: null, rules: [] },
    '2007': { generalRate: null, rules: [] },
    '2101': { generalRate: 0.95, rules: [
      { kind: 'reduced', rate: 0.5, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '2102': { generalRate: 1.5, rules: [] },
    '2103': { generalRate: 1, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'sector', turnoverMax: null, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 300.000,00, e que nos períodos de 2023 e 2024 tenham criado e mantenham os seguintes postos de trabalho: - microempresas - 1 posto de trabalho; - pequenas empresas - 3 postos de trabalho; - médias empresas - 6 postos.' },
    ] },
    '2104': { generalRate: 0.9, rules: [] },
    '2105': { generalRate: 0.5, rules: [
      { kind: 'reduced', rate: 0.01, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '2106': { generalRate: 1.5, rules: [] },
    '2107': { generalRate: null, rules: [] },
    '2201': { generalRate: null, rules: [] },
    '2202': { generalRate: null, rules: [] },
    '2203': { generalRate: null, rules: [] },
    '2204': { generalRate: null, rules: [] },
    '2205': { generalRate: null, rules: [] },
    '2206': { generalRate: null, rules: [] },
    '2207': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '2208': { generalRate: null, rules: [] },
    '2209': { generalRate: 1.5, rules: [
      { kind: 'exempt', rate: 0, criterion: 'turnover', turnoverMax: 150000, scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.' },
    ] },
    '2210': { generalRate: null, rules: [] },
    '2211': { generalRate: null, rules: [] },
  },
};
