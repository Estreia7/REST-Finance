import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidade | REST Finance',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground mb-8 inline-block">&larr; Voltar</Link>

        <h1 className="text-3xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-8">Última atualização: Março 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Responsável pelo Tratamento</h2>
            <p>REST Finance (&quot;nós&quot;, &quot;nosso&quot;) é o responsável pelo tratamento dos seus dados pessoais. Se tiver questões sobre esta política, contacte-nos em suporte@restfinance.pt.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Dados Que Recolhemos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Dados de conta:</strong> nome, email, password (encriptada)</li>
              <li><strong>Dados do restaurante:</strong> nome, NIF, dados financeiros (receitas, custos, faturas)</li>
              <li><strong>Dados de utilização:</strong> logs de acesso, ações realizadas, exportações</li>
              <li><strong>Dados de pagamento:</strong> processados pelo Stripe (não armazenamos dados de cartão)</li>
              <li><strong>Documentos digitalizados:</strong> imagens de faturas/recibos enviados para processamento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Base Legal</h2>
            <p>Tratamos os seus dados com base em:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Execução de contrato:</strong> necessário para prestar o serviço que contratou</li>
              <li><strong>Consentimento:</strong> dado no momento do registo para comunicações e processamento de dados</li>
              <li><strong>Interesse legítimo:</strong> melhorar o serviço e garantir segurança</li>
              <li><strong>Obrigação legal:</strong> cumprimento de requisitos fiscais e contabilísticos</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Como Utilizamos os Dados</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Prestar e manter o serviço REST Finance</li>
              <li>Processar documentos financeiros e gerar relatórios</li>
              <li>Detetar alterações de preços nos fornecedores</li>
              <li>Processar pagamentos e gerir subscrições</li>
              <li>Enviar notificações sobre a sua conta</li>
              <li>Melhorar e desenvolver novas funcionalidades</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Subprocessadores</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Supabase (Singapura/EUA):</strong> autenticação e base de dados</li>
              <li><strong>Stripe (EUA):</strong> processamento de pagamentos</li>
              <li><strong>Railway (EUA):</strong> alojamento da aplicação</li>
            </ul>
            <p>Todos os subprocessadores mantêm padrões adequados de proteção de dados e conformidade com o RGPD.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Retenção de Dados</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Dados de conta: mantidos enquanto a conta estiver ativa</li>
              <li>Dados financeiros: mantidos por 10 anos (obrigação fiscal portuguesa)</li>
              <li>Logs de auditoria: mantidos por 2 anos</li>
              <li>Após eliminação de conta: dados anonimizados ou eliminados em 30 dias</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Os Seus Direitos (RGPD)</h2>
            <p>Tem o direito de:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Acesso:</strong> solicitar uma cópia dos seus dados pessoais</li>
              <li><strong>Retificação:</strong> corrigir dados incorretos</li>
              <li><strong>Eliminação:</strong> solicitar a eliminação dos seus dados</li>
              <li><strong>Portabilidade:</strong> receber os seus dados em formato estruturado</li>
              <li><strong>Oposição:</strong> opor-se ao tratamento dos seus dados</li>
              <li><strong>Retirar consentimento:</strong> a qualquer momento, sem afetar a licitude do tratamento anterior</li>
            </ul>
            <p>Para exercer estes direitos, utilize a secção &quot;Definições&quot; no painel de controlo ou contacte suporte@restfinance.pt.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Segurança</h2>
            <p>Implementamos medidas técnicas e organizativas adequadas para proteger os seus dados, incluindo encriptação em trânsito (TLS) e em repouso, controlo de acesso baseado em funções, e auditorias regulares.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">9. Contacto</h2>
            <p>Para questões sobre proteção de dados: suporte@restfinance.pt</p>
            <p>Pode também apresentar reclamação à CNPD (Comissão Nacional de Proteção de Dados).</p>
          </section>
        </div>
      </div>
    </div>
  );
}
